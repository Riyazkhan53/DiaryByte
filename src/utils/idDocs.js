// Personal Documents: ID cards and the like (Aadhaar, PAN, voter ID,
// passport, driving licence, passport photos...). Each is encrypted with the
// vault code; only `remind: { type, expiry }` stays readable, so the
// dashboard can warn before a passport or licence expires.
import { daysBetween, todayKey } from './autopay.js';

export const IDDOCS_STORAGE_KEY = '@diarybyte_iddocs';
export const EXPIRY_WARN_DAYS = 60;

// `number`: label of the main number (null: none). `fields`: [key, label,
// kind?] with kind 'date' for a date picker. `expiry`: has a valid-till date.
export const DOC_TYPES = [
  {
    key: 'aadhaar',
    label: 'Aadhaar',
    icon: 'finger-print-outline',
    color: '#FF9500',
    number: 'Aadhaar number',
    numberHint: '12 digits',
    fields: [
      ['name', 'Name'],
      ['dob', 'Date of birth', 'date'],
      ['address', 'Address'],
    ],
  },
  {
    key: 'pan',
    label: 'PAN card',
    icon: 'card-outline',
    color: '#5856D6',
    number: 'PAN',
    numberHint: 'e.g. ABCDE1234F',
    fields: [
      ['name', 'Name'],
      ['father', "Father's name"],
      ['dob', 'Date of birth', 'date'],
    ],
  },
  {
    key: 'voter',
    label: 'Voter ID',
    icon: 'checkbox-outline',
    color: '#34C759',
    number: 'EPIC number',
    numberHint: 'e.g. ABC1234567',
    fields: [
      ['name', 'Name'],
      ['constituency', 'Assembly constituency'],
      ['partNo', 'Part / serial no.'],
    ],
  },
  {
    key: 'passport',
    label: 'Passport',
    icon: 'airplane-outline',
    color: '#1E40AF',
    number: 'Passport number',
    numberHint: 'e.g. P1234567',
    fields: [
      ['name', 'Name'],
      ['placeOfIssue', 'Place of issue'],
      ['issueDate', 'Date of issue', 'date'],
    ],
    expiry: true,
  },
  {
    key: 'licence',
    label: 'Driving licence',
    icon: 'car-outline',
    color: '#E5383B',
    number: 'Licence number',
    numberHint: 'e.g. TN01 20201234567',
    fields: [
      ['name', 'Name'],
      ['classes', 'Vehicle classes (e.g. LMV, MCWG)'],
      ['issueDate', 'Date of issue', 'date'],
    ],
    expiry: true,
  },
  {
    key: 'photo',
    label: 'Passport photos',
    icon: 'person-circle-outline',
    color: '#AF52DE',
    number: null,
    fields: [],
  },
  {
    key: 'other',
    label: 'Other document',
    icon: 'document-text-outline',
    color: '#8E8E93',
    number: 'Number (if any)',
    numberHint: '',
    fields: [['name', 'Name on it']],
    expiry: true,
  },
];

export const docType = (key) => DOC_TYPES.find((t) => t.key === key) || DOC_TYPES[DOC_TYPES.length - 1];

/** A document's display name: its own title, or the type's label. */
export const docTitle = (doc) => (doc.title && doc.title.trim()) || docType(doc.type).label;

/** "XXXX XXXX 1234" for Aadhaar; other numbers show only the last 4. */
export function maskNumber(number, type) {
  const clean = String(number || '').replace(/\s+/g, '');
  if (!clean) return '';
  const last = clean.slice(-4);
  if (type === 'aadhaar') return `XXXX XXXX ${last}`;
  return `${'•'.repeat(Math.max(2, Math.min(8, clean.length - 4)))}${last}`;
}

/** Aadhaar as "1234 5678 9012"; others as typed (upper case). */
export function formatNumber(number, type) {
  const clean = String(number || '').trim();
  if (type === 'aadhaar') {
    const digits = clean.replace(/\D/g, '');
    return digits.length === 12 ? digits.replace(/(\d{4})(?=\d)/g, '$1 ') : clean;
  }
  return clean.toUpperCase();
}

/** Days until `expiry` ('YYYY-MM-DD'); negative when already expired; null without one. */
export const daysToExpiry = (expiry, today = todayKey()) => (expiry ? daysBetween(today, expiry) : null);

/** { label, tone: 'ok' | 'soon' | 'expired' } for a document's expiry, or null. */
export function expiryStatus(expiry, today = todayKey()) {
  const d = daysToExpiry(expiry, today);
  if (d == null) return null;
  if (d < 0) return { label: `Expired ${-d} day${d === -1 ? '' : 's'} ago`, tone: 'expired' };
  if (d === 0) return { label: 'Expires today', tone: 'soon' };
  if (d <= EXPIRY_WARN_DAYS) return { label: `Expires in ${d} day${d === 1 ? '' : 's'}`, tone: 'soon' };
  return { label: `Valid till ${expiry}`, tone: 'ok' };
}

/**
 * Documents (stored, possibly encrypted) whose `remind.expiry` falls within
 * `days` (or has passed): [{ id, type, label, expiry, daysLeft }], soonest first.
 */
export function expiringDocs(stored, today = todayKey(), days = EXPIRY_WARN_DAYS) {
  return (stored || [])
    .filter((d) => d?.remind?.expiry)
    .map((d) => ({ id: d.id, type: d.remind.type, label: docType(d.remind.type).label, expiry: d.remind.expiry, daysLeft: daysToExpiry(d.remind.expiry, today) }))
    .filter((d) => d.daysLeft <= days)
    .sort((a, b) => a.expiry.localeCompare(b.expiry));
}
