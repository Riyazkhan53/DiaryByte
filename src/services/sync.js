import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkHealth, fetchCollection, pushCollection } from './api';
import { isGuest } from './session';
import { getLargeItem, setLargeItem } from './localStore';

// Single registry of every synced collection: local storage key ↔ server collection.
// On web, AsyncStorage is backed by IndexedDB; on Android/iOS it's SQLite.
// Either way it is the local-first store for the app.
export const SYNCED_COLLECTIONS = [
  { collection: 'movies', storageKey: '@diarybyte_movies' },
  { collection: 'passwords', storageKey: '@diarybyte_passwords' },
  { collection: 'vouchers', storageKey: '@diarybyte_vouchers' },
  { collection: 'banking', storageKey: '@diarybyte_banking' },
  { collection: 'diary', storageKey: '@diarybyte_entries' },
  { collection: 'vault', storageKey: '@diarybyte_vault' },
  { collection: 'iddocs', storageKey: '@diarybyte_iddocs' },
  { collection: 'todo', storageKey: '@diarybyte_todo' },
  { collection: 'expenditure', storageKey: '@diarybyte_expenditure' },
  { collection: 'cards', storageKey: '@diarybyte_cards' },
  { collection: 'investments', storageKey: '@diarybyte_investments' },
  { collection: 'debts', storageKey: '@diarybyte_debts' },
  { collection: 'autopays', storageKey: '@diarybyte_autopays' },
  { collection: 'tickets', storageKey: '@diarybyte_tickets' },
  { collection: 'dates', storageKey: '@diarybyte_dates' },
  { collection: 'months', storageKey: '@diarybyte_months' },
  { collection: 'spends', storageKey: '@diarybyte_spends' },
  { collection: 'setups', storageKey: '@diarybyte_setups' },
  { collection: 'trades', storageKey: '@diarybyte_trades' },
  { collection: 'demat', storageKey: '@diarybyte_demat' },
  { collection: 'tradingconfig', storageKey: '@diarybyte_tradingconfig' },
  { collection: 'learned', storageKey: '@diarybyte_learned' },
  { collection: 'authenticator', storageKey: '@diarybyte_authenticator' },
];

// Section names for "Items waiting for sync".
export const COLLECTION_LABELS = {
  movies: 'Movies',
  passwords: 'Passwords',
  vouchers: 'Vouchers & Gift Cards',
  banking: 'Banking',
  diary: 'Diary',
  vault: 'Personal Vault',
  iddocs: 'Personal Documents',
  todo: 'To-do',
  expenditure: 'Expenditure',
  cards: 'Cards',
  investments: 'Investments',
  debts: 'Debts',
  autopays: 'Autopays',
  tickets: 'Tickets',
  dates: 'Important Dates',
  months: 'Monthly income',
  spends: 'Total spends',
  setups: 'Setup checks',
  trades: 'Paper trades',
  demat: 'Demat',
  tradingconfig: 'Trading settings',
  learned: 'Smart fill (learned formats)',
  authenticator: 'Authenticator',
};

// ------- sync status events -------

// "Items waiting for sync" changed (a save, a push, a failed push).
const statusListeners = new Set();

export function subscribeSyncStatus(listener) {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

function emitSyncStatus() {
  statusListeners.forEach((listener) => {
    try {
      listener();
    } catch (_error) {
      // a listener's problem isn't the sync's
    }
  });
}

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
// Items waiting for sync: { id: stamp of the save that changed it }.
const queueKey = (storageKey) => `${storageKey}_queue`;

/** Every key this module keeps for a collection (for a full reset). */
export const syncKeysFor = (storageKey) => [pendingKey(storageKey), deletedKey(storageKey), queueKey(storageKey)];

// ------- local reads/writes -------

// Through localStore: big lists (photos) are split into pieces, because
// Android can't read back one value over ~2 MB.
export async function readLocal(storageKey) {
  const stored = await getLargeItem(storageKey);
  return stored ? JSON.parse(stored) : [];
}

export async function writeLocal(storageKey, items) {
  await setLargeItem(storageKey, JSON.stringify(items));
}

async function readDeleted(storageKey) {
  try {
    return JSON.parse((await AsyncStorage.getItem(deletedKey(storageKey))) || '[]');
  } catch (_error) {
    return [];
  }
}

async function readQueue(storageKey) {
  try {
    return JSON.parse((await AsyncStorage.getItem(queueKey(storageKey))) || '{}') || {};
  } catch (_error) {
    return {};
  }
}

async function writeQueue(storageKey, queue) {
  if (Object.keys(queue).length) await AsyncStorage.setItem(queueKey(storageKey), JSON.stringify(queue));
  else await AsyncStorage.removeItem(queueKey(storageKey));
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
 * The server only removes the ids listed as deleted, so this merge isn't
 * what keeps data safe; it brings items saved from other devices onto this
 * one, so the screen shows everything.
 */
async function pushMerged(collection, storageKey) {
  const remote = await fetchCollection(collection);
  const { merged, deleted, pending, queued } = await inLocalQueue(storageKey, async () => {
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
      queued: await readQueue(storageKey),
    };
  });

  await pushCollection(collection, merged, deleted);

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
    // Items saved again while this push was in flight stay waiting.
    const queue = await readQueue(storageKey);
    Object.keys(queued).forEach((id) => {
      if (queue[id] === queued[id]) delete queue[id];
    });
    await writeQueue(storageKey, queue);
  });
  emitSyncStatus();
  return merged;
}

/**
 * Persist items locally (remembering anything deleted), then merge with the
 * server and push in real time. If the push fails, the change stays queued
 * as pending and is retried on the next app load or the next save.
 */
export async function saveAndPush(collection, storageKey, items) {
  // Guests: this device only. No delete log, no pending marker, no push.
  if (isGuest()) {
    try {
      await inLocalQueue(storageKey, () => writeLocal(storageKey, items));
    } catch (error) {
      console.error(`Failed to save ${collection} locally`, error);
    }
    return { pushed: false, guest: true };
  }
  try {
    await inLocalQueue(storageKey, async () => {
      const previous = await readLocal(storageKey);
      const kept = new Set(items.map((item) => item.id));
      const removed = previous.map((item) => item.id).filter((id) => id && !kept.has(id));
      if (removed.length) {
        const deleted = new Set([...(await readDeleted(storageKey)), ...removed]);
        await AsyncStorage.setItem(deletedKey(storageKey), JSON.stringify([...deleted]));
      }
      // Items waiting for sync: the ones this save added, changed or removed.
      const stamp = Date.now();
      const before = new Map(previous.map((item) => [item.id, JSON.stringify(item)]));
      const changed = items.filter((item) => item && item.id && before.get(item.id) !== JSON.stringify(item)).map((item) => item.id);
      if (changed.length || removed.length) {
        const queue = await readQueue(storageKey);
        [...changed, ...removed].forEach((id) => {
          queue[id] = stamp;
        });
        await writeQueue(storageKey, queue);
      }
      await writeLocal(storageKey, items);
      // A fresh value each save, so an older push can't clear a newer edit.
      await AsyncStorage.setItem(pendingKey(storageKey), String(stamp));
    });
  } catch (error) {
    console.error(`Failed to save ${collection} locally`, error);
  }
  emitSyncStatus();

  try {
    await pushMerged(collection, storageKey);
    return { pushed: true };
  } catch (error) {
    console.error(`Failed to push ${collection}`, error);
    emitSyncStatus();
    return { pushed: false, error };
  }
}

/**
 * Load from the local store instantly. If a previous push failed, retry it
 * silently in the background — the UI never waits on the network.
 */
export async function loadLocalWithRetry(collection, storageKey) {
  const local = await readLocal(storageKey);
  if (isGuest()) return local;
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
  if (isGuest()) return readLocal(storageKey);
  // Make sure the local copy opens first (this also recovers one saved too
  // big by an older version): never overwrite something unread, as it may
  // hold changes the server doesn't have.
  await readLocal(storageKey);
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

// ------- items waiting for sync -------

/** True when this collection has changes the server hasn't got yet. */
export async function hasPending(storageKey) {
  if (isGuest()) return false;
  return !!(await AsyncStorage.getItem(pendingKey(storageKey)));
}

/**
 * Items waiting for sync, by section: [{ collection, label, count }] for
 * sections with unsynced changes (count of items added, changed or
 * deleted; at least 1).
 */
export async function pendingSummary() {
  if (isGuest()) return [];
  const out = [];
  for (const { collection, storageKey } of SYNCED_COLLECTIONS) {
    if (!(await AsyncStorage.getItem(pendingKey(storageKey)))) continue;
    const count = Object.keys(await readQueue(storageKey)).length;
    out.push({ collection, label: COLLECTION_LABELS[collection] || collection, count: Math.max(1, count) });
  }
  return out;
}

let syncRun = null;
let lastSync = null; // { at, ok, reachable, failed: [labels] }

export const lastSyncResult = () => lastSync;

/**
 * Push every section with items waiting for sync. Checks the server first,
 * so an unreachable one costs one quick check instead of a timeout per
 * section. One run at a time. Returns { reachable, synced, failed, left }.
 */
export function syncAllPending() {
  if (syncRun) return syncRun;
  syncRun = (async () => {
    const waiting = await pendingSummary();
    if (!waiting.length) {
      lastSync = { at: Date.now(), ok: true, reachable: true, failed: [] };
      return { reachable: true, synced: 0, failed: [], left: 0 };
    }
    if (!(await checkHealth(10000))) {
      lastSync = { at: Date.now(), ok: false, reachable: false, failed: [] };
      emitSyncStatus();
      return { reachable: false, synced: 0, failed: [], left: waiting.length };
    }
    let synced = 0;
    const failed = [];
    for (const { collection, label } of waiting) {
      const entry = SYNCED_COLLECTIONS.find((c) => c.collection === collection);
      try {
        await pushMerged(collection, entry.storageKey);
        synced += 1;
      } catch (error) {
        console.error(`Sync of ${collection} failed`, error);
        failed.push(label);
      }
    }
    lastSync = { at: Date.now(), ok: !failed.length, reachable: true, failed };
    emitSyncStatus();
    return { reachable: true, synced, failed, left: (await pendingSummary()).length };
  })().finally(() => {
    syncRun = null;
  });
  return syncRun;
}
