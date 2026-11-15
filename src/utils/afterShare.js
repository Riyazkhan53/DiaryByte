// After something is shared in from some apps (Netflix, ZEE5), Android
// relaunches DiaryByte's window and new screens open blank (navigation is
// left attached to the closed window). Once the share is done, a quick
// restart puts everything back on the live window. This note (kept in a
// file, read synchronously at start-up) makes that restart quick: no launch
// animation or server wait, and the confirmation is shown after it.
import { Platform } from 'react-native';
import * as Updates from 'expo-updates';
import { trace } from './shareTrace';

let file = null;
function noteFile() {
  if (file || Platform.OS === 'web') return file;
  try {
    const { File, Paths } = require('expo-file-system');
    file = new File(Paths.document, 'after-share.json');
  } catch (_error) {
    file = null;
  }
  return file;
}

let cached;
/** The note left before the restart ({ message, at }) if it's fresh, else null. Read once. */
export function afterShareNote() {
  if (cached !== undefined) return cached;
  cached = null;
  try {
    const f = noteFile();
    if (f && f.exists) {
      const note = JSON.parse(f.textSync() || 'null');
      f.write('');
      if (note && Date.now() - note.at < 30000) cached = note;
    }
  } catch (_error) {
    cached = null;
  }
  return cached;
}

/** Restart the app's screens after a share (Android release builds only). */
export function restartAfterShare(message) {
  if (Platform.OS !== 'android' || __DEV__) return false;
  try {
    noteFile()?.write(JSON.stringify({ message: message || '', at: Date.now() }));
  } catch (_error) {
    // the restart still helps without the note
  }
  trace('restarting screens after the share');
  Updates.reloadAsync().catch((e) => trace(`restart failed: ${e?.message || e}`));
  return true;
}
