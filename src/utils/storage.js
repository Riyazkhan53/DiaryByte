import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchCollection, pushCollection } from '../services/api';

const STORAGE_KEY = '@diarybyte_entries';
const PENDING_SYNC_KEY = '@diarybyte_entries_pending';

export async function loadEntries() {
  try {
    const pending = await AsyncStorage.getItem(PENDING_SYNC_KEY);
    if (pending === '1') {
      // Local has changes the server never received — push them up
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const local = stored ? JSON.parse(stored) : [];
      await pushCollection('diary', local);
      await AsyncStorage.removeItem(PENDING_SYNC_KEY);
      return local;
    }
    const remote = await fetchCollection('diary');
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
    return remote;
  } catch (error) {
    // Cloud unreachable — fall back to the local cache
    console.error('Cloud load failed, using local entries', error);
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (cacheError) {
      console.error('Failed to load entries', cacheError);
      return [];
    }
  }
}

export async function saveEntries(entries) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (error) {
    console.error('Failed to save entries', error);
  }
  // Fire-and-forget cloud sync; queue as pending if it fails
  pushCollection('diary', entries)
    .then(async () => {
      await AsyncStorage.removeItem(PENDING_SYNC_KEY);
    })
    .catch(async (error) => {
      console.error('Failed to sync entries', error);
      try {
        await AsyncStorage.setItem(PENDING_SYNC_KEY, '1');
      } catch (queueError) {
        console.error('Failed to mark pending sync', queueError);
      }
    });
}

export async function addEntry(entry) {
  const entries = await loadEntries();
  const updated = [entry, ...entries];
  await saveEntries(updated);
  return updated;
}

export async function deleteEntry(id) {
  const entries = await loadEntries();
  const updated = entries.filter((entry) => entry.id !== id);
  await saveEntries(updated);
  return updated;
}

export async function getEntry(id) {
  const entries = await loadEntries();
  return entries.find((entry) => entry.id === id) || null;
}
