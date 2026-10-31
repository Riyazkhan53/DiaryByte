import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, Animated, Easing, Image, Platform, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { checkHealth } from '../services/api';
import { BRAND_ICON, GLOW_RINGS, brandStyles, glowRingStyle } from './brand';

const BAR_WIDTH = 200;
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
 * Laid out like the launch animation (AnimatedSplash), which fades into it.
 */
export default function ServerGate({ children }) {
  const [ready, setReady] = useState(false);
  const [showOffline, setShowOffline] = useState(false);
  const [percent, setPercent] = useState(0);
  const [fill] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(0));
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

  // The halo breathes slowly while waiting.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  if (ready) return children;

  const continueOffline = () => {
    doneRef.current = true;
    setReady(true);
  };

  const fillWidth = fill.interpolate({ inputRange: [0, 1], outputRange: [0, BAR_WIDTH] });
  // Starts where the launch animation's halo ends (scale 1.25, opacity 0.7).
  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1.25, 1.35] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0.45] });

  return (
    <View style={brandStyles.screen}>
      <StatusBar style="light" />

      <View style={brandStyles.stage}>
        {GLOW_RINGS.map((ring) => (
          <Animated.View
            key={ring[0]}
            style={[glowRingStyle(ring), { opacity: haloOpacity, transform: [{ scale: haloScale }] }]}
          />
        ))}
        <Image source={BRAND_ICON} style={brandStyles.icon} accessibilityIgnoresInvertColors />
      </View>

      <View style={brandStyles.below}>
        <Text style={brandStyles.name}>
          Diary<Text style={brandStyles.nameAccent}>Byte</Text>
        </Text>
        <Text style={styles.status}>{percent >= 100 ? 'Ready' : 'Waking up the server…'}</Text>
        <View
          style={styles.track}
          accessibilityRole="progressbar"
          accessibilityLabel="Loading DiaryByte"
          accessibilityValue={{ min: 0, max: 100, now: percent }}
        >
          <Animated.View style={[styles.fill, { width: fillWidth }]}>
            <LinearGradient colors={['#35C8F5', '#2C6BFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.fillGradient} />
          </Animated.View>
        </View>
        <Text style={styles.percent}>{percent}%</Text>

        {showOffline && percent < 100 && (
          <TouchableOpacity onPress={continueOffline} style={styles.offlineButton} activeOpacity={0.7}>
            <Text style={styles.offlineText}>Taking a while? Continue offline</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  status: { fontSize: 15, marginTop: 10, color: '#9FB3D1' },
  track: {
    width: BAR_WIDTH,
    height: 6,
    borderRadius: 3,
    marginTop: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  fill: { height: '100%', borderRadius: 3, overflow: 'hidden' },
  fillGradient: { flex: 1 },
  percent: { fontSize: 13, marginTop: 8, color: '#6F84A6', fontVariant: ['tabular-nums'] },
  offlineButton: { marginTop: 22, paddingVertical: 10, paddingHorizontal: 16 },
  offlineText: { fontSize: 14, fontWeight: '600', color: '#35C8F5' },
});
