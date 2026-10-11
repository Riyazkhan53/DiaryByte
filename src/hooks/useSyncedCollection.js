import { useState, useEffect, useCallback } from 'react';
import { loadLocalWithRetry, saveAndPush } from '../services/sync';

/**
 * Local-first synced collection.
 * - Loads instantly from the local store (IndexedDB on web, SQLite on native)
 * - Every persist writes locally AND pushes to the server in real time
 * - Failed pushes are queued and retried on next load/save
 * - The server is pulled only via Settings → "Sync from Server"
 */
export function useSyncedCollection(collection, storageKey) {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [synced, setSynced] = useState(false);

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

  return { items, loaded, synced, persist };
}
