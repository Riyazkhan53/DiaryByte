// Auto-close for your own paper trades (My Trading → Open): when the last
// traded price reaches a trade's target or stop-loss, the trade is closed at
// that level. Runs with the scanner every 5 minutes in each market's hours,
// so it works with the app closed. Trades with autoClose: false are left
// for you to close.

const { getModel } = require('../models');
const { getQuotes } = require('../quotes');

const isUs = (t) => t.market === 'US';
const dir = (t) => (t.side === 'short' ? -1 : 1);

/** 'stop' | 'target' | null for a trade at `price` (same rule as the app). */
function levelHit(t, price) {
  if (!(price > 0)) return null;
  const d = dir(t);
  if (t.stopLoss > 0 && (price - t.stopLoss) * d <= 0) return 'stop';
  if (t.target > 0 && (price - t.target) * d >= 0) return 'target';
  return null;
}

const wantsAutoClose = (t) => t && t.status !== 'closed' && t.autoClose !== false && t.symbol && (t.stopLoss > 0 || t.target > 0);

/** The IST calendar date (the app's dates are Indian). */
const istDate = (now = Date.now()) => new Date(now + 330 * 60000).toISOString().slice(0, 10);

/**
 * Close the open paper trades of a market ('NSE' | 'US') whose target or stop
 * has been reached. Returns the closed trades.
 */
async function autoClosePaperTrades(market, { quotesFn = getQuotes, now = Date.now() } = {}) {
  const Model = getModel('trades');
  const open = (await Model.find({}).lean()).filter((t) => wantsAutoClose(t) && isUs(t) === (market === 'US'));
  if (!open.length) return [];
  const { quotes } = await quotesFn([...new Set(open.map((t) => t.symbol))]);
  const closed = [];
  for (const t of open) {
    const q = quotes?.[String(t.symbol).toUpperCase()] || quotes?.[t.symbol];
    if (!q || q.stale) continue;
    const hit = levelHit(t, q.price);
    if (!hit) continue;
    const change = {
      status: 'closed',
      exitPrice: hit === 'stop' ? t.stopLoss : t.target,
      exitDate: istDate(now),
      exitReason: hit,
      closedBy: 'auto',
      updatedAt: new Date(now).toISOString(),
    };
    await Model.updateOne({ id: t.id }, { $set: change });
    closed.push({ ...t, ...change });
  }
  return closed;
}

module.exports = { autoClosePaperTrades, levelHit };
