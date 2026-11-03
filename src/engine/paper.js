// Paper-trade simulation on candles, with conservative fill rules:
// - entry at the NEXT candle's open after the signal candle (never at the
//   signal candle's close), plus slippage;
// - a candle that touches both stop and target is settled on 1-minute
//   candles when given (`fine`); without them, or if a 1-minute candle
//   also touches both, it counts as the stop;
// - an optional maximum holding time exits at the next candle's open;
// - once the trade is trailAtR × its risk in profit (at a candle close),
//   the stop moves to the entry price ("trail to breakeven");
// - the trade exits at the next candle's open when the setup breaks: a
//   candle closes on the wrong side of VWAP *and* EMA 9 has crossed EMA 21
//   against it (two things together, not one indicator flipping);
// - a gap through the stop fills at the open (worse than the stop);
// - open positions are squared off at 15:20 IST (intraday);
// - estimated charges come off the gross P/L.

import { estimateCosts, DEFAULT_CONFIG } from './risk.js';
import { emaSeries } from './indicators.js';
import { istMinutes, istParts } from './time.js';

const round2 = (n) => Math.round(n * 100) / 100;
const SQUARE_OFF = istMinutes('15:20');
const SQUARE_OFF_WARN = istMinutes('15:10');

/** Session VWAP at every candle (resets each IST day). */
function vwapSeries(candles) {
  let day = null;
  let pv = 0;
  let vol = 0;
  return candles.map((c) => {
    const d = istParts(c.t).dateKey;
    if (d !== day) {
      day = d;
      pv = 0;
      vol = 0;
    }
    pv += ((c.high + c.low + c.close) / 3) * (c.volume || 0);
    vol += c.volume || 0;
    return vol > 0 ? pv / vol : null;
  });
}

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
 *   exitTime, exitPrice, exitReason: 'stop' | 'target' | 'trail' | 'weak' |
 *   'eod' | 'time', grossPnl, costs, netPnl, r, bothTouched?, resolvedBy?:
 *   '1m' | 'conservative', stopMoved?, finalStop }. An open trade also has
 *   { lastPrice, openPnl (net of est. charges), liveAction: 'HOLD' |
 *   'TRAIL SL' | 'EXIT / TRAIL SL' | 'SQUARE OFF', actionNote }.
 */
export function simulateTrade(plan, candles, signalTime, config = DEFAULT_CONFIG, { fine } = {}) {
  const slipPct = (config.slippagePct ?? DEFAULT_CONFIG.slippagePct) / 100;
  const d = plan.side === 'short' ? -1 : 1;
  const firstAfter = candles.findIndex((c) => c.t > signalTime);
  if (firstAfter < 0) return { status: 'pending', liveAction: 'ENTRY PENDING', actionNote: 'Enters at the next candle\u2019s open' };
  const after = candles.slice(firstAfter);
  const trailAtR = config.trailAtR ?? DEFAULT_CONFIG.trailAtR;
  const weakExit = config.weakExit ?? DEFAULT_CONFIG.weakExit;
  const closes = candles.map((c) => c.close);
  const e9 = emaSeries(closes, 9);
  const e21 = emaSeries(closes, 21);
  const vwap = vwapSeries(candles);

  const entryCandle = after[0];
  const entryPrice = round2(entryCandle.open * (1 + d * slipPct));
  const entryDay = istParts(entryCandle.t).dateKey;
  // The plan's stop/target distances, re-anchored on the actual fill.
  const stop = round2(entryPrice - (plan.entry - plan.stop));
  const target = round2(entryPrice + (plan.target - plan.entry));
  const qty = plan.quantity;
  const base = { entryTime: entryCandle.t, entryPrice, stop, target, quantity: qty };
  const risk = Math.abs(entryPrice - stop);
  let stopNow = stop;
  let stopMoved = false;
  let weakPending = false;

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
      stopMoved,
      finalStop: stopNow,
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
    if (weakPending) return close(c.t, c.open, 'weak');
    const stop = stopNow;
    const stopReason = stopMoved ? 'trail' : 'stop';
    const hitStop = d > 0 ? c.low <= stop : c.high >= stop;
    const hitTarget = d > 0 ? c.high >= target : c.low <= target;
    if (hitStop && hitTarget) {
      const gapped = d > 0 ? c.open < stop : c.open > stop;
      const gappedTarget = d > 0 ? c.open > target : c.open < target;
      // An open beyond either level settles it without finer data.
      if (gapped) return { ...close(c.t, c.open, stopReason), bothTouched: true, resolvedBy: 'open' };
      if (gappedTarget) return { ...close(c.t, c.open, 'target'), bothTouched: true, resolvedBy: 'open' };
      const first = firstTouched(fine, c.t, d, stop, target);
      return first === 'target'
        ? { ...close(c.t, target, 'target'), bothTouched: true, resolvedBy: '1m' }
        : { ...close(c.t, stop, stopReason), bothTouched: true, resolvedBy: first ? '1m' : 'conservative' };
    }
    if (hitStop) {
      const gapped = d > 0 ? c.open < stop : c.open > stop;
      return close(c.t, gapped ? c.open : stop, stopReason);
    }
    if (hitTarget) {
      const gapped = d > 0 ? c.open > target : c.open < target;
      return close(c.t, gapped ? c.open : target, 'target');
    }
    // At the candle's close: trail the stop, or flag a broken setup.
    const k = firstAfter + i;
    if (trailAtR > 0 && !stopMoved && risk > 0 && (c.close - entryPrice) * d >= risk * trailAtR) {
      stopNow = entryPrice;
      stopMoved = true;
    }
    if (weakExit && vwap[k] != null && e9[k] != null && e21[k] != null) {
      const below = d > 0 ? c.close < vwap[k] && e9[k] < e21[k] : c.close > vwap[k] && e9[k] > e21[k];
      if (below) weakPending = true;
    }
  }
  // Still open: where it stands and what to do now.
  const last = after[after.length - 1];
  const lastPrice = last.close;
  const gross = (lastPrice - entryPrice) * qty * d;
  const estCosts = estimateCosts(d > 0 ? entryPrice * qty : lastPrice * qty, d > 0 ? lastPrice * qty : entryPrice * qty, config.charges);
  const lateNow = istParts(last.t).minutes + 5 >= SQUARE_OFF_WARN;
  const [liveAction, actionNote] = lateNow
    ? ['SQUARE OFF', 'Close to 15:20: square off this position']
    : weakPending
      ? ['EXIT / TRAIL SL', `Setup broke: closed ${d > 0 ? 'below' : 'above'} VWAP with EMA 9 ${d > 0 ? 'under' : 'over'} EMA 21 — exits at the next candle's open`]
      : stopMoved
        ? ['TRAIL SL', `In profit by ${trailAtR}R: stop moved to entry ₹${entryPrice}, so it can't turn into a loss`]
        : ['HOLD', `Stop ₹${stopNow} · target ₹${target}`];
  return {
    ...base,
    status: 'open',
    stopMoved,
    finalStop: stopNow,
    lastPrice: round2(lastPrice),
    openPnl: round2(gross - estCosts),
    liveAction,
    actionNote,
  };
}

/** Net P/L of trades closed on IST day `dateKey`. */
export function dayNetPnl(trades, dateKey) {
  return round2(
    trades
      .filter((t) => t.status === 'closed' && t.exitTime && istParts(t.exitTime).dateKey === dateKey)
      .reduce((s, t) => s + (t.netPnl || 0), 0)
  );
}
