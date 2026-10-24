import { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import Header from '../../../components/Header';
import { useTheme } from '../../../hooks/useTheme';
import { getEntry, deleteEntry } from '../../../utils/storage';
import { CATEGORIES } from '../../../constants/theme';

export default function EntryDetailScreen() {
  const { id } = useLocalSearchParams();
  const { theme } = useTheme();
  const [entry, setEntry] = useState(null);

  const fetchEntry = useCallback(async () => {
    const data = await getEntry(id);
    setEntry(data);
  }, [id]);

  useEffect(() => {
    const initialize = async () => {
      await fetchEntry();
    };
    initialize();
  }, [fetchEntry]);

  const handleDelete = () => {
    Alert.alert(
      'Delete Entry',
      'Are you sure you want to delete this entry?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteEntry(id);
            if (router.canGoBack()) router.back();
            else router.replace('/diary');
          },
        },
      ]
    );
  };

  if (!entry) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: 'transparent' }]}
      >
        <Header
          title="Entry"
          showBack
          onBack={() => router.back()}
        />
        <View style={styles.center}>
          <Text style={{ color: theme.textMuted }}>Entry not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const category = CATEGORIES.find((c) => c.key === entry.category);
  const date = new Date(entry.date);
  const dateString = date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeString = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: 'transparent' }]}
    >
      <Header
        title="Entry"
        subtitle={dateString}
        showBack
        onBack={() => router.back()}
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              shadowColor: theme.shadow,
            },
          ]}
        >
          <View style={styles.headerRow}>
            <Text style={styles.mood}>{entry.mood?.emoji || '📝'}</Text>
            <View style={styles.meta}>
              <Text style={[styles.title, { color: theme.text }]}>
                {entry.title}
              </Text>
              {category && (
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: category.color + '33' },
                  ]}
                >
                  <Text style={[styles.badgeText, { color: category.color }]}>
                    {category.label}
                  </Text>
                </View>
              )}
              <Text style={[styles.time, { color: theme.textMuted }]}>
                {timeString}
              </Text>
            </View>
          </View>

          {entry.imageUri && (
            <Image
              source={{ uri: entry.imageUri }}
              style={styles.image}
              resizeMode="cover"
            />
          )}

          <Text style={[styles.body, { color: theme.textSecondary }]}>
            {entry.content}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.deleteButton, { backgroundColor: theme.danger }]}
          onPress={handleDelete}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={20} color="#FFF" />
          <Text style={styles.deleteText}>Delete Entry</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 20,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  mood: {
    fontSize: 40,
    marginRight: 14,
  },
  meta: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    marginBottom: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  time: {
    fontSize: 13,
  },
  image: {
    width: '100%',
    height: 240,
    borderRadius: 16,
    marginBottom: 16,
  },
  body: {
    fontSize: 16,
    lineHeight: 26,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  deleteText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
