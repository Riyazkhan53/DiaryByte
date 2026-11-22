// F&O paper trading: index futures and options (NSE / BSE), for learning.
// Pure functions shared by the app and tests: contract specs, expiries,
// Black-Scholes option prices and Greeks, charges, margin and P/L.
//
// Prices here are estimates. Option premiums come from Black-Scholes with
// the volatility you set (India VIX by default), so they can differ from
// the broker's live premium: type the real premium when you have it.

export const FNO_STORAGE_KEY = '@diarybyte_fnotrades';
export const FNO_SETTINGS_KEY = '@diarybyte_fnosettings';

// Lot sizes and expiry days change from time to time (NSE / BSE circulars):
// the defaults below can be changed in F&O settings.
// expiryDay: 0 Sun … 6 Sat. weekly: weekly expiries as well as monthly.
export const UNDERLYINGS = [
  { key: 'NIFTY', name: 'Nifty 50', quote: '^NSEI', lot: 75, step: 50, expiryDay: 2, weekly: true, exchange: 'NSE' },
  { key: 'BANKNIFTY', name: 'Bank Nifty', quote: '^NSEBANK', lot: 35, step: 100, expiryDay: 2, weekly: false, exchange: 'NSE' },
  { key: 'FINNIFTY', name: 'Fin Nifty', quote: 'NIFTY_FIN_SERVICE.NS', lot: 65, step: 50, expiryDay: 2, weekly: false, exchange: 'NSE' },
  { key: 'MIDCPNIFTY', name: 'Midcap Nifty', quote: 'NIFTY_MID_SELECT.NS', lot: 140, step: 25, expiryDay: 2, weekly: false, exchange: 'NSE' },
  { key: 'SENSEX', name: 'Sensex', quote: '^BSESN', lot: 20, step: 100, expiryDay: 4, weekly: true, exchange: 'BSE' },
];
export const VIX_QUOTE = '^INDIAVIX';

export const DEFAULT_FNO_SETTINGS = {
  capital: 100000, // ₹ for paper trading
  riskPct: 2, // max loss per trade, % of capital
  marginPct: 12, // futures / option-selling margin, % of contract value (approx SPAN + exposure)
  riskFreePct: 6.5, // for Black-Scholes
  autoClose: true, // close at stop / target (and settle at expiry)
  lots: {}, // { NIFTY: 75, … } overrides
};

export const underlyingOf = (key, settings) => {
  const u = UNDERLYINGS.find((x) => x.key === key) || UNDERLYINGS[0];
  const lot = Number(settings?.lots?.[u.key]);
  return lot > 0 ? { ...u, lot } : u;
};

// ---------------- dates ----------------

const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const fromKey = (k) => new Date(`${k}T00:00:00Z`);

/** Last `weekday` of a month (UTC date key). */
function lastWeekdayOf(year, month, weekday) {
  const d = new Date(Date.UTC(year, month + 1, 0));
  while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() - 1);
  return keyOf(d);
}

/**
 * The next expiries on or after `today` (YYYY-MM-DD, IST): weekly ones for
 * underlyings that have them, and the next three monthly ones. Exchange
 * holidays move an expiry a day earlier; that isn't known here.
 * Returns [{ date, monthly }], soonest first.
 */
export function expiries(u, today, weeks = 4) {
  const out = new Map();
  const t = fromKey(today);
  for (let m = 0; m < 3; m += 1) {
    const d = lastWeekdayOf(t.getUTCFullYear(), t.getUTCMonth() + m, u.expiryDay);
    if (d >= today) out.set(d, { date: d, monthly: true });
  }
  if (u.weekly) {
    const d = new Date(t);
    while (d.getUTCDay() !== u.expiryDay) d.setUTCDate(d.getUTCDate() + 1);
    for (let i = 0; i < weeks; i += 1) {
      const k = keyOf(d);
      if (!out.has(k)) out.set(k, { date: k, monthly: false });
      d.setUTCDate(d.getUTCDate() + 7);
    }
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(0, u.weekly ? weeks + 2 : 3);
}

/** Years to expiry at 15:30 IST on the expiry date, from `now` (ms). Never below a few minutes. */
export function yearsTo(expiryDate, now = Date.now()) {
  const end = Date.parse(`${expiryDate}T10:00:00Z`); // 15:30 IST
  return Math.max((end - now) / (365 * 86400000), 5 / (365 * 24 * 60));
}

export const expired = (expiryDate, now = Date.now()) => now >= Date.parse(`${expiryDate}T10:00:00Z`);

// ---------------- Black-Scholes ----------------

/** Standard normal CDF (Abramowitz–Stegun 7.1.26). */
export function normCdf(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * z);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
  return 0.5 * (1 + sign * y);
}
const normPdf = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

/**
 * Option price and Greeks: { price, delta, gamma, theta (₹ per day), vega
 * (₹ per 1% volatility) }. kind 'CE' | 'PE'; vol and r as fractions.
 */
export function blackScholes({ spot, strike, years, vol, r = 0.065, kind = 'CE' }) {
  if (!(spot > 0) || !(strike > 0) || !(years > 0) || !(vol > 0)) return null;
  const sq = Math.sqrt(years);
  const d1 = (Math.log(spot / strike) + (r + (vol * vol) / 2) * years) / (vol * sq);
  const d2 = d1 - vol * sq;
  const disc = Math.exp(-r * years);
  const call = kind === 'CE';
  const price = call ? spot * normCdf(d1) - strike * disc * normCdf(d2) : strike * disc * normCdf(-d2) - spot * normCdf(-d1);
  const delta = call ? normCdf(d1) : normCdf(d1) - 1;
  const gamma = normPdf(d1) / (spot * vol * sq);
  const thetaYear = -(spot * normPdf(d1) * vol) / (2 * sq) + (call ? -r * strike * disc * normCdf(d2) : r * strike * disc * normCdf(-d2));
  const vega = (spot * normPdf(d1) * sq) / 100;
  const round = (n, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp + 0;
  return { price: round(Math.max(price, 0.05)), delta: round(delta, 3), gamma: round(gamma, 5), theta: round(thetaYear / 365), vega: round(vega) };
}

/** Value at expiry: intrinsic for options, the spot for futures. */
export function intrinsic(kind, strike, spot) {
  if (kind === 'CE') return Math.max(spot - strike, 0);
  if (kind === 'PE') return Math.max(strike - spot, 0);
  return spot;
}

/** ATM strike, and how an option's strike sits: 'ATM' | 'ITM' | 'OTM'. */
export const atmStrike = (spot, step) => Math.round(spot / step) * step;
export function moneyness(kind, strike, spot, step) {
  if (kind === 'FUT' || !(spot > 0)) return '';
  if (Math.abs(strike - spot) < step / 2) return 'ATM';
  const itm = kind === 'CE' ? strike < spot : strike > spot;
  return itm ? 'ITM' : 'OTM';
}

// ---------------- charges, margin, P/L ----------------

// Estimated charges per round trip (discount broker, NSE rates from Oct 2024).
export const FNO_CHARGES = {
  brokeragePerOrder: 20,
  sttOptionSellPct: 0.1, // on the sell-side premium
  sttFutureSellPct: 0.02, // on the sell-side value
  exchOptionPct: 0.03503, // on premium turnover
  exchFuturePct: 0.00173, // on turnover
  sebiPerCrore: 10,
  stampOptionBuyPct: 0.003,
  stampFutureBuyPct: 0.002,
  gstPct: 18,
};

/** Estimated round-trip charges (₹) for a trade of `qty` units, entry → exit price. */
export function fnoCharges({ kind, side = 'buy', qty, entry, exit = entry }, c = FNO_CHARGES) {
  if (!(qty > 0) || !(entry > 0)) return 0;
  const opt = kind !== 'FUT';
  const buyValue = (side === 'buy' ? entry : exit) * qty;
  const sellValue = (side === 'buy' ? exit : entry) * qty;
  const turnover = buyValue + sellValue;
  const brokerage = 2 * c.brokeragePerOrder;
  const stt = (sellValue * (opt ? c.sttOptionSellPct : c.sttFutureSellPct)) / 100;
  const exch = (turnover * (opt ? c.exchOptionPct : c.exchFuturePct)) / 100;
  const sebi = (turnover / 1e7) * c.sebiPerCrore;
  const stamp = (buyValue * (opt ? c.stampOptionBuyPct : c.stampFutureBuyPct)) / 100;
  const gst = ((brokerage + exch + sebi) * c.gstPct) / 100;
  return Math.round((brokerage + stt + exch + sebi + stamp + gst) * 100) / 100;
}

/**
 * Money needed to take the trade: the premium for option buys; margin
 * (marginPct of contract value) for futures and option selling.
 */
export function capitalNeeded({ kind, side, qty, price, spot, marginPct = 12 }) {
  if (kind !== 'FUT' && side === 'buy') return Math.round(price * qty);
  const base = kind === 'FUT' ? price : spot;
  return Math.round((base * qty * marginPct) / 100);
}

/** P/L (₹) at `now` price for a trade (buy: now − entry). */
export const pnlOf = (t, now) => (now == null ? null : Math.round((t.side === 'sell' ? t.entryPrice - now : now - t.entryPrice) * t.lots * t.lotSize * 100) / 100);

/** Spot at which the trade breaks even at expiry. */
export function breakeven({ kind, side, strike, price }) {
  if (kind === 'FUT') return price;
  return kind === 'CE' ? strike + price : strike - price;
}

/**
 * Max loss (₹) for the trade if held to its stop, or unlimited (null) for
 * option selling / futures without a stop. Buying an option risks at most
 * the premium (or premium − stop when a stop is set).
 */
export function maxLoss({ kind, side, price, stop, qty }) {
  const perUnit = stop > 0 ? (side === 'sell' ? stop - price : price - stop) : kind !== 'FUT' && side === 'buy' ? price : null;
  return perUnit == null || perUnit <= 0 ? null : Math.round(perUnit * qty);
}

/** 'stop' | 'target' | null for a trade at price `now` (premium or futures price). */
export function hitLevel(t, now) {
  if (!(now > 0)) return null;
  const dir = t.side === 'sell' ? -1 : 1;
  if (t.stop > 0 && (now - t.stop) * dir <= 0) return 'stop';
  if (t.target > 0 && (now - t.target) * dir >= 0) return 'target';
  return null;
}

/**
 * The trade's price now: the price you typed if it is recent, else at expiry
 * the settlement value, else a Black-Scholes estimate from the spot (futures:
 * the spot). { price, source: 'typed' | 'expiry' | 'estimate' }.
 */
export function priceNow(t, spot, { now = Date.now(), r = 0.065, typedMaxAgeMs = 15 * 60000 } = {}) {
  if (t.lastPrice > 0 && t.lastPriceAt && now - Date.parse(t.lastPriceAt) < typedMaxAgeMs) return { price: t.lastPrice, source: 'typed' };
  if (!(spot > 0)) return { price: null, source: null };
  if (expired(t.expiry, now)) return { price: Math.round(intrinsic(t.kind, t.strike, spot) * 100) / 100, source: 'expiry' };
  if (t.kind === 'FUT') return { price: spot, source: 'estimate' };
  const bs = blackScholes({ spot, strike: t.strike, years: yearsTo(t.expiry, now), vol: (t.iv || 15) / 100, r, kind: t.kind });
  return { price: bs?.price ?? null, source: 'estimate' };
}

/** Totals for closed trades: { count, wins, losses, winRate, gross, charges, net }. */
export function fnoStats(closed) {
  const rows = closed.map((t) => {
    const gross = pnlOf(t, t.exitPrice) || 0;
    const charges = fnoCharges({ kind: t.kind, side: t.side, qty: t.lots * t.lotSize, entry: t.entryPrice, exit: t.exitPrice });
    return { gross, charges, net: gross - charges };
  });
  const sum = (k) => Math.round(rows.reduce((s, r) => s + r[k], 0) * 100) / 100;
  const wins = rows.filter((r) => r.net > 0).length;
  return { count: rows.length, wins, losses: rows.length - wins, winRate: rows.length ? Math.round((wins / rows.length) * 100) : null, gross: sum('gross'), charges: sum('charges'), net: sum('net') };
}
