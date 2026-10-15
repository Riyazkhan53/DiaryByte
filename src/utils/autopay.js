// Date maths for autopays. All dates are local calendar days stored as
// 'YYYY-MM-DD' strings, which also compare correctly as plain strings.

export const RECURRENCES = [
  { key: 'monthly', label: 'Every month' },
  { key: 'weekly', label: 'Every week' },
  { key: 'yearly', label: 'Every year' },
  { key: 'dates', label: 'Specific dates' },
  { key: 'once', label: 'Only once' },
];

// Reminders go out this many days before the due date, and on the day itself.
export const REMIND_DAYS_BEFORE = 2;

const pad = (n) => String(n).padStart(2, '0');

export function toKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey() {
  return toKey(new Date());
}

export function addDays(key, days) {
  const date = fromKey(key);
  date.setDate(date.getDate() + days);
  return toKey(date);
}

export function daysBetween(fromDateKey, toDateKey) {
  return Math.round((fromKey(toDateKey) - fromKey(fromDateKey)) / 86400000);
}

const daysInMonth = (year, monthIndex) => new Date(year, monthIndex + 1, 0).getDate();

// The k-th occurrence after the start date. Monthly/yearly clamp to the
// last day of short months (31st → 30th/28th, 29 Feb → 28 Feb).
function nthOccurrence(start, recurrence, k) {
  const base = fromKey(start);
  if (recurrence === 'weekly') return addDays(start, 7 * k);
  if (recurrence === 'monthly') {
    const totalMonths = base.getMonth() + k;
    const year = base.getFullYear() + Math.floor(totalMonths / 12);
    const month = ((totalMonths % 12) + 12) % 12;
    return toKey(new Date(year, month, Math.min(base.getDate(), daysInMonth(year, month))));
  }
  if (recurrence === 'yearly') {
    const year = base.getFullYear() + k;
    const month = base.getMonth();
    return toKey(new Date(year, month, Math.min(base.getDate(), daysInMonth(year, month))));
  }
  return start;
}

/**
 * Due dates on or after `fromDateKey`, earliest first, at most `limit`.
 */
export function occurrencesFrom(autopay, fromDateKey, limit = 1) {
  const { recurrence, startDate, dates } = autopay;
  if (recurrence === 'dates') {
    return [...(dates || [])].sort().filter((d) => d >= fromDateKey).slice(0, limit);
  }
  if (!startDate) return [];
  if (recurrence === 'once') {
    return startDate >= fromDateKey ? [startDate] : [];
  }
  const result = [];
  // Jump close to fromDateKey instead of walking from a start date years back.
  // Longest period length, so the jump never overshoots a due date.
  const step = recurrence === 'weekly' ? 7 : recurrence === 'monthly' ? 31 : 366;
  let k = Math.max(0, Math.floor(daysBetween(startDate, fromDateKey) / step) - 1);
  while (result.length < limit) {
    const due = nthOccurrence(startDate, recurrence, k);
    if (due >= fromDateKey) result.push(due);
    k += 1;
    if (k > 100000) break;
  }
  return result;
}

/**
 * Upcoming due dates that still need reminders: on or after today, and
 * after the cycle the user dismissed (`ackDue`).
 */
export function pendingDues(autopay, today = todayKey(), limit = 1) {
  const from = autopay.ackDue && autopay.ackDue >= today ? addDays(autopay.ackDue, 1) : today;
  return occurrencesFrom(autopay, from, limit);
}

export function nextDue(autopay, today = todayKey()) {
  return pendingDues(autopay, today, 1)[0] || null;
}

/**
 * The autopay's current reminder, if today falls in its window
 * (2 days before → due day) and the cycle hasn't been dismissed.
 */
export function activeReminder(autopay, today = todayKey()) {
  const due = nextDue(autopay, today);
  if (!due) return null;
  const daysLeft = daysBetween(today, due);
  if (daysLeft > REMIND_DAYS_BEFORE) return null;
  return { due, daysLeft };
}

export function dueLabel(daysLeft) {
  if (daysLeft <= 0) return 'Due today';
  if (daysLeft === 1) return 'Due tomorrow';
  return `Due in ${daysLeft} days`;
}

export function formatDate(key) {
  return fromKey(key).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function money(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export function recurrenceLabel(autopay) {
  if (autopay.recurrence === 'dates') {
    const count = (autopay.dates || []).length;
    return `${count} specific date${count === 1 ? '' : 's'}`;
  }
  return RECURRENCES.find((r) => r.key === autopay.recurrence)?.label || '';
}
