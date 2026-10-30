// Market-data providers behind one interface, so the engine doesn't depend
// on a vendor's format:
//   { id, label, delayed, getCandles(symbol, intervalMin) → raw candles }
// Yahoo is the prototype feed (unofficial, may be delayed). Kite Connect is
// used when MARKET_DATA_PROVIDER=kite, its keys are set and today's login
// has been done; otherwise the engine falls back to Yahoo and says so.

const crypto = require('crypto');
const mongoose = require('mongoose');
const { getIntradayCandles } = require('../quotes');

const KITE_API = 'https://api.kite.trade';
const KITE_LOGIN = 'https://kite.zerodha.com/connect/login';

// ------- Yahoo -------

const yahooCache = new Map();

/** Candles cached until the next candle should have closed (+20 s for the feed). */
async function yahooCandles(symbol, intervalMin) {
  const key = `${symbol}:${intervalMin}`;
  const cached = yahooCache.get(key);
  if (cached && Date.now() < cached.until) return cached.candles;
  const candles = await getIntradayCandles(symbol, intervalMin);
  const step = intervalMin * 60000;
  yahooCache.set(key, { candles, until: Math.ceil((Date.now() + 1) / step) * step + 20000 });
  return candles;
}

const yahoo = {
  id: 'yahoo',
  label: 'Yahoo Finance (prototype feed, may be delayed)',
  delayed: true,
  getCandles: yahooCandles,
};

// ------- Kite Connect -------

let sessionModel = null;
function kiteSession() {
  if (!sessionModel) {
    sessionModel = mongoose.model(
      'kitesession',
      new mongoose.Schema({ _id: String }, { strict: false, collection: 'kitesession' })
    );
  }
  return sessionModel;
}

const kiteKeys = () => ({ apiKey: process.env.KITE_API_KEY, apiSecret: process.env.KITE_API_SECRET });
const kiteConfigured = () => !!(kiteKeys().apiKey && kiteKeys().apiSecret);
const kiteWanted = () => (process.env.MARKET_DATA_PROVIDER || '').toLowerCase() === 'kite';

let accessToken = null;
let tokenExpired = false;

async function loadKiteToken() {
  if (accessToken || !kiteConfigured()) return accessToken;
  const doc = await kiteSession().findById('current').lean().catch(() => null);
  accessToken = doc?.accessToken || null;
  return accessToken;
}

function kiteLoginUrl() {
  return `${KITE_LOGIN}?api_key=${encodeURIComponent(kiteKeys().apiKey)}&v=3`;
}

/** Exchange the request_token from Kite's login redirect for today's access token. */
async function kiteCreateSession(requestToken) {
  const { apiKey, apiSecret } = kiteKeys();
  const checksum = crypto.createHash('sha256').update(apiKey + requestToken + apiSecret).digest('hex');
  const response = await fetch(`${KITE_API}/session/token`, {
    method: 'POST',
    headers: { 'X-Kite-Version': '3', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ api_key: apiKey, request_token: requestToken, checksum }).toString(),
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.data?.access_token) {
    throw new Error(body?.message || `Kite session failed (${response.status})`);
  }
  accessToken = body.data.access_token;
  tokenExpired = false;
  await kiteSession().findByIdAndUpdate(
    'current',
    { accessToken, createdAt: new Date() },
    { upsert: true }
  );
  return true;
}

async function kiteGet(path, { raw = false } = {}) {
  const { apiKey } = kiteKeys();
  const response = await fetch(`${KITE_API}${path}`, {
    headers: { 'X-Kite-Version': '3', Authorization: `token ${apiKey}:${accessToken}` },
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 403) {
    // Kite tokens expire every morning; a fresh login is needed.
    tokenExpired = true;
    throw new Error('Kite login expired');
  }
  if (!response.ok) throw new Error(`Kite responded ${response.status}`);
  return raw ? response.text() : response.json();
}

// Instrument tokens for NSE/BSE trading symbols, refreshed daily.
const instruments = { NSE: null, BSE: null };
async function instrumentToken(symbol) {
  const exchange = symbol.endsWith('.BO') ? 'BSE' : 'NSE';
  const tradingsymbol = symbol.replace(/\.(NS|BO)$/, '');
  const cached = instruments[exchange];
  if (!cached || Date.now() - cached.at > 24 * 3600000) {
    const csv = await kiteGet(`/instruments/${exchange}`, { raw: true });
    const lines = csv.trim().split('\n');
    const cols = lines[0].split(',');
    const iToken = cols.indexOf('instrument_token');
    const iSymbol = cols.indexOf('tradingsymbol');
    const map = new Map();
    lines.slice(1).forEach((line) => {
      const parts = line.split(',');
      map.set(parts[iSymbol], parts[iToken]);
    });
    instruments[exchange] = { at: Date.now(), map };
  }
  const token = instruments[exchange].map.get(tradingsymbol);
  if (!token) throw new Error(`${symbol} not found on Kite ${exchange}`);
  return token;
}

// Kite wants 'YYYY-MM-DD HH:MM:SS' in exchange time (IST).
function istString(ms) {
  const d = new Date(ms + 330 * 60000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00`;
}

async function kiteCandles(symbol, intervalMin) {
  const token = await instrumentToken(symbol);
  const days = intervalMin === 1 ? 3 : intervalMin <= 5 ? 6 : 25;
  const from = istString(Date.now() - days * 86400000);
  const to = istString(Date.now());
  const body = await kiteGet(
    // Kite names the 1-minute interval "minute", the rest "5minute" etc.
    `/instruments/historical/${token}/${intervalMin === 1 ? '' : intervalMin}minute?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  );
  return (body?.data?.candles || []).map(([ts, open, high, low, close, volume]) => ({
    // '2026-10-29T09:15:00+0530' → '+05:30' so every JS engine parses it.
    t: Date.parse(String(ts).replace(/([+-]\d{2})(\d{2})$/, '$1:$2')),
    open,
    high,
    low,
    close,
    volume,
  }));
}

const kite = {
  id: 'kite',
  label: 'Kite Connect (Zerodha)',
  delayed: false,
  getCandles: kiteCandles,
};

/** The provider to use now, and why (for the status strip). */
async function activeProvider() {
  if (!kiteWanted()) return { provider: yahoo, note: null };
  if (!kiteConfigured()) return { provider: yahoo, note: 'Kite selected but KITE_API_KEY / KITE_API_SECRET are not set' };
  await loadKiteToken();
  if (!accessToken || tokenExpired) return { provider: yahoo, note: 'Kite needs today’s login; using Yahoo until then' };
  return { provider: kite, note: null };
}

function kiteStatus() {
  return {
    wanted: kiteWanted(),
    configured: kiteConfigured(),
    connected: !!accessToken && !tokenExpired,
  };
}

module.exports = {
  activeProvider,
  kiteStatus,
  kiteLoginUrl,
  kiteCreateSession,
  kiteConfigured,
  yahoo,
};
