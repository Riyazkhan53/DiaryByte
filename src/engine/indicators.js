// Indicators on candles (oldest first). Every function returns null when
// there isn't enough history ("warm-up"), never a partial value.

import { marketParts } from './time.js';

/** EMA series, seeded with the simple average of the first `period` values. */
export function emaSeries(values, period) {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
  const out = new Array(period - 1).fill(null);
  out.push(ema);
  for (let i = period; i < values.length; i += 1) {
    ema = values[i] * k + ema * (1 - k);
    out.push(ema);
  }
  return out;
}

const last = (series) => (series.length ? series[series.length - 1] : null);

export const ema = (values, period) => last(emaSeries(values, period));

/** Wilder's RSI. */
export function rsi(closes, period = 14) {
  if (closes.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gain += change;
    else loss -= change;
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < closes.length; i += 1) {
    const change = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(change, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-change, 0)) / period;
  }
  if (loss === 0) return gain === 0 ? 50 : 100;
  return 100 - 100 / (1 + gain / loss);
}

/** MACD line and signal (EMA-seeded as above). */
export function macd(closes, fast = 12, slow = 26, signal = 9) {
  const fastEma = emaSeries(closes, fast);
  const slowEma = emaSeries(closes, slow);
  if (!slowEma.length) return null;
  const line = closes
    .map((_, i) => (fastEma[i] != null && slowEma[i] != null ? fastEma[i] - slowEma[i] : null))
    .filter((v) => v != null);
  const signalSeries = emaSeries(line, signal);
  if (!signalSeries.length) return null;
  return { macd: last(line), signal: last(signalSeries), histogram: last(line) - last(signalSeries) };
}

/** Wilder's Average True Range. */
export function atr(candles, period = 14) {
  if (candles.length <= period) return null;
  const tr = candles.slice(1).map((c, i) => {
    const prevClose = candles[i].close;
    return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
  });
  let value = tr.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < tr.length; i += 1) value = (value * (period - 1) + tr[i]) / period;
  return value;
}

/**
 * Session VWAP: typical price × volume over the candles of the same
 * trading day (in the market's local time) as the last candle; it resets
 * every session. Null when the session has no volume yet.
 */
export function sessionVwap(candles, market = 'NSE') {
  if (!candles.length) return null;
  const dayOf = (t) => marketParts(t, market).dateKey;
  const day = dayOf(candles[candles.length - 1].t);
  let pv = 0;
  let vol = 0;
  for (let i = candles.length - 1; i >= 0 && dayOf(candles[i].t) === day; i -= 1) {
    const c = candles[i];
    pv += ((c.high + c.low + c.close) / 3) * c.volume;
    vol += c.volume;
  }
  return vol > 0 ? pv / vol : null;
}

// Early in the session: earlier candles needed today before a signal (so
// the opening candle alone can't trigger one), and earlier days needed for
// the same-time comparison.
export const EARLY_MIN_CANDLES = 2;
const EARLY_MIN_DAYS = 2;

/**
 * Volume of the last candle against what is normal (pass completed candles
 * only, so the forming candle is never in either number):
 * - once the session has `n` earlier candles: their average ('session');
 * - before that: the same 5-minute slot on earlier days ('sameTime'), since
 *   the open trades far more than midday and today's few candles would be a
 *   skewed yardstick. Needs EARLY_MIN_CANDLES earlier candles today and the
 *   slot on at least EARLY_MIN_DAYS earlier days.
 * Returns { volume, avg, ratio, count, needed, basis }; avg and ratio are
 * null while neither is available (`needed` = candles today required).
 */
export function volumeStats(candles, n = 20, market = 'NSE') {
  if (!candles.length) return { volume: null, avg: null, ratio: null, count: 0, needed: EARLY_MIN_CANDLES, basis: null };
  const parts = (t) => marketParts(t, market);
  const last = candles[candles.length - 1];
  const { dateKey: day, minutes: slot } = parts(last.t);
  const prior = [];
  for (let i = candles.length - 2; i >= 0 && prior.length < n && parts(candles[i].t).dateKey === day; i -= 1) {
    prior.push(candles[i]);
  }
  let avg = null;
  let basis = null;
  let needed = n;
  if (prior.length === n) {
    avg = prior.reduce((s, c) => s + c.volume, 0) / n;
    basis = 'session';
  } else {
    const sameSlot = candles.filter((c) => {
      const p = parts(c.t);
      return p.dateKey !== day && p.minutes === slot && c.volume > 0;
    });
    if (sameSlot.length >= EARLY_MIN_DAYS) {
      needed = EARLY_MIN_CANDLES;
      if (prior.length >= EARLY_MIN_CANDLES) {
        avg = sameSlot.reduce((s, c) => s + c.volume, 0) / sameSlot.length;
        basis = 'sameTime';
      }
    }
  }
  return {
    volume: last.volume,
    avg,
    ratio: avg > 0 ? last.volume / avg : null,
    count: prior.length,
    needed,
    basis,
  };
}

/** Same-session average volume of the `n` candles before the last one (see volumeStats). */
export function volumeAverage(candles, n = 20, market = 'NSE') {
  return volumeStats(candles, n, market).avg;
}

/** Highest high / lowest low of the `n` candles before the last one. */
export function priorRange(candles, n = 12) {
  if (candles.length < n + 1) return null;
  const prior = candles.slice(-1 - n, -1);
  return { high: Math.max(...prior.map((c) => c.high)), low: Math.min(...prior.map((c) => c.low)) };
}
