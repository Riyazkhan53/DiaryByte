import { StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';

export default function SearchBar({ value, onChangeText, placeholder }) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.surface,
          borderColor: theme.borderNeutral,
        },
      ]}
    >
      <Ionicons
        name="search"
        size={18}
        color={theme.textMuted}
        style={styles.icon}
      />
      <TextInput
        style={[styles.input, { color: theme.text }]}
        placeholder={placeholder || 'Search entries...'}
        placeholderTextColor={theme.textMuted}
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
  },
  icon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    height: '100%',
  },
});
