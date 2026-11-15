import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { takeShare, onShare } from '../services/shareText';

const Ctx = createContext({ hasShareIntent: false, shareIntent: null, resetShareIntent: () => {}, error: null });

const URL_RE = /https?:\/\/[^\s<>"')\]]+/i;

/** The native share as the app's share object. */
function toShare(raw) {
  const text = raw.text || '';
  const files = (raw.files || [])
    .filter((f) => f && f.path)
    .map((f) => ({ path: f.path, contentUri: f.path, mimeType: f.mimeType || '', fileName: f.fileName || 'shared', size: f.size || null, width: null, height: null }));
  return {
    text: text || null,
    webUrl: (text.match(URL_RE) || [null])[0],
    files: files.length ? files : null,
    type: files.length ? 'media' : 'text',
    meta: { title: raw.title || undefined },
  };
}

/**
 * What was shared into DiaryByte, for every screen. Read from the app's own
 * share module when the app starts, when a share arrives while it runs, and
 * whenever it comes to the front.
 */
export function AppShareProvider({ children }) {
  const [share, setShare] = useState(null);

  useEffect(() => {
    const pull = () => {
      const raw = takeShare();
      if (raw && (raw.text || raw.files?.length)) setShare(toShare(raw));
    };
    pull();
    const off = onShare(pull);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && pull());
    return () => {
      off();
      sub.remove();
    };
  }, []);

  const value = useMemo(
    () => ({ hasShareIntent: !!share, shareIntent: share, error: null, resetShareIntent: () => setShare(null) }),
    [share]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAppShare = () => useContext(Ctx);
