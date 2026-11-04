import AsyncStorage from '@react-native-async-storage/async-storage';
import { sha256 } from './sha256';

// "Password to confirm delete": kept on this device only (not synced), as a
// salted SHA-256 hash. When it is on, every delete asks for the password.
const KEY = '@diarybyte_delete_guard';

let state = { enabled: false, salt: null, hash: null };
let loaded = false;
const listeners = new Set();

const emit = () => listeners.forEach((fn) => fn(state));

/** Load the setting once (cheap to call again). */
export async function loadDeleteGuard() {
  if (loaded) return state;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) state = { ...state, ...JSON.parse(raw) };
  } catch (_error) {
    // No setting: deletes just ask for a confirmation.
  }
  loaded = true;
  emit();
  return state;
}

export const deleteGuardEnabled = () => !!(state.enabled && state.hash);

export function subscribeDeleteGuard(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function checkDeletePassword(password) {
  return !!state.hash && sha256(`${state.salt}:${password}`) === state.hash;
}

async function save(next) {
  state = next;
  await AsyncStorage.setItem(KEY, JSON.stringify(state));
  emit();
}

/** Turn the password on (or change it). */
export async function setDeletePassword(password) {
  const salt = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  await save({ enabled: true, salt, hash: sha256(`${salt}:${password}`) });
}

/** Turn it off (forgets the password). */
export async function clearDeletePassword() {
  await save({ enabled: false, salt: null, hash: null });
}

loadDeleteGuard();
