// Exchange-time helpers. The engine supports two markets:
// - NSE (India): IST = UTC+5:30, no daylight saving; session 09:15–15:30.
// - US (NASDAQ): New York time, UTC−5 (EST) or UTC−4 (EDT, from the second
//   Sunday of March to the first Sunday of November); session 09:30–16:00.
// Everything time-of-day (the session, the trading day used for VWAP and
// volume, the last entry, the square-off) is in the market's own local time.
// Exchange holidays are not known here, so a holiday looks like an open day
// with no fresh data, which the freshness gate turns into NO TRADE.

const IST_OFFSET_MIN = 330;

const hm = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const MARKETS = {
  NSE: {
    id: 'NSE',
    label: 'India · NSE',
    zone: 'IST',
    currency: 'INR',
    symbol: '₹',
    open: '09:15',
    close: '15:30',
    lastEntry: '14:45', // no new entries after this
    squareOffWarn: '15:10',
    squareOff: '15:20', // intraday positions are closed here
  },
  US: {
    id: 'US',
    label: 'US · NASDAQ',
    zone: 'ET',
    currency: 'USD',
    symbol: '$',
    open: '09:30',
    close: '16:00',
    lastEntry: '15:15',
    squareOffWarn: '15:40',
    squareOff: '15:50',
  },
};

/** The market profile for an id ('NSE' | 'US') or a profile; NSE by default. */
export const marketOf = (m) => MARKETS[m?.id || m] || MARKETS.NSE;

export const NSE_SESSION = { open: hm(MARKETS.NSE.open), close: hm(MARKETS.NSE.close) };

const toMs = (t) => (t instanceof Date ? t.getTime() : typeof t === 'number' ? t : Date.parse(t));

// Day of the month of the n-th Sunday of (year, month 0–11).
const nthSunday = (year, month, n) => {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  return 1 + ((7 - first) % 7) + (n - 1) * 7;
};

/**
 * New York's UTC offset in minutes at `t`: −240 during daylight saving
 * (2:00 local on the 2nd Sunday of March to 2:00 local on the 1st Sunday of
 * November), −300 otherwise.
 */
export function usOffsetMin(t) {
  const ms = toMs(t);
  const year = new Date(ms).getUTCFullYear();
  const start = Date.UTC(year, 2, nthSunday(year, 2, 2), 7); // 02:00 EST = 07:00 UTC
  const end = Date.UTC(year, 10, nthSunday(year, 10, 1), 6); // 02:00 EDT = 06:00 UTC
  return ms >= start && ms < end ? -240 : -300;
}

/** The market's UTC offset in minutes at `t`. */
export const offsetMin = (t, market = 'NSE') => (marketOf(market).id === 'US' ? usOffsetMin(t) : IST_OFFSET_MIN);

/**
 * Local calendar parts of a time in the market's zone:
 * { dateKey: 'YYYY-MM-DD', minutes (since local midnight), weekday (0 = Sun) }.
 */
export function marketParts(t, market = 'NSE') {
  const ms = toMs(t);
  const d = new Date(ms + offsetMin(ms, market) * 60000);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    dateKey: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
    weekday: d.getUTCDay(),
  };
}

/** IST calendar parts of a time: { dateKey: 'YYYY-MM-DD', minutes, weekday (0 = Sun) }. */
export const istParts = (t) => marketParts(t, 'NSE');

/** Session open / close / last entry / square-off as minutes since local midnight. */
export function sessionTimes(market = 'NSE') {
  const m = marketOf(market);
  return { open: hm(m.open), close: hm(m.close), lastEntry: hm(m.lastEntry), squareOffWarn: hm(m.squareOffWarn), squareOff: hm(m.squareOff) };
}

/** Is the market's regular session open at `now`? */
export function isMarketOpen(now = Date.now(), market = 'NSE') {
  const { minutes, weekday } = marketParts(now, market);
  const s = sessionTimes(market);
  return weekday >= 1 && weekday <= 5 && minutes >= s.open && minutes < s.close;
}

/** Is the NSE regular session open at `now`? */
export const isNseOpen = (now = Date.now()) => isMarketOpen(now, 'NSE');

/** Minutes since midnight, e.g. "15:20" → 920. */
export const istMinutes = hm;

/** "HH:MM" from minutes since midnight. */
export const hhmm = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export { toMs };
