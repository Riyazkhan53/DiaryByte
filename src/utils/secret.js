import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchCollection, pushCollection } from '../services/api';
import { sha256 } from './sha256';

const SYNC_TIMEOUT_MS = 8000;

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

/**
 * A secret (password or code) stored as a salted SHA-256 hash — never in
 * plain text. Used for the delete password and the vault code.
 *
 * Without `sync` it stays on this device only. With
 * `sync: { collection, id }` the hash is also kept on the server as one
 * document, so every device asks for the same secret: the most recently
 * set (or removed) one wins.
 */
export function createSecret(storageKey, sync = null) {
  let state = { enabled: false, salt: null, hash: null, updatedAt: null };
  let loaded = false;
  let loading = null;
  let refreshing = null;
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn(state));
  const pendingKey = `${storageKey}_pending`;

  const writeLocal = async (next) => {
    state = next;
    await AsyncStorage.setItem(storageKey, JSON.stringify(state));
    emit();
  };

  const push = async () => {
    if (!sync) return;
    try {
      const { enabled, salt, hash, updatedAt } = state;
      await pushCollection(sync.collection, [{ id: sync.id, enabled, salt, hash, updatedAt }]);
      await AsyncStorage.removeItem(pendingKey);
    } catch (_error) {
      // Offline: stays pending and is pushed on the next refresh.
      await AsyncStorage.setItem(pendingKey, '1').catch(() => {});
    }
  };

  const stamp = (value) => (value ? Date.parse(value) || 0 : 0);

  const secret = {
    /** Load once from this device (cheap to call again). */
    load() {
      if (loaded) return Promise.resolve(state);
      if (!loading) {
        loading = (async () => {
          try {
            const raw = await AsyncStorage.getItem(storageKey);
            if (raw) state = { ...state, ...JSON.parse(raw) };
          } catch (_error) {
            // Nothing saved yet.
          }
          loaded = true;
          emit();
          return state;
        })();
      }
      return loading;
    },
    /**
     * Bring this device in line with the server (synced secrets only):
     * whichever side was changed last wins. Never throws.
     */
    refresh() {
      if (!sync) return secret.load();
      if (!refreshing) {
        refreshing = (async () => {
          await secret.load();
          try {
            const remote = (await withTimeout(fetchCollection(sync.collection), SYNC_TIMEOUT_MS)).find(
              (doc) => doc && doc.id === sync.id
            );
            const pending = !!(await AsyncStorage.getItem(pendingKey));
            const localTime = stamp(state.updatedAt);
            const remoteTime = remote ? stamp(remote.updatedAt) : -1;
            if (remote && remoteTime > localTime) {
              await writeLocal({
                enabled: !!remote.enabled,
                salt: remote.salt || null,
                hash: remote.hash || null,
                updatedAt: remote.updatedAt || null,
              });
              await AsyncStorage.removeItem(pendingKey);
            } else if (pending || (!remote && state.hash) || (remote && localTime > remoteTime)) {
              // This device has the newer secret, or set one before syncing existed.
              if (!state.updatedAt) await writeLocal({ ...state, updatedAt: new Date().toISOString() });
              await push();
            }
          } catch (_error) {
            // Offline or server asleep: keep what this device has.
          }
          return state;
        })().finally(() => {
          refreshing = null;
        });
      }
      return refreshing;
    },
    isLoaded: () => loaded,
    enabled: () => !!(state.enabled && state.hash),
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    check: (value) => !!state.hash && sha256(`${state.salt}:${value}`) === state.hash,
    async set(value) {
      const salt = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
      await writeLocal({ enabled: true, salt, hash: sha256(`${salt}:${value}`), updatedAt: new Date().toISOString() });
      await push();
    },
    async clear() {
      await writeLocal({ enabled: false, salt: null, hash: null, updatedAt: new Date().toISOString() });
      await push();
    },
  };
  secret.load();
  return secret;
}
