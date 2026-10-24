import { todayKey } from './autopay';

export const DATES_STORAGE_KEY = '@diarybyte_dates';

export const DATE_SECTIONS = [
  { key: 'recurring', label: 'Dates to Remember', icon: 'calendar-outline' },
  { key: 'upcoming', label: 'Occasions Coming Up', icon: 'flag-outline' },
];

export function dateSection(key) {
  return DATE_SECTIONS.find((s) => s.key === key) || DATE_SECTIONS[1];
}

export function nextOccurrenceKey(dateItem, today = todayKey()) {
  const target = dateItem.date;
  if (dateItem.section === 'upcoming') return target;
  if (!target) return '';
  const year = Number(today.slice(0, 4));
  const candidate = `${year}-${target.slice(5)}`;
  return candidate >= today ? candidate : `${year + 1}-${target.slice(5)}`;
}

export function daysUntil(dateItem, today = todayKey()) {
  const next = nextOccurrenceKey(dateItem, today);
  if (!next) return Infinity;
  const a = new Date(`${today}T00:00:00`);
  const b = new Date(`${next}T00:00:00`);
  const diff = Math.round((b - a) / (1000 * 60 * 60 * 24));
  return diff;
}

export function countdownLabel(dateItem, today = todayKey()) {
  const days = daysUntil(dateItem, today);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

export function formatDisplayDate(dateItem, today = todayKey()) {
  const next = nextOccurrenceKey(dateItem, today);
  if (!next) return '';
  const [y, , d] = next.split('-');
  const date = new Date(`${next}T00:00:00`);
  const monthName = date.toLocaleString('default', { month: 'short' });
  const originalYear = dateItem.date.slice(0, 4);
  const showOriginal = dateItem.section === 'recurring' && originalYear !== y;
  return `${d} ${monthName}${showOriginal ? ` (${originalYear})` : ''}${dateItem.section === 'upcoming' ? ` ${y}` : ''}`;
}

export function sortDates(dates, today = todayKey()) {
  const sorted = [...dates].sort(
    (a, b) =>
      daysUntil(a, today) - daysUntil(b, today) ||
      (a.title || '').localeCompare(b.title || '')
  );
  const recurring = sorted.filter((d) => d.section === 'recurring');
  const upcoming = sorted.filter((d) => d.section === 'upcoming');
  return { recurring, upcoming, all: sorted };
}
