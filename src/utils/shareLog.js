// The last thing shared into DiaryByte (for Settings → AI → "Last share
// received"), so a share that doesn't work can be looked into.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@diarybyte_last_share';

export async function recordShare(entry) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ at: new Date().toISOString(), ...entry }));
  } catch (_error) {
    // diagnostics only
  }
}

export async function lastShare() {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) || 'null');
  } catch (_error) {
    return null;
  }
}
