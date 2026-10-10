import { StyleSheet, Text, View, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { CATEGORIES } from '../constants/theme';

export default function EntryCard({ entry, onPress }) {
  const { theme } = useTheme();
  const category = CATEGORIES.find((c) => c.key === entry.category);

  const formatDate = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          shadowColor: theme.shadow,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.row}>
        <Text style={styles.mood}>{entry.mood?.emoji || '📝'}</Text>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Text
                style={[styles.title, { color: theme.text }]}
                numberOfLines={1}
              >
                {entry.title}
              </Text>
              {category && (
                <View
                  style={[
                    styles.categoryBadge,
                    { backgroundColor: category.color + '33' },
                  ]}
                >
                  <Text style={[styles.categoryText, { color: category.color }]}>
                    {category.label}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.date, { color: theme.textMuted }]}>
              {formatDate(entry.date)} at {formatTime(entry.date)}
            </Text>
          </View>
          {entry.imageUri && (
            <Image source={{ uri: entry.imageUri }} style={styles.thumbnail} />
          )}
          <Text
            style={[styles.body, { color: theme.textSecondary }]}
            numberOfLines={2}
          >
            {entry.content}
          </Text>
        </View>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={theme.textMuted}
        />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mood: {
    fontSize: 28,
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  header: {
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    flexShrink: 1,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '600',
  },
  date: {
    fontSize: 11,
  },
  thumbnail: {
    width: '100%',
    height: 100,
    borderRadius: 10,
    marginVertical: 8,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
  },
});
