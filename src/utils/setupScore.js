/**
 * setupScore.js — stock setup confluence scoring (framework-agnostic).
 * Used by the Setup Check screen (src/app/setup-check.js).
 *
 * Usage:
 *   import { scoreSetup } from './setupScore.js';
 *   const r = scoreSetup({ price: 512, prevClose: 505, ema20: 498, ema50: 480,
 *                          rsi: 61, macd: 4.2, macdSignal: 3.1,
 *                          volume: 2400000, avgVolume: 1600000,
 *                          vwap: 507, swingHigh: 510, swingLow: 470 }, 65);
 *   r.signal   // 'BUY' | 'SELL' | 'WAIT'
 *   r.bullPct  // 0–100
 *
 * Any field can be left out; only the checks with data are scored.
 * Not financial advice: the score shows how many indicators agree, not the odds of a win.
 */

export const DEFAULT_THRESHOLD = 65;
export const MIN_CHECKS = 3;

export function scoreSetup(input, threshold = DEFAULT_THRESHOLD) {
  const d = {};
  for (const [k, v] of Object.entries(input || {})) {
    const n = typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) : v;
    if (Number.isFinite(n)) d[k] = n;
  }
  const has = (...keys) => keys.every((k) => k in d);
  const checks = [];
  const warnings = [];
  const add = (id, name, weight, vote, note) => checks.push({ id, name, weight, vote, note });

  // 1. Short-term trend: price vs EMA 20
  if (has('price', 'ema20')) {
    const v = Math.sign(d.price - d.ema20);
    add('ema20', 'Price vs EMA 20', 15, v,
      v > 0 ? 'Price is above the 20 EMA' : v < 0 ? 'Price is below the 20 EMA' : 'Price is sitting on the 20 EMA');
  }

  // 2. Trend structure: EMA 20 vs EMA 50
  if (has('ema20', 'ema50')) {
    const v = Math.sign(d.ema20 - d.ema50);
    add('emaCross', 'EMA 20 vs EMA 50', 20, v,
      v > 0 ? '20 EMA is above the 50 EMA (uptrend)' : v < 0 ? '20 EMA is below the 50 EMA (downtrend)' : 'EMAs are flat together');
  }

  // 3. Momentum: RSI
  if (has('rsi')) {
    const r = d.rsi;
    let v = 0, note = 'RSI is in the neutral zone (45–55)';
    if (r > 70) { note = 'RSI above 70: strong but overbought'; warnings.push('RSI is overbought, so a pullback is common before more upside.'); }
    else if (r >= 55) { v = 1; note = 'RSI between 55 and 70: bullish momentum'; }
    else if (r < 30) { note = 'RSI below 30: weak but oversold'; warnings.push('RSI is oversold, so a bounce is common before more downside.'); }
    else if (r <= 45) { v = -1; note = 'RSI between 30 and 45: bearish momentum'; }
    add('rsi', 'RSI (14)', 15, v, note);
  }

  // 4. Momentum: MACD vs signal
  if (has('macd', 'macdSignal')) {
    const v = Math.sign(d.macd - d.macdSignal);
    add('macd', 'MACD vs signal', 15, v,
      v > 0 ? 'MACD is above its signal line' : v < 0 ? 'MACD is below its signal line' : 'MACD is on its signal line');
  }

  // 5. Volume confirms today's move
  if (has('volume', 'avgVolume', 'price', 'prevClose') && d.avgVolume > 0) {
    const ratio = d.volume / d.avgVolume;
    const move = Math.sign(d.price - d.prevClose);
    let v = 0, note;
    if (ratio >= 1.2 && move !== 0) {
      v = move;
      note = `Volume is ${ratio.toFixed(1)}× average and backs the ${move > 0 ? 'up' : 'down'} move`;
    } else if (ratio < 0.8) {
      note = `Volume is only ${ratio.toFixed(1)}× average, so the move lacks conviction`;
      warnings.push('Low volume: signals on thin volume fail more often.');
    } else {
      note = `Volume is ${ratio.toFixed(1)}× average, which is normal`;
    }
    add('volume', 'Volume vs 20-day average', 15, v, note);
  }

  // 6. Intraday value: price vs VWAP
  if (has('price', 'vwap')) {
    const v = Math.sign(d.price - d.vwap);
    add('vwap', 'Price vs VWAP', 10, v,
      v > 0 ? 'Price is above VWAP (buyers in control)' : v < 0 ? 'Price is below VWAP (sellers in control)' : 'Price is at VWAP');
  }

  // 7. Breakout / breakdown of recent range
  if (has('price') && (has('swingHigh') || has('swingLow'))) {
    let v = 0, note = 'Price is inside its recent range';
    if (has('swingHigh') && d.price > d.swingHigh) { v = 1; note = 'Price broke above the recent swing high'; }
    else if (has('swingLow') && d.price < d.swingLow) { v = -1; note = 'Price broke below the recent swing low'; }
    add('breakout', 'Breakout of recent range', 10, v, note);
  }

  const total = checks.reduce((s, c) => s + c.weight, 0);
  const bull = checks.filter((c) => c.vote > 0).reduce((s, c) => s + c.weight, 0);
  const bear = checks.filter((c) => c.vote < 0).reduce((s, c) => s + c.weight, 0);
  const bullPct = total ? Math.round((bull / total) * 100) : 0;
  const bearPct = total ? Math.round((bear / total) * 100) : 0;

  let signal = 'WAIT';
  let reason;
  if (checks.length < MIN_CHECKS) {
    reason = `Fill in at least ${MIN_CHECKS} indicators to get a reading.`;
  } else if (bullPct >= threshold) {
    signal = 'BUY'; reason = `${bullPct}% of the weighted checks are bullish (needs ${threshold}%).`;
  } else if (bearPct >= threshold) {
    signal = 'SELL'; reason = `${bearPct}% of the weighted checks are bearish (needs ${threshold}%).`;
  } else {
    reason = `No side reaches ${threshold}%: bullish ${bullPct}%, bearish ${bearPct}%.`;
  }

  return {
    signal, reason, threshold,
    bullPct, bearPct, neutralPct: Math.max(0, 100 - bullPct - bearPct),
    checks, warnings, checksUsed: checks.length, checksTotal: 7,
  };
}

