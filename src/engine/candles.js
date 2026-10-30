// Candle normalisation and data-quality checks. A candle is
// { t (start, ms since epoch), open, high, low, close, volume }.

import { istParts, isNseOpen, toMs } from './time.js';

const finite = (n) => typeof n === 'number' && Number.isFinite(n);

/**
 * Clean a provider's candles: numeric fields, timestamps in ms, oldest
 * first, one candle per timestamp (the later copy wins), and rows with
 * missing or impossible prices dropped.
 */
export function normalizeCandles(raw) {
  const byTime = new Map();
  (raw || []).forEach((c) => {
    if (!c) return;
    const t = toMs(c.t);
    const candle = {
      t,
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: Number(c.volume) || 0,
    };
    const ok =
      finite(t) &&
      [candle.open, candle.high, candle.low, candle.close].every((v) => finite(v) && v > 0) &&
      candle.high >= candle.low;
    if (ok) byTime.set(t, candle);
  });
  return [...byTime.values()].sort((a, b) => a.t - b.t);
}

/** Only candles that have finished by `now` (a forming candle never makes a signal). */
export function completedCandles(candles, intervalMin, now = Date.now()) {
  const nowMs = toMs(now);
  return candles.filter((c) => c.t + intervalMin * 60000 <= nowMs);
}

/**
 * How usable the data is at `now`:
 * { status: 'fresh' | 'delayed' | 'stale' | 'empty', marketOpen, ageMin,
 *   lastCandle, gaps, issues: [text] }.
 * During the session, the last completed candle must have ended within
 * `maxDelayMin` minutes (delayed feeds lag); otherwise the data is stale.
 */
export function checkFreshness(completed, { intervalMin, now = Date.now(), maxDelayMin = 20 } = {}) {
  const nowMs = toMs(now);
  const marketOpen = isNseOpen(nowMs);
  const issues = [];
  if (!completed.length) {
    return { status: 'empty', marketOpen, ageMin: null, lastCandle: null, gaps: 0, issues: ['No completed candles'] };
  }
  const last = completed[completed.length - 1];
  const ageMin = Math.max(0, Math.round((nowMs - (last.t + intervalMin * 60000)) / 60000));

  // Missing candles inside today's session (not overnight or weekends).
  const today = istParts(last.t).dateKey;
  const session = completed.filter((c) => istParts(c.t).dateKey === today);
  let gaps = 0;
  for (let i = 1; i < session.length; i += 1) {
    const missing = Math.round((session[i].t - session[i - 1].t) / (intervalMin * 60000)) - 1;
    if (missing > 0) gaps += missing;
  }
  if (gaps) issues.push(`${gaps} missing ${intervalMin}-minute candle${gaps > 1 ? 's' : ''} today`);

  let status = 'fresh';
  if (marketOpen) {
    if (ageMin > maxDelayMin) {
      status = 'stale';
      issues.push(`Last completed candle ended ${ageMin} min ago`);
    } else if (ageMin > intervalMin) {
      status = 'delayed';
    }
  } else {
    status = 'stale';
    issues.push('Market is closed');
  }
  return { status, marketOpen, ageMin, lastCandle: last, gaps, issues };
}
