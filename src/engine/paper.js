// Paper-trade simulation on candles, with conservative fill rules:
// - entry at the NEXT candle's open after the signal candle (never at the
//   signal candle's close), plus slippage;
// - a candle that touches both stop and target is settled on 1-minute
//   candles when given (`fine`); without them, or if a 1-minute candle
//   also touches both, it counts as the stop;
// - an optional maximum holding time exits at the next candle's open;
// - a gap through the stop fills at the open (worse than the stop);
// - open positions are squared off at 15:20 IST (intraday);
// - estimated charges come off the gross P/L.

import { estimateCosts, DEFAULT_CONFIG } from './risk.js';
import { istMinutes, istParts } from './time.js';

const round2 = (n) => Math.round(n * 100) / 100;
const SQUARE_OFF = istMinutes('15:20');

const STEP_5M = 5 * 60000;

/**
 * Which level a 5-minute candle that touched both reached first, from the
 * 1-minute candles inside it: 'stop', 'target', or null when they don't
 * cover it or one of them touched both too.
 */
function firstTouched(fine, start, d, stop, target) {
  const inside = (fine || []).filter((m) => m.t >= start && m.t < start + STEP_5M).sort((a, b) => a.t - b.t);
  for (const m of inside) {
    const s = d > 0 ? m.low <= stop : m.high >= stop;
    const t = d > 0 ? m.high >= target : m.low <= target;
    if (s && t) return null;
    if (s) return 'stop';
    if (t) return 'target';
  }
  return null;
}

/**
 * Simulate `plan` (from planTrade, with signalTime = the signal candle's
 * start) over the 5-minute candles after it. `fine`: optional 1-minute
 * candles to settle candles that touched both levels. Returns the trade so
 * far: { status: 'pending' | 'open' | 'closed', entryTime, entryPrice,
 *   exitTime, exitPrice, exitReason: 'stop' | 'target' | 'eod' | 'time',
 *   grossPnl, costs, netPnl, r, bothTouched?, resolvedBy?: '1m' |
 *   'conservative' }.
 */
export function simulateTrade(plan, candles, signalTime, config = DEFAULT_CONFIG, { fine } = {}) {
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

  const maxHoldMs = (config.maxHoldMin ?? DEFAULT_CONFIG.maxHoldMin) * 60000;
  for (let i = 0; i < after.length; i += 1) {
    const c = after[i];
    const { dateKey, minutes } = istParts(c.t);
    if (dateKey !== entryDay || minutes >= SQUARE_OFF) {
      // Square off at the open of the first candle at/after 15:20 (or next day's open).
      return close(c.t, c.open, 'eod');
    }
    if (maxHoldMs > 0 && c.t - entryCandle.t >= maxHoldMs) return close(c.t, c.open, 'time');
    const hitStop = d > 0 ? c.low <= stop : c.high >= stop;
    const hitTarget = d > 0 ? c.high >= target : c.low <= target;
    if (hitStop && hitTarget) {
      const gapped = d > 0 ? c.open < stop : c.open > stop;
      const gappedTarget = d > 0 ? c.open > target : c.open < target;
      // An open beyond either level settles it without finer data.
      if (gapped) return { ...close(c.t, c.open, 'stop'), bothTouched: true, resolvedBy: 'open' };
      if (gappedTarget) return { ...close(c.t, c.open, 'target'), bothTouched: true, resolvedBy: 'open' };
      const first = firstTouched(fine, c.t, d, stop, target);
      return first === 'target'
        ? { ...close(c.t, target, 'target'), bothTouched: true, resolvedBy: '1m' }
        : { ...close(c.t, stop, 'stop'), bothTouched: true, resolvedBy: first ? '1m' : 'conservative' };
    }
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
