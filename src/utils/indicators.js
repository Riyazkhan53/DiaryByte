// Technical indicators from daily candles, to fill in a Setup Check.
// Candles are oldest first: [{ t, open, high, low, close, volume }].

const round2 = (n) => Math.round(n * 100) / 100;

/** Exponential moving average series (seeded with the simple average of the first `period`). */
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

/** Wilder's RSI over `period` closes. */
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
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

/** MACD (12, 26) and its 9-period signal line. */
export function macd(closes, fast = 12, slow = 26, signal = 9) {
  const fastEma = emaSeries(closes, fast);
  const slowEma = emaSeries(closes, slow);
  if (!slowEma.length) return null;
  const line = closes.map((_, i) => (fastEma[i] != null && slowEma[i] != null ? fastEma[i] - slowEma[i] : null));
  const valid = line.filter((v) => v != null);
  const signalSeries = emaSeries(valid, signal);
  if (!signalSeries.length) return null;
  return { macd: last(valid), signal: last(signalSeries) };
}

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
