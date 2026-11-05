// The Personal Vault's 6-digit combination.
//
// When a code is set, every vault item (title, details, photos) is encrypted
// with a key derived from it (see vaultCrypto). The lock itself — salt,
// round count and a sealed check value, never the code — is synced as one
// document in "vaultlock", so every device asks for the same code. The most
// recently set, changed or removed code wins.
//
// While the vault is open the key is kept in memory only; locking forgets it.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchCollection, pushCollection } from '../services/api';
import { notifyLocal, pullFromServer, readLocal, saveAndPush } from '../services/sync';
import { sha256 } from './sha256';
import {
  KDF_ITERATIONS,
  checkVerifier,
  decryptItem,
  deriveKey,
  encryptItem,
  isEncryptedItem,
  makeVerifier,
  newSalt,
} from './vaultCrypto';

export const VAULT_CODE_LENGTH = 6;
export const isVaultCode = (value) => new RegExp(`^\\d{${VAULT_CODE_LENGTH}}$`).test(value);

export const VAULT_STORAGE_KEY = '@diarybyte_vault';
const LOCK_KEY = '@diarybyte_vault_code';
const PENDING_KEY = `${LOCK_KEY}_pending`;
const LOCK_COLLECTION = 'vaultlock';
const LOCK_ID = 'vault-code';
const SYNC_TIMEOUT_MS = 8000;

const EMPTY = { enabled: false, salt: null, iterations: null, verifier: null, hash: null, updatedAt: null };

let state = { ...EMPTY };
let loaded = false;
let loading = null;
let refreshing = null;
let currentKey = null; // only while the vault is open
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(state));

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
const stamp = (value) => (value ? Date.parse(value) || 0 : 0);
const pick = (doc) => ({
  enabled: !!doc.enabled,
  salt: doc.salt || null,
  iterations: doc.iterations || null,
  verifier: doc.verifier || null,
  hash: doc.hash || null, // only on locks saved by an older app version
  updatedAt: doc.updatedAt || null,
});

async function writeLock(next) {
  state = next;
  await AsyncStorage.setItem(LOCK_KEY, JSON.stringify(state));
  emit();
}

async function pushLock() {
  try {
    await pushCollection(LOCK_COLLECTION, [{ id: LOCK_ID, ...state }]);
    await AsyncStorage.removeItem(PENDING_KEY);
  } catch (_error) {
    // Offline: pushed on the next refresh.
    await AsyncStorage.setItem(PENDING_KEY, '1').catch(() => {});
  }
}

/** Decrypt every vault item with `oldKey` and re-encrypt it with `newKey` (null = keep it readable). */
async function rekeyItems(oldKey, newKey) {
  let items;
  try {
    items = await pullFromServer('vault', VAULT_STORAGE_KEY);
  } catch (_error) {
    items = await readLocal(VAULT_STORAGE_KEY);
  }
  let changed = false;
  const next = items.map((raw) => {
    const plain = decryptItem(oldKey, raw);
    if (!plain) return raw; // sealed with some other code: leave it alone
    const out = newKey ? encryptItem(newKey, plain) : plain;
    if (out !== raw) changed = true;
    return out;
  });
  if (!changed) return;
  notifyLocal(VAULT_STORAGE_KEY, next);
  await saveAndPush('vault', VAULT_STORAGE_KEY, next);
}

async function keyFor(code) {
  if (state.verifier && state.salt) {
    const key = await deriveKey(code, state.salt, state.iterations || KDF_ITERATIONS);
    return checkVerifier(key, state.verifier) ? key : null;
  }
  return null;
}

export const vaultLock = {
  /** Read this device's copy once (cheap to call again). */
  load() {
    if (loaded) return Promise.resolve(state);
    if (!loading) {
      loading = (async () => {
        try {
          const raw = await AsyncStorage.getItem(LOCK_KEY);
          if (raw) state = pick({ ...EMPTY, ...JSON.parse(raw) });
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

  /** Match the server's lock: whichever side changed last wins. Never throws. */
  refresh() {
    if (!refreshing) {
      refreshing = (async () => {
        await vaultLock.load();
        try {
          const remote = (await withTimeout(fetchCollection(LOCK_COLLECTION), SYNC_TIMEOUT_MS)).find(
            (doc) => doc && doc.id === LOCK_ID
          );
          const pending = !!(await AsyncStorage.getItem(PENDING_KEY));
          const localTime = stamp(state.updatedAt);
          const remoteTime = remote ? stamp(remote.updatedAt) : -1;
          // An older app's plain hash stays on this device: unlocking upgrades it.
          const hasLocal = !!state.verifier;
          if (remote && remoteTime > localTime) {
            if (remote.salt !== state.salt) currentKey = null;
            await writeLock(pick(remote));
            await AsyncStorage.removeItem(PENDING_KEY);
          } else if (pending || (!remote && hasLocal) || (remote && localTime > remoteTime)) {
            if (!state.updatedAt) await writeLock({ ...state, updatedAt: new Date().toISOString() });
            await pushLock();
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

  enabled: () => !!(state.enabled && (state.verifier || state.hash)),
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** True if `code` is the vault code. Slow (derives the key). */
  async check(code) {
    await vaultLock.load();
    if (state.verifier) return !!(await keyFor(code));
    return !!state.hash && sha256(`${state.salt}:${code}`) === state.hash;
  },

  /**
   * Open the vault with `code`: true and the key kept in memory, or false.
   * A lock from an older app version (a plain hash, items unencrypted) is
   * upgraded here: the items get encrypted with this code.
   */
  async unlock(code) {
    await vaultLock.load();
    if (!vaultLock.enabled()) {
      currentKey = null;
      return true;
    }
    if (state.verifier) {
      currentKey = await keyFor(code);
      return !!currentKey;
    }
    if (sha256(`${state.salt}:${code}`) !== state.hash) return false;
    await vaultLock.setCode(code);
    return true;
  },

  /** Forget the key (the vault door shows again). */
  lock() {
    currentKey = null;
  },

  /** The key while the vault is open (null when no code is set). */
  key: () => currentKey,

  /**
   * Set or change the code (`current` is needed to change it). Re-encrypts
   * every vault item with the new key. Returns false if `current` is wrong.
   */
  async setCode(next, current = null) {
    await vaultLock.load();
    let oldKey = null;
    if (state.verifier) {
      oldKey = current != null ? await keyFor(current) : currentKey;
      if (!oldKey) return false;
    } else if (state.hash && current != null && sha256(`${state.salt}:${current}`) !== state.hash) {
      return false;
    }
    const salt = newSalt();
    const key = await deriveKey(next, salt, KDF_ITERATIONS);
    await writeLock({
      ...EMPTY,
      enabled: true,
      salt,
      iterations: KDF_ITERATIONS,
      verifier: makeVerifier(key),
      updatedAt: new Date().toISOString(),
    });
    await pushLock();
    currentKey = key;
    await rekeyItems(oldKey, key);
    return true;
  },

  /** Remove the code: items are stored readable again. False if `current` is wrong. */
  async removeCode(current) {
    await vaultLock.load();
    let oldKey = null;
    if (state.verifier) {
      oldKey = await keyFor(current);
      if (!oldKey) return false;
    } else if (state.hash && sha256(`${state.salt}:${current}`) !== state.hash) {
      return false;
    }
    await writeLock({ ...EMPTY, updatedAt: new Date().toISOString() });
    await pushLock();
    currentKey = null;
    if (oldKey) await rekeyItems(oldKey, null);
    return true;
  },
};

/** Encrypt items stored readable (from before a code was set) with the open vault's key. */
export function sealPlainItems(items) {
  const key = currentKey;
  if (!key || !items.some((item) => !isEncryptedItem(item))) return null;
  return items.map((item) => (isEncryptedItem(item) ? item : encryptItem(key, item)));
}

vaultLock.load();
