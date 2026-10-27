// Stock prices and symbol search for Indian (NSE/BSE) and US stocks, from
// Yahoo Finance's public website endpoints. Yahoo has no official API:
// these are unofficial, for personal use, and can throttle (HTTP 429), so
// every answer is cached and requests are kept few and sequential.

const CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const SEARCH_URL = 'https://query2.finance.yahoo.com/v1/finance/search';
const QUOTE_CACHE_MS = 10 * 60 * 1000;
const SEARCH_CACHE_MS = 24 * 60 * 60 * 1000;
const MAX_SYMBOLS = 40;
// Yahoo refuses requests without a browser-like User-Agent.
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json',
};

const quoteCache = new Map();
const searchCache = new Map();

// Symbols look like TCS.NS, 500325.BO, AAPL, BRK-B or USDINR=X.
const isSymbol = (s) => typeof s === 'string' && /^[A-Z0-9.\-=^&]{1,20}$/i.test(s);

async function getJson(url) {
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Yahoo responded ${response.status}`);
  return response.json();
}

/** Latest price of one symbol: { price, currency, time, name }. */
async function fetchQuote(symbol) {
  const cached = quoteCache.get(symbol);
  if (cached && Date.now() - cached.at < QUOTE_CACHE_MS) return cached.quote;
  try {
    const body = await getJson(`${CHART_URL}${encodeURIComponent(symbol)}?range=1d&interval=1d`);
    const meta = body?.chart?.result?.[0]?.meta;
    const price = Number(meta?.regularMarketPrice);
    if (!(price > 0)) throw new Error('No price');
    const quote = {
      price,
      currency: meta.currency || null,
      time: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
      name: meta.longName || meta.shortName || null,
    };
    quoteCache.set(symbol, { at: Date.now(), quote });
    return quote;
  } catch (error) {
    // A slightly old price beats none.
    if (cached) return { ...cached.quote, stale: true };
    throw error;
  }
}

/**
 * Prices for several symbols plus today's USD→INR rate:
 * { quotes: { [symbol]: quote }, usdInr }. Symbols that fail are left out.
 */
async function getQuotes(symbols) {
  const wanted = [...new Set(symbols.filter(isSymbol).map((s) => s.toUpperCase()))].slice(0, MAX_SYMBOLS);
  const quotes = {};
  for (const symbol of wanted) {
    try {
      quotes[symbol] = await fetchQuote(symbol);
    } catch (error) {
      console.warn(`[quotes] ${symbol}: ${error.message}`);
    }
  }
  let usdInr = null;
  try {
    usdInr = (await fetchQuote('USDINR=X')).price;
  } catch (error) {
    console.warn(`[quotes] USDINR: ${error.message}`);
  }
  return { quotes, usdInr };
}

const US_EXCHANGES = new Set(['NMS', 'NGM', 'NCM', 'NYQ', 'ASE', 'PCX', 'BTS', 'NAS', 'NYS', 'CBOE']);

/** Stocks/ETFs matching `query` in one market: [{ symbol, name, exchange }]. */
async function searchSymbols(query, market) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const key = `${market}:${q.toLowerCase()}`;
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.at < SEARCH_CACHE_MS) return cached.results;
  const body = await getJson(
    `${SEARCH_URL}?q=${encodeURIComponent(q)}&quotesCount=20&newsCount=0&listsCount=0`
  );
  const results = (body?.quotes || [])
    .filter((r) => r.symbol && ['EQUITY', 'ETF'].includes(r.quoteType))
    .filter((r) =>
      market === 'IN'
        ? /\.(NS|BO)$/.test(r.symbol)
        : !r.symbol.includes('.') && US_EXCHANGES.has(r.exchange)
    )
    // NSE listings first for Indian stocks.
    .sort((a, b) => Number(b.symbol.endsWith('.NS')) - Number(a.symbol.endsWith('.NS')))
    .slice(0, 12)
    .map((r) => ({
      symbol: r.symbol,
      name: r.longname || r.shortname || r.symbol,
      exchange: r.exchDisp || r.exchange || null,
    }));
  searchCache.set(key, { at: Date.now(), results });
  return results;
}

module.exports = { getQuotes, searchSymbols, isSymbol };
