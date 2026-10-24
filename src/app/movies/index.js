import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  Modal,
  Alert,
  Image,
  ScrollView,
  ActivityIndicator,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Header from '../../components/Header';
import SyncRow from '../../components/SyncRow';
import { useTheme } from '../../hooks/useTheme';
import { useSyncedCollection } from '../../hooks/useSyncedCollection';
import {
  TMDB_KEY_STORAGE,
  fetchProviders,
  fetchOTTTitles,
  posterUrl,
} from '../../services/tmdb';

const STORAGE_KEY = '@diarybyte_movies';

const STATUSES = [
  { key: 'watchlist', label: 'Watchlist', icon: 'time-outline', color: '#32ADE6' },
  { key: 'watching', label: 'Watching', icon: 'play-outline', color: '#FF9500' },
  { key: 'watched', label: 'Watched', icon: 'checkmark-circle-outline', color: '#34C759' },
];

const MEDIA_TYPES = [
  { key: 'movie', label: 'Movies', icon: 'film-outline' },
  { key: 'tv', label: 'Series', icon: 'tv-outline' },
];

const LANGUAGES = [
  { code: '', label: 'All' },
  { code: 'ta', label: 'Tamil' },
  { code: 'hi', label: 'Hindi' },
  { code: 'te', label: 'Telugu' },
  { code: 'en', label: 'English' },
  { code: 'ml', label: 'Malayalam' },
  { code: 'kn', label: 'Kannada' },
  { code: 'bn', label: 'Bengali' },
  { code: 'mr', label: 'Marathi' },
];

const TITLE_TYPES = ['Movie', 'Series', 'Short Film'];

const PLATFORMS = [
  'Netflix',
  'Prime',
  'Hotstar',
  'Zee5',
  'Sony LIV',
  'Sun Nxt',
  'Aaha',
  'Tentkotta',
  'Youtube',
  'Other',
];

const KNOWN_PLATFORM_KEYS = PLATFORMS.filter((p) => p !== 'Other').map((p) =>
  p.toLowerCase()
);

const TMDB_API_URL = 'https://www.themoviedb.org/settings/api';

const makeId = () =>
  `${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`;

const getInitials = (title) =>
  (title || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => (word ? word[0] : ''))
    .join('')
    .toUpperCase();

const getTypeLabel = (item) =>
  item.type || (item.mediaType === 'tv' ? 'Series' : 'Movie');

const getTypeColor = (label, theme) => {
  if (label === 'Series') return theme.secondary;
  if (label === 'Short Film') return theme.accent;
  return theme.primary;
};

export default function MoviesScreen() {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const { items: movies, synced, persist, pulling, pullInfo, pullNow } = useSyncedCollection(
    'movies',
    STORAGE_KEY
  );
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [platformChoice, setPlatformChoice] = useState('');
  const [platform, setPlatform] = useState('');
  const [platformMenuOpen, setPlatformMenuOpen] = useState(false);
  const [manualType, setManualType] = useState('Movie');
  const [status, setStatus] = useState('watchlist');
  const [filter, setFilter] = useState('watchlist');
  const [typeFilter, setTypeFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  // TMDB / OTT state
  const [tab, setTab] = useState('mylist');
  const [apiKey, setApiKey] = useState(null);
  const [keyInput, setKeyInput] = useState('');
  const [keyError, setKeyError] = useState(null);
  const [providers, setProviders] = useState([]);
  const [selectedProviders, setSelectedProviders] = useState([]);
  const [mediaType, setMediaType] = useState('movie');
  const [language, setLanguage] = useState('');
  const [ottMovies, setOttMovies] = useState([]);
  const [ottLoading, setOttLoading] = useState(false);
  const [ottError, setOttError] = useState(null);

  const languageRef = useRef(language);

  const cardWidth = (width - 32 - 12) / 2;

  useEffect(() => {
    const initialize = async () => {
      try {
        const storedKey = await AsyncStorage.getItem(TMDB_KEY_STORAGE);
        if (storedKey) setApiKey(storedKey);
      } catch (error) {
        console.error('Failed to load TMDB key', error);
      }
    };
    initialize();
  }, []);

  const ottRequestIdRef = useRef(0);

  const loadOttMovies = useCallback(async (key, providerIds, type, lang) => {
    const requestId = ++ottRequestIdRef.current;
    setOttLoading(true);
    setOttError(null);
    try {
      const list = await fetchOTTTitles(key, providerIds, type, lang);
      if (ottRequestIdRef.current !== requestId) return;
      setOttMovies(list);
    } catch (error) {
      if (ottRequestIdRef.current !== requestId) return;
      setOttError(error.message);
    } finally {
      if (ottRequestIdRef.current === requestId) setOttLoading(false);
    }
  }, []);

  // Load streaming providers (per media type) once we have a key
  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    fetchProviders(apiKey, mediaType)
      .then((list) => {
        if (cancelled) return;
        setProviders(list);
        const initialIds = list.slice(0, 3).map((p) => p.id);
        setSelectedProviders(initialIds);
        if (initialIds.length > 0) {
          loadOttMovies(apiKey, initialIds, mediaType, languageRef.current);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        if (error.status === 401) {
          setKeyError(error.message);
          setApiKey(null);
          AsyncStorage.removeItem(TMDB_KEY_STORAGE).catch(() => {});
        } else {
          setOttError(error.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey, mediaType, loadOttMovies]);

  const addMovie = () => {
    if (!title.trim()) return;
    const resolvedPlatform =
      platformChoice === 'Other'
        ? platform.trim() || 'Other'
        : platformChoice;
    const movie = {
      id: makeId(),
      title: title.trim(),
      platform: resolvedPlatform,
      type: manualType,
      status,
      addedAt: new Date().toISOString(),
    };
    persist([movie, ...movies]);
    setTitle('');
    setPlatformChoice('');
    setPlatform('');
    setPlatformMenuOpen(false);
    setManualType('Movie');
    setStatus('watchlist');
    setModalVisible(false);
  };

  const addFromTMDB = (movie) => {
    if (
      movies.some((m) => m.tmdbId === movie.tmdbId && (m.mediaType || 'movie') === movie.mediaType)
    ) {
      return;
    }
    const platformNames = providers
      .filter((p) => selectedProviders.includes(p.id))
      .map((p) => p.name)
      .join(', ');
    persist([
      {
        id: makeId(),
        title: movie.title,
        platform: platformNames,
        type: movie.mediaType === 'tv' ? 'Series' : 'Movie',
        status: 'watchlist',
        addedAt: new Date().toISOString(),
        tmdbId: movie.tmdbId,
        mediaType: movie.mediaType,
        posterPath: movie.posterPath,
        rating: movie.rating,
        releaseDate: movie.releaseDate,
      },
      ...movies,
    ]);
  };

  const cycleStatus = (movie) => {
    const order = ['watchlist', 'watching', 'watched'];
    const next = order[(order.indexOf(movie.status) + 1) % order.length];
    persist(movies.map((m) => (m.id === movie.id ? { ...m, status: next } : m)));
  };

  const deleteMovie = (id) => {
    Alert.alert('Delete Movie', 'Remove this from your list?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => persist(movies.filter((m) => m.id !== id)),
      },
    ]);
  };

  const saveApiKey = async () => {
    const key = keyInput.trim();
    if (!key) return;
    try {
      await AsyncStorage.setItem(TMDB_KEY_STORAGE, key);
      setKeyInput('');
      setKeyError(null);
      setApiKey(key);
    } catch (error) {
      console.error('Failed to save TMDB key', error);
    }
  };

  const clearApiKey = () => {
    Alert.alert('Change API key', 'Disconnect TMDB and enter a new API key?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Change',
        style: 'destructive',
        onPress: () => {
          AsyncStorage.removeItem(TMDB_KEY_STORAGE).catch(() => {});
          setApiKey(null);
          setProviders([]);
          setSelectedProviders([]);
          setOttMovies([]);
        },
      },
    ]);
  };

  const toggleProvider = (id) => {
    const next = selectedProviders.includes(id)
      ? selectedProviders.filter((p) => p !== id)
      : [...selectedProviders, id];
    setSelectedProviders(next);
    if (apiKey && next.length > 0) {
      loadOttMovies(apiKey, next, mediaType, language);
    }
  };

  const changeLanguage = (code) => {
    setLanguage(code);
    languageRef.current = code;
    if (apiKey && selectedProviders.length > 0) {
      loadOttMovies(apiKey, selectedProviders, mediaType, code);
    }
  };

  const matchesPlatform = (m) => {
    if (platformFilter === 'all') return true;
    const p = (m.platform || '').toLowerCase();
    if (platformFilter === 'Other') {
      return !KNOWN_PLATFORM_KEYS.some((k) => p.includes(k));
    }
    return p.includes(platformFilter.toLowerCase());
  };

  const filtersActive = typeFilter !== 'all' || platformFilter !== 'all';

  const clearFilters = () => {
    setTypeFilter('all');
    setPlatformFilter('all');
  };

  const visible = movies
    .filter((m) => (filter === 'all' ? true : m.status === filter))
    .filter((m) => (typeFilter === 'all' ? true : getTypeLabel(m) === typeFilter))
    .filter(matchesPlatform);

  const statusMeta = (key) => STATUSES.find((s) => s.key === key);

  const statusCounts = useMemo(() => {
    const counts = { watchlist: 0, watching: 0, watched: 0 };
    movies.forEach((m) => {
      if (counts[m.status] !== undefined) counts[m.status] += 1;
    });
    return counts;
  }, [movies]);

  const renderMovieRow = ({ item }) => {
    const meta = statusMeta(item.status);
    const thumb = posterUrl(item.posterPath, 'w92');
    const typeLabel = getTypeLabel(item);
    const typeColor = getTypeColor(typeLabel, theme);
    const infoParts = [typeLabel];
    if (item.platform) infoParts.push(item.platform);
    if (item.releaseDate) infoParts.push(item.releaseDate.slice(0, 4));
    return (
      <View
        style={[
          styles.row,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            shadowColor: theme.shadow,
          },
        ]}
      >
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.rowThumb} />
        ) : (
          <View style={[styles.rowThumb, styles.initialsBox, { backgroundColor: typeColor }]}>
            <Text style={[styles.initialsText, { color: theme.text }]}>
              {getInitials(item.title)}
            </Text>
          </View>
        )}
        <TouchableOpacity style={styles.statusBtn} onPress={() => cycleStatus(item)}>
          <Ionicons name={meta.icon} size={26} color={meta.color} />
        </TouchableOpacity>
        <View style={styles.rowBody}>
          <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[styles.rowInfo, { color: theme.textSecondary }]} numberOfLines={1}>
            {infoParts.join('  ·  ')}
          </Text>
          <Text style={[styles.rowSub, { color: meta.color }]}>
            {meta.label}
            {item.rating ? `  ·  ★ ${item.rating.toFixed(1)}` : ''}
          </Text>
        </View>
        <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteMovie(item.id)}>
          <Ionicons name="trash-outline" size={20} color={theme.danger} />
        </TouchableOpacity>
      </View>
    );
  };

  const renderOttCard = ({ item }) => {
    const added = movies.some(
      (m) => m.tmdbId === item.tmdbId && (m.mediaType || 'movie') === item.mediaType
    );
    const poster = posterUrl(item.posterPath);
    const year = item.releaseDate ? item.releaseDate.slice(0, 4) : '';
    return (
      <View
        style={[
          styles.card,
          {
            width: cardWidth,
            backgroundColor: theme.surface,
            borderColor: theme.border,
            shadowColor: theme.shadow,
          },
        ]}
      >
        {poster ? (
          <Image source={{ uri: poster }} style={styles.cardPoster} />
        ) : (
          <View
            style={[
              styles.cardPosterFallback,
              { backgroundColor: getTypeColor(getTypeLabel(item), theme) },
            ]}
          >
            <Text style={[styles.cardInitialsText, { color: theme.text }]}>
              {getInitials(item.title)}
            </Text>
          </View>
        )}
        <View style={styles.cardBody}>
          <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
            {item.title}
          </Text>
          <View style={styles.cardMetaRow}>
            <View style={styles.cardRating}>
              <Ionicons name="star" size={12} color="#FFCC80" />
              <Text style={[styles.cardRatingText, { color: theme.textSecondary }]}>
                {item.rating ? item.rating.toFixed(1) : '—'}
              </Text>
              {year ? (
                <Text style={[styles.cardYear, { color: theme.textMuted }]}> · {year}</Text>
              ) : null}
            </View>
            <TouchableOpacity
              style={[
                styles.cardAddBtn,
                { backgroundColor: added ? '#34C759' : theme.secondary },
              ]}
              onPress={() => addFromTMDB(item)}
              disabled={added}
            >
              <Ionicons name={added ? 'check' : 'add'} size={18} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
      <Header
        title="Movies Watch List"
        subtitle={`What's next to watch · ${movies.length} ${movies.length === 1 ? 'title' : 'titles'}`}
      />

      <View style={styles.content}>
        <View
          style={[
            styles.tabBar,
            { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.tabBtn,
              tab === 'mylist' && { backgroundColor: theme.primary },
            ]}
            onPress={() => setTab('mylist')}
          >
            <Ionicons
              name="list-outline"
              size={16}
              color={tab === 'mylist' ? theme.onPrimary : theme.text}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabBtnText, { color: tab === 'mylist' ? theme.onPrimary : theme.text }]}>My List</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'ott' && { backgroundColor: theme.secondary }]}
            onPress={() => setTab('ott')}
          >
            <Ionicons
              name="sparkles-outline"
              size={16}
              color={tab === 'ott' ? theme.onPrimary : theme.text}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabBtnText, { color: tab === 'ott' ? theme.onPrimary : theme.text }]}>New on OTT</Text>
          </TouchableOpacity>
        </View>

        {tab === 'mylist' ? (
          <>
            <SyncRow synced={synced} pulling={pulling} pullInfo={pullInfo} onPull={pullNow} />

            <View style={styles.filters}>
              <TouchableOpacity
                style={[
                  styles.chip,
                  {
                    backgroundColor: filter === 'all' ? theme.primary : theme.surface,
                    borderColor: filter === 'all' ? theme.primaryDark : theme.borderNeutral,
                  },
                ]}
                onPress={() => setFilter('all')}
              >
                <Text style={[styles.chipText, { color: theme.text }]}>
                  All ({movies.length})
                </Text>
              </TouchableOpacity>
              {STATUSES.map((s) => (
                <TouchableOpacity
                  key={s.key}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: filter === s.key ? s.color : theme.surface,
                      borderColor: filter === s.key ? s.color : theme.borderNeutral,
                    },
                  ]}
                  onPress={() => setFilter(s.key)}
                >
                  <Text style={[styles.chipText, { color: theme.text }]}>
                    {s.label} ({statusCounts[s.key]})
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[
                  styles.chip,
                  styles.filterBtn,
                  {
                    backgroundColor: filtersActive ? theme.accent : theme.surface,
                    borderColor: filtersActive ? theme.accent : theme.borderNeutral,
                  },
                ]}
                onPress={() => setFilterModalVisible(true)}
              >
                <Ionicons
                  name="options-outline"
                  size={14}
                  color={theme.text}
                  style={{ marginRight: 5 }}
                />
                <Text style={[styles.chipText, { color: theme.text }]}>Filter</Text>
              </TouchableOpacity>
            </View>

            {filtersActive ? (
              <View style={styles.activeFilters}>
                {typeFilter !== 'all' ? (
                  <TouchableOpacity
                    style={[styles.chip, styles.activeChip, { backgroundColor: theme.surfaceAlt, borderColor: theme.accent }]}
                    onPress={() => setTypeFilter('all')}
                  >
                    <Text style={[styles.activeChipText, { color: theme.text }]}>Type: {typeFilter}</Text>
                    <Ionicons name="close" size={13} color={theme.textSecondary} />
                  </TouchableOpacity>
                ) : null}
                {platformFilter !== 'all' ? (
                  <TouchableOpacity
                    style={[styles.chip, styles.activeChip, { backgroundColor: theme.surfaceAlt, borderColor: theme.accent }]}
                    onPress={() => setPlatformFilter('all')}
                  >
                    <Text style={[styles.activeChipText, { color: theme.text }]}>OTT: {platformFilter}</Text>
                    <Ionicons name="close" size={13} color={theme.textSecondary} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            <FlatList
              data={visible}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Ionicons name="film-outline" size={56} color={theme.textMuted} />
                  <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                    {movies.length === 0
                      ? 'No movies yet. Tap + to add one!'
                      : `Nothing in ${statusMeta(filter)?.label || 'this filter'} yet.`}
                  </Text>
                </View>
              }
              renderItem={renderMovieRow}
            />
          </>
        ) : (
          <>
            {!apiKey ? (
              <View
                style={[
                  styles.setupCard,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
              >
                <Ionicons name="key-outline" size={32} color={theme.primary} />
                <Text style={[styles.setupTitle, { color: theme.text }]}>
                  Connect TMDB
                </Text>
                <Text style={[styles.setupText, { color: theme.textSecondary }]}>
                  Link a free TMDB API key to browse movies streaming on Netflix, Prime
                  Video, JioHotstar and more in India.
                </Text>
                <TouchableOpacity
                  style={[styles.linkBtn, { backgroundColor: theme.surfaceAlt }]}
                  onPress={() => Linking.openURL(TMDB_API_URL)}
                >
                  <Ionicons
                    name="open-outline"
                    size={14}
                    color={theme.text}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.linkBtnText, { color: theme.text }]}>
                    Get a free key at themoviedb.org
                  </Text>
                </TouchableOpacity>
                {keyError ? (
                  <Text style={styles.keyErrorText}>{keyError}</Text>
                ) : null}
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.surfaceAlt,
                      borderColor: theme.borderNeutral,
                      color: theme.text,
                    },
                  ]}
                  placeholder="Paste your TMDB API key..."
                  placeholderTextColor={theme.textMuted}
                  value={keyInput}
                  onChangeText={setKeyInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: theme.secondary }]}
                  onPress={saveApiKey}
                  disabled={!keyInput.trim()}
                >
                  <Text style={styles.saveText}>Connect</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View
                  style={[
                    styles.typeBar,
                    { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral },
                  ]}
                >
                  {MEDIA_TYPES.map((t) => (
                    <TouchableOpacity
                      key={t.key}
                      style={[
                        styles.typeBtn,
                        mediaType === t.key && { backgroundColor: theme.primary },
                      ]}
                      onPress={() => setMediaType(t.key)}
                    >
                      <Ionicons
                        name={t.icon}
                        size={15}
                        color={mediaType === t.key ? theme.onPrimary : theme.text}
                        style={{ marginRight: 6 }}
                      />
                      <Text style={[styles.typeBtnText, { color: mediaType === t.key ? theme.onPrimary : theme.text }]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.langScroll}>
                  <View style={styles.langChips}>
                    {LANGUAGES.map((l) => {
                      const selected = language === l.code;
                      return (
                        <TouchableOpacity
                          key={l.code || 'all'}
                          style={[
                            styles.chip,
                            styles.langChip,
                            {
                              backgroundColor: selected ? theme.accent : theme.surface,
                              borderColor: selected ? theme.accent : theme.borderNeutral,
                            },
                          ]}
                          onPress={() => changeLanguage(l.code)}
                        >
                          <Text style={[styles.chipText, { color: theme.text }]}>{l.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>

                <View style={styles.providerRow}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.providerChips}>
                      {providers.map((p) => {
                        const selected = selectedProviders.includes(p.id);
                        return (
                          <TouchableOpacity
                            key={p.id}
                            style={[
                              styles.chip,
                              {
                                backgroundColor: selected ? theme.secondary : theme.surface,
                                borderColor: selected ? theme.secondary : theme.borderNeutral,
                              },
                            ]}
                            onPress={() => toggleProvider(p.id)}
                          >
                            <Text style={[styles.chipText, { color: theme.text }]}>
                              {p.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                  <TouchableOpacity style={styles.keyBtn} onPress={clearApiKey}>
                    <Ionicons name="key-outline" size={18} color={theme.textMuted} />
                  </TouchableOpacity>
                </View>

                {ottLoading ? (
                  <View style={styles.empty}>
                    <ActivityIndicator size="large" color={theme.primary} />
                    <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                      Loading movies on OTT...
                    </Text>
                  </View>
                ) : ottError ? (
                  <View style={styles.empty}>
                    <Ionicons name="cloud-offline-outline" size={48} color={theme.danger} />
                    <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                      {ottError}
                    </Text>
                    <TouchableOpacity
                      style={[styles.retryBtn, { backgroundColor: theme.primary }]}
                      onPress={() => loadOttMovies(apiKey, selectedProviders, mediaType, language)}
                    >
                      <Text style={styles.saveText}>Retry</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <FlatList
                      data={selectedProviders.length > 0 ? ottMovies : []}
                      keyExtractor={(item) => `${item.mediaType}-${item.tmdbId}`}
                      numColumns={2}
                      columnWrapperStyle={styles.gridRow}
                      contentContainerStyle={styles.list}
                      showsVerticalScrollIndicator={false}
                      ListEmptyComponent={
                        <View style={styles.empty}>
                          <Ionicons name="film-outline" size={56} color={theme.textMuted} />
                          <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                            Pick at least one platform above to see movies.
                          </Text>
                        </View>
                      }
                      renderItem={renderOttCard}
                    />
                    <Text style={[styles.tmdbCredit, { color: theme.textMuted }]}>
                      Powered by The Movie Database (TMDB)
                    </Text>
                  </>
                )}
              </>
            )}
          </>
        )}
      </View>

      {tab === 'mylist' ? (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: theme.secondary, shadowColor: theme.secondary }]}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={32} color="#FFF" />
        </TouchableOpacity>
      ) : null}

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.sheet }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Add Title</Text>
            <TextInput
              style={[
                styles.input,
                styles.modalInput,
                {
                  backgroundColor: theme.surfaceAlt,
                  borderColor: theme.borderNeutral,
                  color: theme.text,
                },
              ]}
              placeholder="Movie title... (e.g. Annn Cffff)"
              placeholderTextColor={theme.textMuted}
              value={title}
              onChangeText={setTitle}
            />
            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>OTT Platform</Text>
            <TouchableOpacity
              style={[
                styles.platformSelect,
                { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral },
              ]}
              onPress={() => setPlatformMenuOpen((open) => !open)}
            >
              <Text style={[styles.platformSelectText, { color: platformChoice ? theme.text : theme.textMuted }]}>
                {platformChoice || 'Select OTT platform'}
              </Text>
              <Ionicons
                name={platformMenuOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={theme.textSecondary}
              />
            </TouchableOpacity>
            {platformMenuOpen ? (
              <View style={[styles.platformMenu, { backgroundColor: theme.surface, borderColor: theme.borderNeutral }]}>
                {PLATFORMS.map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.platformOption,
                      platformChoice === p && { backgroundColor: theme.primary + '33' },
                    ]}
                    onPress={() => {
                      setPlatformChoice(p);
                      setPlatformMenuOpen(false);
                    }}
                  >
                    <Text style={[styles.platformOptionText, { color: theme.text }]}>{p}</Text>
                    {platformChoice === p ? (
                      <Ionicons name="checkmark" size={17} color={theme.primaryDark} />
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            {platformChoice === 'Other' ? (
              <TextInput
                style={[
                  styles.input,
                  styles.modalInput,
                  styles.otherInput,
                  {
                    backgroundColor: theme.surfaceAlt,
                    borderColor: theme.borderNeutral,
                    color: theme.text,
                  },
                ]}
                placeholder="Enter platform name..."
                placeholderTextColor={theme.textMuted}
                value={platform}
                onChangeText={setPlatform}
                autoCapitalize="words"
              />
            ) : null}
            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Type</Text>
            <View style={styles.statusRow}>
              {TITLE_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.chip,
                    {
                      backgroundColor:
                        manualType === t ? getTypeColor(t, theme) : theme.surfaceAlt,
                      borderColor:
                        manualType === t ? getTypeColor(t, theme) : theme.borderNeutral,
                    },
                  ]}
                  onPress={() => setManualType(t)}
                >
                  <Text style={[styles.chipText, { color: theme.text }]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Status</Text>
            <View style={styles.statusRow}>
              {STATUSES.map((s) => (
                <TouchableOpacity
                  key={s.key}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: status === s.key ? s.color : theme.surfaceAlt,
                      borderColor: status === s.key ? s.color : theme.borderNeutral,
                    },
                  ]}
                  onPress={() => setStatus(s.key)}
                >
                  <Text style={[styles.chipText, { color: theme.text }]}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.cancelBtn, { backgroundColor: theme.surfaceAlt }]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: theme.primary }]}
                onPress={addMovie}
                disabled={!title.trim()}
              >
                <Text style={[styles.saveText, { color: theme.onPrimary }]}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={filterModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.sheet }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Filter Watch List</Text>

            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Type</Text>
            <View style={styles.statusRow}>
              {['all', ...TITLE_TYPES].map((t) => {
                const selected = typeFilter === t;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected ? theme.primary : theme.surfaceAlt,
                        borderColor: selected ? theme.primaryDark : theme.borderNeutral,
                      },
                    ]}
                    onPress={() => setTypeFilter(t)}
                  >
                    <Text style={[styles.chipText, { color: theme.text }]}>
                      {t === 'all' ? 'All' : t}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>OTT Platform</Text>
            <View style={styles.statusRow}>
              {['all', ...PLATFORMS].map((p) => {
                const selected = platformFilter === p;
                return (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected ? theme.secondary : theme.surfaceAlt,
                        borderColor: selected ? theme.secondary : theme.borderNeutral,
                      },
                    ]}
                    onPress={() => setPlatformFilter(p)}
                  >
                    <Text style={[styles.chipText, { color: theme.text }]}>
                      {p === 'all' ? 'All' : p}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.cancelBtn, { backgroundColor: theme.surfaceAlt }]}
                onPress={() => {
                  clearFilters();
                  setFilterModalVisible(false);
                }}
              >
                <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: theme.primary }]}
                onPress={() => setFilterModalVisible(false)}
              >
                <Text style={[styles.saveText, { color: theme.onPrimary }]}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  tabBar: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    marginBottom: 14,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 10,
  },
  tabBtnText: { fontSize: 14, fontWeight: '600' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  activeFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  activeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, paddingHorizontal: 10 },
  activeChipText: { fontSize: 12, fontWeight: '600' },
  platformSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  platformSelectText: { fontSize: 15 },
  platformMenu: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    overflow: 'hidden',
  },
  platformOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  platformOptionText: { fontSize: 14 },
  otherInput: { marginTop: 8, marginBottom: 0 },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  list: { paddingBottom: 90 },
  empty: { alignItems: 'center', marginTop: 80, paddingHorizontal: 40 },
  emptyText: { marginTop: 12, fontSize: 14, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  rowThumb: {
    width: 36,
    height: 54,
    borderRadius: 6,
    marginRight: 10,
    backgroundColor: '#EEE',
  },
  initialsBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: { fontSize: 16, fontWeight: 'bold' },
  rowInfo: { fontSize: 12, marginTop: 2 },
  statusBtn: { marginRight: 12 },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowSub: { fontSize: 12, marginTop: 2 },
  deleteBtn: { padding: 6 },
  providerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  providerChips: { flexDirection: 'row', gap: 8 },
  keyBtn: { padding: 8, marginLeft: 4 },
  typeBar: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
    marginBottom: 10,
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 9,
  },
  typeBtnText: { fontSize: 13, fontWeight: '600' },
  langScroll: { marginBottom: 10, flexGrow: 0 },
  langChips: { flexDirection: 'row', gap: 8 },
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
  cardPoster: { width: '100%', aspectRatio: 2 / 3, backgroundColor: '#EEE' },
  cardPosterFallback: {
    width: '100%',
    aspectRatio: 2 / 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInitialsText: { fontSize: 40, fontWeight: 'bold' },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  modalInput: { marginTop: 0, marginBottom: 10 },
  cardBody: { padding: 10 },
  cardTitle: { fontSize: 14, fontWeight: '600' },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  cardRating: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  cardRatingText: { fontSize: 12, marginLeft: 4, fontWeight: '600' },
  cardYear: { fontSize: 12 },
  cardAddBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setupCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 22,
    alignItems: 'center',
    marginTop: 20,
  },
  setupTitle: { fontSize: 19, fontWeight: 'bold', marginTop: 10 },
  setupText: { fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 19 },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginTop: 14,
  },
  linkBtnText: { fontSize: 13, fontWeight: '600' },
  keyErrorText: {
    color: '#FF3B30',
    fontSize: 13,
    marginTop: 10,
    textAlign: 'center',
  },
  retryBtn: { marginTop: 16, paddingVertical: 10, paddingHorizontal: 28, borderRadius: 12 },
  tmdbCredit: {
    textAlign: 'center',
    fontSize: 11,
    paddingBottom: 8,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 100,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modal: { borderRadius: 20, padding: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontSize: 16,
    marginBottom: 14,
    width: '100%',
    marginTop: 16,
  },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600' },
  saveBtn: {
    paddingVertical: 13,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveText: { fontSize: 15, fontWeight: '600', color: '#FFF' },
});
