import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { CATEGORIES } from '../constants/theme';

export default function CategoryPicker({ selected, onSelect }) {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>Category</Text>
      <View style={styles.list}>
        {CATEGORIES.map((category) => {
          const isSelected = selected === category.key;
          return (
            <TouchableOpacity
              key={category.key}
              style={[
                styles.chip,
                {
                  backgroundColor: isSelected
                    ? category.color + '4D'
                    : theme.surface,
                  borderColor: isSelected
                    ? category.color
                    : theme.borderNeutral,
                },
              ]}
              onPress={() =>
                onSelect(isSelected ? null : category.key)
              }
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: isSelected ? category.color : theme.textSecondary },
                ]}
              >
                {category.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
