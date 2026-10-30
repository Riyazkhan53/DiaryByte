// Paper-trade simulation on candles, with conservative fill rules:
// - entry at the NEXT candle's open after the signal candle (never at the
//   signal candle's close), plus slippage;
// - a candle that touches both stop and target counts as the stop;
// - a gap through the stop fills at the open (worse than the stop);
// - open positions are squared off at 15:20 IST (intraday);
// - estimated charges come off the gross P/L.

import { estimateCosts, DEFAULT_CONFIG } from './risk.js';
import { istMinutes, istParts } from './time.js';

const round2 = (n) => Math.round(n * 100) / 100;
const SQUARE_OFF = istMinutes('15:20');

/**
 * Simulate `plan` (from planTrade, with signalTime = the signal candle's
 * start) over the candles after it. Returns the trade so far:
 * { status: 'pending' | 'open' | 'closed', entryTime, entryPrice, exitTime,
 *   exitPrice, exitReason: 'stop' | 'target' | 'eod', grossPnl, costs,
 *   netPnl, r }.
 */
export function simulateTrade(plan, candles, signalTime, config = DEFAULT_CONFIG) {
  const slipPct = (config.slippagePct ?? DEFAULT_CONFIG.slippagePct) / 100;
  const d = plan.side === 'short' ? -1 : 1;
  const after = candles.filter((c) => c.t > signalTime);
  if (!after.length) return { status: 'pending' };

  const entryCandle = after[0];
  const entryPrice = round2(entryCandle.open * (1 + d * slipPct));
  const entryDay = istParts(entryCandle.t).dateKey;
  // The plan's stop/target distances, re-anchored on the actual fill.
  const stop = round2(entryPrice - (plan.entry - plan.stop));
  const target = round2(entryPrice + (plan.target - plan.entry));
  const qty = plan.quantity;
  const base = { entryTime: entryCandle.t, entryPrice, stop, target, quantity: qty };

  const close = (exitTime, rawExit, exitReason) => {
    // Exits lose slippage too.
    const exitPrice = round2(rawExit * (1 - d * slipPct));
    const grossPnl = round2((exitPrice - entryPrice) * qty * d);
    const buy = d > 0 ? entryPrice * qty : exitPrice * qty;
    const sell = d > 0 ? exitPrice * qty : entryPrice * qty;
    const costs = estimateCosts(buy, sell, config.charges);
    const riskPerShare = Math.abs(entryPrice - stop);
    return {
      ...base,
      status: 'closed',
      exitTime,
      exitPrice,
      exitReason,
      grossPnl,
      costs,
      netPnl: round2(grossPnl - costs),
      r: riskPerShare > 0 ? round2(((exitPrice - entryPrice) * d) / riskPerShare) : null,
    };
  };

  for (let i = 0; i < after.length; i += 1) {
    const c = after[i];
    const { dateKey, minutes } = istParts(c.t);
    if (dateKey !== entryDay || minutes >= SQUARE_OFF) {
      // Square off at the open of the first candle at/after 15:20 (or next day's open).
      return close(c.t, c.open, 'eod');
    }
    const hitStop = d > 0 ? c.low <= stop : c.high >= stop;
    const hitTarget = d > 0 ? c.high >= target : c.low <= target;
    if (hitStop) {
      const gapped = d > 0 ? c.open < stop : c.open > stop;
      return close(c.t, gapped ? c.open : stop, 'stop');
    }
    if (hitTarget) {
      const gapped = d > 0 ? c.open > target : c.open < target;
      return close(c.t, gapped ? c.open : target, 'target');
    }
  }
  return { ...base, status: 'open' };
}

/** Net P/L of trades closed on IST day `dateKey`. */
export function dayNetPnl(trades, dateKey) {
  return round2(
    trades
      .filter((t) => t.status === 'closed' && t.exitTime && istParts(t.exitTime).dateKey === dateKey)
      .reduce((s, t) => s + (t.netPnl || 0), 0)
  );
}
