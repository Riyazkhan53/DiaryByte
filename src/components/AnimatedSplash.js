import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Platform, StyleSheet, Text, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

// Same navy and logo as the native splash (app.json), so the hand-over is seamless.
const BG = '#0E192D';
const LOGO = require('../../assets/splash-icon.png');
const ICON = require('../../assets/icon.png');
const useNativeDriver = Platform.OS !== 'web';

/**
 * Launch animation over the app: starts exactly like the native splash (the
 * "D" on navy), then the full DiaryByte icon grows in with the name and a
 * glow, and the whole thing fades away to the app (about 1.8 s). The native
 * splash is hidden once this has drawn its first frame.
 */
export default function AnimatedSplash() {
  const [done, setDone] = useState(false);
  // Created once: logo = the native-splash "D", icon = full icon in, fade = whole overlay.
  const [{ logo, icon, glow, text, fade }] = useState(() => ({
    logo: new Animated.Value(1),
    icon: new Animated.Value(0),
    glow: new Animated.Value(0),
    text: new Animated.Value(0),
    fade: new Animated.Value(1),
  }));
  const started = useRef(false);

  const start = () => {
    if (started.current) return;
    started.current = true;
    SplashScreen.hide();
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        const t = (ms) => (reduce ? 0 : ms);
        Animated.sequence([
          Animated.parallel([
            Animated.timing(logo, { toValue: 0, duration: t(350), useNativeDriver }),
            Animated.timing(icon, {
              toValue: 1,
              duration: t(650),
              easing: Easing.out(Easing.back(1.4)),
              useNativeDriver,
            }),
            Animated.timing(glow, { toValue: 1, duration: t(900), easing: Easing.out(Easing.quad), useNativeDriver }),
            Animated.timing(text, { toValue: 1, duration: t(550), delay: t(250), useNativeDriver }),
          ]),
          Animated.delay(reduce ? 300 : 650),
          Animated.timing(fade, { toValue: 0, duration: 350, useNativeDriver }),
        ]).start(() => setDone(true));
      });
  };

  // If layout never fires (e.g. a test renderer), don't leave the native splash up.
  useEffect(() => {
    const timer = setTimeout(start, 1500);
    return () => clearTimeout(timer);
  });

  if (done) return null;

  const iconScale = icon.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.25] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 0.7] });
  const textShift = text.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });

  return (
    <Animated.View
      style={[styles.overlay, { opacity: fade }]}
      onLayout={start}
      pointerEvents="none"
      accessibilityLabel="DiaryByte is starting"
    >
      <View style={styles.stage}>
        {/* A soft halo: rings that get fainter outwards. */}
        {GLOW_RINGS.map(([size, alpha]) => (
          <Animated.View
            key={size}
            style={[
              styles.glow,
              { width: size, height: size, borderRadius: size / 2, backgroundColor: `rgba(44, 140, 255, ${alpha})` },
              { opacity: glowOpacity, transform: [{ scale: glowScale }] },
            ]}
          />
        ))}
        <Animated.Image source={LOGO} style={[styles.logo, { opacity: logo }]} resizeMode="contain" />
        <Animated.View style={{ opacity: icon, transform: [{ scale: iconScale }] }}>
          <Image source={ICON} style={styles.icon} />
        </Animated.View>
      </View>
      <Animated.View style={[styles.textBox, { opacity: text, transform: [{ translateY: textShift }] }]}>
        <Text style={styles.name}>
          Diary<Text style={styles.nameAccent}>Byte</Text>
        </Text>
        <Text style={styles.tagline}>Diary · Money · Trading · Watch list</Text>
      </Animated.View>
    </Animated.View>
  );
}

const ICON_SIZE = 168;
// [diameter, opacity] from the inside out.
const GLOW_RINGS = [
  [190, 0.22],
  [230, 0.12],
  [280, 0.07],
  [340, 0.04],
];

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The native splash centres its 200px logo on the screen; the stage is
  // centred the same way, with the name placed below it.
  stage: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center' },
  textBox: { position: 'absolute', top: '50%', left: 0, right: 0, marginTop: 110 },
  glow: { position: 'absolute' },
  logo: { position: 'absolute', width: 200, height: 200 },
  icon: { width: ICON_SIZE, height: ICON_SIZE, borderRadius: ICON_SIZE * 0.23 },
  name: { fontSize: 32, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', letterSpacing: 0.5 },
  nameAccent: { color: '#35C8F5' },
  tagline: { marginTop: 8, fontSize: 14, color: '#9FB3D1', textAlign: 'center', letterSpacing: 0.3 },
});
