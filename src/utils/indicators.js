// Technical indicators from daily candles, to fill in a Setup Check.
// Candles are oldest first: [{ t, open, high, low, close, volume }].

import { emaSeries, macd, rsi } from '../engine/indicators.js';

const round2 = (n) => Math.round(n * 100) / 100;

const last = (series) => (series.length ? series[series.length - 1] : null);

// The maths lives in the shared engine; kept importable from here.
export { emaSeries, macd, rsi };

/**
 * Setup Check inputs from daily candles: today's price and volume against
 * the previous close, EMAs, RSI, MACD, the 20-day average volume and the
 * swing high/low of the 20 sessions before today. VWAP is intraday only,
 * so it's left out. Fields that need more history than given are omitted.
 */
export function setupInputsFromCandles(candles, lookback = 20) {
  const rows = (candles || []).filter((c) => c && c.close > 0);
  if (rows.length < 2) return {};
  const closes = rows.map((c) => c.close);
  const today = rows[rows.length - 1];
  const before = rows.slice(-1 - lookback, -1);
  const out = { price: today.close, prevClose: rows[rows.length - 2].close };
  const e20 = last(emaSeries(closes, 20));
  const e50 = last(emaSeries(closes, 50));
  if (e20 != null) out.ema20 = e20;
  if (e50 != null) out.ema50 = e50;
  const r = rsi(closes, 14);
  if (r != null) out.rsi = r;
  const m = macd(closes);
  if (m) {
    out.macd = m.macd;
    out.macdSignal = m.signal;
  }
  const volumes = before.map((c) => c.volume).filter((v) => v > 0);
  if (today.volume > 0 && volumes.length >= Math.min(lookback, 10)) {
    out.volume = today.volume;
    out.avgVolume = volumes.reduce((s, v) => s + v, 0) / volumes.length;
  }
  if (before.length >= Math.min(lookback, 10)) {
    out.swingHigh = Math.max(...before.map((c) => c.high || c.close));
    out.swingLow = Math.min(...before.map((c) => c.low || c.close));
  }
  return Object.fromEntries(
    Object.entries(out).map(([k, v]) => [k, k.toLowerCase().includes('volume') ? Math.round(v) : round2(v)])
  );
}
