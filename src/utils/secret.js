import AsyncStorage from '@react-native-async-storage/async-storage';
import { sha256 } from './sha256';

/**
 * A secret (password or code) kept on this device only, as a salted SHA-256
 * hash — never in plain text, never synced. Used for the delete password
 * and the vault code.
 */
export function createSecret(storageKey) {
  let state = { enabled: false, salt: null, hash: null };
  let loaded = false;
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn(state));

  const save = async (next) => {
    state = next;
    await AsyncStorage.setItem(storageKey, JSON.stringify(state));
    emit();
  };

  const secret = {
    /** Load once (cheap to call again). */
    async load() {
      if (loaded) return state;
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (raw) state = { ...state, ...JSON.parse(raw) };
      } catch (_error) {
        // Nothing saved yet.
      }
      loaded = true;
      emit();
      return state;
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
      await save({ enabled: true, salt, hash: sha256(`${salt}:${value}`) });
    },
    async clear() {
      await save({ enabled: false, salt: null, hash: null });
    },
  };
  secret.load();
  return secret;
}
