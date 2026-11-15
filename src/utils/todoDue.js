// To-do due date and time: { dueDate: 'YYYY-MM-DD', dueTime: 'HH:MM' } (24 h,
// the phone's local time). Pure functions, shared by the app and tests.

export const TODO_REMIND_BEFORE_MS = 60 * 60 * 1000; // 1 hour before

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** When the task is due (a local Date), or null without a date and time. */
export function dueAtOf(item) {
  if (!DATE_RE.test(item?.dueDate || '') || !TIME_RE.test(item?.dueTime || '')) return null;
  const [y, m, d] = item.dueDate.split('-').map(Number);
  const [hh, mm] = item.dueTime.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

/** "18:30" → "6:30 PM". */
export function time12(hhmm) {
  if (!TIME_RE.test(hhmm || '')) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** "Today · 6:30 PM", "Tomorrow · 9:00 AM", "Tue, 17 Nov · 6:30 PM". */
export function dueLabel(item, now = new Date()) {
  const at = dueAtOf(item);
  if (!at) return '';
  const today = dayKey(now);
  const tomorrow = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const yesterday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const key = dayKey(at);
  let day;
  if (key === today) day = 'Today';
  else if (key === tomorrow) day = 'Tomorrow';
  else if (key === yesterday) day = 'Yesterday';
  else day = `${DAYS[at.getDay()]}, ${at.getDate()} ${MONTHS[at.getMonth()]}${at.getFullYear() !== now.getFullYear() ? ` ${at.getFullYear()}` : ''}`;
  return `${day} · ${time12(item.dueTime)}`;
}

export const isOverdue = (item, now = new Date()) => {
  const at = dueAtOf(item);
  return !!at && !item.done && at.getTime() < now.getTime();
};

/**
 * Reminders to schedule: one per pending task, 1 hour before it's due, only
 * when that moment is still ahead. [{ key, id, at: Date, title, body }]
 */
export function todoReminders(items, now = new Date()) {
  return (items || [])
    .filter((t) => !t.done)
    .map((t) => ({ t, due: dueAtOf(t) }))
    .filter(({ due }) => due && due.getTime() - TODO_REMIND_BEFORE_MS > now.getTime())
    .map(({ t, due }) => ({
      key: `todo:${t.id}:${t.dueDate}T${t.dueTime}`,
      id: t.id,
      at: new Date(due.getTime() - TODO_REMIND_BEFORE_MS),
      title: `To-do in 1 hour: ${t.title}`,
      body: `Due at ${time12(t.dueTime)}${t.note ? ` · ${t.note}` : ''}`,
    }))
    .sort((a, b) => a.at - b.at);
}

/** Pending tasks with a due time first (soonest first), then the rest as they were. */
export function sortByDue(items) {
  const withDue = items.filter((t) => !t.done && dueAtOf(t)).sort((a, b) => dueAtOf(a) - dueAtOf(b));
  const ids = new Set(withDue.map((t) => t.id));
  return [...withDue, ...items.filter((t) => !ids.has(t.id))];
}
