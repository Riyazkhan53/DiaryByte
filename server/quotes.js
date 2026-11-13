// Stock prices and symbol search for Indian (NSE/BSE) and US stocks, from
// Yahoo Finance's public website endpoints. Yahoo has no official API:
// these are unofficial, for personal use, and can throttle (HTTP 429), so
// every answer is cached and requests are kept few and sequential.

const CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const SEARCH_URL = 'https://query2.finance.yahoo.com/v1/finance/search';
// Short, so prices stay close to the broker's: at most a minute older than Yahoo's.
const QUOTE_CACHE_MS = 15 * 1000; // the app re-checks every 15 s while a trading screen is open
const SEARCH_CACHE_MS = 24 * 60 * 60 * 1000;
const MAX_SYMBOLS = 40;
// Yahoo refuses requests without a browser-like User-Agent.
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json',
};

// Daily candles: today's bar moves during market hours, so refetch after a
// minute then; outside them (nothing changes) keep them for 15 minutes.
const nseOpenNow = () => {
  const ist = new Date(Date.now() + 330 * 60000);
  const day = ist.getUTCDay();
  const min = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return day >= 1 && day <= 5 && min >= 9 * 60 + 15 && min < 15 * 60 + 30;
};
const candlesCacheMs = () => (nseOpenNow() ? 60 * 1000 : 15 * 60 * 1000);

const quoteCache = new Map();
const searchCache = new Map();
const candlesCache = new Map();

// Symbols look like TCS.NS, 500325.BO, AAPL, BRK-B or USDINR=X.
const isSymbol = (s) => typeof s === 'string' && /^[A-Z0-9.\-=^&]{1,20}$/i.test(s);

async function getJson(url) {
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Yahoo responded ${response.status}`);
  return response.json();
}

/**
 * Latest price of one symbol: { price, previousClose, currency, time,
 * fetchedAt, name }. previousClose is the last session's official close
 * (what brokers show as "prev close").
 */
async function fetchQuote(symbol) {
  const cached = quoteCache.get(symbol);
  if (cached && Date.now() - cached.at < QUOTE_CACHE_MS) return cached.quote;
  try {
    const body = await getJson(`${CHART_URL}${encodeURIComponent(symbol)}?range=1d&interval=1d`);
    const meta = body?.chart?.result?.[0]?.meta;
    const price = Number(meta?.regularMarketPrice);
    if (!(price > 0)) throw new Error('No price');
    const prev = Number(meta.previousClose ?? meta.chartPreviousClose);
    const quote = {
      price,
      previousClose: prev > 0 ? prev : null,
      currency: meta.currency || null,
      time: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
      // When this server fetched it (time is the exchange's last-trade time).
      fetchedAt: new Date().toISOString(),
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

/**
 * About six months of daily candles for one symbol, oldest first:
 * { symbol, name, currency, candles: [{ t, open, high, low, close, volume }] }.
 * Enough for EMA 50, RSI 14, MACD and 20-day volume and swing levels.
 */
/** The exchange's calendar day of a time (gmtoffset in seconds, e.g. 19800 for IST). */
const exchangeDay = (iso, gmtoffset = 0) => new Date(Date.parse(iso) + (gmtoffset || 0) * 1000).toISOString().slice(0, 10);

async function getCandles(symbol) {
  if (!isSymbol(symbol)) throw new Error('Bad symbol');
  const key = symbol.toUpperCase();
  const cached = candlesCache.get(key);
  if (cached && Date.now() - cached.at < candlesCacheMs()) return cached.data;
  const body = await getJson(`${CHART_URL}${encodeURIComponent(key)}?range=6mo&interval=1d`);
  const result = body?.chart?.result?.[0];
  const q = result?.indicators?.quote?.[0] || {};
  const candles = (result?.timestamp || [])
    .map((t, i) => ({
      t: new Date(t * 1000).toISOString(),
      open: q.open?.[i],
      high: q.high?.[i],
      low: q.low?.[i],
      close: q.close?.[i],
      volume: q.volume?.[i],
    }))
    .filter((c) => c.close > 0);
  if (!candles.length) throw new Error('No price history');
  // Yahoo sometimes sends today twice (an early bar and the live one): keep
  // the last bar of each exchange day, so "previous close" really is the
  // previous session.
  const byDay = new Map();
  candles.forEach((c) => byDay.set(exchangeDay(c.t, result.meta?.gmtoffset), c));
  const daily = [...byDay.values()];
  // The live price and the official previous close, when Yahoo has them.
  const quote = await fetchQuote(key).catch(() => null);
  const data = {
    symbol: key,
    name: result.meta?.longName || result.meta?.shortName || null,
    currency: result.meta?.currency || null,
    candles: daily,
    quote: quote ? { price: quote.price, previousClose: quote.previousClose, time: quote.time } : null,
    fetchedAt: new Date().toISOString(), // when this server got them from Yahoo
  };
  candlesCache.set(key, { at: Date.now(), data });
  return data;
}

const intradayBundleCache = new Map();

/**
 * Intraday candles for a chart-style reading, oldest first, including the
 * candle still forming (as a broker chart shows it):
 * { symbol, name, currency, interval, candles: [{ t (ISO), open, high, low,
 * close, volume }], quote, fetchedAt }. About five days of 5-minute candles.
 */
async function getIntradayBundle(symbol, intervalMin = 5) {
  if (!isSymbol(symbol)) throw new Error('Bad symbol');
  const key = `${symbol.toUpperCase()}:${intervalMin}`;
  const cached = intradayBundleCache.get(key);
  if (cached && Date.now() - cached.at < QUOTE_CACHE_MS) return cached.data;
  const rows = (await getIntradayCandles(key.split(':')[0], intervalMin)).filter((c) => c.close > 0);
  if (!rows.length) throw new Error('No price history');
  const quote = await fetchQuote(key.split(':')[0]).catch(() => null);
  const data = {
    symbol: key.split(':')[0],
    name: quote?.name || null,
    currency: quote?.currency || null,
    interval: intervalMin,
    candles: rows.map((c) => ({ ...c, t: new Date(c.t).toISOString() })),
    quote: quote ? { price: quote.price, previousClose: quote.previousClose, time: quote.time } : null,
    fetchedAt: new Date().toISOString(),
  };
  intradayBundleCache.set(key, { at: Date.now(), data });
  return data;
}

const fxDayCache = new Map();

/**
 * ₹ per $ on a past date ('YYYY-MM-DD'): that day's closing USD→INR rate,
 * or the last trading day's before it (weekends, holidays):
 * { date, rate, rateDate }.
 */
async function getUsdInrOn(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error('Bad date');
  const cached = fxDayCache.get(date);
  if (cached) return cached;
  const day = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(day) || day > Date.now()) throw new Error('Bad date');
  const period1 = Math.floor((day - 10 * 86400000) / 1000);
  const period2 = Math.floor((day + 86400000) / 1000);
  const body = await getJson(`${CHART_URL}USDINR%3DX?period1=${period1}&period2=${period2}&interval=1d`);
  const result = body?.chart?.result?.[0];
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const bars = (result?.timestamp || [])
    .map((t, i) => ({ day: new Date(t * 1000).toISOString().slice(0, 10), close: closes[i] }))
    .filter((b) => b.close > 0 && b.day <= date);
  const bar = bars[bars.length - 1];
  if (!bar) throw new Error('No rate for that date');
  const out = { date, rate: Math.round(bar.close * 100) / 100, rateDate: bar.day };
  // Past days don't change; today's can, so only cache older ones.
  if (date < new Date().toISOString().slice(0, 10)) fxDayCache.set(date, out);
  return out;
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

/**
 * Intraday candles from Yahoo's chart endpoint, for the signal engine:
 * [{ t (ms), open, high, low, close, volume }], oldest first, including a
 * possibly still-forming last candle (the engine drops it).
 */
async function getIntradayCandles(symbol, intervalMin, rangeOverride) {
  if (!isSymbol(symbol)) throw new Error('Bad symbol');
  // Backtests ask for more history (Yahoo keeps 60 days of 5-minute candles).
  const range = rangeOverride || (intervalMin <= 5 ? '5d' : '1mo');
  const body = await getJson(
    `${CHART_URL}${encodeURIComponent(symbol.toUpperCase())}?range=${range}&interval=${intervalMin}m`
  );
  const result = body?.chart?.result?.[0];
  const q = result?.indicators?.quote?.[0] || {};
  return (result?.timestamp || []).map((t, i) => ({
    t: t * 1000,
    open: q.open?.[i],
    high: q.high?.[i],
    low: q.low?.[i],
    close: q.close?.[i],
    volume: q.volume?.[i],
  }));
}

module.exports = { getQuotes, getCandles, getIntradayCandles, getIntradayBundle, searchSymbols, isSymbol, getUsdInrOn };
