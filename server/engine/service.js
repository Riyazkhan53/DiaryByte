// Server side of the intraday signal engine: evaluates symbols with the
// shared engine (src/engine), scans a watchlist every 5 minutes during the
// NSE session, and keeps a paper-trade ledger of candidates that is
// simulated on later candles. Signals are decision support only; nothing
// here can place an order.
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

const MAX_WATCHLIST = 10;
const SCAN_DELAY_MS = 20000; // let the feed publish the candle that just closed

const state = {
  lastScanAt: null,
  lastError: null,
  scanning: false,
  latest: {}, // symbol → last evaluation
  timer: null,
  lastBoundary: null,
  summaryDay: null, // IST day the morning summary went out
};

const newId = () => `${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`;

/** Trading settings saved from the app, over the engine defaults. */
async function getConfig() {
  const { DEFAULT_CONFIG } = await engine();
  const doc = await getModel('tradingconfig').findOne({}).lean().catch(() => null);
  const cfg = { ...DEFAULT_CONFIG };
  if (doc) {
    Object.keys(DEFAULT_CONFIG).forEach((k) => {
      if (k !== 'charges' && doc[k] != null) cfg[k] = doc[k];
    });
    // Your broker's charges, set in the app, over the estimates.
    if (doc.charges && typeof doc.charges === 'object') cfg.charges = { ...DEFAULT_CONFIG.charges, ...doc.charges };
  }
  cfg.watchlist = (doc?.watchlist || []).filter((s) => typeof s === 'string').slice(0, MAX_WATCHLIST);
  cfg.scannerOn = doc?.scannerOn !== false;
  cfg.autoPaper = doc?.autoPaper !== false;
  // Phone alerts (ntfy): on once a topic is set, each kind on unless turned off.
  cfg.alertTopic = isTopic(doc?.alertTopic) ? doc.alertTopic : null;
  cfg.alertsOn = !!cfg.alertTopic && doc?.alertsOn !== false;
  cfg.alertEntries = doc?.alertEntries !== false;
  cfg.alertExits = doc?.alertExits !== false;
  cfg.alertSummary = doc?.alertSummary !== false;
  return cfg;
}

/** Open positions, cash in use, today's net P/L and last signal per symbol. */
async function ledgerContext() {
  const { istParts, dayNetPnl } = await engine();
  const trades = await getModel('enginetrades').find({}).lean();
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
    dayPnl: dayNetPnl(trades, istParts(Date.now()).dateKey),
    lastKeys,
  };
}

const LEARN_CACHE_MS = 5 * 60 * 1000;
let learnCache = null; // { at, threshold, learned }

/**
 * What past results teach (see src/engine/learn.js): from the engine's closed
 * paper and demo trades, and your own closed paper trades on NSE stocks.
 */
async function learned(cfg) {
  if (learnCache && Date.now() - learnCache.at < LEARN_CACHE_MS && learnCache.threshold === cfg.threshold) return learnCache.learned;
  const E = await engine();
  const [engineTrades, paper] = await Promise.all([
    getModel('enginetrades').find({ status: 'closed' }).lean(),
    getModel('trades').find({ status: 'closed' }).lean().catch(() => []),
  ]);
  const records = engineTrades
    .filter((t) => Number.isFinite(t.netPnl))
    .map((t) => ({
      side: t.side,
      symbol: t.symbol,
      r: t.r ?? null,
      net: t.netPnl,
      score: t.score ? t.score[t.side === 'short' ? 'short' : 'long'] : null,
      minutes: t.signalTime ? E.istParts(t.signalTime).minutes : null,
    }));
  paper
    .filter((t) => (t.market || 'IN') === 'IN' && t.entryPrice > 0 && t.exitPrice > 0 && t.quantity > 0)
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
  const result = E.learnFromTrades(records, cfg.threshold);
  learnCache = { at: Date.now(), threshold: cfg.threshold, learned: result };
  return result;
}

/** Evaluate one symbol now. Adds the provider used to the result. */
async function evaluate(symbol, { config, context } = {}) {
  const E = await engine();
  const cfg = config || (await getConfig());
  const ctx = context || (await ledgerContext());
  const { provider, note } = await activeProvider();
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
  state.latest[symbol] = result;
  return result;
}

/** Re-simulate pending/open engine trades on the latest candles. */
async function updateOpenTrades() {
  const E = await engine();
  const cfg = await getConfig();
  const Trades = getModel('enginetrades');
  const open = await Trades.find({ status: { $in: ['pending', 'open'] } }).lean();
  if (!open.length) return 0;
  const { provider } = await activeProvider();
  let changed = 0;
  for (const t of open) {
    try {
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
        if (sim.status === 'closed' && t.status !== 'closed' && cfg.alertsOn && cfg.alertExits) {
          await sendAlert(cfg.alertTopic, closedAlert({ ...t, ...sim }));
        }
      }
    } catch (error) {
      state.lastError = `${t.symbol}: ${error.message}`;
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
 * Signal history, newest first, with the paper trade of each candidate.
 * Filters: symbol, state, days (back from now), timeframe. Up to `limit`.
 */
async function history({ symbol, state: wanted, days, timeframe, limit = 500 } = {}) {
  const filter = {};
  if (symbol) filter.symbol = symbol;
  if (HISTORY_STATES.includes(wanted)) filter.state = wanted;
  if (timeframe) filter.timeframe = timeframe;
  if (days > 0) filter.candleTime = { $gte: Date.now() - days * 86400000 };
  const signals = await getModel('tradingsignals')
    .find(filter)
    .sort({ candleTime: -1 })
    .limit(Math.min(Math.max(1, limit), 2000))
    .lean();
  const tradeFilter = { signalTime: filter.candleTime || { $gte: 0 } };
  if (symbol) tradeFilter.symbol = symbol;
  const trades = await getModel('enginetrades').find(tradeFilter).lean();
  const strip = ({ _id, __v, loggedAt, ...rest }) => rest;
  return { signals: signals.map(strip), trades: trades.map(strip) };
}

/**
 * Demo trade: "what if I took this now?" Evaluates the symbol, plans the
 * given side (default: the engine's side) from the live price and ATR with
 * your risk settings, and opens an engine paper trade that the scanner
 * simulates like the automatic ones (next-candle entry, stop, target,
 * trailing stop, weak-setup exit, 15:20 square-off, charges). It does not
 * need a BUY/SELL candidate, so any signal can be tested.
 */
async function startDemo(symbol, side) {
  const E = await engine();
  const cfg = await getConfig();
  const ctx = await ledgerContext();
  const r = await evaluate(symbol, { config: cfg, context: ctx });
  if (!r.data.marketOpen) throw Object.assign(new Error('NSE is closed: demo trades run in market hours (09:15–15:30 IST)'), { status: 400 });
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

/** One scan: evaluate the watchlist, log every decision, open paper trades. */
async function scan() {
  if (state.scanning) return { skipped: true };
  state.scanning = true;
  const results = [];
  try {
    const cfg = await getConfig();
    await updateOpenTrades();
    const ctx = await ledgerContext();
    for (const symbol of cfg.watchlist) {
      try {
        const r = await evaluate(symbol, { config: cfg, context: ctx });
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
        state.lastError = `${symbol}: ${error.message}`;
        results.push({ symbol, error: error.message });
      }
    }
    state.lastScanAt = new Date().toISOString();
    // Once a day, after 09:20 IST: where every watchlist stock stands.
    if (cfg.alertsOn && cfg.alertSummary && results.length) {
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
    return { results };
  } finally {
    state.scanning = false;
  }
}

/** Start the 5-minute scanner (call once when the server starts). */
function startScanner() {
  if (state.timer) return;
  state.timer = setInterval(async () => {
    try {
      const E = await engine();
      const now = Date.now();
      const boundary = Math.floor(now / 300000);
      if (boundary === state.lastBoundary || now - boundary * 300000 < SCAN_DELAY_MS) return;
      const { minutes, weekday } = E.istParts(now);
      // Run through the session, and until 15:45 IST to settle square-offs.
      const inHours = weekday >= 1 && weekday <= 5 && minutes >= E.NSE_SESSION.open + 5 && minutes <= E.NSE_SESSION.close + 15;
      if (!inHours) return;
      state.lastBoundary = boundary;
      const cfg = await getConfig();
      if (cfg.scannerOn) await scan();
      else await updateOpenTrades();
    } catch (error) {
      state.lastError = error.message;
    }
  }, 30000);
}

async function status() {
  const E = await engine();
  const cfg = await getConfig().catch(() => null);
  const { provider, note } = await activeProvider();
  return {
    provider: { id: provider.id, label: provider.label, delayed: provider.delayed, note },
    kite: kiteStatus(),
    marketOpen: E.isNseOpen(Date.now()),
    scanner: {
      running: !!state.timer,
      enabled: cfg?.scannerOn ?? true,
      autoPaper: cfg?.autoPaper ?? true,
      watchlist: cfg?.watchlist || [],
      lastScanAt: state.lastScanAt,
      lastError: state.lastError,
    },
    ruleVersion: E.RULE_VERSION,
    serverTime: new Date(Date.now()).toISOString(),
  };
}

/** Send a test notification to the saved topic (or `topic`, before it's saved). */
async function testAlert(topic) {
  const cfg = await getConfig();
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

module.exports = { evaluate, scan, startScanner, status, updateOpenTrades, getConfig, history, startDemo, testAlert };
