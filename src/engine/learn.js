// Learning from results: the engine looks at how its past trades did and
// asks for a higher score where it has been losing.
//
// It never loosens a rule and never invents a signal; it only raises the
// score needed (by +5 or +10 per finding, +20 at most) in a situation where
// closed trades, after charges, show a clear loss. Each finding needs a
// minimum number of trades, so a couple of unlucky trades change nothing,
// and it lapses by itself once the results in that situation recover.
//
// Situations looked at: the side (long / short), the time of day, the stock,
// and trades that only just cleared the threshold.
//
// Input records: { side: 'long' | 'short', symbol, r (result in R, or null),
// net (money after charges), score (side's score at entry, or null), minutes
// (minutes of the day at the signal, in the market's local time, or null) }.
// Each market (NSE, US) learns from its own trades only.

import { hhmm, marketOf, sessionTimes } from './time.js';

const round2 = (n) => Math.round(n * 100) / 100;

export const LEARN_MIN_TRADES = 20; // nothing is learned before this many closed trades
export const LEARN_MAX_BUMP = 20;
const MIN_BUCKET = 8; // trades needed in a situation (6 for one stock)
const MIN_SYMBOL = 6;

// Parts of the session, as minutes after the open: the first 90 minutes,
// midday, and the rest (the last entry comes before the close).
const BUCKET_SPANS = [
  { id: 'open', name: 'the first 90 minutes', from: 0, to: 90 },
  { id: 'mid', name: 'midday', from: 90, to: 225 },
  { id: 'late', name: 'the afternoon', from: 225, to: 24 * 60 },
];

/** The session's time buckets in local minutes, with labels like "the first 90 minutes (09:15–10:45)". */
export function timeBuckets(market = 'NSE') {
  const { open, lastEntry } = sessionTimes(market);
  const zone = marketOf(market).zone;
  return BUCKET_SPANS.map((b) => {
    const from = open + b.from;
    const to = Math.min(open + b.to, lastEntry);
    return { id: b.id, label: `${b.name} (${hhmm(from)}–${hhmm(to)} ${zone})`, from, to: b.id === 'late' ? 24 * 60 : to };
  });
}
export const TIME_BUCKETS = timeBuckets('NSE');
export const timeBucket = (minutes, market = 'NSE') =>
  minutes == null ? null : timeBuckets(market).find((b) => minutes >= b.from && minutes < b.to) || null;

function stats(list) {
  const n = list.length;
  const net = round2(list.reduce((s, t) => s + (Number(t.net) || 0), 0));
  const withR = list.filter((t) => t.r != null);
  const avgR = withR.length ? round2(withR.reduce((s, t) => s + t.r, 0) / withR.length) : null;
  const wins = list.filter((t) => (Number(t.net) || 0) > 0).length;
  return { n, net, avgR, winRate: n ? Math.round((wins / n) * 100) : null };
}

// A clear loss: money lost overall and a negative average result. Worse → bigger bump.
function bumpFor(s) {
  if (!(s.net < 0) || !(s.avgR == null || s.avgR < -0.1)) return 0;
  return s.avgR != null && s.avgR <= -0.4 ? 10 : 5;
}

const money = (n, cur = '₹') => `${n < 0 ? '−' : '+'}${cur}${Math.abs(Math.round(n)).toLocaleString(cur === '$' ? 'en-US' : 'en-IN')}`;
const describe = (s, cur) => `${s.n} trades, ${s.winRate}% won, ${money(s.net, cur)}${s.avgR != null ? `, avg ${s.avgR}R` : ''}`;

/**
 * What the results teach: { trades, active, rules: [{ id, kind, match,
 * bump, note }] }. `threshold` is the base score needed.
 */
export function learnFromTrades(records, threshold = 65, market = 'NSE') {
  const cur = marketOf(market).symbol;
  const trades = (records || []).filter((t) => t && (t.side === 'long' || t.side === 'short') && Number.isFinite(Number(t.net)));
  const out = { trades: trades.length, active: trades.length >= LEARN_MIN_TRADES, needed: LEARN_MIN_TRADES, rules: [] };
  if (!out.active) return out;
  const add = (id, kind, match, list, min, label) => {
    if (list.length < min) return;
    const s = stats(list);
    const bump = bumpFor(s);
    if (bump) out.rules.push({ id, kind, match, bump, note: `${label} have been losing (${describe(s, cur)}): needs +${bump} points` });
  };
  ['long', 'short'].forEach((side) =>
    add(`side:${side}`, 'side', { side }, trades.filter((t) => t.side === side), MIN_BUCKET, side === 'long' ? 'Long trades' : 'Short trades')
  );
  timeBuckets(market).forEach((b) =>
    add(`time:${b.id}`, 'time', { bucket: b.id }, trades.filter((t) => timeBucket(t.minutes, market)?.id === b.id), MIN_BUCKET, `Trades in ${b.label}`)
  );
  [...new Set(trades.map((t) => t.symbol).filter(Boolean))].forEach((symbol) =>
    add(`symbol:${symbol}`, 'symbol', { symbol }, trades.filter((t) => t.symbol === symbol), MIN_SYMBOL, `${String(symbol).replace(/\.(NS|BO)$/, '')} trades`)
  );
  // Trades that only just qualified (within 10 points of the threshold).
  add(
    'marginal',
    'marginal',
    { below: threshold + 10 },
    trades.filter((t) => t.score != null && t.score >= threshold && t.score < threshold + 10),
    MIN_BUCKET,
    `Trades that only just reached ${threshold}`
  );
  return out;
}

/**
 * Extra points needed right now for `side` on `symbol` at `minutes`:
 * { bump, notes: [text] }. Capped at LEARN_MAX_BUMP.
 */
export function learnedBump(learned, { side, symbol, minutes }, market = 'NSE') {
  if (!learned?.active) return { bump: 0, notes: [] };
  const bucket = timeBucket(minutes, market)?.id;
  const hits = learned.rules.filter(
    (r) =>
      (r.kind === 'side' && r.match.side === side) ||
      (r.kind === 'time' && r.match.bucket === bucket) ||
      (r.kind === 'symbol' && r.match.symbol === symbol) ||
      r.kind === 'marginal'
  );
  // The marginal rule is the general "ask for more"; it doesn't stack past the cap.
  const bump = Math.min(LEARN_MAX_BUMP, hits.reduce((s, r) => s + r.bump, 0));
  return { bump, notes: hits.map((r) => r.note) };
}
