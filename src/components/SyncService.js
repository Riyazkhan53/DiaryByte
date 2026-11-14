import { useEffect } from 'react';
import { AppState } from 'react-native';
import { isGuest } from '../services/session';
import { pendingSummary, syncAllPending } from '../services/sync';

const EVERY_MS = 30000;
const FIRST_TRY_MS = 4000;

/**
 * Background sync: while items are waiting for sync, try every 30 s and
 * whenever the app comes back to the foreground. Each try checks the
 * server first, so it costs nothing while offline. Renders nothing.
 */
export default function SyncService() {
  useEffect(() => {
    if (isGuest()) return undefined;
    let stopped = false;
    const tryNow = async () => {
      if (stopped) return;
      try {
        if ((await pendingSummary()).length) await syncAllPending();
      } catch (_error) {
        // tried again on the next tick
      }
    };
    const first = setTimeout(tryNow, FIRST_TRY_MS);
    const timer = setInterval(tryNow, EVERY_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tryNow();
    });
    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(timer);
      sub.remove();
    };
  }, []);
  return null;
}
