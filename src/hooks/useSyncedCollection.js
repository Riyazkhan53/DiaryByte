import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchCollection, pushCollection } from '../services/api';

/**
 * Cloud-backed collection with offline AsyncStorage fallback.
 * Pulls from the API on mount (or pushes queued local changes),
 * and pushes the full list to the API on every persist.
 */
export function useSyncedCollection(collection, storageKey) {
  const [items, setItems] = useState([]);
  const [synced, setSynced] = useState(false);

  const pendingKey = `${storageKey}_pending`;

  const load = useCallback(async () => {
    try {
      const pending = await AsyncStorage.getItem(pendingKey);
      if (pending === '1') {
        // Local has changes the server never received — push them up
        const stored = await AsyncStorage.getItem(storageKey);
        const local = stored ? JSON.parse(stored) : [];
        setItems(local);
        await pushCollection(collection, local);
        await AsyncStorage.removeItem(pendingKey);
        setSynced(true);
        return;
      }
      const remote = await fetchCollection(collection);
      setItems(remote);
      setSynced(true);
      await AsyncStorage.setItem(storageKey, JSON.stringify(remote));
    } catch (_error) {
      // Cloud unreachable — fall back to the local cache
      setSynced(false);
      try {
        const stored = await AsyncStorage.getItem(storageKey);
        if (stored) setItems(JSON.parse(stored));
      } catch (cacheError) {
        console.error(`Failed to load ${collection}`, cacheError);
      }
    }
  }, [collection, storageKey, pendingKey]);

  useEffect(() => {
    const initialize = async () => {
      await load();
    };
    initialize();
  }, [load]);

  const persist = useCallback(
    async (updated) => {
      setItems(updated);
      try {
        await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
      } catch (error) {
        console.error(`Failed to save ${collection}`, error);
      }
      // Fire-and-forget cloud sync; queue as pending if it fails
      pushCollection(collection, updated)
        .then(async () => {
          setSynced(true);
          await AsyncStorage.removeItem(pendingKey);
        })
        .catch(async (error) => {
          console.error(`Failed to sync ${collection}`, error);
          setSynced(false);
          try {
            await AsyncStorage.setItem(pendingKey, '1');
          } catch (queueError) {
            console.error('Failed to mark pending sync', queueError);
          }
        });
    },
    [collection, storageKey, pendingKey]
  );

  return { items, synced, load, persist };
}
