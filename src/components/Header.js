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
          <TouchableOpacity onPress={onBack} style={styles.glassButton}>
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => router.replace('/')} style={styles.glassButton}>
            <Ionicons name="home-outline" size={22} color={theme.text} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={toggleTheme}
          style={styles.glassButton}
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
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderTopWidth: 0,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  glassButton: {
    padding: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
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
