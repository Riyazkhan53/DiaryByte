import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@diarybyte_entries';

export async function loadEntries() {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
    return [];
  } catch (error) {
    console.error('Failed to load entries', error);
    return [];
  }
}

export async function saveEntries(entries) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (error) {
    console.error('Failed to save entries', error);
  }
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
