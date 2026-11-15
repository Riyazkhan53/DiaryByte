// App lock: ask for the fingerprint (or the phone's PIN) when DiaryByte
// opens, and when it comes back after being away for a while. Settings are
// kept on this phone only.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

const KEY = '@diarybyte_app_lock';
export const LOCK_AFTER = [
  [0, 'Immediately'],
  [60, 'After 1 minute'],
  [300, 'After 5 minutes'],
  [900, 'After 15 minutes'],
];

let prefs = { enabled: false, after: 0 };
let locked = false;
let loaded = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(locked));

export const appLockSupported = Platform.OS !== 'web';

export function loadAppLock() {
  if (!loaded) {
    loaded = AsyncStorage.getItem(KEY)
      .then((raw) => {
        prefs = { ...prefs, ...(JSON.parse(raw || '{}') || {}) };
        // Locked from the start when it's on.
        if (prefs.enabled && appLockSupported) {
          locked = true;
          emit();
        }
        return prefs;
      })
      .catch(() => prefs);
  }
  return loaded;
}

export const appLockPrefs = () => prefs;
export const isAppLocked = () => locked;

export function subscribeAppLock(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function save(next) {
  prefs = { ...prefs, ...next };
  await AsyncStorage.setItem(KEY, JSON.stringify(prefs));
}

/** What the phone can do: { hardware, enrolled }. */
export async function biometricStatus() {
  if (!appLockSupported) return { hardware: false, enrolled: false };
  try {
    const [hardware, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
    return { hardware, enrolled };
  } catch (_error) {
    return { hardware: false, enrolled: false };
  }
}

/** Ask for the fingerprint (or the phone's PIN). True when it matched. */
export async function authenticate(promptMessage = 'Unlock DiaryByte') {
  try {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel: 'Cancel', disableDeviceFallback: false });
    return !!r.success;
  } catch (_error) {
    return false;
  }
}

export async function unlockApp() {
  const ok = await authenticate();
  if (ok) {
    locked = false;
    emit();
  }
  return ok;
}

/** Turn the lock on (after a fingerprint check) or off. */
export async function setAppLock(enabled) {
  if (enabled && !(await authenticate('Confirm it’s you'))) return false;
  await save({ enabled });
  if (!enabled && locked) {
    locked = false;
    emit();
  }
  return true;
}

export const setLockAfter = (after) => save({ after });

// Leaving and coming back.
let leftAt = null;
export function appWentAway() {
  leftAt = Date.now();
}
export function appCameBack() {
  if (!prefs.enabled || !appLockSupported || leftAt == null) return;
  if ((Date.now() - leftAt) / 1000 >= (prefs.after || 0)) {
    locked = true;
    emit();
  }
  leftAt = null;
}
