import { StyleSheet } from 'react-native';

// Shared by the launch animation and the server wake-up screen, so one fades
// into the other with nothing moving: same navy, icon, glow and name.
export const BRAND_BG = '#0E192D';
export const BRAND_ICON = require('../../assets/icon.png');
export const BRAND_ICON_SIZE = 168;
// [diameter, opacity] of the halo rings, from the inside out.
export const GLOW_RINGS = [
  [190, 0.22],
  [230, 0.12],
  [280, 0.07],
  [340, 0.04],
];
export const glowRingStyle = ([size, alpha]) => ({
  position: 'absolute',
  width: size,
  height: size,
  borderRadius: size / 2,
  backgroundColor: `rgba(44, 140, 255, ${alpha})`,
});

export const brandStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BRAND_BG, alignItems: 'center', justifyContent: 'center' },
  // The native splash centres its 200px logo on the screen; the stage is
  // centred the same way, with the name placed below it.
  stage: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center' },
  below: { position: 'absolute', top: '50%', left: 0, right: 0, marginTop: 110, alignItems: 'center' },
  icon: { width: BRAND_ICON_SIZE, height: BRAND_ICON_SIZE, borderRadius: BRAND_ICON_SIZE * 0.23 },
  name: { fontSize: 32, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', letterSpacing: 0.5 },
  nameAccent: { color: '#35C8F5' },
  tagline: { marginTop: 8, fontSize: 14, color: '#9FB3D1', textAlign: 'center', letterSpacing: 0.3 },
});
