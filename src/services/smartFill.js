// Smart fill: the formats DiaryByte has learned from shared messages
// (tickets, OTT shares), stored as a synced collection so they survive a
// reinstall and work on every device. See engine/shareLearner.js.
import { learnLayout, messageSource, readWithLearned, readWithLayout } from '../engine/shareLearner';
import { readLocal, saveAndPush, notifyLocal } from './sync';
import { todayKey } from '../utils/autopay';

export const LEARNED_STORAGE_KEY = '@diarybyte_learned';
const MAX_PER_KIND = 60;

export const SMART_KINDS = { ticket: 'Tickets', ott: 'OTT shares' };

const SOURCE_NAMES = {
  bookmyshow: 'BookMyShow',
  bms: 'BookMyShow',
  abhibus: 'AbhiBus',
  redbus: 'redBus',
  irctc: 'IRCTC',
  district: 'District',
  paytm: 'Paytm',
  insider: 'Insider',
  pvrcinemas: 'PVR',
  goindigo: 'IndiGo',
  airindia: 'Air India',
  makemytrip: 'MakeMyTrip',
  ixigo: 'ixigo',
  netflix: 'Netflix',
  primevideo: 'Prime Video',
  hotstar: 'JioHotstar',
  sonyliv: 'Sony LIV',
  zee5: 'ZEE5',
  sunnxt: 'Sun NXT',
  youtube: 'YouTube',
};

/** "bookmyshow" → "BookMyShow" (for showing where a learned format is from). */
export const sourceName = (source) => SOURCE_NAMES[source] || (source ? source.charAt(0).toUpperCase() + source.slice(1) : '');

async function load() {
  try {
    return await readLocal(LEARNED_STORAGE_KEY);
  } catch (_error) {
    return [];
  }
}

function save(items) {
  notifyLocal(LEARNED_STORAGE_KEY, items);
  return saveAndPush('learned', LEARNED_STORAGE_KEY, items).catch(() => {});
}

/**
 * Read `text` with a learned format: { fields, layoutId, source, uses } or
 * null when nothing learned fits.
 */
export async function smartRead(kind, text) {
  if (!String(text || '').trim()) return null;
  const layouts = await load();
  const hit = readWithLearned(layouts, kind, text, { source: messageSource(text), today: todayKey() });
  if (!hit) return null;
  return { fields: hit.fields, layoutId: hit.layout.id, source: hit.layout.source, uses: hit.layout.hits || 0 };
}

/**
 * Learn from a saved item: the message it came from and the fields as they
 * were finally saved (read by Smart fill, by AI, or corrected by hand).
 * A format that read this message differently is replaced. Returns true
 * when something was learned.
 */
export async function teach(kind, text, fields, constants = {}) {
  const source = messageSource(text);
  const layout = learnLayout(kind, text, fields, { constants, source });
  if (!layout) return false;
  const now = new Date().toISOString();
  const layouts = await load();
  const same = layouts.find((l) => l.kind === kind && l.sig === layout.sig);
  // Formats that would read this message wrongly: forget them.
  const wrong = new Set(
    layouts
      .filter((l) => l.kind === kind && l.sig !== layout.sig && (!l.source || l.source === source))
      .filter((l) => {
        const read = readWithLayout(l, text, { today: todayKey() });
        return read && Object.entries(fields).some(([k, v]) => v && read[k] !== undefined && read[k] !== v);
      })
      .map((l) => l.id)
  );
  let next = layouts.filter((l) => !wrong.has(l.id));
  if (same) {
    next = next.map((l) => (l.id === same.id ? { ...l, ...layout, id: l.id, hits: (l.hits || 0) + 1, label: labelFor(fields), updatedAt: now } : l));
  } else {
    next = [{ ...layout, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, hits: 1, label: labelFor(fields), createdAt: now, updatedAt: now }, ...next];
  }
  // Keep the most used, most recent formats.
  const ofKind = next.filter((l) => l.kind === kind);
  if (ofKind.length > MAX_PER_KIND) {
    const drop = new Set(
      ofKind
        .sort((a, b) => (b.hits || 0) - (a.hits || 0) || String(b.updatedAt).localeCompare(String(a.updatedAt)))
        .slice(MAX_PER_KIND)
        .map((l) => l.id)
    );
    next = next.filter((l) => !drop.has(l.id));
  }
  await save(next);
  return true;
}

const labelFor = (fields) => String(fields.title || fields.bookingRef || '').slice(0, 40);

export async function listLearned() {
  return load();
}

export async function forgetLearned(id) {
  const layouts = await load();
  await save(id ? layouts.filter((l) => l.id !== id) : []);
}
