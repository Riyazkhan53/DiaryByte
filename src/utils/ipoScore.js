// IPO demand score (0–100): a plain, rule-based reading of the numbers, so the
// app can show why it likes or dislikes an IPO. Shared by the server and app.
//
// - QIB subscription: up to 40 points (institutions do the deepest research)
// - Overall subscription: up to 20
// - Retail subscription: up to 10
// - Grey market premium (GMP, % over the top of the price band): up to 30
//
// Missing parts are left out and the rest is scaled up to 100. With no
// subscription figures yet (bidding hasn't started) there is no score.

const logPart = (x, full, max) => (x > 0 ? Math.min(max, (max * Math.log10(1 + x)) / Math.log10(1 + full)) : 0);
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/** GMP as % of the upper price band, or null. */
export function gmpPct(ipo) {
  const gmp = num(ipo?.gmp);
  const high = num(ipo?.priceHigh);
  return gmp != null && high > 0 ? Math.round((gmp / high) * 1000) / 10 : null;
}

/**
 * { score, label, parts: [{ name, points, max, note }] } or null when there
 * are no subscription figures yet.
 */
export function ipoScore(ipo) {
  const sub = ipo?.subscription || {};
  const qib = num(sub.qib);
  const overall = num(sub.overall);
  const retail = num(sub.retail);
  if (qib == null && overall == null && retail == null) return null;
  const parts = [];
  if (qib != null) parts.push({ name: 'QIB demand', points: logPart(qib, 50, 40), max: 40, note: `${qib}×` });
  if (overall != null) parts.push({ name: 'Overall demand', points: logPart(overall, 100, 20), max: 20, note: `${overall}×` });
  if (retail != null) parts.push({ name: 'Retail demand', points: logPart(retail, 20, 10), max: 10, note: `${retail}×` });
  const pct = gmpPct(ipo);
  if (pct != null) {
    // −5% or worse → 0, +30% or better → full marks.
    parts.push({ name: 'Grey market premium', points: Math.max(0, Math.min(30, ((pct + 5) / 35) * 30)), max: 30, note: `${pct > 0 ? '+' : ''}${pct}%` });
  }
  const got = parts.reduce((s, p) => s + p.points, 0);
  const max = parts.reduce((s, p) => s + p.max, 0);
  const score = Math.round((got / max) * 100);
  const label = score >= 70 ? 'Strong demand' : score >= 45 ? 'Moderate demand' : 'Weak demand';
  return { score, label, parts: parts.map((p) => ({ ...p, points: Math.round(p.points * 10) / 10 })) };
}
