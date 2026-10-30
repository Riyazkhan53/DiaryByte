const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
const API_KEY = process.env.EXPO_PUBLIC_API_KEY || '';

const COLLECTIONS = [
  'movies',
  'passwords',
  'banking',
  'diary',
  'vault',
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
  'tradingconfig',
  // Written by the server's scanner; read-only in the app.
  'signals',
  'enginetrades',
];

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(`API request failed (${response.status})`);
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

// Live digital gold rate, cached by the server: { buy, sell, gst, timestamp }.
export function fetchGoldRateFromServer() {
  return request('/api/gold-rate');
}

// Stock prices for symbols (e.g. TCS.NS, AAPL) and USD→INR: { quotes, usdInr }.
export function fetchStockQuotes(symbols) {
  return request(`/api/quotes?symbols=${encodeURIComponent(symbols.join(','))}`);
}

// Find a stock in a market ('IN' or 'US'): { results: [{ symbol, name, exchange }] }.
export function searchStockSymbols(query, market) {
  return request(`/api/stock-search?q=${encodeURIComponent(query)}&market=${market}`);
}

// About six months of daily candles: { symbol, name, currency, candles }.
export function fetchCandles(symbol) {
  return request(`/api/candles?symbol=${encodeURIComponent(symbol)}`);
}

// ------- intraday signal engine -------

export function fetchEngineStatus() {
  return request('/api/engine/status');
}

export function evaluateSymbol(symbol) {
  return request(`/api/engine/evaluate?symbol=${encodeURIComponent(symbol)}`);
}

export function runEngineScan() {
  return request('/api/engine/scan', { method: 'POST' });
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
