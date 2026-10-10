import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { MOODS } from '../constants/theme';

export default function MoodPicker({ selected, onSelect }) {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>Mood</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
      >
        {MOODS.map((mood) => {
          const isSelected = selected?.label === mood.label;
          return (
            <TouchableOpacity
              key={mood.label}
              style={[
                styles.moodButton,
                {
                  backgroundColor: isSelected
                    ? theme.primary
                    : theme.surface,
                  borderColor: isSelected
                    ? theme.primaryDark
                    : theme.borderNeutral,
                },
              ]}
              onPress={() => onSelect(mood)}
              activeOpacity={0.7}
            >
              <Text style={styles.emoji}>{mood.emoji}</Text>
              <Text
                style={[
                  styles.moodLabel,
                  { color: isSelected ? theme.text : theme.textSecondary },
                ]}
              >
                {mood.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  list: {
    gap: 10,
    paddingRight: 20,
  },
  moodButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    minWidth: 70,
  },
  emoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  moodLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
});
