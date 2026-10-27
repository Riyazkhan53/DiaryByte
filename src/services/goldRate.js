// Live digital gold rate (₹ per gram, 24K) from OroPocket's public price
// feed. Fetched through our own server, which caches it and avoids the
// browser's cross-site limits; straight from OroPocket if the server is
// unreachable.

import { fetchGoldRateFromServer } from './api';

const OROPOCKET_URL = 'https://api.oropocket.com/public/prices';
const TIMEOUT_MS = 12000;

/** Pull { buy, sell, gst, timestamp } out of OroPocket's response. */
export function parseOroPocket(body) {
  const data = body?.data || body;
  const gold = data?.gold;
  const buy = parseFloat(gold?.buy);
  const sell = parseFloat(gold?.sell);
  if (!(buy > 0) || !(sell > 0)) throw new Error('No gold rate in response');
  return { buy, sell, gst: parseFloat(gold?.gst) || null, timestamp: data?.timestamp || null };
}

async function fetchDirect() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(OROPOCKET_URL, { signal: controller.signal });
    if (!response.ok) throw new Error(`Gold rate lookup failed (${response.status})`);
    return parseOroPocket(await response.json());
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Today's gold rate per gram: `sell` is what your gold would fetch now (use
 * it to value holdings), `buy` is what buying costs (use it for SIPs).
 */
export async function fetchGoldRate() {
  try {
    const rate = await fetchGoldRateFromServer();
    if (rate?.buy > 0 && rate?.sell > 0) return rate;
  } catch (_error) {
    // fall through to the direct call
  }
  return fetchDirect();
}

/** Value every gold locker that has grams at `sell` per gram. Same array back when nothing changed. */
export function applyGoldRate(items, sell, dateKey) {
  let updated = 0;
  const next = items.map((item) => {
    if (item.category !== 'Digital Gold' || !(item.grams > 0)) return item;
    const current = Math.round(item.grams * sell * 100) / 100;
    if (item.rate === sell && item.current === current && item.rateSource === 'live') return item;
    updated += 1;
    return { ...item, rate: sell, rateDate: dateKey, rateSource: 'live', current };
  });
  return { items: updated ? next : items, updated };
}
