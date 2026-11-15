import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppShare } from '../AppShareProvider';
import ShareToWatchlist from './ShareToWatchlist';
import { TMDB_KEY_STORAGE } from '../../services/tmdb';
import { notifyLocal, readLocal, saveAndPush } from '../../services/sync';
import { sharedText, shareTarget } from '../../utils/shareRoute';
import { listPlatform } from '../../utils/ottShare';
import { trace } from '../../utils/shareTrace';
import { afterShareNote, restartAfterShare } from '../../utils/afterShare';
import { activityCreates } from '../../services/shareText';
import { isAppLocked, subscribeAppLock } from '../../utils/appLock';

// Windows Android had created when the app (JS) started.
const CREATES_AT_START = activityCreates();

const MOVIES_KEY = '@diarybyte_movies';

const inList = (movies, item) =>
  movies.some((m) =>
    item.tmdbId
      ? m.tmdbId === item.tmdbId && (m.mediaType || 'movie') === item.mediaType
      : (m.title || '').trim().toLowerCase() === item.title.trim().toLowerCase()
  );

/**
 * "Add to Watchlist" for something shared from an OTT app, shown right
 * where you are (no switch to the Movies screen), saved straight into the
 * Movies list.
 */
export default function OttShareHost() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useAppShare();
  const [share, setShare] = useState(null);
  const [apiKey, setApiKey] = useState(null);
  // A confirmation left before the quick restart that follows a share.
  const [toast, setToast] = useState(() => afterShareNote()?.message || null);
  const added = useRef(null);
  const movies = useRef([]);
  // The sheet waits while the app is locked.
  const [locked, setLocked] = useState(isAppLocked());
  useEffect(() => subscribeAppLock(setLocked), []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    AsyncStorage.getItem(TMDB_KEY_STORAGE)
      .then((k) => setApiKey(k || null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!hasShareIntent || shareTarget(shareIntent) !== '/movies') return;
    const shared = sharedText(shareIntent);
    trace('host: got the OTT share');
    Promise.resolve().then(async () => {
      try {
        movies.current = await readLocal(MOVIES_KEY).catch(() => []);
        setShare(shared);
        trace('host: sheet requested');
      } finally {
        resetShareIntent();
      }
    });
    // Runs once per share.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasShareIntent]);

  const onAdd = async (movie) => {
    const list = await readLocal(MOVIES_KEY).catch(() => movies.current);
    const next = [movie, ...list];
    movies.current = next;
    notifyLocal(MOVIES_KEY, next);
    saveAndPush('movies', MOVIES_KEY, next).catch(() => {});
    trace(`host: added "${movie.title}"`);
    added.current = `Added “${movie.title}” to your Watchlist`;
    setToast(added.current);
  };

  // Done with the share. Only if Android recreated the app's window while it
  // ran (screens would then open blank) does it restart the screens.
  const close = () => {
    setShare(null);
    const message = added.current;
    added.current = null;
    const creates = activityCreates();
    trace(`host: sheet closed (window created ${creates}× since start ${CREATES_AT_START})`);
    if (creates > CREATES_AT_START) setTimeout(() => restartAfterShare(message), 350);
  };

  return (
    <>
      <ShareToWatchlist
        share={locked ? null : share}
        apiKey={apiKey}
        mapPlatform={listPlatform}
        isInList={(item) => inList(movies.current, item)}
        onAdd={onAdd}
        onClose={close}
      />
      {toast ? (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  toast: { position: 'absolute', left: 20, right: 20, bottom: 40, backgroundColor: 'rgba(20,28,45,0.95)', borderRadius: 14, padding: 14, zIndex: 2000 },
  toastText: { color: '#FFF', fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
