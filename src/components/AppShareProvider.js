import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useShareIntentContext } from 'expo-share-intent';
import { takeSharedText } from '../services/shareText';

const Ctx = createContext({ hasShareIntent: false, shareIntent: null, resetShareIntent: () => {}, error: null });

// A share with an image and no text: the text, read once per share.
const filled = new WeakMap();
function withText(share) {
  if (!share) return share;
  if (!filled.has(share)) {
    // Always take it, so a text share's message isn't handed out again later.
    const native = takeSharedText();
    filled.set(
      share,
      share.text || !native?.text
        ? share
        : { ...share, text: native.text, meta: { ...(share.meta || {}), title: share.meta?.title || native.title || undefined } }
    );
  }
  return filled.get(share);
}

/**
 * What was shared into DiaryByte, for every screen: expo-share-intent's
 * share, plus the message that came with an image (Netflix and ZEE5 share a
 * poster with their message, and the library drops the message). If the
 * library couldn't read a share at all, the message is still used.
 */
export function AppShareProvider({ children }) {
  const lib = useShareIntentContext();
  const [orphan, setOrphan] = useState(null);
  const recent = useRef({ text: '', at: 0 });

  const libShare = lib.hasShareIntent ? withText(lib.shareIntent) : null;

  // The library sent nothing (or failed) but a share's message is waiting.
  useEffect(() => {
    let timer = null;
    const check = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const native = takeSharedText();
        if (!native?.text || Date.now() - Number(native.at || 0) > 120000) return;
        // Not the one just handled.
        if (native.text === recent.current.text && Date.now() - recent.current.at < 120000) return;
        setOrphan({ text: native.text, webUrl: null, files: null, type: 'text', meta: { title: native.title || undefined } });
      }, 2000);
    };
    check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [lib.error]);

  const share = libShare || orphan;
  useEffect(() => {
    if (share?.text) recent.current = { text: share.text, at: Date.now() };
  }, [share]);

  const value = useMemo(
    () => ({
      hasShareIntent: !!share,
      shareIntent: share,
      error: lib.error,
      resetShareIntent: () => {
        setOrphan(null);
        lib.resetShareIntent();
      },
    }),
    [share, lib]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAppShare = () => useContext(Ctx);
