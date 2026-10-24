import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, Animated, Easing, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../hooks/useTheme';
import { checkHealth } from '../services/api';

const ICON_SIZE = 132;
const RETRY_DELAY_MS = 2000;
const MIN_SPLASH_MS = 900;
const OFFLINE_BUTTON_AFTER_MS = 12000;
// A cold Render free-tier start usually takes 30–60s. The fill eases toward
// 90% on this time scale, then jumps to 100% the moment the server answers.
const FILL_TIME_CONSTANT_MS = 20000;

/**
 * Start page shown while the API server wakes up. Renders children once
 * /api/health responds, or when the user chooses to continue offline
 * (the app is local-first, so everything still works without the server).
 */
export default function ServerGate({ children }) {
  const { theme } = useTheme();
  const [ready, setReady] = useState(false);
  const [showOffline, setShowOffline] = useState(false);
  const [percent, setPercent] = useState(0);
  const [fill] = useState(() => new Animated.Value(0));
  const doneRef = useRef(false);

  useEffect(() => {
    const startedAt = Date.now();
    let cancelled = false;

    // Idempotent via doneRef, so it is safe to call from any effect
    // instance (React dev StrictMode remounts make "cancelled" unreliable
    // for one-shot completion logic).
    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      const wait = Math.max(0, MIN_SPLASH_MS - (Date.now() - startedAt));
      setTimeout(() => setReady(true), wait + 150);
      Animated.timing(fill, {
        toValue: 1,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    };

    const tick = setInterval(() => {
      if (doneRef.current) return;
      const elapsed = Date.now() - startedAt;
      const target = 0.9 * (1 - Math.exp(-elapsed / FILL_TIME_CONSTANT_MS));
      Animated.timing(fill, {
        toValue: target,
        duration: 250,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start();
      if (elapsed >= OFFLINE_BUTTON_AFTER_MS) setShowOffline(true);
    }, 250);

    const listener = fill.addListener(({ value }) => setPercent(Math.round(value * 100)));

    const poll = async () => {
      while (!cancelled && !doneRef.current) {
        if (await checkHealth()) {
          finish();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    };
    poll();

    return () => {
      cancelled = true;
      clearInterval(tick);
      fill.removeListener(listener);
    };
  }, [fill]);

  if (ready) return children;

  const continueOffline = () => {
    doneRef.current = true;
    setReady(true);
  };

  const fillHeight = fill.interpolate({
    inputRange: [0, 1],
    outputRange: [0, ICON_SIZE],
  });

  return (
    <View style={styles.container}>
      <StatusBar style={theme.statusBar} />

      <View
        style={[
          styles.icon,
          { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow },
        ]}
        accessibilityRole="progressbar"
        accessibilityLabel="Loading DiaryByte"
        accessibilityValue={{ min: 0, max: 100, now: percent }}
      >
        <Animated.View style={[styles.fill, { height: fillHeight }]}>
          <LinearGradient
            colors={[theme.primary, theme.secondary]}
            start={{ x: 0, y: 1 }}
            end={{ x: 1, y: 0 }}
            style={styles.fillGradient}
          />
        </Animated.View>
        <Ionicons name="book" size={60} color={theme.text} style={styles.glyph} />
      </View>

      <Text style={[styles.title, { color: theme.text }]}>DiaryByte</Text>
      <Text style={[styles.status, { color: theme.textSecondary }]}>
        {percent >= 100 ? 'Ready' : 'Waking up the server…'}
      </Text>
      <Text style={[styles.percent, { color: theme.textMuted }]}>{percent}%</Text>

      {showOffline && percent < 100 && (
        <TouchableOpacity onPress={continueOffline} style={styles.offlineButton} activeOpacity={0.7}>
          <Text style={[styles.offlineText, { color: theme.secondaryDark }]}>
            Taking a while? Continue offline
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: 34,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  fill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  fillGradient: {
    flex: 1,
  },
  glyph: {
    opacity: 0.85,
  },
  title: {
    fontSize: 30,
    fontWeight: 'bold',
    marginTop: 24,
  },
  status: {
    fontSize: 15,
    marginTop: 8,
  },
  percent: {
    fontSize: 13,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  offlineButton: {
    marginTop: 28,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  offlineText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
