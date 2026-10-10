import { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Header from '../../components/Header';
import SearchBar from '../../components/SearchBar';
import EntryCard from '../../components/EntryCard';
import { useTheme } from '../../hooks/useTheme';
import { loadEntries } from '../../utils/storage';

export default function HomeScreen() {
  const { theme } = useTheme();
  const [entries, setEntries] = useState([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchEntries = useCallback(async () => {
    const data = await loadEntries();
    setEntries(data);
  }, []);

  useEffect(() => {
    const initialize = async () => {
      await fetchEntries();
    };
    initialize();
  }, [fetchEntries]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchEntries();
    setRefreshing(false);
  }, [fetchEntries]);

  const filteredEntries = entries.filter((entry) => {
    const query = search.toLowerCase();
    return (
      entry.title.toLowerCase().includes(query) ||
      entry.content.toLowerCase().includes(query)
    );
  });

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Ionicons name="book-outline" size={64} color={theme.textMuted} />
      <Text style={[styles.emptyTitle, { color: theme.textSecondary }]}>
        No entries yet
      </Text>
      <Text style={[styles.emptyText, { color: theme.textMuted }]}>
        Tap the + button to write your first diary entry.
      </Text>
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <Header title="DiaryByte" subtitle="Your personal space" />

      <View style={styles.content}>
        <View style={styles.searchRow}>
          <View style={styles.searchWrapper}>
            <SearchBar
              value={search}
              onChangeText={setSearch}
              placeholder="Search entries..."
            />
          </View>
          <TouchableOpacity
            style={[
              styles.calendarButton,
              {
                backgroundColor: theme.surface,
                borderColor: theme.borderNeutral,
              },
            ]}
            onPress={() => router.push('/calendar')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="calendar-outline"
              size={22}
              color={theme.textSecondary}
            />
          </TouchableOpacity>
        </View>

        {filteredEntries.length === 0 && !search ? (
          renderEmpty()
        ) : (
          <FlatList
            data={filteredEntries}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <EntryCard
                entry={item}
                onPress={() => router.push(`/entry/${item.id}`)}
              />
            )}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={theme.textSecondary}
              />
            }
            ListEmptyComponent={
              <Text style={[styles.noResults, { color: theme.textMuted }]}>
                No entries match your search.
              </Text>
            }
          />
        )}
      </View>

      <TouchableOpacity
        style={[
          styles.fab,
          {
            backgroundColor: theme.secondary,
            shadowColor: theme.secondary,
          },
        ]}
        onPress={() => router.push('/new')}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={32} color="#FFF" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    pointerEvents: 'box-none',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  searchWrapper: {
    flex: 1,
  },
  calendarButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingBottom: 90,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  noResults: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
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
});
