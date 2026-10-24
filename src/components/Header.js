import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';

// Round translucent button, like the iOS navigation bar glass controls.
export function GlassIconButton({ icon, size = 20, onPress, accessibilityLabel }) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.glassButton,
        {
          backgroundColor: theme.glassSurfaceStrong,
          borderColor: theme.border,
          shadowColor: theme.shadow,
        },
      ]}
    >
      <Ionicons name={icon} size={size} color={theme.text} />
    </TouchableOpacity>
  );
}

export default function Header({ title, subtitle, showBack, onBack }) {
  const { theme, toggleTheme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  // iOS screens sit in a SafeAreaView already; Android and web need the inset.
  const paddingTop = Platform.OS === 'ios' ? 6 : insets.top + 12;

  return (
    <View style={[styles.header, { paddingTop }]}>
      <StatusBar style={theme.statusBar} />
      <View style={styles.topRow}>
        {showBack ? (
          <GlassIconButton icon="chevron-back" size={22} onPress={onBack} accessibilityLabel="Back" />
        ) : (
          <GlassIconButton
            icon="home-outline"
            onPress={() => router.replace('/')}
            accessibilityLabel="Home"
          />
        )}
        <GlassIconButton
          icon={isDark ? 'sunny-outline' : 'moon-outline'}
          onPress={toggleTheme}
          accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        />
      </View>

      <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={2}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={[styles.headerSubtitle, { color: theme.textMuted }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: 8,
    paddingHorizontal: 20,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  glassButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  headerSubtitle: {
    fontSize: 15,
    marginTop: 2,
  },
});
