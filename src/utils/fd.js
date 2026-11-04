// Fixed deposits that grow on their own: amount invested, interest rate
// (% a year) and the interest already earned on a date. From then on the
// value goes up by a day's interest every day (simple interest on the amount
// invested, Actual/365), until the maturity date if there is one. Banks often
// compound quarterly, so their figure can run slightly ahead of this.

const DAY_MS = 86400000;
const round2 = (n) => Math.round(n * 100) / 100;
const dayNumber = (key) => {
  const [y, m, d] = String(key).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
};

/** An FD with a rate, so it can be grown daily. */
export const isGrowingFd = (item) => item.category === 'FD' && Number(item.fdRate) > 0 && !!item.fdAsOf;

/** One day's interest on the amount invested. */
export const fdPerDay = (item) => round2(((Number(item.invested) || 0) * Number(item.fdRate)) / 100 / 365);

/** Has it matured by `dateKey`? */
export const fdMatured = (item, dateKey) => !!item.fdMaturity && item.fdMaturity <= dateKey;

/** Value on `dateKey`: invested + interest earned then + daily interest since. */
export function fdValue(item, dateKey) {
  if (!isGrowingFd(item)) return null;
  const end = item.fdMaturity && item.fdMaturity < dateKey ? item.fdMaturity : dateKey;
  const days = Math.max(0, dayNumber(end) - dayNumber(item.fdAsOf));
  const invested = Number(item.invested) || 0;
  return round2(invested + (Number(item.fdInterest) || 0) + (invested * Number(item.fdRate) * days) / 100 / 365);
}

/** Bring every growing FD up to `dateKey`. Same array back when nothing changed. */
export function applyFdGrowth(items, dateKey) {
  let updated = 0;
  const next = items.map((item) => {
    const value = fdValue(item, dateKey);
    if (value == null || value === item.current) return item;
    updated += 1;
    return { ...item, current: value };
  });
  return { items: updated ? next : items, updated };
}
