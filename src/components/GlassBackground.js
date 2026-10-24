import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../hooks/useTheme';

// Large soft glows behind every screen. Glass only reads as glass when there
// is colour behind it, so the translucent cards pick up these tints.
const GLOWS = [
  { size: 420, top: -140, left: -150 },
  { size: 380, top: 180, right: -190 },
  { size: 360, bottom: 60, left: -170 },
  { size: 320, bottom: -120, right: -100 },
];

export default function GlassBackground({ children }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <LinearGradient colors={theme.backgroundGradient} style={StyleSheet.absoluteFill} />
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {GLOWS.map(({ size, ...position }, i) => (
          <LinearGradient
            key={i}
            colors={[theme.glows[i], 'transparent']}
            start={{ x: 0.5, y: 0.5 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.glow,
              position,
              { width: size, height: size, borderRadius: size / 2 },
            ]}
          />
        ))}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  glow: { position: 'absolute', filter: 'blur(40px)' },
});
