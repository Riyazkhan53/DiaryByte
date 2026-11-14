import { authToken, getSession, isGuest, sessionReady, signOut } from './session';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
const API_KEY = process.env.EXPO_PUBLIC_API_KEY || '';

const COLLECTIONS = [
  'movies',
  'passwords',
  'vouchers',
  'banking',
  'diary',
  'vault',
  'vaultlock',
  'todo',
  'expenditure',
  'cards',
  'investments',
  'debts',
  'autopays',
  'tickets',
  'dates',
  'months',
  'spends',
  'setups',
  'trades',
  'demat',
  'tradingconfig',
  // Written by the server's scanner; read-only in the app.
  'signals',
  'enginetrades',
];

// Market data anyone may read; everything else is the owner's (see server/auth.js).
const PUBLIC_PATHS = ['/api/health', '/api/auth/', '/api/gold-rate', '/api/quotes', '/api/usdinr', '/api/crypto/', '/api/candles', '/api/stock-search'];
const isPublic = (path) => PUBLIC_PATHS.some((p) => path.startsWith(p));

async function request(path, options = {}) {
  await sessionReady;
  // Guests stay on this device: nothing private is asked of the server.
  if (isGuest() && !isPublic(path)) {
    const error = new Error('Guest mode: this needs you to sign in.');
    error.status = 'guest';
    error.serverMessage = 'Sign in to use this. In guest mode everything stays on this device.';
    throw error;
  }
  const token = authToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  // The server no longer accepts this sign-in: back to the sign-in page.
  if (response.status === 401 && token && !path.startsWith('/api/auth/') && getSession()?.token === token) {
    const body = await response.clone().json().catch(() => null);
    if (body?.code === 'auth') signOut();
  }
  if (!response.ok) {
    const error = new Error(`API request failed (${response.status})`);
    // Lets screens tell "server is out of date" (404) from other failures.
    error.status = response.status;
    // The server's own explanation, when it sent one ({ error: '…' }).
    error.serverMessage = await response
      .json()
      .then((body) => (typeof body?.error === 'string' ? body.error : null))
      .catch(() => null);
    throw error;
  }
  return response.json();
}

// Resolves true once the API answers. The per-attempt timeout keeps a
// sleeping free-tier server from hanging a single request for minutes.
export async function checkHealth(timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_URL}/api/health`, {
      signal: controller.signal,
      headers: API_KEY ? { 'x-api-key': API_KEY } : {},
    });
    return response.ok;
  } catch (_error) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function fetchCollection(collection) {
  if (!COLLECTIONS.includes(collection)) {
    throw new Error(`Unknown collection: ${collection}`);
  }
  return request(`/api/${collection}`).then((data) => data.items || []);
}

// Adds/updates `items` on the server. Only ids in `deleted` are removed;
// the server moves them to Recently deleted.
export function pushCollection(collection, items, deleted = []) {
  if (!COLLECTIONS.includes(collection)) {
    throw new Error(`Unknown collection: ${collection}`);
  }
  return request(`/api/${collection}`, {
    method: 'PUT',
    body: JSON.stringify({ items, deleted }),
  });
}

// Live digital gold rate, cached by the server: { buy, sell, gst, timestamp, silver: { buy, sell, gst } | null }.
export function fetchGoldRateFromServer() {
  return request('/api/gold-rate');
}

// Stock prices for symbols (e.g. TCS.NS, AAPL) and USD→INR: { quotes, usdInr }.
// Crypto via the server (CoinGecko): coin search and live prices.
export function searchCryptoOnServer(query) {
  return request(`/api/crypto/search?q=${encodeURIComponent(query)}`);
}
export function fetchCryptoPricesFromServer(ids) {
  return request(`/api/crypto/prices?ids=${encodeURIComponent(ids.join(','))}`);
}

// ₹ per $ on a past date: { date, rate, rateDate } (rateDate = the trading day used).
export function fetchUsdInrOn(date) {
  return request(`/api/usdinr?date=${encodeURIComponent(date)}`);
}

export function fetchStockQuotes(symbols) {
  return request(`/api/quotes?symbols=${encodeURIComponent(symbols.join(','))}`);
}

// Find a stock in a market ('IN' or 'US'): { results: [{ symbol, name, exchange }] }.
export function searchStockSymbols(query, market) {
  return request(`/api/stock-search?q=${encodeURIComponent(query)}&market=${market}`);
}

// About six months of daily candles: { symbol, name, currency, candles }.
// With interval 5: about five days of 5-minute candles, including the one still forming.
export function fetchCandles(symbol, interval) {
  return request(`/api/candles?symbol=${encodeURIComponent(symbol)}${interval ? `&interval=${interval}` : ''}`);
}

// ------- account -------

// { registered } — whether the app's one account exists yet.
export const fetchAuthStatus = () => request('/api/auth/status');
// Both resolve to { username, token }; errors carry the server's message.
export const registerAccount = (username, password) =>
  request('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) });
export const loginAccount = (username, password) =>
  request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });

// ------- AI assistants (Claude, via the server) -------

// { configured, model } — configured is false until ANTHROPIC_API_KEY is set on the server.
export function fetchAiStatus() {
  return request('/api/ai/status');
}

// Ask StockByte AI (kind 'stock') or InvestByte AI ('invest'): { reply, tools, model }.
// history: earlier turns [{ role: 'user' | 'assistant', content }].
export function askAi(kind, question, history = []) {
  return request(`/api/ai/${kind}`, { method: 'POST', body: JSON.stringify({ question, history }) });
}

// ------- intraday signal engine -------

// Engine calls take a market: 'NSE' (India, default) or 'US' (NASDAQ).
const mq = (market) => (market === 'US' ? 'market=US' : '');

export function fetchEngineStatus(market) {
  return request(`/api/engine/status${market === 'US' ? '?market=US' : ''}`);
}

export function evaluateSymbol(symbol, market) {
  return request(`/api/engine/evaluate?symbol=${encodeURIComponent(symbol)}${market === 'US' ? '&market=US' : ''}`);
}

export function runEngineScan(market) {
  return request('/api/engine/scan', { method: 'POST', body: JSON.stringify({ market: market === 'US' ? 'US' : 'NSE' }) });
}

/** Last backtest of a market and whether one is running: { running, summary }. */
export function fetchBacktest(market) {
  return request(`/api/engine/backtest${mq(market) ? `?${mq(market)}` : ''}`);
}

/** Start a backtest of a market's watchlist (runs on the server): { started }. */
export function startBacktest(market) {
  return request('/api/engine/backtest', { method: 'POST', body: JSON.stringify({ market: market === 'US' ? 'US' : 'NSE' }) });
}

// Phone alerts (ntfy): ask the server to send a test notification.
export function sendTestAlert(topic) {
  return request('/api/engine/test-alert', { method: 'POST', body: JSON.stringify({ topic }) });
}

// Demo trade: simulate taking the signal now (side 'long' | 'short'): { trade }.
export function startDemoTrade(symbol, side, market) {
  return request('/api/engine/demo', { method: 'POST', body: JSON.stringify({ symbol, side, market: market === 'US' ? 'US' : 'NSE' }) });
}

// Logged signals (newest first) and their paper trades: { signals, trades }.
// Filters: { symbol, state, days, timeframe, market }.
export function fetchSignalHistory(filters = {}) {
  const query = Object.entries(filters)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return request(`/api/engine/history${query ? `?${query}` : ''}`);
}

export function fetchKiteLoginUrl() {
  return request('/api/kite/login-url');
}

export function fetchTrash(collection) {
  if (!COLLECTIONS.includes(collection)) {
    throw new Error(`Unknown collection: ${collection}`);
  }
  return request(`/api/trash/${collection}`);
}

export function restoreFromTrash(collection, trashIds) {
  if (!COLLECTIONS.includes(collection)) {
    throw new Error(`Unknown collection: ${collection}`);
  }
  return request(`/api/trash/${collection}/restore`, {
    method: 'POST',
    body: JSON.stringify({ trashIds }),
  });
}

/** A one-time 6-digit code to pair a Wear OS watch: { code, expiresAt }. */
export function createWatchPairCode() {
  return request('/api/watch/pair', { method: 'POST' });
}

/** The server address the app talks to (the watch needs the same one). */
export const serverAddress = () => API_URL;

// ------- IPO Watch (AI web research on the server) -------

/** { ipos, fetchedAt, sources, cached }. `refresh` runs a new search (costs AI credit). */
export function fetchIpos(refresh = false) {
  return request(`/api/ipos${refresh ? '?refresh=1' : ''}`);
}

/** AI review of one IPO by name: { review, sources, fetchedAt, cached }. */
export function fetchIpoReview(name, refresh = false) {
  return request(`/api/ipos/review?name=${encodeURIComponent(name)}${refresh ? '&refresh=1' : ''}`);
}

/** Latest news headlines about an IPO: { items: [{ title, url, source, publishedAt }] }. */
export function fetchIpoNews(name) {
  return request(`/api/ipos/news?name=${encodeURIComponent(name)}`);
}

/**
 * Read a ticket with AI on the server: { text?, image? (data URI) } →
 * { found, fields: { type, title, from, to, venue, date, time, seat, bookingRef, note } }.
 */
export function readTicketWithAi({ text, image, today }) {
  return request('/api/ai/ticket', { method: 'POST', body: JSON.stringify({ text, image, today }) });
}
