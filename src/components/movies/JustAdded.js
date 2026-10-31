import { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../hooks/useTheme';
import { confirmAction } from '../../utils/confirm';
import {
  DEFAULT_BASE_URL,
  SA_KEY_STORAGE,
  SA_SIGNUP_URL,
  checkHost,
  getBaseUrl,
  normalizeBaseUrl,
  setSessionBaseUrl,
  fetchJustAdded,
  fetchTamilDubbed,
  fetchTamilLatest,
} from '../../services/streamingAvailability';

const CACHE_KEY = '@diarybyte_sa_cache';
const CACHE_MS = 6 * 60 * 60 * 1000; // the free plan's daily requests are few

const FEEDS = [
  { key: 'latest', label: 'Latest on OTT', load: fetchJustAdded },
  { key: 'tamil', label: 'Tamil', load: fetchTamilLatest },
  { key: 'dubbed', label: 'Tamil dubbed', load: fetchTamilDubbed },
];
const TYPES = [
  { key: 'movie', label: 'Movies', icon: 'film-outline' },
  { key: 'series', label: 'Series', icon: 'tv-outline' },
];

async function readCache() {
  try {
    return JSON.parse((await AsyncStorage.getItem(CACHE_KEY)) || '{}');
  } catch (_error) {
    return {};
  }
}

const getInitials = (title) =>
  (title || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] || '')
    .join('')
    .toUpperCase();

/**
 * "Just added" tab of the watch list: newest titles on Indian OTTs from the
 * Streaming Availability API, with Tamil and Tamil-dubbed feeds. Needs the
 * user's own RapidAPI key, which can be changed or removed here.
 * `isAdded(item)` and `onAdd(item)` connect it to My List.
 */
export default function JustAdded({ cardWidth, isAdded, onAdd }) {
  const { theme } = useTheme();
  const [apiKey, setApiKey] = useState(null);
  const [keyReady, setKeyReady] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [feed, setFeed] = useState('latest');
  const [showType, setShowType] = useState('movie');
  const [service, setService] = useState('all');
  const [result, setResult] = useState({ items: [], nextCursor: null, at: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestRef = useRef(0);
  // Trying another host: for this session only, never saved.
  const [host, setHost] = useState(getBaseUrl());
  const [hostOpen, setHostOpen] = useState(false);
  const [hostInput, setHostInput] = useState(getBaseUrl());
  const [hostCheck, setHostCheck] = useState(null); // { state: 'checking' | 'ok' | 'fail', text }
  const customHost = host !== DEFAULT_BASE_URL;

  useEffect(() => {
    AsyncStorage.getItem(SA_KEY_STORAGE)
      .then((key) => key && setApiKey(key))
      .catch(() => {})
      .finally(() => setKeyReady(true));
  }, []);

  // Load a feed: from the cache when fresh, else from the API.
  const load = async ({ force = false, more = false } = {}) => {
    if (!apiKey) return;
    const id = ++requestRef.current;
    const cacheId = `${feed}:${showType}`;
    setLoading(true);
    setError(null);
    try {
      // Only the default host's results are cached.
      const cache = customHost ? {} : await readCache();
      const hit = cache[cacheId];
      if (!force && !more && hit && Date.now() - hit.at < CACHE_MS) {
        if (requestRef.current === id) setResult(hit);
        return;
      }
      const { load: fetchFeed } = FEEDS.find((f) => f.key === feed);
      const page = await fetchFeed(apiKey, { showType, cursor: more ? result.nextCursor : undefined });
      if (requestRef.current !== id) return;
      const seen = new Set(more ? result.items.map((i) => i.key) : []);
      const next = {
        items: [...(more ? result.items : []), ...page.items.filter((i) => !seen.has(i.key))],
        nextCursor: page.nextCursor,
        at: Date.now(),
      };
      setResult(next);
      if (!customHost) {
        AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ ...cache, [cacheId]: next })).catch(() => {});
      }
    } catch (e) {
      if (requestRef.current !== id) return;
      setError(e.message);
      if (e.status === 401 || e.status === 403) setResult({ items: [], nextCursor: null, at: null });
    } finally {
      if (requestRef.current === id) setLoading(false);
    }
  };
  // The latest load, for the effect below (which must not rerun on every render).
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    if (apiKey) loadRef.current();
  }, [apiKey, feed, showType, host]);

  const checkTypedHost = async () => {
    const url = normalizeBaseUrl(hostInput);
    if (!url) {
      setHostCheck({ state: 'fail', text: 'Enter a host, e.g. streaming-availability.p.rapidapi.com' });
      return;
    }
    setHostCheck({ state: 'checking', text: `Checking ${url}…` });
    const r = await checkHost(apiKey, url);
    setHostCheck(
      r.ok
        ? { state: 'ok', url, text: `Works: ${r.services.length} services in India (${r.services.slice(0, 4).join(', ')}${r.services.length > 4 ? '…' : ''}).` }
        : { state: 'fail', text: r.message }
    );
  };

  const applyHost = (url) => {
    setSessionBaseUrl(url);
    setHost(getBaseUrl());
    setHostInput(getBaseUrl());
    setHostCheck(null);
    setResult({ items: [], nextCursor: null, at: null });
  };

  const saveKey = async () => {
    const key = keyInput.trim();
    if (!key) return;
    await AsyncStorage.setItem(SA_KEY_STORAGE, key).catch(() => {});
    await AsyncStorage.removeItem(CACHE_KEY).catch(() => {});
    setKeyInput('');
    setError(null);
    setApiKey(key);
  };

  const changeKey = () =>
    confirmAction('Change API key', 'Remove the Streaming Availability key and enter a new one?', 'Change', () => {
      AsyncStorage.multiRemove([SA_KEY_STORAGE, CACHE_KEY]).catch(() => {});
      requestRef.current += 1;
      setApiKey(null);
      setResult({ items: [], nextCursor: null, at: null });
      setError(null);
      setLoading(false);
    });

  const pickFeed = (key) => {
    setService('all');
    setResult({ items: [], nextCursor: null, at: null });
    setFeed(key);
  };
  const pickType = (key) => {
    setService('all');
    setResult({ items: [], nextCursor: null, at: null });
    setShowType(key);
  };

  if (!keyReady) return null;

  if (!apiKey) {
    return (
      <ScrollView contentContainerStyle={styles.list}>
        <View style={[styles.setupCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name="key-outline" size={32} color={theme.primary} />
          <Text style={[styles.setupTitle, { color: theme.text }]}>Connect Streaming Availability</Text>
          <Text style={[styles.setupText, { color: theme.textSecondary }]}>
            Shows what was just added to Netflix, Prime Video, JioHotstar, Zee5, SonyLIV and more in India, with the
            audio languages of each stream, so Tamil and Tamil-dubbed titles can be picked out. Sign up on RapidAPI,
            subscribe to the free Basic plan, then paste your RapidAPI key here.
          </Text>
          <TouchableOpacity
            style={[styles.linkBtn, { backgroundColor: theme.surfaceAlt }]}
            onPress={() => Linking.openURL(SA_SIGNUP_URL)}
          >
            <Ionicons name="open-outline" size={14} color={theme.text} style={styles.iconGap} />
            <Text style={[styles.linkBtnText, { color: theme.text }]}>Get a free key on RapidAPI</Text>
          </TouchableOpacity>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <TextInput
            style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
            placeholder="Paste your RapidAPI key..."
            placeholderTextColor={theme.textMuted}
            value={keyInput}
            onChangeText={setKeyInput}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="RapidAPI key"
          />
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: theme.secondary }]}
            onPress={saveKey}
            disabled={!keyInput.trim()}
          >
            <Text style={styles.saveText}>Connect</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  const services = [...new Set(result.items.flatMap((i) => i.services))];
  const shown = service === 'all' ? result.items : result.items.filter((i) => i.services.includes(service));

  const renderCard = ({ item }) => {
    const added = isAdded(item);
    return (
      <View
        style={[
          styles.card,
          { width: cardWidth, backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow },
        ]}
      >
        <TouchableOpacity
          onPress={() => item.link && Linking.openURL(item.link)}
          disabled={!item.link}
          accessibilityLabel={`Open ${item.title} on ${item.services[0] || 'OTT'}`}
        >
          {item.posterUri ? (
            <Image source={{ uri: item.posterUri }} style={styles.poster} />
          ) : (
            <View style={[styles.poster, styles.posterFallback, { backgroundColor: theme.primary }]}>
              <Text style={[styles.initials, { color: theme.onPrimary }]}>{getInitials(item.title)}</Text>
            </View>
          )}
          {item.tamilAudio ? (
            <View style={[styles.badge, { backgroundColor: item.dubbed ? '#AF52DE' : '#FF9500' }]}>
              <Text style={styles.badgeText}>{item.dubbed ? 'Tamil dub' : 'Tamil'}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
        <View style={styles.cardBody}>
          <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[styles.cardSub, { color: theme.textSecondary }]} numberOfLines={1}>
            {item.services.slice(0, 2).join(', ') || 'OTT'}
          </Text>
          <View style={styles.cardMetaRow}>
            <View style={styles.cardRating}>
              <Ionicons name="star" size={12} color="#FFCC80" />
              <Text style={[styles.cardRatingText, { color: theme.textSecondary }]}>
                {item.rating ? item.rating.toFixed(1) : '—'}
                {item.year ? ` · ${item.year}` : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: added ? '#34C759' : theme.secondary }]}
              onPress={() => onAdd(item)}
              disabled={added}
              accessibilityLabel={added ? `${item.title} is in your list` : `Add ${item.title} to watch list`}
            >
              <Ionicons name={added ? 'checkmark' : 'add'} size={18} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.flex}>
      <View style={[styles.typeBar, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral }]}>
        {TYPES.map((t) => {
          const on = showType === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.typeBtn, on && { backgroundColor: theme.primary }]}
              onPress={() => pickType(t.key)}
            >
              <Ionicons name={t.icon} size={15} color={on ? theme.onPrimary : theme.text} style={styles.iconGap} />
              <Text style={[styles.typeBtnText, { color: on ? theme.onPrimary : theme.text }]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.chipRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {FEEDS.map((f) => {
            const on = feed === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[
                  styles.chip,
                  { backgroundColor: on ? theme.accent : theme.surface, borderColor: on ? theme.accent : theme.borderNeutral },
                ]}
                onPress={() => pickFeed(f.key)}
              >
                <Text style={[styles.chipText, { color: theme.text }]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <TouchableOpacity style={styles.iconBtn} onPress={() => load({ force: true })} accessibilityLabel="Refresh">
          <Ionicons name="refresh" size={18} color={theme.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => setHostOpen((o) => !o)}
          accessibilityLabel="Try another host"
        >
          <Ionicons name="server-outline" size={18} color={customHost ? theme.accent : theme.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={changeKey} accessibilityLabel="Change Streaming Availability key">
          <Ionicons name="key-outline" size={18} color={theme.textMuted} />
        </TouchableOpacity>
      </View>

      {hostOpen ? (
        <View style={[styles.hostPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.hostLabel, { color: theme.textSecondary }]}>
            Host in use: <Text style={styles.bold}>{host}</Text>
            {customHost ? ' (this session only)' : ' (default)'}
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
            value={hostInput}
            onChangeText={(v) => {
              setHostInput(v);
              setHostCheck(null);
            }}
            placeholder={DEFAULT_BASE_URL}
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            accessibilityLabel="Host to try"
          />
          {hostCheck ? (
            <Text
              style={[
                styles.hostResult,
                { color: hostCheck.state === 'ok' ? '#34C759' : hostCheck.state === 'fail' ? '#FF3B30' : theme.textMuted },
              ]}
            >
              {hostCheck.text}
            </Text>
          ) : null}
          <View style={styles.hostActions}>
            <TouchableOpacity
              style={[styles.hostBtn, { borderColor: theme.primary }]}
              onPress={checkTypedHost}
              disabled={hostCheck?.state === 'checking'}
            >
              <Text style={[styles.hostBtnText, { color: theme.primary }]}>Check</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.hostBtn, { borderColor: theme.secondary, opacity: hostCheck?.state === 'ok' ? 1 : 0.4 }]}
              onPress={() => applyHost(hostCheck.url)}
              disabled={hostCheck?.state !== 'ok'}
            >
              <Text style={[styles.hostBtnText, { color: theme.secondary }]}>Use for now</Text>
            </TouchableOpacity>
            {customHost ? (
              <TouchableOpacity style={[styles.hostBtn, { borderColor: theme.borderNeutral }]} onPress={() => applyHost(null)}>
                <Text style={[styles.hostBtnText, { color: theme.text }]}>Reset to default</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <Text style={[styles.hostNote, { color: theme.textMuted }]}>
            Not saved: the app goes back to the default host when it restarts. Check uses your key and one request.
          </Text>
        </View>
      ) : null}

      {services.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.noShrink}
          contentContainerStyle={styles.chips}
        >
          {['all', ...services].map((s) => {
            const on = service === s;
            return (
              <TouchableOpacity
                key={s}
                style={[
                  styles.chip,
                  { backgroundColor: on ? theme.secondary : theme.surface, borderColor: on ? theme.secondary : theme.borderNeutral },
                ]}
                onPress={() => setService(s)}
              >
                <Text style={[styles.chipText, { color: theme.text }]}>{s === 'all' ? 'All OTTs' : s}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}

      {error && !result.items.length ? (
        <View style={styles.empty}>
          <Ionicons name="cloud-offline-outline" size={48} color={theme.danger} />
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>{error}</Text>
          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: theme.primary }]} onPress={() => load({ force: true })}>
            <Text style={styles.saveText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(item) => item.key}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            loading ? (
              <View style={styles.empty}>
                <ActivityIndicator size="large" color={theme.primary} />
              </View>
            ) : (
              <View style={styles.empty}>
                <Ionicons name="film-outline" size={56} color={theme.textMuted} />
                <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                  {feed === 'dubbed'
                    ? 'No Tamil-dubbed titles among the latest additions. Tap Load more to look further back.'
                    : 'Nothing here yet.'}
                </Text>
              </View>
            )
          }
          ListFooterComponent={
            <View style={styles.footer}>
              {error && result.items.length ? <Text style={styles.errorText}>{error}</Text> : null}
              {result.nextCursor ? (
                <TouchableOpacity
                  style={[styles.moreBtn, { borderColor: theme.primary }]}
                  onPress={() => load({ more: true })}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                  ) : (
                    <Text style={[styles.moreText, { color: theme.primary }]}>Load more</Text>
                  )}
                </TouchableOpacity>
              ) : null}
              <Text style={[styles.credit, { color: theme.textMuted }]}>
                Streaming data by Streaming Availability API (Movie of the Night)
                {result.at ? ` · updated ${new Date(result.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : ''}
                . Tamil dub = a Tamil audio track on a non-Tamil title. Tap a poster to open it.
              </Text>
            </View>
          }
          renderItem={renderCard}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  noShrink: { flexGrow: 0, flexShrink: 0 },
  bold: { fontWeight: '700' },
  hostPanel: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8, marginBottom: 10 },
  hostLabel: { fontSize: 12 },
  hostResult: { fontSize: 12, lineHeight: 17 },
  hostActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hostBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  hostBtnText: { fontSize: 13, fontWeight: '600' },
  hostNote: { fontSize: 11, lineHeight: 15 },
  iconGap: { marginRight: 6 },
  list: { paddingBottom: 100 },
  setupCard: { borderRadius: 18, borderWidth: 1, padding: 20, alignItems: 'center', gap: 10 },
  setupTitle: { fontSize: 18, fontWeight: '700' },
  setupText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  linkBtnText: { fontSize: 13, fontWeight: '600' },
  input: { alignSelf: 'stretch', borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 15 },
  saveBtn: { alignSelf: 'stretch', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  saveText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  errorText: { color: '#FF3B30', fontSize: 13, textAlign: 'center' },
  typeBar: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 3, marginBottom: 10 },
  typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 10 },
  typeBtnText: { fontSize: 14, fontWeight: '600' },
  chipRow: { flexDirection: 'row', alignItems: 'center' },
  chips: { gap: 8, paddingBottom: 10 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 13, fontWeight: '600' },
  iconBtn: { padding: 6, marginBottom: 10 },
  gridRow: { gap: 12, marginBottom: 12 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  poster: { width: '100%', aspectRatio: 2 / 3, backgroundColor: '#EEE' },
  posterFallback: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 28, fontWeight: '800' },
  badge: { position: 'absolute', top: 8, left: 8, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  badgeText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  cardBody: { padding: 10 },
  cardTitle: { fontSize: 14, fontWeight: '600' },
  cardSub: { fontSize: 12, marginTop: 2 },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  cardRating: { flexDirection: 'row', alignItems: 'center', gap: 3, flex: 1 },
  cardRatingText: { fontSize: 12 },
  addBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyText: { fontSize: 14, textAlign: 'center', paddingHorizontal: 20 },
  footer: { gap: 10, paddingTop: 4 },
  moreBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  moreText: { fontSize: 14, fontWeight: '600' },
  credit: { fontSize: 11, textAlign: 'center', lineHeight: 16 },
});
