// Smart fill: learns how a message shared from an app is laid out (a
// BookMyShow booking, an AbhiBus ticket, a Netflix share...) from one
// example whose fields are known, and reads the next message laid out the
// same way by itself, without AI.
//
// Learning: each field's value is found in the message (dates and times in
// whatever way the message writes them), and the text around it is kept as
// anchors. Numbers, weekday and month names in the anchors are generalised,
// so the next booking with a different PNR or date still matches.
//
// Reading: a learned layout matches when every anchor is found in order;
// the text between them is read back into the fields.
//
// Pure functions (no storage, no React Native), so it is easy to test.

const ANCHOR = 32; // most characters of a label kept before a field
const MIN_ANCHOR_CHARS = 10; // total literal context a layout needs to be trusted
const MAX_FIELD = 160;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const WORDS_RE = /\b(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day|nesday|rsday|urday|sday)?\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/gi;

const pad = (n) => String(n).padStart(2, '0');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ------- dates and times as messages write them -------

// Each format: how to write a date, and a pattern + reader to get it back.
const DATE_FORMATS = {
  dmy_mon: {
    write: (y, m, d) => [`${d} ${MONTHS[m - 1]} ${y}`, `${pad(d)} ${MONTHS[m - 1]} ${y}`],
    re: '(\\d{1,2})(?:st|nd|rd|th)?[\\s-]+([A-Za-z]{3,9})[,\\s-]+(\\d{4})',
    read: (g) => [g[3], monthIndex(g[2]), g[1]],
  },
  dmy_mon_short: {
    write: (y, m, d) => [`${d} ${MONTHS[m - 1]} ${String(y).slice(2)}`, `${pad(d)} ${MONTHS[m - 1]} ${String(y).slice(2)}`, `${pad(d)}-${MONTHS[m - 1]}-${String(y).slice(2)}`],
    re: "(\\d{1,2})[\\s-]+([A-Za-z]{3,9})[\\s-]+'?(\\d{2})(?!\\d)",
    read: (g) => [`20${g[3]}`, monthIndex(g[2]), g[1]],
  },
  mon_dy: {
    write: (y, m, d) => [`${MONTHS[m - 1]} ${d}, ${y}`, `${MONTHS[m - 1]} ${pad(d)}, ${y}`, `${MONTHS[m - 1]} ${d} ${y}`],
    re: '([A-Za-z]{3,9})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})',
    read: (g) => [g[3], monthIndex(g[1]), g[2]],
  },
  dm_mon: {
    // No year: the next such date (filled in when read).
    write: (y, m, d) => [`${d} ${MONTHS[m - 1]}`, `${pad(d)} ${MONTHS[m - 1]}`],
    re: '(\\d{1,2})(?:st|nd|rd|th)?\\s+([A-Za-z]{3,9})(?![A-Za-z]*[,\\s-]+\\d{4}\\b)',
    read: (g, today) => withYear(monthIndex(g[2]), g[1], today),
  },
  dmy_num: {
    write: (y, m, d) => [`${pad(d)}/${pad(m)}/${y}`, `${pad(d)}-${pad(m)}-${y}`, `${pad(d)}.${pad(m)}.${y}`, `${d}/${m}/${y}`],
    re: '(\\d{1,2})[/.-](\\d{1,2})[/.-](\\d{4})',
    read: (g) => [g[3], g[2], g[1]],
  },
  ymd: {
    write: (y, m, d) => [`${y}-${pad(m)}-${pad(d)}`],
    re: '(\\d{4})-(\\d{2})-(\\d{2})',
    read: (g) => [g[1], g[2], g[3]],
  },
};

function monthIndex(name) {
  const n = String(name || '').toLowerCase();
  const i = MONTHS.findIndex((m) => n.startsWith(m));
  return i >= 0 ? i + 1 : 0;
}

function withYear(month, day, today) {
  const [ty, tm, td] = String(today || '').split('-').map(Number);
  if (!ty) return [new Date().getFullYear(), month, day];
  const past = Number(month) < tm || (Number(month) === tm && Number(day) < td);
  return [past ? ty + 1 : ty, month, day];
}

function toKey(y, m, d) {
  const Y = Number(y);
  const M = Number(m);
  const D = Number(d);
  if (!Y || !M || !D || M > 12 || D > new Date(Y, M, 0).getDate()) return null;
  return `${Y}-${pad(M)}-${pad(D)}`;
}

const TIME_FORMATS = {
  h12: {
    write: (h, m) => {
      const hh = h % 12 || 12;
      const ap = h < 12 ? 'AM' : 'PM';
      return [`${hh}:${pad(m)} ${ap}`, `${hh}:${pad(m)}${ap}`, `${pad(hh)}:${pad(m)} ${ap}`, `${pad(hh)}:${pad(m)}${ap}`, `${hh}.${pad(m)} ${ap}`];
    },
    re: '(\\d{1,2})[:.](\\d{2})\\s*([AaPp])\\.?[Mm]\\.?',
    read: (g) => {
      let h = Number(g[1]) % 12;
      if (/p/i.test(g[3])) h += 12;
      return [h, Number(g[2])];
    },
  },
  h24: {
    write: (h, m) => [`${pad(h)}:${pad(m)}`, `${h}:${pad(m)}`, `${pad(h)}${pad(m)} hrs`],
    re: '(\\d{1,2})[:.]?(\\d{2})(?!\\s*[AaPp]\\.?[Mm])',
    read: (g) => [Number(g[1]), Number(g[2])],
  },
};

// Where `surface` appears in `lower` as a whole (not inside a longer number or word).
function wholeAt(lower, surface) {
  const needle = surface.toLowerCase();
  let at = lower.indexOf(needle);
  while (at >= 0) {
    const before = lower[at - 1] || ' ';
    const after = lower[at + needle.length] || ' ';
    const edge = (c, inner) => !(/[0-9]/.test(c) && /[0-9]/.test(inner)) && !(/[a-z]/.test(c) && /[a-z]/.test(inner));
    if (edge(before, needle[0]) && edge(after, needle[needle.length - 1])) return at;
    at = lower.indexOf(needle, at + 1);
  }
  return -1;
}

// The longest way the value is written in the message (so "07:30 PM" wins
// over the "7:30 PM" inside it).
function bestSurface(lower, candidates) {
  let best = null;
  for (const [surface, fmt] of candidates) {
    const at = wholeAt(lower, surface);
    if (at >= 0 && (!best || surface.length > best.end - best.start)) best = { start: at, end: at + surface.length, fmt };
  }
  return best;
}

function findValue(text, lower, field, value) {
  const v = String(value || '').trim();
  if (!v) return null;
  if (field === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number);
    const candidates = [];
    Object.entries(DATE_FORMATS).forEach(([fmt, f]) => {
      f.write(y, m, d).forEach((surface) => candidates.push([surface, fmt]));
    });
    // Full month names too ("21 November 2026").
    candidates.push([`${d} ${MONTH_NAMES[m - 1]} ${y}`, 'dmy_mon'], [`${MONTH_NAMES[m - 1]} ${d}, ${y}`, 'mon_dy']);
    return bestSurface(lower, candidates);
  }
  if (field === 'time' && /^\d{1,2}:\d{2}$/.test(v)) {
    const [h, m] = v.split(':').map(Number);
    const candidates = [];
    Object.entries(TIME_FORMATS).forEach(([fmt, f]) => {
      f.write(h, m).forEach((surface) => candidates.push([surface, fmt]));
    });
    return bestSurface(lower, candidates);
  }
  if (v.length < 2) return null;
  return bestSurface(lower, [[v, 'text']]);
}

// ------- anchors -------

/** A piece of literal text as a pattern: numbers, day and month names, spaces generalised. */
export function anchorPattern(literal) {
  let out = '';
  let last = 0;
  const s = String(literal);
  const tokens = [];
  s.replace(WORDS_RE, (m, at) => {
    tokens.push([at, at + m.length, '[A-Za-z]+']);
    return m;
  });
  s.replace(/\d+/g, (m, at) => {
    if (!tokens.some(([a, b]) => at >= a && at < b)) tokens.push([at, at + m.length, '\\d+']);
    return m;
  });
  tokens.sort((a, b) => a[0] - b[0]);
  for (const [a, b, pat] of tokens) {
    out += escapeRe(s.slice(last, a)) + pat;
    last = b;
  }
  out += escapeRe(s.slice(last));
  // Spaces stay flexible; a line break stays a line break.
  return out.replace(/(?:\\s|\s)+/g, (run) => (run.includes('\n') ? '[ \\t]*\\r?\\n\\s*' : '\\s+'));
}

const literalChars = (s) => String(s).replace(/[\s\d]/g, '').length;

function slotPattern(slot, isLast, nextAnchor) {
  // \b: a date or time never starts in the middle of a number.
  if (slot.fmt in DATE_FORMATS) return `\\b(${DATE_FORMATS[slot.fmt].re.replace(/\((?!\?)/g, '(?:')})`;
  if (slot.fmt in TIME_FORMATS) return `\\b(${TIME_FORMATS[slot.fmt].re.replace(/\((?!\?)/g, '(?:')})`;
  // Free text: up to the next anchor, or to the end of the line.
  return isLast && !nextAnchor ? '([^\\n]{1,160})' : '([^\\n]{1,160}?)';
}

// ------- learning -------

/**
 * Learn a layout from one example. `fields`: the known values ({ title,
 * date: 'YYYY-MM-DD', time: 'HH:MM', seat, ... }); `constants`: values that
 * are the same for every message of this layout (e.g. { type: 'movie' }).
 * Returns a layout { kind, source, parts, slots, constants, sig } or null
 * when too little of the message could be tied to the fields.
 */
export function learnLayout(kind, text, fields, { constants = {}, source = '' } = {}) {
  const raw = String(text || '');
  if (!raw.trim()) return null;
  const lower = raw.toLowerCase();
  // Longest values first, so "Chennai Egmore" wins over "Chennai".
  const found = [];
  Object.entries(fields || {})
    .filter(([, v]) => typeof v === 'string' && v.trim())
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([field, value]) => {
      const hit = findValue(raw, lower, field, value);
      if (hit && !found.some((f) => hit.start < f.end && f.start < hit.end)) found.push({ field, ...hit });
    });
  if (!found.length) return null;
  found.sort((a, b) => a.start - b.start);

  // parts: [lead, slot0, gap, slot1, ..., tail]. Messages put a label
  // before a value ("Movie: ", "PNR ") and a separator after it (" (",
  // " | ", a line break). A short gap on one line (" to ", ", departure ")
  // is kept whole; otherwise only the separator after the field and the
  // label before the next one are kept, so text that changes between
  // bookings ("(UA) - English") doesn't stop the next one matching.
  const label = (gap) => gap.slice(gap.lastIndexOf('\n') + 1).slice(-ANCHOR);
  const separator = (gap) => (gap.match(/^[^A-Za-z0-9]{0,3}/) || [''])[0];
  const parts = [];
  let cursor = 0;
  found.forEach((f, i) => {
    const gap = raw.slice(cursor, f.start);
    if (i === 0) parts.push({ lead: label(gap) });
    else if (gap.length <= ANCHOR && !gap.includes('\n')) parts.push({ between: gap });
    else parts.push({ after: separator(gap), before: label(gap) });
    parts.push({ slot: f.field, fmt: f.fmt });
    cursor = f.end;
  });
  parts.push({ tail: separator(raw.slice(cursor)) });

  const anchorText = parts.map((p) => (p.lead || '') + (p.between || '') + (p.after || '') + (p.before || '') + (p.tail || '')).join('');
  if (literalChars(anchorText) < MIN_ANCHOR_CHARS) return null;
  const pattern = layoutPattern({ parts });
  return {
    kind,
    source: source || '',
    parts,
    slots: found.map((f) => f.field),
    constants,
    sig: hash(`${kind}|${source}|${pattern}`),
  };
}

export function layoutPattern(layout) {
  let re = '';
  const parts = layout.parts;
  parts.forEach((p, i) => {
    if ('lead' in p) re += p.lead ? anchorPattern(p.lead) : '';
    else if ('between' in p) re += anchorPattern(p.between);
    else if ('after' in p) re += `${anchorPattern(p.after)}[\\s\\S]*?${anchorPattern(p.before)}`;
    else if ('tail' in p) re += p.tail ? anchorPattern(p.tail) : '';
    else if ('slot' in p) {
      const next = parts[i + 1];
      const nextAnchor = next && (next.between || next.after || next.tail);
      re += slotPattern(p, i === parts.length - 2, nextAnchor);
    }
  });
  return re;
}

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// ------- reading -------

function readSlot(slot, value, today) {
  const v = String(value || '').trim();
  if (!v) return null;
  if (slot.fmt in DATE_FORMATS) {
    const m = v.match(new RegExp(`^${DATE_FORMATS[slot.fmt].re}$`, 'i'));
    if (!m) return null;
    const [y, mo, d] = DATE_FORMATS[slot.fmt].read(m, today);
    return toKey(y, mo, d);
  }
  if (slot.fmt in TIME_FORMATS) {
    const m = v.match(new RegExp(`^${TIME_FORMATS[slot.fmt].re}$`, 'i'));
    if (!m) return null;
    const [h, mi] = TIME_FORMATS[slot.fmt].read(m);
    return h < 24 && mi < 60 ? `${pad(h)}:${pad(mi)}` : null;
  }
  const clean = v.replace(/\s+/g, ' ').replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
  return clean && clean.length <= MAX_FIELD ? clean : null;
}

/** Fields from `text` if `layout` matches it, else null. */
export function readWithLayout(layout, text, { today } = {}) {
  let re;
  try {
    re = new RegExp(layoutPattern(layout), 'i');
  } catch (_error) {
    return null;
  }
  const m = String(text || '').match(re);
  if (!m) return null;
  const slots = layout.parts.filter((p) => 'slot' in p);
  const fields = {};
  for (let i = 0; i < slots.length; i += 1) {
    const value = readSlot(slots[i], m[i + 1], today);
    if (value == null) return null;
    fields[slots[i].slot] = value;
  }
  return { ...layout.constants, ...fields };
}

/**
 * The best learned layout for `text`: { fields, layout } or null. Layouts
 * with a source (e.g. 'bookmyshow') only apply to messages from it; the
 * one that reads the most fields wins.
 */
export function readWithLearned(layouts, kind, text, { source = '', today } = {}) {
  let best = null;
  for (const layout of layouts || []) {
    if (layout.kind !== kind) continue;
    if (layout.source && source && layout.source !== source) continue;
    const fields = readWithLayout(layout, text, { today });
    if (!fields) continue;
    const score = layout.slots.length * 1000 + (layout.hits || 0);
    if (!best || score > best.score) best = { fields, layout, score };
  }
  return best ? { fields: best.fields, layout: best.layout } : null;
}

/** Where a message came from: the main part of its first link's host ('bookmyshow', 'netflix'), or ''. */
export function messageSource(text) {
  const m = String(text || '').match(/https?:\/\/([^/\s?#]+)/i);
  if (!m) return '';
  const parts = m[1].toLowerCase().replace(/^www\./, '').split('.');
  const generic = new Set(['com', 'in', 'co', 'org', 'net', 'app', 'link', 'to', 'tv', 'io', 'me', 'page']);
  const named = parts.filter((p) => !generic.has(p));
  return (named[named.length - 1] || parts[0] || '').slice(0, 30);
}
