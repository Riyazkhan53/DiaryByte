// Backtest: replay the last ~60 days of 5-minute candles for a market's
// watchlist through the same engine (same rules, risk settings and fills
// as live paper trading) to see how it would have done, and to give the
// learning layer enough closed trades to work with straight away.
//
// How a run works, in time order across all the watchlist's stocks:
// - at every completed 5-minute candle in the session, evaluate the signal
//   on the history up to that candle only (no look-ahead);
// - a BUY / SELL candidate opens a simulated paper trade (next candle's
//   open, stop, target, trailing stop, weak-setup exit, square-off,
//   charges); one open trade per stock at a time, and the daily loss limit
//   and open-position limit apply as they would live;
// - learning is off during the run, so the trades show the plain rules.
// The run's trades replace the market's previous backtest trades
// (backtesttrades), and from then on count in what the engine learns.
//
// Data: Yahoo, which keeps about 60 days of 5-minute candles. There are no
// 1-minute candles that far back, so a candle that touched both stop and
// target counts as the stop (conservative).

const { getModel } = require('../models');
const { getIntradayCandles } = require('../quotes');
const service = require('./service');

const HISTORY_5M = 400; // candles of history the engine sees at each step (~5 days)
const HISTORY_15M = 150;
const AUTO_EVERY_MS = 7 * 86400000; // refresh a market's backtest weekly
const RETRY_MS = 6 * 3600000; // after a failed automatic run
const round2 = (n) => Math.round(n * 100) / 100;

const running = {}; // market → { startedAt, done, total, symbol }
const lastAttempt = {}; // market → ms

const yieldNow = () => new Promise((resolve) => setImmediate(resolve));
const YIELD_EVERY_MS = 40;

/** Summaries of a list of closed trades, grouped by `key(trade)`. */
function groupStats(trades, key) {
  const groups = {};
  trades.forEach((t) => {
    const k = key(t);
    if (k == null) return;
    const g = (groups[k] ||= { key: k, trades: 0, wins: 0, net: 0, rSum: 0, rCount: 0 });
    g.trades += 1;
    if (t.netPnl > 0) g.wins += 1;
    g.net += t.netPnl;
    if (t.r != null) {
      g.rSum += t.r;
      g.rCount += 1;
    }
  });
  return Object.values(groups)
    .map((g) => ({
      key: g.key,
      trades: g.trades,
      winRate: Math.round((g.wins / g.trades) * 100),
      net: round2(g.net),
      avgR: g.rCount ? round2(g.rSum / g.rCount) : null,
    }))
    .sort((a, b) => b.net - a.net);
}

/**
 * Run a backtest for `market` ('NSE' | 'US') now. Returns the summary.
 * `fetchCandles(symbol, intervalMin)` can be swapped in tests.
 */
async function runBacktest(market = 'NSE', { fetchCandles } = {}) {
  const mkt = service.marketId(market);
  if (running[mkt]) throw Object.assign(new Error('A backtest is already running for this market'), { status: 409 });
  const E = await service.engine();
  const progress = (running[mkt] = { startedAt: new Date().toISOString(), done: 0, total: 0, symbol: null });
  lastAttempt[mkt] = Date.now();
  try {
    const base = await service.getConfig(mkt);
    // The plain rules: nothing learned is applied while backtesting.
    const cfg = { ...base, learnOn: false };
    const symbols = base.watchlist;
    if (!symbols.length) throw Object.assign(new Error('Add stocks to the watchlist first'), { status: 400 });
    const fetch = fetchCandles || ((symbol, interval) => getIntradayCandles(symbol, interval, '60d'));

    // 1. History per stock.
    const data = {};
    for (const symbol of symbols) {
      progress.symbol = symbol;
      try {
        const [c5, c15] = await Promise.all([fetch(symbol, 5), fetch(symbol, 15)]);
        data[symbol] = { c5: E.normalizeCandles(c5), c15: E.normalizeCandles(c15) };
      } catch (error) {
        data[symbol] = { c5: [], c15: [], error: error.message };
      }
    }

    // 2. Every candle of every stock, in time order (only in-session candles).
    const events = [];
    Object.entries(data).forEach(([symbol, d]) => {
      d.c5.forEach((c, i) => {
        if (i >= E.MIN_5M && E.isMarketOpen(c.t, mkt)) events.push({ t: c.t, symbol, i });
      });
    });
    events.sort((a, b) => a.t - b.t || a.symbol.localeCompare(b.symbol));
    progress.total = events.length;

    // 3. Replay.
    const trades = [];
    const openUntil = {}; // symbol → exit time of its open trade
    const lastKey = {};
    const ptr15 = {}; // symbol → index of the first 15-minute candle not yet complete
    let lastYield = Date.now();
    for (let n = 0; n < events.length; n += 1) {
      const { t, symbol, i } = events[n];
      progress.done = n + 1;
      // Keep the server responsive (Render's health check waits only 5 s, and
      // the free plan's CPU is slow): hand back control every ~40 ms of work.
      if (Date.now() - lastYield > YIELD_EVERY_MS) {
        await yieldNow();
        lastYield = Date.now();
      }
      if (openUntil[symbol] != null && openUntil[symbol] > t) continue;
      const d = data[symbol];
      const now = t + 5 * 60000 + 30000; // just after the candle closed
      let k = ptr15[symbol] || 0;
      while (k < d.c15.length && d.c15[k].t + 15 * 60000 <= now) k += 1;
      ptr15[symbol] = k;
      const c5 = d.c5.slice(Math.max(0, i + 1 - HISTORY_5M), i + 1);
      const c15 = d.c15.slice(Math.max(0, k - HISTORY_15M), k);
      // The ledger as it stood at that moment.
      const open = trades.filter((x) => x.entryTime <= now && x.exitTime > now);
      const day = E.marketParts(t, mkt).dateKey;
      const dayPnl = trades
        .filter((x) => x.exitTime <= now && E.marketParts(x.exitTime, mkt).dateKey === day)
        .reduce((s, x) => s + x.netPnl, 0);
      const r = E.evaluateSignal({
        symbol,
        candles5: c5,
        candles15: c15,
        now,
        config: cfg,
        context: {
          cash: Math.max(0, cfg.capital - open.reduce((s, x) => s + (x.cashUsed || 0), 0)),
          openPositions: open.length,
          dayPnl,
          lastSignalKey: lastKey[symbol],
        },
      });
      if (r.state !== 'BUY CANDIDATE' && r.state !== 'SELL CANDIDATE') continue;
      lastKey[symbol] = r.key;
      const sim = E.simulateTrade(r.plan, d.c5, r.candle.t, cfg);
      if (sim.status !== 'closed') continue; // still open at the end of the data
      openUntil[symbol] = sim.exitTime;
      trades.push({
        id: `${mkt}:${symbol}:${r.candle.t}`,
        market: mkt,
        symbol,
        side: r.side,
        signalTime: r.candle.t,
        entryTime: sim.entryTime,
        exitTime: sim.exitTime,
        entryPrice: sim.entryPrice,
        exitPrice: sim.exitPrice,
        quantity: sim.quantity,
        cashUsed: round2(sim.entryPrice * sim.quantity),
        exitReason: sim.exitReason,
        grossPnl: sim.grossPnl,
        costs: sim.costs,
        netPnl: sim.netPnl,
        r: sim.r,
        score: r.score,
        status: 'closed',
      });
    }

    // 4. Summary.
    const stats = E.performanceStats(trades);
    const days = [...new Set(events.map((e) => E.marketParts(e.t, mkt).dateKey))].sort();
    const bucketOf = (x) => E.timeBucket(E.marketParts(x.signalTime, mkt).minutes, mkt);
    const lessons = E.learnFromTrades(
      trades.map((x) => ({
        side: x.side,
        symbol: x.symbol,
        r: x.r,
        net: x.netPnl,
        score: x.score?.[x.side] ?? null,
        minutes: E.marketParts(x.signalTime, mkt).minutes,
      })),
      cfg.threshold,
      mkt
    );
    const runId = `${mkt}-${Date.now()}`;
    const summary = {
      market: mkt,
      runId,
      ranAt: new Date().toISOString(),
      from: days[0] || null,
      to: days[days.length - 1] || null,
      sessions: days.length,
      symbols,
      missing: Object.entries(data)
        .filter(([, d]) => !d.c5.length)
        .map(([symbol, d]) => ({ symbol, error: d.error || 'No data' })),
      candles: events.length,
      ruleVersion: E.RULE_VERSION,
      settings: { capital: cfg.capital, riskPct: cfg.riskPct, threshold: cfg.threshold, rewardRisk: cfg.rewardRisk, allowShort: cfg.allowShort },
      stats,
      bySymbol: groupStats(trades, (x) => x.symbol),
      bySide: groupStats(trades, (x) => x.side),
      byTime: groupStats(trades, (x) => bucketOf(x)?.label || null),
      byExit: groupStats(trades, (x) => x.exitReason),
      lessons: lessons.rules.map((x) => ({ id: x.id, bump: x.bump, note: x.note })),
      recent: [...trades].sort((a, b) => b.exitTime - a.exitTime).slice(0, 30),
    };

    // 5. Save: this run's trades replace the market's previous ones.
    const Model = getModel('backtesttrades');
    await Model.deleteMany({ market: mkt });
    if (trades.length) await Model.insertMany(trades.map((x) => ({ ...x, runId, createdAt: summary.ranAt })));
    await getModel('backtests').updateOne({ id: mkt }, { $set: { id: mkt, data: summary, ranAt: summary.ranAt } }, { upsert: true });
    service.resetLearning(mkt);
    return summary;
  } finally {
    delete running[mkt];
  }
}

/** { running: { done, total, symbol } | null, summary | null } for a market. */
async function backtestStatus(market = 'NSE') {
  const mkt = service.marketId(market);
  const doc = await getModel('backtests').findOne({ id: mkt }).lean().catch(() => null);
  return { market: mkt, running: running[mkt] || null, summary: doc?.data || null };
}

/** Start a run in the background (the app polls backtestStatus). */
function startBacktest(market = 'NSE') {
  const mkt = service.marketId(market);
  if (running[mkt]) throw Object.assign(new Error('A backtest is already running for this market'), { status: 409 });
  runBacktest(mkt).catch((error) => console.error(`[backtest] ${mkt} failed`, error.message));
  return { started: true, market: mkt };
}

/**
 * Called by the scanner every 30 s: when a market is closed and its last
 * backtest is a week old (or there is none), run a fresh one, one market
 * at a time.
 */
async function autoBacktest() {
  if (Object.keys(running).length) return;
  const E = await service.engine();
  for (const mkt of service.MARKET_IDS) {
    if (E.isMarketOpen(Date.now(), mkt)) continue;
    if (lastAttempt[mkt] && Date.now() - lastAttempt[mkt] < RETRY_MS) continue;
    const doc = await getModel('backtests').findOne({ id: mkt }).lean().catch(() => null);
    if (doc?.ranAt && Date.now() - Date.parse(doc.ranAt) < AUTO_EVERY_MS) continue;
    const cfg = await service.getConfig(mkt);
    if (!cfg.scannerOn || !cfg.watchlist.length) continue;
    startBacktest(mkt);
    return;
  }
}

module.exports = { runBacktest, startBacktest, backtestStatus, autoBacktest };
