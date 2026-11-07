// Live digital gold and silver rates (₹ per gram; gold 24K, silver 999) from
// OroPocket's public price feed. Fetched through our own server, which
// caches it and avoids the browser's cross-site limits; straight from
// OroPocket if the server is unreachable.

import { fetchGoldRateFromServer } from './api';

const OROPOCKET_URL = 'https://api.oropocket.com/public/prices';
const TIMEOUT_MS = 12000;

/** Holdings valued by weight × a per-gram rate. */
export const METALS = {
  'Digital Gold': { key: 'gold', label: 'Gold', icon: 'diamond-outline', example: '7450' },
  'Digital Silver': { key: 'silver', label: 'Silver', icon: 'ellipse-outline', example: '95' },
};
export const isMetal = (category) => !!METALS[category];

// Silver is sometimes quoted per kg; no gram of silver costs anywhere near ₹2,000.
const silverPerGram = (n) => (n > 2000 ? n / 1000 : n);

function parseMetal(raw, perGram = (n) => n) {
  const buy = perGram(parseFloat(raw?.buy));
  const sell = perGram(parseFloat(raw?.sell));
  if (!(buy > 0) || !(sell > 0)) return null;
  return { buy: Math.round(buy * 100) / 100, sell: Math.round(sell * 100) / 100, gst: parseFloat(raw?.gst) || null };
}

/** Pull { buy, sell, gst, timestamp, silver: { buy, sell, gst } | null } out of OroPocket's response. */
export function parseOroPocket(body) {
  const data = body?.data || body;
  const gold = parseMetal(data?.gold);
  if (!gold) throw new Error('No gold rate in response');
  return { ...gold, timestamp: data?.timestamp || null, silver: parseMetal(data?.silver, silverPerGram) };
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
 * Today's gold rate per gram (and silver's, under `silver`, when the feed
 * has it): `sell` is what your metal would fetch now (use it to value
 * holdings), `buy` is what buying costs (use it for SIPs).
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

/** The { buy, sell } for `category` from a fetchGoldRate result, or null. */
export function metalRate(rate, category = 'Digital Gold') {
  if (!rate) return null;
  if (category === 'Digital Silver') return rate.silver?.sell > 0 ? rate.silver : null;
  return rate.sell > 0 ? rate : null;
}

/** Value every `category` holding that has grams at `sell` per gram. Same array back when nothing changed. */
export function applyGoldRate(items, sell, dateKey, category = 'Digital Gold') {
  let updated = 0;
  const next = items.map((item) => {
    if (item.category !== category || !(item.grams > 0)) return item;
    const current = Math.round(item.grams * sell * 100) / 100;
    if (item.rate === sell && item.current === current && item.rateSource === 'live') return item;
    updated += 1;
    return { ...item, rate: sell, rateDate: dateKey, rateSource: 'live', current };
  });
  return { items: updated ? next : items, updated };
}

/** Apply a fetchGoldRate result to gold and (when present) silver holdings. */
export function applyMetalRates(items, rate, dateKey) {
  let out = items;
  let updated = 0;
  for (const category of Object.keys(METALS)) {
    const r = metalRate(rate, category);
    if (!r) continue;
    const res = applyGoldRate(out, r.sell, dateKey, category);
    out = res.items;
    updated += res.updated;
  }
  return { items: out, updated };
}
