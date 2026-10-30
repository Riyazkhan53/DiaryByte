// Performance of closed paper trades, net of estimated charges. Judged on
// simulated fills (entry, stop, target, slippage, charges), not on whether
// the price moved the right way after a signal.

const round2 = (n) => Math.round(n * 100) / 100;

/** Largest fall of cumulative net P/L from a previous high (≤ 0). */
export function maxDrawdown(closed) {
  let peak = 0;
  let equity = 0;
  let worst = 0;
  [...closed]
    .sort((a, b) => (a.exitTime || 0) - (b.exitTime || 0))
    .forEach((t) => {
      equity += t.netPnl || 0;
      peak = Math.max(peak, equity);
      worst = Math.min(worst, equity - peak);
    });
  return round2(worst);
}

/**
 * Stats for closed trades ({ netPnl, r, exitReason, exitTime, plan }).
 * Returns { trades, wins, losses, winRate (%), netPnl, grossProfit,
 * grossLoss, profitFactor (null with no losses), avgNet, avgWin, avgLoss,
 * avgReturnPct (net P/L ÷ cash used, per trade), avgR, maxDrawdown, best,
 * worst, exits: { target, stop, eod, time } }.
 */
export function performanceStats(trades) {
  const closed = trades.filter((t) => t.status === 'closed' && Number.isFinite(t.netPnl));
  const wins = closed.filter((t) => t.netPnl > 0);
  const losses = closed.filter((t) => t.netPnl < 0);
  const sum = (list, f) => list.reduce((s, t) => s + f(t), 0);
  const avg = (list, f) => (list.length ? round2(sum(list, f) / list.length) : null);
  const grossProfit = round2(sum(wins, (t) => t.netPnl));
  const grossLoss = round2(sum(losses, (t) => t.netPnl));
  const withR = closed.filter((t) => t.r != null);
  const withCash = closed.filter((t) => t.plan?.cashUsed > 0);
  const exits = { target: 0, stop: 0, eod: 0, time: 0 };
  closed.forEach((t) => {
    if (t.exitReason in exits) exits[t.exitReason] += 1;
  });
  return {
    trades: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length ? Math.round((wins.length / closed.length) * 100) : null,
    netPnl: round2(sum(closed, (t) => t.netPnl)),
    grossProfit,
    grossLoss,
    profitFactor: losses.length ? round2(grossProfit / -grossLoss) : null,
    avgNet: avg(closed, (t) => t.netPnl),
    avgWin: avg(wins, (t) => t.netPnl),
    avgLoss: avg(losses, (t) => t.netPnl),
    avgReturnPct: avg(withCash, (t) => (t.netPnl / t.plan.cashUsed) * 100),
    avgR: avg(withR, (t) => t.r),
    maxDrawdown: maxDrawdown(closed),
    best: closed.length ? Math.max(...closed.map((t) => t.netPnl)) : null,
    worst: closed.length ? Math.min(...closed.map((t) => t.netPnl)) : null,
    exits,
  };
}

// Score bands for "do higher scores do better?".
export const SCORE_BANDS = [
  { label: '85+', min: 85, max: Infinity },
  { label: '75–84', min: 75, max: 84 },
  { label: 'Under 75', min: -Infinity, max: 74 },
];

/** performanceStats per score band of the trade's side. */
export function statsByScore(trades) {
  const scoreOf = (t) => (t.score ? t.score[t.side === 'short' ? 'short' : 'long'] : null);
  return SCORE_BANDS.map((b) => ({
    ...b,
    stats: performanceStats(trades.filter((t) => scoreOf(t) != null && scoreOf(t) >= b.min && scoreOf(t) <= b.max)),
  }));
}
