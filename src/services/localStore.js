// Large values in AsyncStorage.
//
// On Android, AsyncStorage keeps each key as one row in SQLite, and a row
// over ~2 MB can be written but never read back ("Row too big to fit into
// CursorWindow"). Lists with photos (the vault, documents, tickets) pass
// that easily. So big values are split into pieces under their own keys,
// and the main key holds a small pointer to them:
//
//   key           → "\u0001chunks:<gen>:<count>"
//   key__<gen>_0  → first piece, key__<gen>_1 → second piece, ...
//
// The pieces are written before the pointer, and old pieces removed after,
// so an interrupted save leaves the previous value readable.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { readOversizedValue } from './oversizeRecovery';

export const CHUNK_CHARS = 400000; // well under the 2 MB row limit, even for non-ASCII text
const MARK = '\u0001chunks:';

const chunkKey = (key, gen, i) => `${key}__${gen}_${i}`;

function parsePointer(value) {
  if (typeof value !== 'string' || !value.startsWith(MARK)) return null;
  const [gen, count] = value.slice(MARK.length).split(':');
  const n = Number(count);
  return gen && Number.isInteger(n) && n > 0 ? { gen, count: n } : null;
}

const chunkKeys = (key, ptr) => Array.from({ length: ptr.count }, (_, i) => chunkKey(key, ptr.gen, i));

export const isTooBigError = (error) => /CursorWindow|Row too big/i.test(String(error?.message || error));

/** The pointer (or plain value) stored under `key`; null if unreadable or missing. */
async function readHead(key) {
  try {
    return await AsyncStorage.getItem(key);
  } catch (_error) {
    return null;
  }
}

/**
 * Write `value` (a string) under `key`, splitting it when it is large.
 */
export async function setLargeItem(key, value) {
  const old = parsePointer(await readHead(key));
  if (value.length <= CHUNK_CHARS) {
    await AsyncStorage.setItem(key, value);
  } else {
    const gen = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const pairs = [];
    for (let i = 0, n = 0; i < value.length; i += CHUNK_CHARS, n += 1) {
      pairs.push([chunkKey(key, gen, n), value.slice(i, i + CHUNK_CHARS)]);
    }
    await AsyncStorage.multiSet(pairs);
    await AsyncStorage.setItem(key, `${MARK}${gen}:${pairs.length}`);
  }
  if (old) await AsyncStorage.multiRemove(chunkKeys(key, old)).catch(() => {});
}

/**
 * Read the string stored under `key` (null if none). A value saved as one
 * oversized row by an older version is recovered straight from the
 * database file and re-saved in pieces.
 */
export async function getLargeItem(key) {
  let value;
  try {
    value = await AsyncStorage.getItem(key);
  } catch (error) {
    if (!isTooBigError(error)) throw error;
    const recovered = await readOversizedValue(key).catch(() => null);
    if (recovered == null) {
      throw new Error(
        'This section is too big for the phone’s storage to open. Install the latest app version to recover it – nothing has been deleted.'
      );
    }
    await setLargeItem(key, recovered);
    return recovered;
  }
  const ptr = parsePointer(value);
  if (!ptr) return value;
  const pieces = await AsyncStorage.multiGet(chunkKeys(key, ptr));
  if (pieces.some(([, piece]) => piece == null)) throw new Error(`Part of ${key} is missing`);
  return pieces.map(([, piece]) => piece).join('');
}

/** Remove `key` and its pieces. */
export async function removeLargeItem(key) {
  const old = parsePointer(await readHead(key));
  await AsyncStorage.removeItem(key);
  if (old) await AsyncStorage.multiRemove(chunkKeys(key, old)).catch(() => {});
}
