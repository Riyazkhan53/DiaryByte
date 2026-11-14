import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { isGuest } from '../../services/session';
import { readOttWithAi } from '../../services/api';
import { posterUrl, searchTitles } from '../../services/tmdb';
import { smartRead, teach } from '../../services/smartFill';
import { ottPlatform, parseOttShare } from '../../utils/ottShare';

const VIA = {
  learned: { icon: 'flash', color: '#2DA44E', text: (p) => `Read by Smart fill, learned from your earlier ${p || 'OTT'} shares. No AI used.` },
  guess: { icon: 'bulb-outline', color: '#F59E0B', text: () => 'Best guess from the shared message. Check the title, or read it with AI.' },
  ai: { icon: 'sparkles', color: '#7C3AED', text: () => 'Read with AI. Smart fill learns from what you add.' },
};

/**
 * "Add to Watchlist" for something shared from an OTT app. Reads the title
 * with a learned format (Smart fill) or a best guess, finds it on TMDB when
 * a key is set, and offers AI only on request. What's finally added teaches
 * Smart fill, so the next share from that app is read by itself.
 *
 * share: { text, metaTitle } | null. onAdd(movie) adds it to the list;
 * mapPlatform(name) turns e.g. "Prime Video" into the list's own name.
 */
export default function ShareToWatchlist({ share, apiKey, onAdd, onClose, mapPlatform, isInList }) {
  const { theme } = useTheme();
  const [title, setTitle] = useState('');
  const [year, setYear] = useState('');
  const [type, setType] = useState('Movie');
  const [platform, setPlatform] = useState('');
  const [via, setVia] = useState(null);
  const [matches, setMatches] = useState([]);
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(null);
  const [problem, setProblem] = useState(null);
  const searchId = useRef(0);

  const search = useCallback(
    async (q, y = '') => {
      const id = ++searchId.current;
      setPicked(null);
      if (!apiKey || !q.trim()) {
        setMatches([]);
        return;
      }
      setBusy('Finding it on TMDB…');
      try {
        const found = await searchTitles(apiKey, q.trim(), y);
        if (searchId.current !== id) return;
        setMatches(found);
        // A clear first match is chosen for you.
        if (found[0] && found[0].title.toLowerCase() === q.trim().toLowerCase()) setPicked(found[0]);
      } catch (_error) {
        if (searchId.current === id) setMatches([]);
      } finally {
        if (searchId.current === id) setBusy(null);
      }
    },
    [apiKey]
  );

  // A new share: read it.
  useEffect(() => {
    if (!share) return undefined;
    let alive = true;
    Promise.resolve().then(async () => {
      setProblem(null);
      setMatches([]);
      setPicked(null);
      const text = share.text || '';
      const shared = ottPlatform(text) || ottPlatform(share.metaTitle || '');
      const learned = await smartRead('ott', text).catch(() => null);
      if (!alive) return;
      const guess = parseOttShare(text, { metaTitle: share.metaTitle || '' });
      const t = learned?.fields?.title || guess.title;
      setTitle(t);
      setYear(guess.year || '');
      setPlatform(learned?.fields?.platform || shared);
      setType(learned?.fields?.type || 'Movie');
      setVia(learned ? 'learned' : t ? 'guess' : null);
      if (t) search(t, guess.year);
    });
    return () => {
      alive = false;
    };
  }, [share, search]);

  const readWithAi = async () => {
    setProblem(null);
    setBusy('Reading it with AI…');
    try {
      const r = await readOttWithAi({ text: share.text, metaTitle: share.metaTitle });
      if (!r.found) {
        setProblem("The AI couldn't tell which title this is. Type it in.");
        return;
      }
      setTitle(r.title);
      setYear(r.year || '');
      if (r.type) setType(r.type === 'series' ? 'Series' : 'Movie');
      if (r.platform && !platform) setPlatform(r.platform);
      setVia('ai');
      setBusy(null);
      await search(r.title, r.year);
    } catch (e) {
      setProblem(e?.status === 404 ? 'AI reading needs a server update (redeploy it on Render).' : e?.serverMessage || "Couldn't read it with AI right now.");
    } finally {
      setBusy(null);
    }
  };

  const add = async () => {
    const name = (picked?.title || title).trim();
    if (!name) return;
    const movie = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: name,
      platform: mapPlatform(platform),
      type: picked ? (picked.mediaType === 'tv' ? 'Series' : 'Movie') : type,
      status: 'watchlist',
      addedAt: new Date().toISOString(),
      link: (share.text.match(/https?:\/\/\S+/) || [''])[0].replace(/[.,;:!?)]+$/, '') || undefined,
      ...(picked
        ? { tmdbId: picked.tmdbId, mediaType: picked.mediaType, posterPath: picked.posterPath, rating: picked.rating, releaseDate: picked.releaseDate }
        : {}),
    };
    if (isInList(movie)) {
      setProblem(`${name} is already in your list.`);
      return;
    }
    onAdd(movie);
    // Learn the title as the message writes it (what you typed or confirmed).
    teach('ott', share.text, { title: title.trim() }, { platform, type: movie.type }).catch(() => {});
    onClose();
  };

  const v = via ? VIA[via] : null;
  const input = [styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }];

  return (
    <Modal visible={!!share} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: theme.sheet }]}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.headRow}>
              <Text style={[styles.title, { color: theme.text }]}>Add to Watchlist</Text>
              {platform ? (
                <View style={[styles.chip, { backgroundColor: theme.primary + '22' }]}>
                  <Ionicons name="tv-outline" size={13} color={theme.primary} />
                  <Text style={[styles.chipText, { color: theme.primary }]}>{platform}</Text>
                </View>
              ) : null}
            </View>
            {v ? (
              <View style={[styles.banner, { backgroundColor: v.color + '18' }]}>
                <Ionicons name={v.icon} size={15} color={v.color} />
                <Text style={[styles.small, styles.flex, { color: v.color }]}>{v.text(platform)}</Text>
              </View>
            ) : null}
            <Text style={[styles.label, { color: theme.textSecondary }]}>Title</Text>
            <View style={styles.searchRow}>
              <TextInput
                style={[input, styles.flex]}
                value={title}
                onChangeText={setTitle}
                placeholder="Movie or show"
                placeholderTextColor={theme.textMuted}
                onSubmitEditing={() => search(title, year)}
                returnKeyType="search"
                accessibilityLabel="Title"
              />
              {apiKey ? (
                <TouchableOpacity style={[styles.iconBtn, { backgroundColor: theme.surfaceAlt }]} onPress={() => search(title, year)} accessibilityLabel="Search TMDB">
                  <Ionicons name="search" size={18} color={theme.text} />
                </TouchableOpacity>
              ) : null}
            </View>

            {matches.length ? (
              <>
                <Text style={[styles.label, { color: theme.textSecondary }]}>Which one?</Text>
                {matches.map((m) => {
                  const on = picked?.tmdbId === m.tmdbId && picked?.mediaType === m.mediaType;
                  return (
                    <TouchableOpacity
                      key={`${m.mediaType}-${m.tmdbId}`}
                      style={[styles.match, { borderColor: on ? theme.primary : theme.borderNeutral, backgroundColor: on ? theme.primary + '18' : 'transparent' }]}
                      onPress={() => setPicked(on ? null : m)}
                      accessibilityLabel={`Pick ${m.title}`}
                    >
                      {m.posterPath ? (
                        <Image source={{ uri: posterUrl(m.posterPath, 'w92') }} style={styles.poster} />
                      ) : (
                        <View style={[styles.poster, { backgroundColor: theme.surfaceAlt }]} />
                      )}
                      <View style={styles.flex}>
                        <Text style={[styles.matchTitle, { color: theme.text }]} numberOfLines={2}>
                          {m.title}
                        </Text>
                        <Text style={[styles.small, { color: theme.textMuted }]}>
                          {m.mediaType === 'tv' ? 'Series' : 'Movie'}
                          {m.releaseDate ? ` · ${String(m.releaseDate).slice(0, 4)}` : ''}
                          {m.rating ? ` · ★ ${Number(m.rating).toFixed(1)}` : ''}
                        </Text>
                      </View>
                      {on ? <Ionicons name="checkmark-circle" size={22} color={theme.primary} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </>
            ) : null}

            {!picked ? (
              <>
                <Text style={[styles.label, { color: theme.textSecondary }]}>Type</Text>
                <View style={styles.row}>
                  {['Movie', 'Series', 'Short Film'].map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.typeChip, { backgroundColor: type === t ? theme.primary : theme.surfaceAlt, borderColor: theme.borderNeutral }]}
                      onPress={() => setType(t)}
                    >
                      <Text style={[styles.chipText, { color: type === t ? theme.onPrimary : theme.text }]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}

            {busy ? (
              <View style={styles.busy}>
                <ActivityIndicator size="small" color={theme.primary} />
                <Text style={[styles.small, { color: theme.textSecondary }]}>{busy}</Text>
              </View>
            ) : null}
            {problem ? <Text style={[styles.small, { color: '#E5383B', marginTop: 8 }]}>{problem}</Text> : null}

            {!isGuest() ? (
              <TouchableOpacity style={[styles.aiBtn, { borderColor: '#7C3AED66' }]} onPress={readWithAi} disabled={!!busy} accessibilityLabel="Read with AI">
                <Ionicons name="sparkles-outline" size={16} color="#7C3AED" />
                <Text style={[styles.aiText]}>Not right? Read with AI</Text>
              </TouchableOpacity>
            ) : null}

            <View style={styles.actions}>
              <TouchableOpacity style={[styles.btn, { backgroundColor: theme.surfaceAlt }]} onPress={onClose}>
                <Text style={[styles.btnText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: theme.primary }, !(picked || title.trim()) && styles.disabled]}
                onPress={add}
                disabled={!(picked || title.trim())}
                accessibilityLabel="Add to Watchlist"
              >
                <Text style={[styles.btnText, { color: theme.onPrimary }]}>Add to Watchlist</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 },
  sheet: { borderRadius: 20, padding: 18, maxHeight: '90%' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  title: { fontSize: 20, fontWeight: '800', flex: 1 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 },
  chipText: { fontSize: 12, fontWeight: '700' },
  banner: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderRadius: 10, padding: 10, marginBottom: 4 },
  small: { fontSize: 12, lineHeight: 17 },
  flex: { flex: 1 },
  label: { fontSize: 12, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15 },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  iconBtn: { padding: 12, borderRadius: 12 },
  match: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 8, marginBottom: 8 },
  poster: { width: 40, height: 60, borderRadius: 6 },
  matchTitle: { fontSize: 15, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  typeChip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  aiBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingVertical: 10, marginTop: 14 },
  aiText: { color: '#7C3AED', fontSize: 14, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 14 },
  btn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  btnText: { fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
