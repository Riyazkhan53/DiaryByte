// Android: read an AsyncStorage value that is too big for Android's
// CursorWindow (~2 MB per row), straight from AsyncStorage's own SQLite file
// ("RKStorage", table catalystLocalStorage) with expo-sqlite, which reads
// rows without that limit. Reads only; the value is then re-saved in pieces
// by localStore.js.
import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';

const STEP = 400000; // characters per read

/** AsyncStorage's database folder: <app data>/databases (expo-sqlite's default is <app data>/files/SQLite). */
function asyncStorageDir() {
  const dir = String(SQLite.defaultDatabaseDirectory || '').replace(/^file:\/\//, '');
  const match = dir.match(/^(.*)\/files\/SQLite\/?$/);
  return match ? `${match[1]}/databases` : null;
}

export async function readOversizedValue(key) {
  if (Platform.OS !== 'android') return null;
  const dir = asyncStorageDir();
  if (!dir) return null;
  const db = await SQLite.openDatabaseAsync('RKStorage', { useNewConnection: true }, dir);
  try {
    const row = await db.getFirstAsync('SELECT length(value) AS n FROM catalystLocalStorage WHERE key = ?', key);
    if (!row || !row.n) return null;
    const parts = [];
    for (let start = 1; start <= row.n; start += STEP) {
      const piece = await db.getFirstAsync(
        'SELECT substr(value, ?, ?) AS part FROM catalystLocalStorage WHERE key = ?',
        start,
        STEP,
        key
      );
      parts.push(piece?.part || '');
    }
    const value = parts.join('');
    JSON.parse(value); // only hand back something whole
    return value;
  } finally {
    await db.closeAsync().catch(() => {});
  }
}
