// Crypto prices from CoinGecko's free public API (no key): coin search and
// live prices in ₹ and $. Cached, to stay well inside its rate limit.

const BASE = 'https://api.coingecko.com/api/v3';
const PRICE_CACHE_MS = 60 * 1000;
const SEARCH_CACHE_MS = 60 * 60 * 1000;
const MAX_IDS = 50;

const priceCache = new Map(); // id → { at, price }
const searchCache = new Map(); // query → { at, results }

const isCoinId = (s) => typeof s === 'string' && /^[a-z0-9-]{1,80}$/.test(s);

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`CoinGecko responded ${response.status}`);
  return response.json();
}

/** Coins matching `query`, best first: [{ id, symbol, name, thumb, rank }]. */
async function searchCoins(query) {
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const cached = searchCache.get(q);
  if (cached && Date.now() - cached.at < SEARCH_CACHE_MS) return cached.results;
  const body = await getJson(`${BASE}/search?query=${encodeURIComponent(q)}`);
  const results = (body?.coins || []).slice(0, 8).map((c) => ({
    id: c.id,
    symbol: String(c.symbol || '').toUpperCase(),
    name: c.name,
    thumb: c.thumb || c.large || null,
    rank: c.market_cap_rank || null,
  }));
  searchCache.set(q, { at: Date.now(), results });
  return results;
}

/**
 * Live prices: { prices: { [id]: { inr, usd, change24h, updatedAt } }, fetchedAt }.
 * Coins CoinGecko doesn't know are left out; a slightly old price beats none.
 */
async function getCryptoPrices(ids) {
  const wanted = [...new Set(ids.filter(isCoinId))].slice(0, MAX_IDS);
  const prices = {};
  const stale = wanted.filter((id) => {
    const hit = priceCache.get(id);
    if (hit && Date.now() - hit.at < PRICE_CACHE_MS) {
      prices[id] = hit.price;
      return false;
    }
    return true;
  });
  if (stale.length) {
    try {
      const body = await getJson(
        `${BASE}/simple/price?ids=${stale.join(',')}&vs_currencies=inr,usd&include_24hr_change=true&include_last_updated_at=true`
      );
      stale.forEach((id) => {
        const p = body?.[id];
        if (!(p?.inr > 0)) return;
        const price = {
          inr: p.inr,
          usd: p.usd ?? null,
          change24h: p.inr_24h_change != null ? Math.round(p.inr_24h_change * 100) / 100 : null,
          updatedAt: p.last_updated_at ? new Date(p.last_updated_at * 1000).toISOString() : null,
        };
        priceCache.set(id, { at: Date.now(), price });
        prices[id] = price;
      });
    } catch (error) {
      stale.forEach((id) => {
        const hit = priceCache.get(id);
        if (hit) prices[id] = { ...hit.price, stale: true };
      });
      if (!Object.keys(prices).length) throw error;
    }
  }
  return { prices, fetchedAt: new Date().toISOString() };
}

module.exports = { searchCoins, getCryptoPrices, isCoinId };
