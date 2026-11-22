// Candlestick and chart patterns on completed 5-minute candles, shared by
// the app and the server. Each found pattern is
// { id, name, bias: 'bull' | 'bear' | 'neutral', strength: 1 (weak) | 2 (strong), note }.
//
// Candlestick (the last 1–3 candles): engulfing, hammer / shooting star,
// doji, morning / evening star, three white soldiers / black crows,
// marubozu, piercing line / dark cloud cover, inside bar (and its breakout).
// Chart (5-minute swings over the last two sessions): double bottom / top
// with a neckline break, and higher-highs-higher-lows / lower-highs-lower-lows
// structure.

import { swingPoints } from './levels.js';

const body = (c) => Math.abs(c.close - c.open);
const range = (c) => Math.max(c.high - c.low, 1e-9);
const upper = (c) => c.high - Math.max(c.open, c.close);
const lower = (c) => Math.min(c.open, c.close) - c.low;
const green = (c) => c.close > c.open;
const red = (c) => c.close < c.open;
const mid = (c) => (c.open + c.close) / 2;

/** Was price falling (rising) into the last candle? Close vs the close `n` candles back. */
const fell = (cs, n = 5) => cs.length > n && cs[cs.length - 1 - 1].close < cs[cs.length - 1 - n].close;
const rose = (cs, n = 5) => cs.length > n && cs[cs.length - 1 - 1].close > cs[cs.length - 1 - n].close;

export function candlePatterns(candles, atr) {
  const out = [];
  const cs = (candles || []).filter((c) => c && c.high > 0);
  if (cs.length < 3) return out;
  const a = cs[cs.length - 3];
  const b = cs[cs.length - 2];
  const c = cs[cs.length - 1];
  const big = (x) => body(x) >= Math.max((atr || 0) * 0.6, range(x) * 0.6);
  const add = (id, name, bias, strength, note) => out.push({ id, name, bias, strength, note });

  // Two-candle reversals
  if (red(b) && green(c) && c.close >= b.open && c.open <= b.close && body(c) > body(b)) {
    add('bullEngulfing', 'Bullish engulfing', 'bull', fell(cs) ? 2 : 1, 'A green candle swallowed the previous red one');
  }
  if (green(b) && red(c) && c.open >= b.close && c.close <= b.open && body(c) > body(b)) {
    add('bearEngulfing', 'Bearish engulfing', 'bear', rose(cs) ? 2 : 1, 'A red candle swallowed the previous green one');
  }
  if (red(b) && big(b) && green(c) && c.open < b.close && c.close > mid(b) && c.close < b.open) {
    add('piercing', 'Piercing line', 'bull', 1, 'Opened lower, closed above the middle of the red candle');
  }
  if (green(b) && big(b) && red(c) && c.open > b.close && c.close < mid(b) && c.close > b.open) {
    add('darkCloud', 'Dark cloud cover', 'bear', 1, 'Opened higher, closed below the middle of the green candle');
  }
  // One-candle shapes
  const smallBody = body(c) <= range(c) * 0.35;
  if (smallBody && lower(c) >= body(c) * 2 && upper(c) <= range(c) * 0.15) {
    if (fell(cs)) add('hammer', 'Hammer', 'bull', 1, 'Long lower wick after a fall: buyers stepped in');
    else if (rose(cs)) add('hangingMan', 'Hanging man', 'bear', 1, 'Long lower wick after a rise: selling showed up');
  }
  if (smallBody && upper(c) >= body(c) * 2 && lower(c) <= range(c) * 0.15) {
    if (rose(cs)) add('shootingStar', 'Shooting star', 'bear', 1, 'Long upper wick after a rise: sellers pushed back');
    else if (fell(cs)) add('invertedHammer', 'Inverted hammer', 'bull', 1, 'Long upper wick after a fall');
  }
  if (body(c) <= range(c) * 0.1) add('doji', 'Doji', 'neutral', 1, 'Open ≈ close: indecision');
  if (big(c) && body(c) >= range(c) * 0.85) {
    add(green(c) ? 'bullMarubozu' : 'bearMarubozu', green(c) ? 'Bullish marubozu' : 'Bearish marubozu', green(c) ? 'bull' : 'bear', 2, 'A full-bodied candle with almost no wicks');
  }
  // Three-candle patterns
  const smallMid = body(b) <= range(b) * 0.35 || body(b) <= body(a) * 0.4;
  if (red(a) && big(a) && smallMid && green(c) && c.close > mid(a)) add('morningStar', 'Morning star', 'bull', 2, 'Fall, pause, strong recovery');
  if (green(a) && big(a) && smallMid && red(c) && c.close < mid(a)) add('eveningStar', 'Evening star', 'bear', 2, 'Rise, pause, strong drop');
  if ([a, b, c].every(green) && b.close > a.close && c.close > b.close && [a, b, c].every((x) => body(x) >= range(x) * 0.5)) {
    add('threeSoldiers', 'Three white soldiers', 'bull', 2, 'Three strong green candles in a row');
  }
  if ([a, b, c].every(red) && b.close < a.close && c.close < b.close && [a, b, c].every((x) => body(x) >= range(x) * 0.5)) {
    add('threeCrows', 'Three black crows', 'bear', 2, 'Three strong red candles in a row');
  }
  // Inside bar: the previous candle inside the one before; the last breaks it.
  if (b.high <= a.high && b.low >= a.low) {
    if (c.close > a.high) add('insideBreakUp', 'Inside-bar breakout', 'bull', 2, 'Broke above the mother candle after a pause');
    else if (c.close < a.low) add('insideBreakDown', 'Inside-bar breakdown', 'bear', 2, 'Broke below the mother candle after a pause');
  } else if (c.high <= b.high && c.low >= b.low) {
    add('insideBar', 'Inside bar', 'neutral', 1, 'Range inside the previous candle: a breakout may follow');
  }
  return out;
}

const dayOf = (t, offsetMin) => new Date((typeof t === 'number' ? t : Date.parse(t)) + offsetMin * 60000).toISOString().slice(0, 10);

export function chartPatterns(candles, { atr, offsetMin = 330 } = {}) {
  const out = [];
  const all = (candles || []).filter((c) => c && c.high > 0);
  if (all.length < 20) return out;
  const days = [...new Set(all.map((c) => dayOf(c.t, offsetMin)))].slice(-2);
  const cs = all.filter((c) => days.includes(dayOf(c.t, offsetMin)));
  const last = cs[cs.length - 1];
  const tol = Math.max(last.close * 0.003, (atr || 0) * 0.5);
  const { highs, lows } = swingPoints(cs, 3);
  // Double bottom: the last two swing lows level, and the close above the
  // high between them (the neckline).
  if (lows.length >= 2) {
    const [l1, l2] = lows.slice(-2);
    if (Math.abs(l1.price - l2.price) <= tol && l2.i - l1.i >= 5) {
      const neck = Math.max(...cs.slice(l1.i, l2.i + 1).map((c) => c.high));
      if (last.close > neck) out.push({ id: 'doubleBottom', name: 'Double bottom', bias: 'bull', strength: 2, note: `Two lows near ${l2.price.toFixed(2)}, broke the ${neck.toFixed(2)} neckline` });
    }
  }
  if (highs.length >= 2) {
    const [h1, h2] = highs.slice(-2);
    if (Math.abs(h1.price - h2.price) <= tol && h2.i - h1.i >= 5) {
      const neck = Math.min(...cs.slice(h1.i, h2.i + 1).map((c) => c.low));
      if (last.close < neck) out.push({ id: 'doubleTop', name: 'Double top', bias: 'bear', strength: 2, note: `Two highs near ${h2.price.toFixed(2)}, broke the ${neck.toFixed(2)} neckline` });
    }
  }
  // Structure from the last three swing highs and lows.
  if (highs.length >= 3 && lows.length >= 3) {
    const h = highs.slice(-3).map((x) => x.price);
    const l = lows.slice(-3).map((x) => x.price);
    if (h[0] < h[1] && h[1] < h[2] && l[0] < l[1] && l[1] < l[2]) out.push({ id: 'higherHighs', name: 'Higher highs & higher lows', bias: 'bull', strength: 1, note: 'Uptrend structure on 5-minute swings' });
    if (h[0] > h[1] && h[1] > h[2] && l[0] > l[1] && l[1] > l[2]) out.push({ id: 'lowerLows', name: 'Lower highs & lower lows', bias: 'bear', strength: 1, note: 'Downtrend structure on 5-minute swings' });
  }
  return out;
}

export const PATTERN_POINTS = { 1: 5, 2: 10 };
export const PATTERN_CAP = 10;

/**
 * Score change from patterns for one side: + for patterns in the trade's
 * direction, − for patterns against it, each side capped at ±10.
 * Returns { plus, minus, for: [...], against: [...] }.
 */
export function patternAdjust(patterns, side) {
  const want = side === 'long' ? 'bull' : 'bear';
  const forIt = patterns.filter((p) => p.bias === want);
  const against = patterns.filter((p) => p.bias !== 'neutral' && p.bias !== want);
  const sum = (list) => Math.min(PATTERN_CAP, list.reduce((s, p) => s + PATTERN_POINTS[p.strength], 0));
  return { plus: sum(forIt), minus: sum(against), for: forIt, against };
}
