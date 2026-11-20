// Support and resistance levels, shared by the app and the server.
//
// Daily levels (from daily candles, worked out once a day per stock):
//   previous day high / low / close, classic pivot points (P, R1, R2, S1, S2),
//   swing levels that price turned at more than once in the last ~6 months
//   (clustered, with a touch count), and the 6-month high / low.
// 5-minute levels (from the intraday candles, every scan):
//   today's high / low so far, the opening range (first 15 minutes) and
//   5-minute swing levels touched more than once over the last two sessions.
//
// A level is { price, label, tf: 'daily' | '5m', touches? }. Whether it is
// support or resistance depends on where the price is now: below it, it is
// resistance; above it, support.

const round = (n) => Math.round(n * 100) / 100;

/** Swing highs/lows: a bar whose high (low) is the highest (lowest) of k bars on each side. */
export function swingPoints(candles, k = 2) {
  const highs = [];
  const lows = [];
  for (let i = k; i < candles.length - k; i += 1) {
    const c = candles[i];
    let isHigh = true;
    let isLow = true;
    for (let j = i - k; j <= i + k; j += 1) {
      if (j === i) continue;
      if (candles[j].high >= c.high) isHigh = false;
      if (candles[j].low <= c.low) isLow = false;
    }
    if (isHigh) highs.push({ price: c.high, i });
    if (isLow) lows.push({ price: c.low, i });
  }
  return { highs, lows };
}

/**
 * Group nearby prices (within `tol`) into levels: { price (average), touches,
 * last (latest index) }, most touches first, then most recent.
 */
export function clusterLevels(points, tol) {
  const sorted = [...points].sort((a, b) => a.price - b.price);
  const groups = [];
  sorted.forEach((p) => {
    const g = groups[groups.length - 1];
    if (g && p.price - g.prices[g.prices.length - 1] <= tol) {
      g.prices.push(p.price);
      g.last = Math.max(g.last, p.i);
    } else groups.push({ prices: [p.price], last: p.i });
  });
  return groups
    .map((g) => ({ price: round(g.prices.reduce((s, x) => s + x, 0) / g.prices.length), touches: g.prices.length, last: g.last }))
    .sort((a, b) => b.touches - a.touches || b.last - a.last);
}

const dayOf = (t, offsetMin) => new Date((typeof t === 'number' ? t : Date.parse(t)) + offsetMin * 60000).toISOString().slice(0, 10);

/**
 * Daily levels from daily candles (oldest first). Only days before `today`
 * count (today's bar is still forming). `offsetMin` turns a bar's time into
 * the exchange's date (IST: 330).
 */
export function dailyLevels(candles, { today, offsetMin = 330 } = {}) {
  const days = (candles || []).filter((c) => c && c.high > 0 && c.low > 0 && c.close > 0 && (!today || dayOf(c.t, offsetMin) < today));
  if (days.length < 2) return [];
  const prev = days[days.length - 1];
  const P = (prev.high + prev.low + prev.close) / 3;
  const range = prev.high - prev.low;
  const levels = [
    { price: round(prev.high), label: 'Prev day high', tf: 'daily' },
    { price: round(prev.low), label: 'Prev day low', tf: 'daily' },
    { price: round(prev.close), label: 'Prev close', tf: 'daily' },
    { price: round(P), label: 'Pivot P', tf: 'daily' },
    { price: round(2 * P - prev.low), label: 'R1', tf: 'daily' },
    { price: round(P + range), label: 'R2', tf: 'daily' },
    { price: round(2 * P - prev.high), label: 'S1', tf: 'daily' },
    { price: round(P - range), label: 'S2', tf: 'daily' },
  ];
  const span = days.slice(-130); // about 6 months of sessions
  levels.push({ price: round(Math.max(...span.map((c) => c.high))), label: '6-month high', tf: 'daily' });
  levels.push({ price: round(Math.min(...span.map((c) => c.low))), label: '6-month low', tf: 'daily' });
  // Swing levels touched 2+ times, within ~1% of each other.
  const { highs, lows } = swingPoints(span, 2);
  const tol = prev.close * 0.01;
  clusterLevels([...highs, ...lows], tol)
    .filter((g) => g.touches >= 2)
    .slice(0, 6)
    .forEach((g) => levels.push({ price: g.price, label: `Swing ×${g.touches}`, tf: 'daily', touches: g.touches }));
  return levels;
}

/**
 * 5-minute levels from completed 5-minute candles (oldest first, `t` in ms or
 * ISO). Uses today's session and the one before. `atr` (5-min) sets how close
 * swing points must be to count as one level.
 */
export function intradayLevels(candles, { offsetMin = 330, atr } = {}) {
  const c5 = (candles || []).filter((c) => c && c.high > 0 && c.low > 0);
  if (c5.length < 6) return [];
  const last = c5[c5.length - 1];
  const today = dayOf(last.t, offsetMin);
  const days = [...new Set(c5.map((c) => dayOf(c.t, offsetMin)))];
  const keep = new Set(days.slice(-2));
  const recent = c5.filter((c) => keep.has(dayOf(c.t, offsetMin)));
  const todays = recent.filter((c) => dayOf(c.t, offsetMin) === today);
  const levels = [];
  // Today's range before the latest candle (the latest is where price is).
  const before = todays.slice(0, -1);
  if (before.length) {
    levels.push({ price: round(Math.max(...before.map((c) => c.high))), label: 'Day high', tf: '5m' });
    levels.push({ price: round(Math.min(...before.map((c) => c.low))), label: 'Day low', tf: '5m' });
  }
  if (todays.length > 3) {
    const or = todays.slice(0, 3);
    levels.push({ price: round(Math.max(...or.map((c) => c.high))), label: 'Opening range high', tf: '5m' });
    levels.push({ price: round(Math.min(...or.map((c) => c.low))), label: 'Opening range low', tf: '5m' });
  }
  const { highs, lows } = swingPoints(recent, 3);
  const tol = Math.max(last.close * 0.0015, (atr || 0) * 0.25);
  clusterLevels([...highs, ...lows], tol)
    .filter((g) => g.touches >= 2)
    .slice(0, 6)
    .forEach((g) => levels.push({ price: g.price, label: `5m swing ×${g.touches}`, tf: '5m', touches: g.touches }));
  return levels;
}

/**
 * The levels around `price`: { above: resistances (nearest first), below:
 * supports (nearest first) }, each with distance % from price. Levels within
 * `same` (fraction) of each other keep the stronger / daily one.
 */
export function levelsAround(levels, price, { max = 4, same = 0.001 } = {}) {
  if (!(price > 0)) return { above: [], below: [] };
  const rank = (l) => (l.tf === 'daily' ? 2 : 1) + (l.touches || 0) * 0.5;
  const uniq = [];
  [...(levels || [])]
    .filter((l) => l && l.price > 0)
    .sort((a, b) => rank(b) - rank(a))
    .forEach((l) => {
      if (!uniq.some((u) => Math.abs(u.price - l.price) / price <= same)) uniq.push(l);
    });
  const dist = (l) => ({ ...l, pct: Math.round(((l.price - price) / price) * 10000) / 100 });
  return {
    above: uniq.filter((l) => l.price > price).sort((a, b) => a.price - b.price).slice(0, max).map(dist),
    below: uniq.filter((l) => l.price < price).sort((a, b) => b.price - a.price).slice(0, max).map(dist),
  };
}
