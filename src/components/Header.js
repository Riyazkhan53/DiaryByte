import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../hooks/useTheme';

export default function Header({ title, subtitle, showBack, onBack }) {
  const { theme, toggleTheme, isDark } = useTheme();

  return (
    <LinearGradient
      colors={theme.headerGradient}
      style={styles.header}
    >
      <StatusBar style={theme.statusBar} />
      <View style={styles.topRow}>
        {showBack ? (
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => router.replace('/')} style={styles.backButton}>
            <Ionicons name="home-outline" size={22} color={theme.text} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={toggleTheme}
          style={[styles.themeButton, { backgroundColor: theme.surface }]}
          activeOpacity={0.7}
        >
          <Ionicons
            name={isDark ? 'sunny-outline' : 'moon-outline'}
            size={20}
            color={theme.text}
          />
        </TouchableOpacity>
      </View>

      <Text style={[styles.headerTitle, { color: theme.text }]}>{title}</Text>
      {subtitle && (
        <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
          {subtitle}
        </Text>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: Platform.OS === 'android' ? 48 : 20,
    paddingBottom: 24,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  backButton: {
    padding: 8,
    borderRadius: 12,
  },
  backPlaceholder: {
    width: 40,
  },

  themeButton: {
    padding: 8,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: 15,
    marginTop: 4,
  },
});
