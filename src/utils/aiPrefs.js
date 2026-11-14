// AI preferences (kept on this device).
// autoScreenshots: read a shared or picked ticket screenshot with AI at
// once. Off by default: the screenshot is attached and AI runs only when
// you tap "Fill details with AI".
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@diarybyte_ai_prefs';
const DEFAULTS = { autoScreenshots: false };

export async function getAiPrefs() {
  try {
    return { ...DEFAULTS, ...(JSON.parse((await AsyncStorage.getItem(KEY)) || '{}') || {}) };
  } catch (_error) {
    return { ...DEFAULTS };
  }
}

export async function setAiPref(name, value) {
  const prefs = { ...(await getAiPrefs()), [name]: value };
  await AsyncStorage.setItem(KEY, JSON.stringify(prefs));
  return prefs;
}
