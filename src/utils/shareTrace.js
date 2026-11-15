// A small crash-proof trace of what happens after something is shared in:
// each line is written to a file straight away (synchronously), so even if
// the app crashes a moment later, the last steps can be read in Settings.
import { Platform } from 'react-native';

const MAX_LINES = 40;
let file = null;
function traceFile() {
  if (file || Platform.OS === 'web') return file;
  try {
    // Loaded lazily so a missing module never breaks the app.
    const { File, Paths } = require('expo-file-system');
    file = new File(Paths.document, 'share-trace.txt');
  } catch (_error) {
    file = null;
  }
  return file;
}

function readRaw() {
  try {
    const f = traceFile();
    if (f) return f.exists ? f.textSync() : '';
    return globalThis.localStorage?.getItem('@diarybyte_share_trace') || '';
  } catch (_error) {
    return '';
  }
}

function writeRaw(text) {
  try {
    const f = traceFile();
    if (f) f.write(text);
    else globalThis.localStorage?.setItem('@diarybyte_share_trace', text);
  } catch (_error) {
    // diagnostics only
  }
}

const stamp = () => {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
};

/** Add a line (written at once). */
export function trace(line) {
  const lines = readRaw().split('\n').filter(Boolean);
  lines.push(`${stamp()} ${String(line).replace(/\s+/g, ' ').slice(0, 200)}`);
  writeRaw(lines.slice(-MAX_LINES).join('\n'));
}

/** Start a new trace (a new share). */
export function traceStart(line) {
  writeRaw('');
  trace(line);
}

export const readTrace = () => readRaw();
export const clearTrace = () => writeRaw('');
