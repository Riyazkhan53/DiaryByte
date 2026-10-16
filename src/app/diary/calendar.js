import { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Header from '../../components/Header';
import CalendarView from '../../components/CalendarView';
import EntryCard from '../../components/EntryCard';
import { useTheme } from '../../hooks/useTheme';
import { loadEntries } from '../../utils/storage';

export default function CalendarScreen() {
  const { theme } = useTheme();
  const [entries, setEntries] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);

  const fetchEntries = useCallback(async () => {
    const data = await loadEntries();
    setEntries(data);
  }, []);

  // Reload on focus so new or deleted entries show when coming back.
  useFocusEffect(
    useCallback(() => {
      fetchEntries();
    }, [fetchEntries])
  );

  const filteredEntries = selectedDate
    ? entries.filter(
        (entry) => entry.date.split('T')[0] === selectedDate
      )
    : entries;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <Header
        title="Calendar"
        subtitle={selectedDate || 'All entries'}
        showBack
        onBack={() => router.back()}
      />

      <View style={styles.content}>
        <CalendarView
          entries={entries}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />

        {selectedDate && (
          <TouchableOpacity
            style={[styles.clearButton, { backgroundColor: theme.surface }]}
            onPress={() => setSelectedDate(null)}
            activeOpacity={0.7}
          >
            <Text style={[styles.clearText, { color: theme.textSecondary }]}>
              Show all entries
            </Text>
          </TouchableOpacity>
        )}

        <FlatList
          data={filteredEntries}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <EntryCard
              entry={item}
              onPress={() => router.push(`/diary/entry/${item.id}`)}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.textMuted }]}>
              {selectedDate
                ? 'No entries on this date.'
                : 'No entries yet.'}
            </Text>
          }
        />
      </View>
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
  },
  clearButton: {
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  clearText: {
    fontSize: 14,
    fontWeight: '600',
  },
  list: {
    paddingBottom: 30,
  },
  empty: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
  },
});
