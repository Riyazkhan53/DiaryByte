// Exchange-time helpers. The engine supports NSE (India, IST = UTC+5:30, no
// daylight saving): regular session 09:15–15:30, Monday to Friday. Exchange
// holidays are not known here, so a holiday looks like an open day with no
// fresh data, which the freshness gate turns into NO TRADE.

const IST_OFFSET_MIN = 330;

export const NSE_SESSION = { open: 9 * 60 + 15, close: 15 * 60 + 30 };

const toMs = (t) => (t instanceof Date ? t.getTime() : typeof t === 'number' ? t : Date.parse(t));

/** IST calendar parts of a time: { dateKey: 'YYYY-MM-DD', minutes, weekday (0 = Sun) }. */
export function istParts(t) {
  const d = new Date(toMs(t) + IST_OFFSET_MIN * 60000);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    dateKey: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
    weekday: d.getUTCDay(),
  };
}

/** Is the NSE regular session open at `now`? */
export function isNseOpen(now = Date.now()) {
  const { minutes, weekday } = istParts(now);
  return weekday >= 1 && weekday <= 5 && minutes >= NSE_SESSION.open && minutes < NSE_SESSION.close;
}

/** Minutes since midnight IST, e.g. "15:20" → 920. */
export const istMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export { toMs };
