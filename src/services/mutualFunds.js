// Mutual fund prices from mfapi.in: a free, keyless API serving AMFI's
// published NAVs. Used to value holdings as units × latest NAV.

const MFAPI_URL = 'https://api.mfapi.in';
const TIMEOUT_MS = 15000;

async function getJson(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${MFAPI_URL}${path}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`Fund price lookup failed (${response.status})`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

// mfapi dates are 'DD-MM-YYYY'; the app uses 'YYYY-MM-DD'.
export function toDateKey(ddmmyyyy) {
  const [d, m, y] = String(ddmmyyyy || '').split('-');
  return y && m && d ? `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` : null;
}

/** Funds whose name matches `query`: [{ schemeCode, schemeName }]. */
export async function searchFunds(query, limit = 25) {
  const q = query.trim();
  if (q.length < 3) return [];
  const results = await getJson(`/mf/search?q=${encodeURIComponent(q)}`);
  return (Array.isArray(results) ? results : [])
    .filter((r) => r && r.schemeCode && r.schemeName)
    .slice(0, limit)
    .map((r) => ({ schemeCode: String(r.schemeCode), schemeName: r.schemeName }));
}

/** Latest NAV for a scheme: { nav, navDate: 'YYYY-MM-DD' }. */
export async function latestNav(schemeCode) {
  let body;
  try {
    body = await getJson(`/mf/${encodeURIComponent(schemeCode)}/latest`);
  } catch (_error) {
    // Older deployments only have the full-history endpoint (newest first).
    body = await getJson(`/mf/${encodeURIComponent(schemeCode)}`);
  }
  const row = Array.isArray(body?.data) ? body.data[0] : null;
  const nav = parseFloat(row?.nav);
  const navDate = toDateKey(row?.date);
  if (!(nav > 0) || !navDate) throw new Error('No NAV available for this fund');
  return { nav, navDate };
}

/**
 * NAV used for a purchase on `dateKey`: that day's NAV, or the next one
 * published after it (weekends and holidays have none). Falls back to the
 * latest NAV when the date is too recent to have one yet.
 */
export async function navOnOrAfter(schemeCode, dateKey) {
  const body = await getJson(`/mf/${encodeURIComponent(schemeCode)}`);
  const rows = (Array.isArray(body?.data) ? body.data : [])
    .map((r) => ({ nav: parseFloat(r.nav), navDate: toDateKey(r.date) }))
    .filter((r) => r.nav > 0 && r.navDate);
  if (!rows.length) throw new Error('No NAV available for this fund');
  const onOrAfter = rows.filter((r) => r.navDate >= dateKey).sort((a, b) => a.navDate.localeCompare(b.navDate));
  return onOrAfter[0] || rows.sort((a, b) => b.navDate.localeCompare(a.navDate))[0];
}

const isLinkedFund = (item) =>
  item.category === 'Mutual Funds' && !!item.schemeCode && item.units > 0;

/**
 * Latest NAV for every scheme the holdings are linked to:
 * { [schemeCode]: { nav, navDate } }. Schemes whose lookup fails are left
 * out, so those holdings keep their last known value.
 */
export async function fetchFundPrices(items) {
  const codes = [...new Set(items.filter(isLinkedFund).map((i) => i.schemeCode))];
  const prices = {};
  await Promise.all(
    codes.map((code) =>
      latestNav(code)
        .then((price) => {
          prices[code] = price;
        })
        .catch(() => {})
    )
  );
  return prices;
}

/** Value linked funds at `prices` (units × NAV). Returns the same array when nothing changed. */
export function applyFundPrices(items, prices) {
  let updated = 0;
  const next = items.map((item) => {
    const price = isLinkedFund(item) && prices[item.schemeCode];
    if (!price) return item;
    const current = Math.round(item.units * price.nav * 100) / 100;
    if (item.nav === price.nav && item.navDate === price.navDate && item.current === current) return item;
    updated += 1;
    return { ...item, nav: price.nav, navDate: price.navDate, current };
  });
  return { items: updated ? next : items, updated };
}
