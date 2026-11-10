// Who is using the app on this device: the signed-in owner, or a guest.
//
// The session is kept in local storage (IndexedDB on web, SQLite on native)
// until you sign out, so you stay signed in.
//
// A guest gets an id like "guest_482913". Everything a guest saves is
// stored under that id on this device only: this module wraps AsyncStorage
// so every key a guest reads or writes is prefixed with it. So a guest never
// sees the owner's local data, and nothing of theirs is sent to the server
// (see api.js and sync.js, which skip the server for guests).
//
// Import this module before anything reads storage; the wrapped calls wait
// until the session has loaded, so early reads land in the right place.

import { DevSettings, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_KEY = '@diarybyte_session';

const raw = {
  getItem: AsyncStorage.getItem.bind(AsyncStorage),
  setItem: AsyncStorage.setItem.bind(AsyncStorage),
  removeItem: AsyncStorage.removeItem.bind(AsyncStorage),
  multiRemove: AsyncStorage.multiRemove.bind(AsyncStorage),
};

let session = null; // { type: 'user', username, token } | { type: 'guest', id }
let loaded = false;

/** Resolves to the session (or null) once it has been read from storage. */
export const sessionReady = raw
  .getItem(SESSION_KEY)
  .then((text) => {
    try {
      const parsed = text ? JSON.parse(text) : null;
      if (parsed?.type === 'user' && parsed.token) session = parsed;
      else if (parsed?.type === 'guest' && /^guest_\d{6}$/.test(parsed.id)) session = parsed;
    } catch (_error) {
      session = null;
    }
  })
  .catch(() => {})
  .then(() => {
    loaded = true;
    return session;
  });

export const getSession = () => session;
export const isSessionLoaded = () => loaded;
export const isGuest = () => session?.type === 'guest';
export const authToken = () => (session?.type === 'user' ? session.token : null);

// ------- guest storage: every key prefixed with the guest id -------

const keyFor = (key) => (session?.type === 'guest' && key !== SESSION_KEY ? `${session.id}:${key}` : key);

AsyncStorage.getItem = async (key, ...rest) => {
  await sessionReady;
  return raw.getItem(keyFor(key), ...rest);
};
AsyncStorage.setItem = async (key, value, ...rest) => {
  await sessionReady;
  return raw.setItem(keyFor(key), value, ...rest);
};
AsyncStorage.removeItem = async (key, ...rest) => {
  await sessionReady;
  return raw.removeItem(keyFor(key), ...rest);
};
AsyncStorage.multiRemove = async (keys, ...rest) => {
  await sessionReady;
  return raw.multiRemove(keys.map(keyFor), ...rest);
};

// ------- signing in and out -------

/** Start the app afresh so nothing loaded for the previous session lingers. */
async function restart() {
  if (Platform.OS === 'web') {
    window.location.reload();
    return;
  }
  try {
    const Updates = await import('expo-updates');
    await Updates.reloadAsync();
  } catch (_error) {
    DevSettings.reload(); // development builds
  }
}

async function setSession(next) {
  if (next) await raw.setItem(SESSION_KEY, JSON.stringify(next));
  else await raw.removeItem(SESSION_KEY);
  await restart();
}

/** Signed in with a username and password (token from the server). */
export const signInUser = (username, token) => setSession({ type: 'user', username, token });

/** Look around as a guest: a fresh "guest_######" id each time. */
export const signInGuest = () =>
  setSession({ type: 'guest', id: `guest_${String(Math.floor(100000 + Math.random() * 900000))}` });

/** Back to the sign-in page. Local data stays on the device. */
export const signOut = () => setSession(null);
