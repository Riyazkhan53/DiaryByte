// Server side of the intraday signal engine: evaluates symbols with the
// shared engine (src/engine), scans each market's watchlist every 5 minutes
// during its session, and keeps a paper-trade ledger of candidates that is
// simulated on later candles. Signals are decision support only; nothing
// here can place an order.
//
// Markets: 'NSE' (India) and 'US' (NASDAQ). Each has its own settings
// (tradingconfig: the NSE doc, and the doc with market 'US'), watchlist,
// paper trades, signal history and learning. Records saved before the US
// market existed have no `market` and count as NSE. Phone alerts are for
// NSE only.
//
// Note: on a free host that sleeps when idle, the scanner only runs while
// the server is awake.

const { getModel } = require('../models');
const { activeProvider, kiteStatus } = require('./providers');
const { getQuotes } = require('../quotes');
const { sendAlert, candidateAlert, closedAlert, summaryAlert, isTopic } = require('./alerts');

let engineModule = null;
// The engine is shared ES-module code; load it once.
const engine = () => (engineModule ||= import('../../src/engine/index.js'));

const MARKET_IDS = ['NSE', 'US'];
const MAX_WATCHLIST = 10;
const SCAN_DELAY_MS = 20000; // let the feed publish the candle that just closed

/** 'US' or 'NSE' (anything else). */
const marketId = (m) => (String(m || '').toUpperCase() === 'US' ? 'US' : 'NSE');
/** Which market a saved record belongs to (old records have none: NSE). */
const marketOfRecord = (r) => (r?.market === 'US' ? 'US' : 'NSE');

const blankState = () => ({ lastScanAt: null, lastError: null, scanning: false, lastBoundary: null });
const state = {
  timer: null,
  latest: {}, // `${market}:${symbol}` → last evaluation
  summaryDay: null, // IST day the NSE morning summary went out
  markets: { NSE: blankState(), US: blankState() },
};

const newId = () => `${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`;

// ------- settings -------

/** The settings doc for a market (US: market 'US'; NSE: any other). */
async function configDoc(market) {
  const docs = await getModel('tradingconfig').find({}).lean().catch(() => []);
  return docs.find((d) => marketOfRecord(d) === market) || null;
}

/** Trading settings for a market, saved from the app, over the engine defaults. */
async function getConfig(market = 'NSE') {
  market = marketId(market);
  const E = await engine();
  const defaults = E.defaultConfig(market);
  const doc = await configDoc(market);
  const cfg = { ...defaults };
  if (doc) {
    Object.keys(defaults).forEach((k) => {
      if (k !== 'charges' && k !== 'watchlist' && k !== 'market' && doc[k] != null) cfg[k] = doc[k];
    });
    // Your broker's charges, set in the app, over the estimates.
    if (doc.charges && typeof doc.charges === 'object') cfg.charges = { ...defaults.charges, ...doc.charges };
  }
  cfg.market = market;
  const list = Array.isArray(doc?.watchlist) ? doc.watchlist : defaults.watchlist || [];
  cfg.watchlist = list.filter((s) => typeof s === 'string').slice(0, MAX_WATCHLIST);
  cfg.scannerOn = doc?.scannerOn !== false;
  cfg.autoPaper = doc?.autoPaper !== false;
  // Phone alerts (ntfy), NSE only: on once a topic is set, each kind on unless turned off.
  cfg.alertTopic = market === 'NSE' && isTopic(doc?.alertTopic) ? doc.alertTopic : null;
  cfg.alertsOn = !!cfg.alertTopic && doc?.alertsOn !== false;
  cfg.alertEntries = doc?.alertEntries !== false;
  cfg.alertExits = doc?.alertExits !== false;
  cfg.alertSummary = doc?.alertSummary !== false;
  return cfg;
}

// ------- ledger -------

/** A market's open positions, cash in use, today's net P/L and last signal per symbol. */
async function ledgerContext(market = 'NSE') {
  market = marketId(market);
  const { marketParts, dayNetPnl } = await engine();
  const trades = (await getModel('enginetrades').find({}).lean()).filter((t) => marketOfRecord(t) === market);
  const open = trades.filter((t) => t.status === 'pending' || t.status === 'open');
  const cashInUse = open.reduce((s, t) => s + (t.plan?.cashUsed || 0), 0);
  const lastKeys = {};
  trades.forEach((t) => {
    lastKeys[t.symbol] = lastKeys[t.symbol] && lastKeys[t.symbol].at > t.createdAt ? lastKeys[t.symbol] : { key: t.signalKey, at: t.createdAt };
  });
  return {
    trades,
    openPositions: open.length,
    cashInUse,
    dayPnl: dayNetPnl(trades, marketParts(Date.now(), market).dateKey, market),
    lastKeys,
  };
}

// ------- learning -------

const LEARN_CACHE_MS = 5 * 60 * 1000;
const learnCache = {}; // market → { at, threshold, learned }
/** Forget what was learned (after a backtest or settings change). */
const resetLearning = (market) => {
  if (market) delete learnCache[marketId(market)];
  else MARKET_IDS.forEach((m) => delete learnCache[m]);
};

/**
 * What past results teach (see src/engine/learn.js), per market: from the
 * engine's closed paper and demo trades, the latest backtest's trades, and
 * your own closed paper trades in that market.
 */
async function learned(cfg) {
  const market = marketId(cfg.market);
  const hit = learnCache[market];
  if (hit && Date.now() - hit.at < LEARN_CACHE_MS && hit.threshold === cfg.threshold) return hit.learned;
  const E = await engine();
  const [engineTrades, backtest, paper] = await Promise.all([
    getModel('enginetrades').find({ status: 'closed' }).lean(),
    getModel('backtesttrades').find({ market }).lean().catch(() => []),
    getModel('trades').find({ status: 'closed' }).lean().catch(() => []),
  ]);
  const minutesOf = (t) => (t ? E.marketParts(t, market).minutes : null);
  const records = [...engineTrades.filter((t) => marketOfRecord(t) === market), ...backtest]
    .filter((t) => Number.isFinite(t.netPnl))
    .map((t) => ({
      side: t.side,
      symbol: t.symbol,
      r: t.r ?? null,
      net: t.netPnl,
      score: t.score ? t.score[t.side === 'short' ? 'short' : 'long'] : null,
      minutes: minutesOf(t.signalTime),
    }));
  // Your own paper trades: market 'IN' (NSE) or 'US'.
  const paperMarket = market === 'US' ? 'US' : 'IN';
  paper
    .filter((t) => (t.market || 'IN') === paperMarket && t.entryPrice > 0 && t.exitPrice > 0 && t.quantity > 0)
    .forEach((t) => {
      const dir = t.side === 'short' ? -1 : 1;
      const risk = t.stopLoss > 0 ? Math.abs(t.entryPrice - t.stopLoss) : 0;
      records.push({
        side: t.side === 'short' ? 'short' : 'long',
        symbol: t.symbol,
        r: risk > 0 ? Math.round((((t.exitPrice - t.entryPrice) * dir) / risk) * 100) / 100 : null,
        net: (t.exitPrice - t.entryPrice) * dir * t.quantity,
        score: null,
        minutes: null,
      });
    });
  const result = E.learnFromTrades(records, cfg.threshold, market);
  learnCache[market] = { at: Date.now(), threshold: cfg.threshold, learned: result };
  return result;
}

/** The data provider for a market: Kite (if set up) or Yahoo for NSE, Yahoo for US. */
async function providerFor(market) {
  if (market === 'US') {
    const { yahoo } = require('./providers');
    return { provider: yahoo, note: null };
  }
  return activeProvider();
}

// ------- evaluate -------

/** Evaluate one symbol now in `market`. Adds the provider used to the result. */
async function evaluate(symbol, { config, context, market } = {}) {
  const E = await engine();
  const mkt = marketId(market || config?.market);
  const cfg = config || (await getConfig(mkt));
  const ctx = context || (await ledgerContext(mkt));
  const { provider, note } = await providerFor(mkt);
  const [candles5, candles15] = await Promise.all([provider.getCandles(symbol, 5), provider.getCandles(symbol, 15)]);
  const lessons = await learned(cfg).catch(() => null);
  const result = E.evaluateSignal({
    symbol,
    candles5,
    candles15,
    now: Date.now(),
    config: cfg,
    context: {
      cash: Math.max(0, cfg.capital - ctx.cashInUse),
      openPositions: ctx.openPositions,
      dayPnl: ctx.dayPnl,
      lastSignalKey: ctx.lastKeys[symbol]?.key,
      learned: lessons,
    },
  });
  // Everything learned so far (not only what applies to this stock now), for the app.
  result.learning = lessons
    ? { on: cfg.learnOn !== false, trades: lessons.trades, needed: lessons.needed, active: lessons.active, rules: lessons.rules.map((r) => ({ id: r.id, bump: r.bump, note: r.note })) }
    : null;
  result.provider = { id: provider.id, label: provider.label, delayed: provider.delayed, note };
  // When the candles were fetched, and the latest traded price, to compare with a broker app.
  const fetched = provider.fetchedAt?.(symbol, 5);
  result.fetchedAt = new Date(fetched || Date.now()).toISOString();
  try {
    result.quote = (await getQuotes([symbol])).quotes[symbol] || null;
  } catch (_error) {
    result.quote = null;
  }
  state.latest[`${mkt}:${symbol}`] = result;
  return result;
}

// ------- paper trades -------

/** Re-simulate pending/open engine trades (both markets) on the latest candles. */
async function updateOpenTrades() {
  const E = await engine();
  const Trades = getModel('enginetrades');
  const open = await Trades.find({ status: { $in: ['pending', 'open'] } }).lean();
  if (!open.length) return 0;
  const configs = {};
  let changed = 0;
  for (const t of open) {
    const market = marketOfRecord(t);
    try {
      const cfg = (configs[market] ||= await getConfig(market));
      const { provider } = await providerFor(market);
      const candles = E.normalizeCandles(await provider.getCandles(t.symbol, 5));
      const done = E.completedCandles(candles, 5, Date.now());
      let sim = E.simulateTrade(t.plan, done, t.signalTime, cfg);
      // A candle touched both stop and target: settle it on 1-minute candles.
      if (sim.resolvedBy === 'conservative') {
        try {
          const fine = E.completedCandles(E.normalizeCandles(await provider.getCandles(t.symbol, 1)), 1, Date.now());
          sim = E.simulateTrade(t.plan, done, t.signalTime, cfg, { fine });
        } catch (_error) {
          // Keep the conservative result (stop first).
        }
      }
      const moved = ['status', 'exitPrice', 'lastPrice', 'liveAction', 'stopMoved'].some((k) => sim[k] !== t[k]);
      if (moved) {
        await Trades.updateOne({ id: t.id }, { $set: { ...sim, updatedAt: new Date().toISOString() } });
        changed += 1;
        if (sim.status === 'closed' && t.status !== 'closed') {
          resetLearning(market);
          if (cfg.alertsOn && cfg.alertExits) await sendAlert(cfg.alertTopic, closedAlert({ ...t, ...sim }));
        }
      }
    } catch (error) {
      state.markets[market].lastError = `${t.symbol}: ${error.message}`;
    }
  }
  return changed;
}

/**
 * Save an evaluation to the signal history (tradingsignals), keyed by
 * symbol and candle so repeated scans can't duplicate it. Only in-session
 * evaluations of a completed candle are kept. Returns true when this call
 * created the record.
 */
async function logSignal(r, tradeId) {
  if (!r.candle || !r.data.marketOpen) return false;
  const id = `${r.symbol}:${r.candle.t}`;
  const record = {
    id,
    market: r.market || 'NSE',
    symbol: r.symbol,
    timeframe: '5m',
    candleTime: r.candle.t,
    key: r.key,
    state: r.state,
    side: r.side,
    score: r.score,
    rawScore: r.rawScore,
    threshold: r.threshold,
    failedConditions: r.failedConditions,
    nextAction: r.nextAction,
    ruleVersion: r.ruleVersion,
    provider: r.provider.id,
    dataStatus: r.data.status,
    indicators: r.indicators,
    plan: r.state === 'BUY CANDIDATE' || r.state === 'SELL CANDIDATE' ? r.plan : null,
    tradeId,
    createdAt: new Date().toISOString(),
    loggedAt: new Date(),
  };
  const res = await getModel('tradingsignals').updateOne({ id }, { $setOnInsert: record }, { upsert: true });
  return (res?.upsertedCount ?? 0) > 0;
}

const HISTORY_STATES = ['BUY CANDIDATE', 'SELL CANDIDATE', 'WAIT', 'NEUTRAL', 'NO TRADE'];

/**
 * Signal history of a market, newest first, with the paper trade of each
 * candidate. Filters: symbol, state, days (back from now), timeframe. Up to `limit`.
 */
async function history({ symbol, state: wanted, days, timeframe, limit = 500, market } = {}) {
  const mkt = marketId(market);
  const filter = {};
  if (symbol) filter.symbol = symbol;
  if (HISTORY_STATES.includes(wanted)) filter.state = wanted;
  if (timeframe) filter.timeframe = timeframe;
  if (days > 0) filter.candleTime = { $gte: Date.now() - days * 86400000 };
  const max = Math.min(Math.max(1, limit), 2000);
  const signals = (await getModel('tradingsignals').find(filter).sort({ candleTime: -1 }).limit(max * 2).lean())
    .filter((s) => marketOfRecord(s) === mkt)
    .slice(0, max);
  const tradeFilter = { signalTime: filter.candleTime || { $gte: 0 } };
  if (symbol) tradeFilter.symbol = symbol;
  const trades = (await getModel('enginetrades').find(tradeFilter).lean()).filter((t) => marketOfRecord(t) === mkt);
  const strip = ({ _id, __v, loggedAt, ...rest }) => rest;
  return { signals: signals.map(strip), trades: trades.map(strip) };
}

/**
 * Demo trade: "what if I took this now?" Evaluates the symbol, plans the
 * given side (default: the engine's side) from the live price and ATR with
 * your risk settings, and opens an engine paper trade that the scanner
 * simulates like the automatic ones (next-candle entry, stop, target,
 * trailing stop, weak-setup exit, square-off, charges). It does not need a
 * BUY/SELL candidate, so any signal can be tested.
 */
async function startDemo(symbol, side, market = 'NSE') {
  const E = await engine();
  const mkt = marketId(market);
  const cfg = await getConfig(mkt);
  const ctx = await ledgerContext(mkt);
  const r = await evaluate(symbol, { config: cfg, context: ctx, market: mkt });
  if (!r.data.marketOpen) {
    const m = E.marketOf(mkt);
    throw Object.assign(new Error(`${m.label} is closed: demo trades run in market hours (${m.open}–${m.close} ${m.zone})`), { status: 400 });
  }
  if (!r.candle) throw Object.assign(new Error('No completed candle yet'), { status: 400 });
  const chosen = side === 'long' || side === 'short' ? side : r.side;
  const plan = E.planTrade({
    side: chosen,
    entry: r.candle.close,
    atr: r.indicators.atr,
    // A what-if on its own: the full practice capital, not what other trades use.
    cash: cfg.capital,
    config: cfg,
  });
  if (!plan.ok) throw Object.assign(new Error(plan.reason), { status: 400 });
  const trade = {
    id: newId(),
    source: 'demo',
    market: mkt,
    symbol,
    side: chosen,
    signalKey: `${symbol}:${r.candle.t}:${chosen}:demo`,
    signalTime: r.candle.t,
    signalState: r.state,
    plan,
    score: r.score,
    ruleVersion: r.ruleVersion,
    provider: r.provider.id,
    indicators: r.indicators,
    status: 'pending',
    liveAction: 'ENTRY PENDING',
    createdAt: new Date().toISOString(),
  };
  await getModel('enginetrades').create(trade);
  return trade;
}

// ------- scanning -------

/** One scan of a market: evaluate its watchlist, log every decision, open paper trades. */
async function scan(market = 'NSE') {
  const mkt = marketId(market);
  const ms = state.markets[mkt];
  if (ms.scanning) return { skipped: true };
  ms.scanning = true;
  const results = [];
  try {
    const cfg = await getConfig(mkt);
    await updateOpenTrades();
    const ctx = await ledgerContext(mkt);
    for (const symbol of cfg.watchlist) {
      try {
        const r = await evaluate(symbol, { config: cfg, context: ctx, market: mkt });
        results.push({ symbol, state: r.state, score: r.score, failedConditions: r.failedConditions, nextAction: r.nextAction });
        const candidate = r.state === 'BUY CANDIDATE' || r.state === 'SELL CANDIDATE';
        const tradeId = candidate && cfg.autoPaper ? newId() : null;
        // One history record per symbol and completed candle, whatever the
        // decision. The first scan of a candle wins; later ones change nothing.
        const logged = await logSignal(r, tradeId);
        if (!candidate || !logged) continue;
        if (cfg.alertsOn && cfg.alertEntries) await sendAlert(cfg.alertTopic, candidateAlert(r));
        if (tradeId) {
          await getModel('enginetrades').create({
            id: tradeId,
            source: 'auto',
            market: mkt,
            symbol,
            side: r.side,
            signalKey: r.key,
            signalTime: r.candle.t,
            plan: r.plan,
            score: r.score,
            ruleVersion: r.ruleVersion,
            provider: r.provider.id,
            indicators: r.indicators,
            status: 'pending',
            createdAt: new Date().toISOString(),
          });
          // The new position counts for the next symbol in this scan.
          ctx.openPositions += 1;
          ctx.cashInUse += r.plan.cashUsed || 0;
          ctx.lastKeys[symbol] = { key: r.key, at: new Date().toISOString() };
        }
      } catch (error) {
        ms.lastError = `${symbol}: ${error.message}`;
        results.push({ symbol, error: error.message });
      }
    }
    ms.lastScanAt = new Date().toISOString();
    // NSE, once a day after 09:20 IST: where every watchlist stock stands.
    if (mkt === 'NSE' && cfg.alertsOn && cfg.alertSummary && results.length) {
      const E = await engine();
      const now = Date.now();
      const day = new Date(now + 330 * 60000).toISOString().slice(0, 10);
      const { minutes, weekday } = E.istParts(now);
      if (state.summaryDay !== day && weekday >= 1 && weekday <= 5 && minutes >= 9 * 60 + 20 && E.isNseOpen(now)) {
        state.summaryDay = day;
        const hhmm = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
        await sendAlert(cfg.alertTopic, summaryAlert(results, hhmm));
      }
    }
    return { market: mkt, results };
  } finally {
    ms.scanning = false;
  }
}

/** Start the 5-minute scanner for every market (call once when the server starts). */
function startScanner() {
  if (state.timer) return;
  state.timer = setInterval(async () => {
    const E = await engine().catch(() => null);
    if (!E) return;
    const now = Date.now();
    const boundary = Math.floor(now / 300000);
    if (now - boundary * 300000 < SCAN_DELAY_MS) return;
    for (const market of MARKET_IDS) {
      const ms = state.markets[market];
      try {
        if (boundary === ms.lastBoundary) continue;
        const { minutes, weekday } = E.marketParts(now, market);
        const s = E.sessionTimes(market);
        // Run through the session, and 15 minutes after to settle square-offs.
        const inHours = weekday >= 1 && weekday <= 5 && minutes >= s.open + 5 && minutes <= s.close + 15;
        if (!inHours) continue;
        ms.lastBoundary = boundary;
        const cfg = await getConfig(market);
        if (cfg.scannerOn) await scan(market);
        else await updateOpenTrades();
      } catch (error) {
        ms.lastError = error.message;
      }
    }
    // Train in the quiet hours: a market's backtest refreshes when it is a week old.
    try {
      const { autoBacktest } = require('./backtest');
      await autoBacktest();
    } catch (error) {
      console.error('[engine] auto backtest failed', error.message);
    }
  }, 30000);
}

/** Engine status for a market (and the other market's scanner, for the app). */
async function status(market = 'NSE') {
  const E = await engine();
  const mkt = marketId(market);
  const cfg = await getConfig(mkt).catch(() => null);
  const { provider, note } = await providerFor(mkt);
  const ms = state.markets[mkt];
  const m = E.marketOf(mkt);
  return {
    market: mkt,
    marketInfo: { id: m.id, label: m.label, zone: m.zone, currency: m.currency, symbol: m.symbol, open: m.open, close: m.close, lastEntry: m.lastEntry, squareOff: m.squareOff },
    provider: { id: provider.id, label: provider.label, delayed: provider.delayed, note },
    kite: mkt === 'NSE' ? kiteStatus() : null,
    marketOpen: E.isMarketOpen(Date.now(), mkt),
    scanner: {
      running: !!state.timer,
      enabled: cfg?.scannerOn ?? true,
      autoPaper: cfg?.autoPaper ?? true,
      watchlist: cfg?.watchlist || [],
      lastScanAt: ms.lastScanAt,
      lastError: ms.lastError,
    },
    ruleVersion: E.RULE_VERSION,
    serverTime: new Date(Date.now()).toISOString(),
  };
}

/** Send a test notification to the saved topic (or `topic`, before it's saved). */
async function testAlert(topic) {
  const cfg = await getConfig('NSE');
  const to = isTopic(topic) ? topic : cfg.alertTopic;
  if (!to) throw Object.assign(new Error('Set up phone alerts first'), { status: 400 });
  const ok = await sendAlert(to, {
    title: '🔔 DiaryByte alerts are on',
    body: 'You will get entry signals, closed paper trades and a morning watchlist summary here.',
    tags: ['bell'],
  });
  if (!ok) throw Object.assign(new Error("Couldn't reach ntfy.sh from the server"), { status: 502 });
  return { ok: true };
}

module.exports = {
  evaluate,
  scan,
  startScanner,
  status,
  updateOpenTrades,
  getConfig,
  history,
  startDemo,
  testAlert,
  learned,
  resetLearning,
  marketId,
  marketOfRecord,
  MARKET_IDS,
  engine,
};
