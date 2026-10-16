import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchCollection, pushCollection } from './api';

// Single registry of every synced collection: local storage key ↔ server collection.
// On web, AsyncStorage is backed by IndexedDB; on Android/iOS it's SQLite.
// Either way it is the local-first store for the app.
export const SYNCED_COLLECTIONS = [
  { collection: 'movies', storageKey: '@diarybyte_movies' },
  { collection: 'passwords', storageKey: '@diarybyte_passwords' },
  { collection: 'banking', storageKey: '@diarybyte_banking' },
  { collection: 'diary', storageKey: '@diarybyte_entries' },
  { collection: 'vault', storageKey: '@diarybyte_vault' },
  { collection: 'todo', storageKey: '@diarybyte_todo' },
  { collection: 'expenditure', storageKey: '@diarybyte_expenditure' },
  { collection: 'cards', storageKey: '@diarybyte_cards' },
  { collection: 'investments', storageKey: '@diarybyte_investments' },
  { collection: 'debts', storageKey: '@diarybyte_debts' },
  { collection: 'autopays', storageKey: '@diarybyte_autopays' },
  { collection: 'months', storageKey: '@diarybyte_months' },
];

// ------- in-app change events -------

// Lets every mounted screen showing a collection see edits made elsewhere
// (another screen, or a notification action), without re-reading storage.
const localListeners = new Map();

export function subscribeLocal(storageKey, listener) {
  if (!localListeners.has(storageKey)) localListeners.set(storageKey, new Set());
  localListeners.get(storageKey).add(listener);
  return () => localListeners.get(storageKey).delete(listener);
}

export function notifyLocal(storageKey, items, source) {
  (localListeners.get(storageKey) || []).forEach((listener) => {
    if (listener !== source) listener(items);
  });
}

const pendingKey = (storageKey) => `${storageKey}_pending`;

// ------- local reads/writes -------

export async function readLocal(storageKey) {
  const stored = await AsyncStorage.getItem(storageKey);
  return stored ? JSON.parse(stored) : [];
}

export async function writeLocal(storageKey, items) {
  await AsyncStorage.setItem(storageKey, JSON.stringify(items));
}

// ------- real-time push (local → server) -------

/**
 * Persist items locally, then push the full list to the server in real time.
 * If the push fails, the change is queued as pending and retried on the
 * next app load or the next successful save.
 */
export async function saveAndPush(collection, storageKey, items) {
  try {
    await writeLocal(storageKey, items);
  } catch (error) {
    console.error(`Failed to save ${collection} locally`, error);
  }

  try {
    await pushCollection(collection, items);
    await AsyncStorage.removeItem(pendingKey(storageKey));
    return { pushed: true };
  } catch (error) {
    console.error(`Failed to push ${collection}`, error);
    try {
      await AsyncStorage.setItem(pendingKey(storageKey), '1');
    } catch (queueError) {
      console.error('Failed to mark pending sync', queueError);
    }
    return { pushed: false, error };
  }
}

/**
 * Load from the local store instantly. If a previous push failed, retry it
 * silently in the background — the UI never waits on the network.
 */
export async function loadLocalWithRetry(collection, storageKey) {
  const local = await readLocal(storageKey);
  try {
    const pending = await AsyncStorage.getItem(pendingKey(storageKey));
    if (pending === '1') {
      pushCollection(collection, local)
        .then(() => AsyncStorage.removeItem(pendingKey(storageKey)))
        .catch(() => {});
    }
  } catch (_error) {
    // best-effort retry only
  }
  return local;
}

// ------- manual pull (server → local) -------

/**
 * Pull the latest data for one collection from the server and overwrite
 * local storage with it.
 */
export async function pullFromServer(collection, storageKey) {
  const remote = await fetchCollection(collection);
  await writeLocal(storageKey, remote);
  await AsyncStorage.removeItem(pendingKey(storageKey));
  return remote;
}

/**
 * Pull every synced collection. Returns per-collection results so the
 * Settings screen can show a summary.
 */
export async function pullAllFromServer() {
  const results = [];
  for (const { collection, storageKey } of SYNCED_COLLECTIONS) {
    try {
      const items = await pullFromServer(collection, storageKey);
      results.push({ collection, ok: true, count: items.length });
    } catch (error) {
      console.error(`Pull failed for ${collection}`, error);
      results.push({ collection, ok: false, error: error.message });
    }
  }
  return results;
}
