import { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Header from '../../components/Header';
import { useTheme } from '../../hooks/useTheme';

const STORAGE_KEY = '@diarybyte_movies';

const STATUSES = [
  { key: 'watchlist', label: 'Watchlist', icon: 'time-outline', color: '#81D4FA' },
  { key: 'watching', label: 'Watching', icon: 'play-outline', color: '#FFCC80' },
  { key: 'watched', label: 'Watched', icon: 'checkmark-circle-outline', color: '#A5D6A7' },
];

export default function MoviesScreen() {
  const { theme } = useTheme();
  const [movies, setMovies] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('watchlist');
  const [filter, setFilter] = useState('all');

  const loadMovies = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) setMovies(JSON.parse(stored));
    } catch (error) {
      console.error('Failed to load movies', error);
    }
  }, []);

  useEffect(() => {
    const initialize = async () => {
      await loadMovies();
    };
    initialize();
  }, [loadMovies]);

  const persist = async (updated) => {
    setMovies(updated);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to save movies', error);
    }
  };

  const addMovie = () => {
    if (!title.trim()) return;
    const movie = {
      id: Date.now().toString(),
      title: title.trim(),
      status,
      addedAt: new Date().toISOString(),
    };
    persist([movie, ...movies]);
    setTitle('');
    setStatus('watchlist');
    setModalVisible(false);
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

  const visible =
    filter === 'all' ? movies : movies.filter((m) => m.status === filter);

  const statusMeta = (key) => STATUSES.find((s) => s.key === key);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Header title="Movies Watch List" subtitle="What's next to watch" />

      <View style={styles.content}>
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
            <Text style={[styles.chipText, { color: theme.text }]}>All</Text>
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
              <Text style={[styles.chipText, { color: theme.text }]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="film-outline" size={56} color={theme.textMuted} />
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                No movies yet. Tap + to add one!
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const meta = statusMeta(item.status);
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
                <TouchableOpacity style={styles.statusBtn} onPress={() => cycleStatus(item)}>
                  <Ionicons name={meta.icon} size={26} color={meta.color} />
                </TouchableOpacity>
                <View style={styles.rowBody}>
                  <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={[styles.rowSub, { color: meta.color }]}>{meta.label}</Text>
                </View>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => deleteMovie(item.id)}
                >
                  <Ionicons name="trash-outline" size={20} color={theme.danger} />
                </TouchableOpacity>
              </View>
            );
          }}
        />
      </View>

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.secondary, shadowColor: theme.secondary }]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={32} color="#FFF" />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Add Movie</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.surfaceAlt,
                  borderColor: theme.borderNeutral,
                  color: theme.text,
                },
              ]}
              placeholder="Movie title..."
              placeholderTextColor={theme.textMuted}
              value={title}
              onChangeText={setTitle}
            />
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
                <Text style={[styles.saveText, { color: theme.text }]}>Add</Text>
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
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  list: { paddingBottom: 90 },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyText: { marginTop: 12, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
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
  statusBtn: { marginRight: 12 },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowSub: { fontSize: 12, marginTop: 2 },
  deleteBtn: { padding: 6 },
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
  },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600' },
  saveBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '600' },
});
