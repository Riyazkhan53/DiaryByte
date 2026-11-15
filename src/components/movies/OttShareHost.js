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
  const [toast, setToast] = useState(null);
  const movies = useRef([]);

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
    setToast(`Added “${movie.title}” to your Watchlist`);
    setTimeout(() => setToast(null), 2600);
  };

  return (
    <>
      <ShareToWatchlist
        share={share}
        apiKey={apiKey}
        mapPlatform={listPlatform}
        isInList={(item) => inList(movies.current, item)}
        onAdd={onAdd}
        onClose={() => setShare(null)}
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
