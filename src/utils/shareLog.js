// The last thing shared into DiaryByte (for Settings → AI → "Last share
// received"), so a share that doesn't work can be looked into.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { trace, traceStart } from './shareTrace';

const KEY = '@diarybyte_last_share';

export async function recordShare(entry) {
  if (entry.error) trace(`share error: ${entry.error}`);
  else traceStart(`share in: ${entry.app || '?'} → ${entry.target || '?'} · ${String(entry.text || '').slice(0, 80)}`);
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

/** Adds a step ("sheet opened", "title: X") to the last share, with seconds since it arrived. */
export async function recordStep(step) {
  trace(step);
  try {
    const last = JSON.parse((await AsyncStorage.getItem(KEY)) || 'null');
    if (!last) return;
    const secs = ((Date.now() - Date.parse(last.at)) / 1000).toFixed(1);
    const steps = [...(last.steps || []), `${secs}s ${String(step).slice(0, 120)}`].slice(-12);
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...last, steps }));
  } catch (_error) {
    // diagnostics only
  }
}
