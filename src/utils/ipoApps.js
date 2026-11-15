// IPO applications: which IPOs you applied for, and whether you got an
// allotment. Pure functions, shared by the app, the server (watch) and tests.
//
// An application doc (collection "ipoapps", id = the IPO's id):
// { id, name, board, openDate, closeDate, listingDate, priceHigh, lotSize,
//   status: 'applied' | 'skipped', result: null | 'allotted' | 'not_allotted',
//   createdAt, updatedAt }

export const IPOAPPS_STORAGE_KEY = '@diarybyte_ipoapps';
// The IPO list as IPO Watch saved it on this device.
export const IPO_LIST_KEY = '@diarybyte_ipos';
// IPOs with a grey market premium above this (% over the top of the price
// band) are put on the home screen to apply for.
export const HOT_GMP_PCT = 20;
// After listing, an unanswered "Did you get an allotment?" stays this long.
const ASK_DAYS_AFTER_LISTING = 7;

const dateKey = (d) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
const addDays = (key, days) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** GMP as % of the upper price band (uses the server's figure when present). */
export function gmpPctOf(ipo) {
  if (typeof ipo?.gmpPct === 'number') return ipo.gmpPct;
  const gmp = Number(ipo?.gmp);
  const high = Number(ipo?.priceHigh);
  return Number.isFinite(gmp) && high > 0 ? Math.round((gmp / high) * 1000) / 10 : null;
}

/** Is bidding still possible (or not started yet) on `today`? */
export function canStillApply(ipo, today) {
  const close = dateKey(ipo?.closeDate);
  if (close) return today <= close;
  return ipo?.status === 'open' || ipo?.status === 'upcoming';
}

export const appFor = (apps, ipo) => (apps || []).find((a) => a.id === ipo?.id);

/**
 * Open and upcoming IPOs with GMP above HOT_GMP_PCT that you haven't marked
 * applied (or skipped), until their close date. Soonest close first.
 */
export function hotIpos(ipos, apps, today, minPct = HOT_GMP_PCT) {
  return (ipos || [])
    .filter((i) => i?.id && !appFor(apps, i))
    .filter((i) => i.status !== 'listed' && canStillApply(i, today))
    .filter((i) => (gmpPctOf(i) ?? -Infinity) > minPct)
    .sort((a, b) => String(a.closeDate || '9').localeCompare(String(b.closeDate || '9')));
}

/** Applied IPOs whose bidding has closed and that still need "allotted?". */
export function awaitingAllotment(apps, today) {
  return (apps || [])
    .filter((a) => a.status === 'applied' && !a.result)
    .filter((a) => {
      const close = dateKey(a.closeDate);
      if (!close || today <= close) return false;
      const listing = dateKey(a.listingDate);
      return !listing || today <= addDays(listing, ASK_DAYS_AFTER_LISTING);
    })
    .sort((a, b) => String(a.closeDate).localeCompare(String(b.closeDate)));
}

/** Allotted IPOs that list today or later (soonest first): listing reminders. */
export function allottedListings(apps, today) {
  return (apps || [])
    .filter((a) => a.result === 'allotted')
    .filter((a) => {
      const listing = dateKey(a.listingDate);
      return !listing || listing >= today;
    })
    .sort((a, b) => String(a.listingDate || '9').localeCompare(String(b.listingDate || '9')));
}

/** A new application doc from an IPO in the list. */
export function newApp(ipo, status, now = new Date().toISOString()) {
  return {
    id: ipo.id,
    name: ipo.name,
    board: ipo.board || 'mainboard',
    openDate: dateKey(ipo.openDate),
    closeDate: dateKey(ipo.closeDate),
    listingDate: dateKey(ipo.listingDate),
    priceHigh: ipo.priceHigh ?? null,
    lotSize: ipo.lotSize ?? null,
    status,
    result: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Copy newer dates from the IPO list into the applications (a listing date
 * is often announced after you apply). Returns the new list, or null when
 * nothing changed.
 */
export function withLatestDates(apps, ipos, now = new Date().toISOString()) {
  let changed = false;
  const byId = new Map((ipos || []).map((i) => [i.id, i]));
  const next = (apps || []).map((a) => {
    const ipo = byId.get(a.id);
    if (!ipo) return a;
    const patch = {};
    ['openDate', 'closeDate', 'listingDate'].forEach((k) => {
      const v = dateKey(ipo[k]);
      if (v && v !== a[k]) patch[k] = v;
    });
    if (!Object.keys(patch).length) return a;
    changed = true;
    return { ...a, ...patch, updatedAt: now };
  });
  return changed ? next : null;
}

/** "Lists today" / "Lists tomorrow" / "Lists in 3 days" / "Listing date not out yet". */
export function listingLabel(app, today) {
  const listing = dateKey(app?.listingDate);
  if (!listing) return 'Listing date not out yet';
  const days = Math.round((Date.parse(`${listing}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  if (days <= 0) return 'Lists today';
  if (days === 1) return 'Lists tomorrow';
  return `Lists in ${days} days`;
}
