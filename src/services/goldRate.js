// Live digital gold, silver and platinum rates (₹ per gram) from OroPocket's
// public price feed. Fetched through our own server, which caches it,
// avoids the browser's cross-site limits and estimates silver/platinum from
// international prices when the feed has none; straight from OroPocket if
// the server is unreachable.

import { fetchGoldRateFromServer } from './api';

const OROPOCKET_URL = 'https://api.oropocket.com/public/prices';
const TIMEOUT_MS = 12000;

/**
 * Holdings valued by weight × a per-gram rate. Gold's rate is at the top of
 * a fetchGoldRate result; the others under their `key`. `perKgAbove`: a
 * quote above this can't be per gram, so it's per kg.
 */
export const METALS = {
  'Digital Gold': { key: 'gold', label: 'Gold', icon: 'diamond-outline', example: '7450', grams: '2.5' },
  'Digital Silver': {
    key: 'silver',
    label: 'Silver',
    icon: 'ellipse-outline',
    example: '95',
    grams: '100',
    names: ['silver', 'Silver', 'SILVER', 'xag', 'XAG', 'silver999'],
    perKgAbove: 2000,
  },
  'Digital Platinum': {
    key: 'platinum',
    label: 'Platinum',
    icon: 'sparkles-outline',
    example: '3200',
    grams: '5',
    names: ['platinum', 'Platinum', 'PLATINUM', 'xpt', 'XPT'],
    perKgAbove: 50000,
  },
};
export const isMetal = (category) => !!METALS[category];
const OTHER_METALS = Object.values(METALS).filter((m) => m.key !== 'gold');

function parseMetal(raw, perKgAbove = Infinity) {
  const perGram = (n) => (n > perKgAbove ? n / 1000 : n);
  const buy = perGram(parseFloat(raw?.buy ?? raw?.buyPrice ?? raw?.buy_price));
  const sell = perGram(parseFloat(raw?.sell ?? raw?.sellPrice ?? raw?.sell_price));
  if (!(buy > 0) || !(sell > 0)) return null;
  return { buy: Math.round(buy * 100) / 100, sell: Math.round(sell * 100) / 100, gst: parseFloat(raw?.gst) || null };
}

/** Pull { buy, sell, gst, timestamp, silver, platinum } (each { buy, sell, gst } | null) out of OroPocket's response. */
export function parseOroPocket(body) {
  const data = body?.data || body;
  const gold = parseMetal(data?.gold);
  if (!gold) throw new Error('No gold rate in response');
  const out = { ...gold, timestamp: data?.timestamp || null };
  for (const m of OTHER_METALS) {
    const raw = m.names.map((n) => data?.[n]).find(Boolean);
    out[m.key] = parseMetal(raw, m.perKgAbove);
  }
  return out;
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
 * Today's gold rate per gram (silver's and platinum's under their keys,
 * when known): `sell` is what your metal would fetch now (use it to value
 * holdings), `buy` is what buying costs (use it for SIPs).
 */
export async function fetchGoldRate() {
  try {
    const rate = await fetchGoldRateFromServer();
    if (rate?.buy > 0 && rate?.sell > 0) {
      const missing = OTHER_METALS.filter((m) => !(rate[m.key]?.sell > 0));
      if (!missing.length) return rate;
      // Some metal missing from the server (an older one, or none found): ask the feed directly.
      const direct = await fetchDirect().catch(() => null);
      const extra = Object.fromEntries(missing.filter((m) => direct?.[m.key]).map((m) => [m.key, direct[m.key]]));
      return { ...rate, ...extra };
    }
  } catch (_error) {
    // fall through to the direct call
  }
  return fetchDirect();
}

/** The { buy, sell } for `category` from a fetchGoldRate result, or null. */
export function metalRate(rate, category = 'Digital Gold') {
  const meta = METALS[category];
  if (!rate || !meta) return null;
  const r = meta.key === 'gold' ? rate : rate[meta.key];
  return r?.sell > 0 ? r : null;
}

/** Value every `category` holding that has grams at `sell` per gram. Same array back when nothing changed. */
export function applyGoldRate(items, sell, dateKey, category = 'Digital Gold', source = 'live') {
  let updated = 0;
  const next = items.map((item) => {
    if (item.category !== category || !(item.grams > 0)) return item;
    const current = Math.round(item.grams * sell * 100) / 100;
    if (item.rate === sell && item.current === current && item.rateSource === source) return item;
    updated += 1;
    return { ...item, rate: sell, rateDate: dateKey, rateSource: source, current };
  });
  return { items: updated ? next : items, updated };
}

/** Apply a fetchGoldRate result to every metal's holdings (those it has a rate for). */
export function applyMetalRates(items, rate, dateKey) {
  let out = items;
  let updated = 0;
  for (const category of Object.keys(METALS)) {
    const r = metalRate(rate, category);
    if (!r) continue;
    const res = applyGoldRate(out, r.sell, dateKey, category, r.source === 'estimate' ? 'estimate' : 'live');
    out = res.items;
    updated += res.updated;
  }
  return { items: out, updated };
}
