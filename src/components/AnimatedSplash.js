import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Platform, StyleSheet, Text, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

import { BRAND_BG, BRAND_ICON, GLOW_RINGS, brandStyles, glowRingStyle } from './brand';

// Same navy and logo as the native splash (app.json), so the hand-over is seamless.
const LOGO = require('../../assets/splash-icon.png');
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
      <View style={brandStyles.stage}>
        {/* A soft halo: rings that get fainter outwards. */}
        {GLOW_RINGS.map(([size, alpha]) => (
          <Animated.View
            key={size}
            style={[glowRingStyle([size, alpha]), { opacity: glowOpacity, transform: [{ scale: glowScale }] }]}
          />
        ))}
        <Animated.Image source={LOGO} style={[styles.logo, { opacity: logo }]} resizeMode="contain" />
        <Animated.View style={{ opacity: icon, transform: [{ scale: iconScale }] }}>
          <Image source={BRAND_ICON} style={brandStyles.icon} />
        </Animated.View>
      </View>
      <Animated.View style={[brandStyles.below, { opacity: text, transform: [{ translateY: textShift }] }]}>
        <Text style={brandStyles.name}>
          Diary<Text style={brandStyles.nameAccent}>Byte</Text>
        </Text>
        <Text style={brandStyles.tagline}>Diary · Money · Trading · Watch list</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    zIndex: 1000,
    backgroundColor: BRAND_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { position: 'absolute', width: 200, height: 200 },
});
