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

// A US stock typed in by hand with its value in dollars.
const isManualUsdStock = (item) =>
  item.category === 'Stocks' && !item.symbol && marketOf(item) === 'US' && item.currentUsd > 0;

/**
 * Dollar figures for a US stock entered in dollars, or null:
 * { investedUsd, currentUsd }.
 */
export function usdFigures(item) {
  if (item.category !== 'Stocks' || marketOf(item) !== 'US' || !(item.investedUsd > 0)) return null;
  const currentUsd = isLinkedStock(item) ? round2(item.quantity * item.price) : item.currentUsd;
  return currentUsd > 0 ? { investedUsd: item.investedUsd, currentUsd } : null;
}

/** Today's ₹ per $ (through our server). */
export async function fetchUsdInr() {
  const body = await fetchStockQuotes([]);
  return body?.usdInr || null;
}

/** Prices for every linked stock, and USD→INR for US ones: { quotes, usdInr }. */
export async function fetchStockPrices(items) {
  const symbols = [...new Set(items.filter(isLinkedStock).map((i) => i.symbol))];
  if (!symbols.length && !items.some(isManualUsdStock)) return { quotes: {}, usdInr: null };
  const body = await fetchStockQuotes(symbols);
  return { quotes: body?.quotes || {}, usdInr: body?.usdInr || null };
}

/**
 * Value linked stocks at the fetched prices, and US stocks entered in
 * dollars at today's rate. Same array back when nothing changed.
 */
export function applyStockPrices(items, { quotes, usdInr }, dateKey) {
  let updated = 0;
  const next = items.map((item) => {
    if (isManualUsdStock(item)) {
      if (!(usdInr > 0)) return item;
      const current = round2(item.currentUsd * usdInr);
      if (item.current === current && item.usdInr === usdInr) return item;
      updated += 1;
      return { ...item, usdInr, current, priceDate: dateKey };
    }
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
