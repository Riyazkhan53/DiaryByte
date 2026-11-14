// Typing a date as DD/MM/YYYY (the way dates are written in India).

/** Digits typed so far, shown as "DD/MM/YYYY" with the slashes added. */
export function formatTyped(text) {
  const d = String(text || '').replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** "DD/MM/YYYY" (or with - or .) → 'YYYY-MM-DD', or null if it isn't a real date. */
export function parseTyped(text) {
  const m = String(text || '').trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) return null;
  if (day > new Date(year, month, 0).getDate()) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' → "DD/MM/YYYY" ('' without a date). */
export function keyToTyped(key) {
  const m = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
