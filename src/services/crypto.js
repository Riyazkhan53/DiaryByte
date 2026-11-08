// Crypto holdings: a coin (CoinGecko id) × how many you hold, valued at the
// live ₹ price. Prices come through our server (cached); straight from
// CoinGecko if the server is unreachable.

import { fetchCryptoPricesFromServer, searchCryptoOnServer } from './api';

export const CRYPTO = 'Crypto';
const COINGECKO = 'https://api.coingecko.com/api/v3';
const TIMEOUT_MS = 12000;

const round2 = (n) => Math.round(n * 100) / 100;

/** A crypto holding linked to a coin, valued as quantity × live price. */
export const isLinkedCoin = (item) => item.category === CRYPTO && !!item.coinId && item.quantity > 0;

async function direct(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${COINGECKO}${path}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`CoinGecko responded ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Coins matching `query`: [{ id, symbol, name, thumb, rank }]. */
export async function searchCoins(query) {
  try {
    const body = await searchCryptoOnServer(query);
    if (Array.isArray(body?.results)) return body.results;
  } catch (_error) {
    // fall through to CoinGecko
  }
  const body = await direct(`/search?query=${encodeURIComponent(query)}`);
  return (body?.coins || []).slice(0, 8).map((c) => ({
    id: c.id,
    symbol: String(c.symbol || '').toUpperCase(),
    name: c.name,
    thumb: c.thumb || null,
    rank: c.market_cap_rank || null,
  }));
}

/** Live prices for coin ids: { prices: { [id]: { inr, usd, change24h, updatedAt } }, fetchedAt }. */
export async function fetchCoinPrices(ids) {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (!wanted.length) return { prices: {}, fetchedAt: null };
  try {
    const body = await fetchCryptoPricesFromServer(wanted);
    if (body?.prices) return body;
  } catch (_error) {
    // fall through to CoinGecko
  }
  const body = await direct(
    `/simple/price?ids=${wanted.join(',')}&vs_currencies=inr,usd&include_24hr_change=true&include_last_updated_at=true`
  );
  const prices = {};
  wanted.forEach((id) => {
    const p = body?.[id];
    if (p?.inr > 0) {
      prices[id] = {
        inr: p.inr,
        usd: p.usd ?? null,
        change24h: p.inr_24h_change != null ? round2(p.inr_24h_change) : null,
        updatedAt: p.last_updated_at ? new Date(p.last_updated_at * 1000).toISOString() : null,
      };
    }
  });
  return { prices, fetchedAt: new Date().toISOString() };
}

/** Prices for every linked crypto holding in `items`. */
export const fetchCryptoPrices = (items) => fetchCoinPrices(items.filter(isLinkedCoin).map((i) => i.coinId));

/** Value linked coins at the fetched prices. Same array back when nothing changed. */
export function applyCryptoPrices(items, { prices, fetchedAt }, dateKey) {
  let updated = 0;
  const next = items.map((item) => {
    const p = isLinkedCoin(item) ? prices?.[item.coinId] : null;
    if (!p) return item;
    const current = round2(item.quantity * p.inr);
    if (item.price === p.inr && item.current === current && item.change24h === (p.change24h ?? undefined)) return item;
    updated += 1;
    return {
      ...item,
      price: p.inr,
      priceCurrency: 'INR',
      priceDate: dateKey,
      priceFetchedAt: fetchedAt || undefined,
      change24h: p.change24h ?? undefined,
      current,
    };
  });
  return { items: updated ? next : items, updated };
}

/** Short ₹ price for a coin: two decimals under ₹100, whole rupees above. */
export const coinPriceLabel = (inr) =>
  `₹${Number(inr || 0).toLocaleString('en-IN', { maximumFractionDigits: inr < 100 ? 4 : 2 })}`;
