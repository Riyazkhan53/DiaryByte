// Stock prices for Indian (NSE/BSE) and US holdings, through our server
// (which reads Yahoo Finance and caches). US prices are in dollars and are
// converted to rupees at today's USD→INR rate.

import { fetchStockQuotes, searchStockSymbols } from './api';

export const MARKETS = [
  { key: 'IN', label: 'India', flag: '🇮🇳', currency: '₹' },
  { key: 'US', label: 'US', flag: '🇺🇸', currency: '$' },
];

/** Older stocks have no market; they were all Indian. */
export const marketOf = (item) => (item.market === 'US' ? 'US' : 'IN');

export const isLinkedStock = (item) => item.category === 'Stocks' && !!item.symbol && item.quantity > 0;

const round2 = (n) => Math.round(n * 100) / 100;

/** Value of `quantity` shares in rupees, or null without the rates needed. */
export function stockValueInr(quantity, price, market, usdInr) {
  if (!(quantity > 0) || !(price > 0)) return null;
  if (market === 'US') return usdInr > 0 ? round2(quantity * price * usdInr) : null;
  return round2(quantity * price);
}

/** Share price in rupees (for buying shares in a SIP). */
export function sharePriceInr(item) {
  if (!(item.price > 0)) return null;
  if (marketOf(item) === 'US') return item.usdInr > 0 ? item.price * item.usdInr : null;
  return item.price;
}

export async function searchStocks(query, market) {
  if (query.trim().length < 2) return [];
  const body = await searchStockSymbols(query.trim(), market);
  return Array.isArray(body?.results) ? body.results : [];
}

/** Prices for every linked stock: { quotes, usdInr }. */
export async function fetchStockPrices(items) {
  const symbols = [...new Set(items.filter(isLinkedStock).map((i) => i.symbol))];
  if (!symbols.length) return { quotes: {}, usdInr: null };
  const body = await fetchStockQuotes(symbols);
  return { quotes: body?.quotes || {}, usdInr: body?.usdInr || null };
}

/** Value linked stocks at the fetched prices. Same array back when nothing changed. */
export function applyStockPrices(items, { quotes, usdInr }, dateKey) {
  let updated = 0;
  const next = items.map((item) => {
    if (!isLinkedStock(item)) return item;
    const quote = quotes[item.symbol];
    if (!quote) return item;
    const market = marketOf(item);
    const fx = market === 'US' ? usdInr || item.usdInr : undefined;
    const current = stockValueInr(item.quantity, quote.price, market, fx);
    if (current == null) return item;
    if (item.price === quote.price && item.current === current && item.usdInr === fx) return item;
    updated += 1;
    return {
      ...item,
      price: quote.price,
      priceCurrency: quote.currency || (market === 'US' ? 'USD' : 'INR'),
      priceDate: dateKey,
      usdInr: fx,
      current,
    };
  });
  return { items: updated ? next : items, updated };
}
