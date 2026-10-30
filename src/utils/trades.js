// Paper trades: simulated positions to practise a setup and review later.
//
// trade: { id, symbol, name, market ('IN' | 'US'), side ('long' | 'short'),
//          entryPrice, quantity, stopLoss?, target?, entryDate,
//          setupId?, setupSignal?, setupBullPct?, setupBearPct?, plan?,
//          status ('open' | 'closed'), exitPrice?, exitDate?,
//          exitReason? ('target' | 'stop' | 'manual'), followedPlan?, review? }

const round2 = (n) => Math.round(n * 100) / 100;

export const EXIT_REASONS = [
  { key: 'target', label: 'Target hit' },
  { key: 'stop', label: 'Stop-loss hit' },
  { key: 'manual', label: 'Closed early' },
];

export const exitReasonLabel = (key) => EXIT_REASONS.find((r) => r.key === key)?.label || 'Closed';

const direction = (trade) => (trade.side === 'short' ? -1 : 1);

/** Profit or loss at `price` (in the stock's own currency). */
export function tradePnl(trade, price) {
  if (!(price > 0) || !(trade.entryPrice > 0) || !(trade.quantity > 0)) return null;
  return round2((price - trade.entryPrice) * trade.quantity * direction(trade));
}

/** Move at `price` as a % of the entry, in the trade's favour when positive. */
export function tradePct(trade, price) {
  if (!(price > 0) || !(trade.entryPrice > 0)) return null;
  return ((price - trade.entryPrice) / trade.entryPrice) * 100 * direction(trade);
}

/** Money at risk per share: entry to stop-loss. Null without a valid stop. */
export function riskPerShare(trade) {
  if (!(trade.stopLoss > 0) || !(trade.entryPrice > 0)) return null;
  const risk = (trade.entryPrice - trade.stopLoss) * direction(trade);
  return risk > 0 ? risk : null;
}

/** Result in R: profit per share ÷ risk per share (e.g. +2R, −1R). */
export function rMultiple(trade, price) {
  const risk = riskPerShare(trade);
  if (!risk || !(price > 0)) return null;
  return round2(((price - trade.entryPrice) * direction(trade)) / risk);
}

/** Reward ÷ risk planned at entry, from the target and stop-loss. */
export function plannedRR(trade) {
  const risk = riskPerShare(trade);
  if (!risk || !(trade.target > 0)) return null;
  const reward = (trade.target - trade.entryPrice) * direction(trade);
  return reward > 0 ? round2(reward / risk) : null;
}

/** 'stop' or 'target' when `price` has reached either, else null. */
export function levelHit(trade, price) {
  if (!(price > 0)) return null;
  const d = direction(trade);
  if (trade.stopLoss > 0 && (price - trade.stopLoss) * d <= 0) return 'stop';
  if (trade.target > 0 && (price - trade.target) * d >= 0) return 'target';
  return null;
}

export function daysHeld(trade) {
  const start = new Date(trade.entryDate);
  const end = trade.exitDate ? new Date(trade.exitDate) : new Date();
  return Math.max(0, Math.round((end - start) / 86400000));
}

/**
 * Review numbers for closed trades. Money is totalled per currency (₹ for
 * Indian, $ for US trades); win rate and R work across both.
 */
export function tradeStats(closed) {
  const rows = closed
    .map((t) => ({ trade: t, pnl: tradePnl(t, t.exitPrice), r: rMultiple(t, t.exitPrice) }))
    .filter((x) => x.pnl != null);
  const wins = rows.filter((x) => x.pnl > 0);
  const losses = rows.filter((x) => x.pnl < 0);
  const byCurrency = (list) =>
    list.reduce(
      (acc, x) => {
        acc[x.trade.market === 'US' ? 'USD' : 'INR'] += x.pnl;
        return acc;
      },
      { INR: 0, USD: 0 }
    );
  const avg = (list, pick) => (list.length ? list.reduce((s, x) => s + pick(x), 0) / list.length : null);
  const withR = rows.filter((x) => x.r != null);
  const bySignal = {};
  rows.forEach((x) => {
    const key = x.trade.setupSignal || 'None';
    bySignal[key] = bySignal[key] || { trades: 0, wins: 0 };
    bySignal[key].trades += 1;
    if (x.pnl > 0) bySignal[key].wins += 1;
  });
  const grossWin = byCurrency(wins);
  const grossLoss = byCurrency(losses);
  return {
    count: rows.length,
    wins: wins.length,
    losses: losses.length,
    winRate: rows.length ? Math.round((wins.length / rows.length) * 100) : null,
    net: byCurrency(rows),
    avgWinPct: avg(wins, (x) => tradePct(x.trade, x.trade.exitPrice)),
    avgLossPct: avg(losses, (x) => tradePct(x.trade, x.trade.exitPrice)),
    avgR: withR.length ? round2(avg(withR, (x) => x.r)) : null,
    // Gross profit ÷ gross loss, per currency; null when there are no losses.
    profitFactor: {
      INR: grossLoss.INR < 0 ? round2(grossWin.INR / -grossLoss.INR) : null,
      USD: grossLoss.USD < 0 ? round2(grossWin.USD / -grossLoss.USD) : null,
    },
    followedPlan: {
      yes: rows.filter((x) => x.trade.followedPlan === true).length,
      no: rows.filter((x) => x.trade.followedPlan === false).length,
    },
    bySignal,
  };
}
