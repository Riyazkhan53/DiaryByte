import { useState, useEffect, useCallback } from 'react';
import { loadLocalWithRetry, saveAndPush, pullFromServer } from '../services/sync';

/**
 * Local-first synced collection.
 * - Loads instantly from the local store (IndexedDB on web, SQLite on native)
 * - Every persist writes locally AND pushes to the server in real time
 * - Failed pushes are queued and retried on next load/save
 * - pullNow() fetches just this section's data from the server on demand
 */
export function useSyncedCollection(collection, storageKey) {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [synced, setSynced] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pullInfo, setPullInfo] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadLocalWithRetry(collection, storageKey).then((local) => {
      if (!cancelled) {
        setItems(local);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [collection, storageKey]);

  const persist = useCallback(
    (updated) => {
      setItems(updated);
      saveAndPush(collection, storageKey, updated).then(({ pushed }) => {
        setSynced(pushed);
      });
    },
    [collection, storageKey]
  );

  // Pull only this section's data from the server, overwriting local copy.
  const pullNow = useCallback(async () => {
    setPulling(true);
    try {
      const remote = await pullFromServer(collection, storageKey);
      setItems(remote);
      setSynced(true);
      setPullInfo({ count: remote.length });
      setTimeout(() => setPullInfo(null), 2500);
      return { ok: true, count: remote.length };
    } catch (error) {
      return { ok: false, error: error.message };
    } finally {
      setPulling(false);
    }
  }, [collection, storageKey]);

  return { items, loaded, synced, persist, pulling, pullInfo, pullNow };
}
