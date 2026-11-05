import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, PanResponder, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { VAULT_CODE_LENGTH, vaultLock } from '../../utils/vaultLock';

const useNativeDriver = Platform.OS !== 'web';
const RIVETS = [
  [0.06, 0.06], [0.5, 0.035], [0.94, 0.06],
  [0.035, 0.5], [0.965, 0.5],
  [0.06, 0.94], [0.5, 0.965], [0.94, 0.94],
];

/** One combination dial: swipe up/down or tap ▲ ▼ to turn it. */
function Dial({ value, onTurn, index }) {
  const [shift] = useState(() => new Animated.Value(0));
  const turn = (step) => {
    shift.setValue(step * 22);
    Animated.spring(shift, { toValue: 0, speed: 24, bounciness: 8, useNativeDriver }).start();
    onTurn((value + step + 10) % 10);
  };
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderRelease: (_, g) => {
          if (g.dy < -12) turn(1);
          else if (g.dy > 12) turn(-1);
        },
      }),
    // turn reads the latest value each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value]
  );
  const prev = (value + 9) % 10;
  const next = (value + 1) % 10;
  return (
    <View style={styles.dialCol}>
      <TouchableOpacity onPress={() => turn(1)} style={styles.dialArrow} accessibilityLabel={`Dial ${index + 1} up`}>
        <Ionicons name="chevron-up" size={16} color="#F5E6B8" />
      </TouchableOpacity>
      <View style={styles.dial} {...pan.panHandlers} accessibilityLabel={`Dial ${index + 1}: ${value}`}>
        <LinearGradient colors={['#0B0F14', '#2A3038', '#0B0F14']} style={StyleSheet.absoluteFill} />
        <Animated.View style={{ alignItems: 'center', transform: [{ translateY: shift }] }}>
          <Text style={styles.dialSide}>{next}</Text>
          <Text style={styles.dialDigit}>{value}</Text>
          <Text style={styles.dialSide}>{prev}</Text>
        </Animated.View>
        <View style={styles.dialGlass} pointerEvents="none" />
      </View>
      <TouchableOpacity onPress={() => turn(-1)} style={styles.dialArrow} accessibilityLabel={`Dial ${index + 1} down`}>
        <Ionicons name="chevron-down" size={16} color="#F5E6B8" />
      </TouchableOpacity>
    </View>
  );
}

/**
 * The Personal Vault's door: set the six dials to the code (from Settings)
 * and turn the handle. Right code: the handle spins, the bolts pull back and
 * the door swings open on its hinges, then `onOpen`. Wrong code: the door
 * shakes. With no code set, the handle opens it straight away. The code
 * also unlocks the key that decrypts the vault's items.
 */
export default function VaultDoor({ onOpen, onSetCode }) {
  const [digits, setDigits] = useState(() => Array(VAULT_CODE_LENGTH).fill(0));
  const [hasCode, setHasCode] = useState(vaultLock.enabled());
  const [message, setMessage] = useState(null);
  const [width, setWidth] = useState(340);
  const [busy, setBusy] = useState(false);
  const [{ spin, bolts, swing, shake }] = useState(() => ({
    spin: new Animated.Value(0),
    bolts: new Animated.Value(0),
    swing: new Animated.Value(0),
    shake: new Animated.Value(0),
  }));

  useEffect(() => {
    const unsubscribe = vaultLock.subscribe(() => setHasCode(vaultLock.enabled()));
    // The saved code may finish loading before or after this subscribes.
    // Then pick up a code set (or changed) on another device.
    vaultLock.refresh().then(() => setHasCode(vaultLock.enabled()));
    return unsubscribe;
  }, []);

  const turnHandle = async () => {
    if (busy) return;
    setBusy(true);
    // Never open on a not-yet-loaded setting: read the saved code first.
    await vaultLock.load();
    // No code here yet: ask the server first, in case another device set one.
    if (!vaultLock.enabled()) await vaultLock.refresh();
    const locked = vaultLock.enabled();
    setHasCode(locked);
    if (locked) setMessage('Checking…');
    const opened = await vaultLock.unlock(digits.join(''));
    setBusy(false);
    if (!opened) {
      setMessage('Wrong combination');
      Animated.sequence(
        [10, -10, 8, -8, 4, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 55, useNativeDriver }))
      ).start();
      Animated.sequence([
        Animated.timing(spin, { toValue: 0.12, duration: 160, useNativeDriver }),
        Animated.timing(spin, { toValue: 0, duration: 220, useNativeDriver }),
      ]).start();
      return;
    }
    setBusy(true);
    setMessage(null);
    Animated.sequence([
      Animated.timing(spin, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.cubic), useNativeDriver }),
      Animated.timing(bolts, { toValue: 1, duration: 260, useNativeDriver }),
      Animated.timing(swing, { toValue: 1, duration: 800, easing: Easing.in(Easing.cubic), useNativeDriver }),
    ]).start(() => onOpen());
  };

  const handleSpin = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const doorAngle = swing.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-105deg'] });
  const boltShift = bolts.interpolate({ inputRange: [0, 1], outputRange: [0, -18] });
  const darkness = swing.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] });

  return (
    <View style={styles.wrap}>
      {/* The vault behind the door */}
      <View style={styles.inside}>
        <Ionicons name="lock-open-outline" size={44} color="#C9A44C" />
        <Text style={styles.insideText}>Opening…</Text>
      </View>

      <Animated.View
        style={[
          styles.door,
          {
            transform: [
              { translateX: shake },
              { perspective: 1400 },
              { translateX: -width / 2 },
              { rotateY: doorAngle },
              { translateX: width / 2 },
            ],
          },
        ]}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        <LinearGradient colors={['#B8C0C8', '#7D868F', '#5A626B', '#8E979F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.doorFace}>
          {/* hinges */}
          <View style={[styles.hinge, { top: '16%' }]} />
          <View style={[styles.hinge, { bottom: '16%' }]} />
          {/* bolts on the opening edge */}
          {['22%', '50%', '78%'].map((top) => (
            <Animated.View key={top} style={[styles.bolt, { top, transform: [{ translateX: boltShift }] }]} />
          ))}
          {RIVETS.map(([x, y]) => (
            <View key={`${x}-${y}`} style={[styles.rivet, { left: `${x * 100}%`, top: `${y * 100}%` }]} />
          ))}
          <View style={styles.innerRing}>
            <Text style={styles.brand}>DIARYBYTE · VAULT</Text>

            {/* handle */}
            <TouchableOpacity onPress={turnHandle} activeOpacity={0.85} accessibilityLabel="Turn the handle to open">
              <Animated.View style={[styles.handle, { transform: [{ rotate: handleSpin }] }]}>
                {[0, 45, 90, 135].map((deg) => (
                  <View key={deg} style={[styles.spoke, { transform: [{ rotate: `${deg}deg` }] }]}>
                    <View style={styles.knob} />
                    <View style={[styles.knob, styles.knobEnd]} />
                  </View>
                ))}
                <LinearGradient colors={['#E8ECEF', '#8D969E']} style={styles.hub}>
                  <Ionicons name="lock-closed" size={20} color="#3B424A" />
                </LinearGradient>
              </Animated.View>
            </TouchableOpacity>

            {/* combination dials */}
            {hasCode ? (
              <LinearGradient colors={['#C9A44C', '#8A6A1F', '#C9A44C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.plate}>
                {digits.map((d, i) => (
                  <Dial
                    key={i}
                    index={i}
                    value={d}
                    onTurn={(v) => {
                      setMessage(null);
                      setDigits((all) => all.map((x, j) => (j === i ? v : x)));
                    }}
                  />
                ))}
              </LinearGradient>
            ) : (
              <View style={styles.noCode}>
                <Text style={styles.noCodeText}>No combination set yet.</Text>
                <TouchableOpacity onPress={onSetCode} accessibilityLabel="Set a vault code in Settings">
                  <Text style={styles.noCodeLink}>Set a 6-digit code in Settings</Text>
                </TouchableOpacity>
              </View>
            )}
            <Text style={[styles.hint, message && styles.wrong]}>
              {message || (hasCode ? 'Set the dials, then turn the handle' : 'Turn the handle to open')}
            </Text>
          </View>
        </LinearGradient>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.shadow, { opacity: darkness }]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center' },
  inside: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 26,
    backgroundColor: '#14181D',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  insideText: { color: '#C9A44C', fontSize: 16, fontWeight: '700', letterSpacing: 2 },
  door: { flex: 1, borderRadius: 26, backfaceVisibility: 'hidden' },
  doorFace: {
    flex: 1,
    borderRadius: 26,
    borderWidth: 6,
    borderColor: '#4A5159',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 14,
  },
  shadow: { backgroundColor: '#000', borderRadius: 26 },
  hinge: { position: 'absolute', left: -10, width: 18, height: 54, borderRadius: 6, backgroundColor: '#2F353B' },
  bolt: { position: 'absolute', right: -12, width: 26, height: 14, marginTop: -7, borderRadius: 4, backgroundColor: '#C9CFD4', borderWidth: 1, borderColor: '#5A626B' },
  rivet: {
    position: 'absolute',
    width: 12,
    height: 12,
    marginLeft: -6,
    marginTop: -6,
    borderRadius: 6,
    backgroundColor: '#D7DCE0',
    borderWidth: 2,
    borderColor: '#5A626B',
  },
  innerRing: {
    alignSelf: 'stretch',
    flex: 1,
    margin: 10,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: 'rgba(40,46,52,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
    paddingVertical: 16,
  },
  brand: { color: '#2F353B', fontSize: 12, fontWeight: '800', letterSpacing: 3 },
  handle: { width: 150, height: 150, alignItems: 'center', justifyContent: 'center' },
  spoke: { position: 'absolute', width: 150, height: 12, borderRadius: 6, backgroundColor: '#3B424A', justifyContent: 'space-between', flexDirection: 'row' },
  knob: { width: 22, height: 22, marginTop: -5, borderRadius: 11, backgroundColor: '#9AA3AB', borderWidth: 2, borderColor: '#3B424A' },
  knobEnd: {},
  hub: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: '#3B424A' },
  plate: { flexDirection: 'row', gap: 4, padding: 8, borderRadius: 12, borderWidth: 2, borderColor: '#6B5218' },
  dialCol: { alignItems: 'center' },
  dialArrow: { paddingVertical: 2, paddingHorizontal: 6 },
  dial: { width: 38, height: 64, borderRadius: 6, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#000' },
  dialDigit: { color: '#F5E6B8', fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'], lineHeight: 30 },
  dialSide: { color: 'rgba(245,230,184,0.3)', fontSize: 15, fontWeight: '700', lineHeight: 17 },
  dialGlass: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderTopWidth: 18, borderBottomWidth: 18, borderColor: 'rgba(0,0,0,0.35)' },
  noCode: { alignItems: 'center', gap: 4 },
  noCodeText: { color: '#2F353B', fontSize: 14, fontWeight: '600' },
  noCodeLink: { color: '#1E3A8A', fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' },
  hint: { color: '#2F353B', fontSize: 13, fontWeight: '600' },
  wrong: { color: '#B91C1C' },
});
