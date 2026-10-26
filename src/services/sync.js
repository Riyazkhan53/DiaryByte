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
  { collection: 'tickets', storageKey: '@diarybyte_tickets' },
  { collection: 'dates', storageKey: '@diarybyte_dates' },
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
// Ids deleted on this device that the server hasn't been told about yet.
const deletedKey = (storageKey) => `${storageKey}_deleted`;

// ------- local reads/writes -------

export async function readLocal(storageKey) {
  const stored = await AsyncStorage.getItem(storageKey);
  return stored ? JSON.parse(stored) : [];
}

export async function writeLocal(storageKey, items) {
  await AsyncStorage.setItem(storageKey, JSON.stringify(items));
}

async function readDeleted(storageKey) {
  try {
    return JSON.parse((await AsyncStorage.getItem(deletedKey(storageKey))) || '[]');
  } catch (_error) {
    return [];
  }
}

// Local read-modify-writes for one collection run one at a time, so a slow
// push can never overwrite an edit made while it was in flight.
const localQueues = new Map();

function inLocalQueue(storageKey, task) {
  const run = (localQueues.get(storageKey) || Promise.resolve()).catch(() => {}).then(task);
  localQueues.set(storageKey, run);
  return run;
}

/**
 * Add server items this device doesn't have, except ones it deleted.
 * Items on both sides keep this device's version.
 */
function mergeWithRemote(local, remote, deleted) {
  const have = new Set(local.map((item) => item.id));
  const gone = new Set(deleted);
  const extra = remote.filter((item) => item && item.id && !have.has(item.id) && !gone.has(item.id));
  return extra.length ? [...local, ...extra] : local;
}

// ------- real-time push (local → server) -------

/**
 * Merge this device's list with the server's, then push the result.
 *
 * The server replaces a whole collection on every push, so pushing only
 * what this device has would wipe items added from other devices (or that
 * this device never pulled). Merging first means a push only ever removes
 * items that were deleted here.
 */
async function pushMerged(collection, storageKey) {
  const remote = await fetchCollection(collection);
  const { merged, deleted, pending } = await inLocalQueue(storageKey, async () => {
    const local = await readLocal(storageKey);
    const deletedIds = await readDeleted(storageKey);
    const result = mergeWithRemote(local, remote, deletedIds);
    if (result !== local) {
      await writeLocal(storageKey, result);
      notifyLocal(storageKey, result);
    }
    return {
      merged: result,
      deleted: deletedIds,
      pending: await AsyncStorage.getItem(pendingKey(storageKey)),
    };
  });

  await pushCollection(collection, merged);

  // Only clear what this push covered; edits made meanwhile stay queued.
  await inLocalQueue(storageKey, async () => {
    const pushedDeletes = new Set(deleted);
    const stillDeleted = (await readDeleted(storageKey)).filter((id) => !pushedDeletes.has(id));
    if (stillDeleted.length) {
      await AsyncStorage.setItem(deletedKey(storageKey), JSON.stringify(stillDeleted));
    } else {
      await AsyncStorage.removeItem(deletedKey(storageKey));
    }
    if ((await AsyncStorage.getItem(pendingKey(storageKey))) === pending) {
      await AsyncStorage.removeItem(pendingKey(storageKey));
    }
  });
  return merged;
}

/**
 * Persist items locally (remembering anything deleted), then merge with the
 * server and push in real time. If the push fails, the change stays queued
 * as pending and is retried on the next app load or the next save.
 */
export async function saveAndPush(collection, storageKey, items) {
  try {
    await inLocalQueue(storageKey, async () => {
      const previous = await readLocal(storageKey);
      const kept = new Set(items.map((item) => item.id));
      const removed = previous.map((item) => item.id).filter((id) => id && !kept.has(id));
      if (removed.length) {
        const deleted = new Set([...(await readDeleted(storageKey)), ...removed]);
        await AsyncStorage.setItem(deletedKey(storageKey), JSON.stringify([...deleted]));
      }
      await writeLocal(storageKey, items);
      // A fresh value each save, so an older push can't clear a newer edit.
      await AsyncStorage.setItem(pendingKey(storageKey), String(Date.now()));
    });
  } catch (error) {
    console.error(`Failed to save ${collection} locally`, error);
  }

  try {
    await pushMerged(collection, storageKey);
    return { pushed: true };
  } catch (error) {
    console.error(`Failed to push ${collection}`, error);
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
    if (await AsyncStorage.getItem(pendingKey(storageKey))) {
      pushMerged(collection, storageKey).catch(() => {});
    }
  } catch (_error) {
    // best-effort retry only
  }
  return local;
}

// ------- manual pull (server → local) -------

/**
 * Pull the latest data for one collection from the server. With no unsynced
 * changes here, the server's copy replaces the local one; otherwise the two
 * are merged and pushed, so a pull never throws away unsynced work.
 */
export async function pullFromServer(collection, storageKey) {
  if (await AsyncStorage.getItem(pendingKey(storageKey))) {
    return pushMerged(collection, storageKey);
  }
  const remote = await fetchCollection(collection);
  await inLocalQueue(storageKey, async () => {
    // An edit may have landed while fetching; let the next push merge it.
    if (await AsyncStorage.getItem(pendingKey(storageKey))) return;
    await writeLocal(storageKey, remote);
  });
  return readLocal(storageKey);
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
