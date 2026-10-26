import { loadLocalWithRetry, saveAndPush, pullFromServer } from '../services/sync';

const STORAGE_KEY = '@diarybyte_entries';
const COLLECTION = 'diary';

// Local-first diary storage: loads instantly from the local store,
// pushes to the server in real time on every change.

export async function loadEntries() {
  return loadLocalWithRetry(COLLECTION, STORAGE_KEY);
}

// Pull only diary entries from the server (unsynced local changes are kept).
export async function pullEntries() {
  return pullFromServer(COLLECTION, STORAGE_KEY);
}

export async function saveEntries(entries) {
  await saveAndPush(COLLECTION, STORAGE_KEY, entries);
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
