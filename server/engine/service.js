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
  }
  cfg.watchlist = (doc?.watchlist || []).filter((s) => typeof s === 'string').slice(0, MAX_WATCHLIST);
  cfg.scannerOn = doc?.scannerOn !== false;
  cfg.autoPaper = doc?.autoPaper !== false;
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

/** Evaluate one symbol now. Adds the provider used to the result. */
async function evaluate(symbol, { config, context } = {}) {
  const E = await engine();
  const cfg = config || (await getConfig());
  const ctx = context || (await ledgerContext());
  const { provider, note } = await activeProvider();
  const [candles5, candles15] = await Promise.all([provider.getCandles(symbol, 5), provider.getCandles(symbol, 15)]);
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
    },
  });
  result.provider = { id: provider.id, label: provider.label, delayed: provider.delayed, note };
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
      if (sim.status !== t.status || sim.exitPrice !== t.exitPrice) {
        await Trades.updateOne({ id: t.id }, { $set: { ...sim, updatedAt: new Date().toISOString() } });
        changed += 1;
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
        if (tradeId) {
          await getModel('enginetrades').create({
            id: tradeId,
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

module.exports = { evaluate, scan, startScanner, status, updateOpenTrades, getConfig, history };
