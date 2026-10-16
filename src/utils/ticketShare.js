// Reads a booking message shared from another app (BookMyShow, airlines,
// IRCTC, redBus...) or pasted from the clipboard, and pulls out what it can
// for a ticket. Every field is a best guess: the form opens pre-filled so the
// user can check it before saving.
import { todayKey } from './autopay';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

const URL_RE = /https?:\/\/[^\s<>"')\]]+/i;

const pad = (n) => String(n).padStart(2, '0');

export function extractLink(text) {
  const match = (text || '').match(URL_RE);
  return match ? match[0].replace(/[.,;:!?]+$/, '') : '';
}

/** Label for a ticket's link button, e.g. "Open in BookMyShow". */
export function linkLabel(url) {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'Open booking link';
  }
  const known = [
    ['bookmyshow', 'BookMyShow'],
    ['bms.to', 'BookMyShow'],
    ['district', 'District'],
    ['paytm', 'Paytm'],
    ['insider', 'Insider'],
    ['pvrcinemas', 'PVR'],
    ['irctc', 'IRCTC'],
    ['redbus', 'redBus'],
    ['goindigo', 'IndiGo'],
    ['airindia', 'Air India'],
    ['makemytrip', 'MakeMyTrip'],
  ];
  const hit = known.find(([part]) => host.includes(part));
  return hit ? `Open in ${hit[1]}` : 'Open booking link';
}

function guessType(text) {
  const t = text.toLowerCase();
  if (/\b(flight|airlines?|boarding pass|indigo|air india|akasa|spicejet|vistara|6e\s?\d)/.test(t)) return 'flight';
  if (/\b(irctc|train|trn|doj|coach|berth|express|rajdhani|shatabdi|vande bharat)\b/.test(t)) return 'train';
  if (/\b(redbus|abhibus|bus|travels)\b/.test(t)) return 'bus';
  if (/\b(concert|live|event|show|standup|stand-up|comedy|festival|match|stadium)\b/.test(t) && !/\b(screen|audi|cinemas?|imax|4dx)\b/.test(t)) {
    return 'event';
  }
  if (/\b(movie|film|cinemas?|theatre|theater|screen|audi|imax|4dx|pvr|inox|cinepolis|bookmyshow)\b/.test(t)) return 'movie';
  return 'other';
}

/** 'YYYY-MM-DD' from day/month(/year); without a year, the next such date from today. */
function toKey(day, monthIndex, year, today) {
  if (!(day >= 1 && day <= 31 && monthIndex >= 0 && monthIndex <= 11)) return '';
  if (year) {
    const y = year < 100 ? 2000 + year : year;
    return `${y}-${pad(monthIndex + 1)}-${pad(day)}`;
  }
  const thisYear = Number(today.slice(0, 4));
  const key = `${thisYear}-${pad(monthIndex + 1)}-${pad(day)}`;
  return key >= today ? key : `${thisYear + 1}-${pad(monthIndex + 1)}-${pad(day)}`;
}

const monthIndex = (name) => MONTHS.indexOf(name.slice(0, 3).toLowerCase());

export function extractDate(text, today = todayKey()) {
  let m = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return toKey(+m[3], +m[2] - 1, +m[1], today);
  // 18 Oct 2026, 18th October, 18-Oct-26
  m = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s\\-/]*${MONTH}[,\\s\\-/']*(\\d{4}|\\d{2}(?!\\s*[:.]\\d))?\\b`, 'i'));
  if (m) return toKey(+m[1], monthIndex(m[2]), m[3] ? +m[3] : 0, today);
  // Oct 18, 2026
  m = text.match(new RegExp(`\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`, 'i'));
  if (m) return toKey(+m[2], monthIndex(m[1]), m[3] ? +m[3] : 0, today);
  // 18/10/2026 or 18-10-26 (day first, as written in India)
  m = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/);
  if (m) return toKey(+m[1], +m[2] - 1, +m[3], today);
  return '';
}

/** First clock time, as 24-hour 'HH:MM'. */
export function extractTime(text) {
  const m = text.match(/\b(\d{1,2})[:.](\d{2})\s*(am|pm|a\.m\.|p\.m\.)?(?![\d/.-]*\d{2,})/i);
  if (!m) return '';
  let h = +m[1];
  const min = +m[2];
  if (h > 23 || min > 59) return '';
  const ampm = (m[3] || '').toLowerCase().replace(/\./g, '');
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  return `${pad(h)}:${pad(min)}`;
}

function extractBookingRef(text) {
  const m = text.match(
    /\b(?:booking\s*(?:id|ref(?:erence)?|no\.?|number|code)|pnr(?:\s*no\.?)?|confirmation\s*(?:code|no\.?|number)|order\s*id|ticket\s*(?:id|no\.?))\s*(?:is)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{3,})/i
  );
  return m ? m[1].toUpperCase() : '';
}

function extractSeat(text, type) {
  const seat = '[A-Z]{1,2}[- ]?\\d{1,3}[A-Z]?';
  const m = text.match(
    new RegExp(`\\bseats?(?:\\(s\\))?\\s*(?:no\\.?|numbers?|nos?\\.?)?\\s*(?:is|are)?\\s*[:#-]?\\s*(?:[A-Z]+[- ](?=[A-Z]{1,2}[- ]?\\d))?(${seat}(?:\\s*(?:,|&|and)\\s*${seat})*)`, 'i')
  );
  if (m) return m[1].replace(/\s*(?:&|and)\s*/gi, ', ').replace(/\s*,\s*/g, ', ').toUpperCase();
  if (type !== 'train') return '';
  // IRCTC coach and berth, e.g. "S5 45" or "B2/32/LB"
  const berth = text.match(/\b([A-Z]{1,2}\d{1,2})[\s/,-]+(\d{1,3})(?:\s*\/\s*([A-Z]{2,3}))?\b/);
  return berth ? [berth[1], berth[2], berth[3]].filter(Boolean).join('/') : '';
}

const clean = (s) =>
  s
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'“”‘’:,-]+|[\s"'“”‘’:,.-]+$/g, '')
    .trim();

// Pieces of a message that are labels or dates, never the title.
const NOT_TITLE = /^(?:booking|pnr|seats?|ticket|order|confirmation|date|time|dep|arr|doj|trn|fare|amount|total|qty|hi|hey|hello|dear|your|thank|thanks|view|mon|tue|wed|thu|fri|sat|sun)\b/i;

function extractTitle(text, type, metaTitle) {
  if (type === 'flight') {
    const m = text.match(/\b(indigo|air india express|air india|akasa(?: air)?|spicejet|vistara)\b(?:\s+flight)?\s*([A-Z0-9]{2}\s?-?\d{2,4})?/i);
    if (m) return clean(`${m[1].replace(/\b\w/g, (c) => c.toUpperCase()).replace('Indigo', 'IndiGo')} ${m[2] || ''}`);
  }
  if (type === 'train') {
    const m = text.match(/\b(?:trn|train(?:\s*no\.?)?)\s*[:#-]?\s*(\d{5})\b/i);
    if (m) return `Train ${m[1]}`;
  }
  const patterns = [
    /tickets?\s+(?:booked\s+)?for\s+["“']?(.+?)["”']?\s*(?:\(|\bon\b|\bat\b|,|\.\s|\n|$)/i,
    /\bbooked\s+(?:\d+\s+tickets?\s+for\s+)?["“']?(.+?)["”']?\s*(?:\(|\bon\b|\bat\b|,|\.\s|\n|$)/i,
    /\b(?:movie|event|show|film)\s*[:-]\s*(.+?)\s*(?:\(|\n|$)/i,
    /["“‘](.{2,60}?)["”’]/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && clean(m[1]).length >= 2 && !URL_RE.test(m[1])) return clean(m[1]).slice(0, 80);
  }
  if (metaTitle && clean(metaTitle)) return clean(metaTitle).slice(0, 80);
  // Otherwise the first piece of the message that isn't a label, date or number.
  const piece = text
    .split(/\n|\.\s|\s\|\s|\s[-–]\s|,\s/)
    .map((p) => clean(p.replace(/\([^)]*\)/g, ' ')))
    .find((p) => p.length >= 2 && !NOT_TITLE.test(p) && !/^\d/.test(p) && !p.includes(':'));
  return piece ? piece.slice(0, 80) : '';
}

function extractVenue(text) {
  const m =
    text.match(/\b(?:venue|cinema|theatre|theater)\s*[:-]\s*([^\n]+)/i) ||
    text.match(/(?:\bat\s+|^)((?:PVR|INOX|Cinepolis|Miraj|Carnival|Sathyam|AGS|Rohini|Kasi)\b[^\n]*)/im) ||
    text.match(/\bat\s+(?!\d)([A-Z][^\n]*?)(?=\s+on\b|\s+at\s+\d|\.\s|\n|$)/);
  if (!m) return '';
  return clean(m[1].replace(URL_RE, '').split(/\s+(?:on|seats?|booking)\b/i)[0]).slice(0, 80);
}

function extractRoute(text) {
  // Station codes as IRCTC writes them, e.g. "MS-MDU"
  const codes = text.match(/,\s*([A-Z]{2,5})-([A-Z]{2,5})\s*,/);
  if (codes) return { from: codes[1], to: codes[2] };
  const m = text.match(/\b([A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+)?)\s*(?:\([A-Z]{3}\)\s*)?(?:→|->|–|\bto\b)\s*([A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+)?)/);
  return m ? { from: m[1], to: m[2] } : { from: '', to: '' };
}

/**
 * Ticket fields found in a shared or pasted message. Only fields it found are
 * returned, so the result can be merged over an existing form.
 */
export function parseBookingText(rawText, { metaTitle = '', today = todayKey() } = {}) {
  const text = (rawText || '').replace(/\r/g, '');
  const link = extractLink(text);
  const body = text.replace(/https?:\/\/[^\s]+/gi, ' ');
  const type = guessType(`${metaTitle} ${text}`);
  const travel = type === 'flight' || type === 'train' || type === 'bus';
  const fields = {
    type,
    title: extractTitle(body, type, metaTitle),
    date: extractDate(body, today),
    time: extractTime(body),
    seat: extractSeat(body, type),
    bookingRef: extractBookingRef(body),
    link,
    ...(travel ? extractRoute(body) : { venue: extractVenue(body) }),
  };
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v));
}
