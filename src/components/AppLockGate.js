import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { appCameBack, appWentAway, isAppLocked, loadAppLock, subscribeAppLock, unlockApp } from '../utils/appLock';

/**
 * Covers the app while it's locked (Settings → App lock) and asks for the
 * fingerprint. The app stays mounted underneath, so nothing is lost.
 */
export default function AppLockGate() {
  const [locked, setLocked] = useState(isAppLocked());
  const [failed, setFailed] = useState(false);
  const asking = useRef(false);

  const ask = async () => {
    if (asking.current) return;
    asking.current = true;
    const ok = await unlockApp();
    asking.current = false;
    setFailed(!ok);
  };

  useEffect(() => {
    const off = subscribeAppLock((l) => {
      setLocked(l);
      if (l) Promise.resolve().then(ask);
    });
    loadAppLock();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') appWentAway();
      else if (s === 'active') appCameBack();
    });
    return () => {
      off();
      sub.remove();
    };
  }, []);

  if (!locked) return null;
  return (
    <View style={styles.cover} accessibilityLabel="DiaryByte is locked">
      <View style={styles.badge}>
        <Ionicons name="finger-print" size={56} color="#35C8F5" />
      </View>
      <Text style={styles.title}>DiaryByte is locked</Text>
      <Text style={styles.hint}>{failed ? 'Not recognised. Try again.' : 'Use your fingerprint to open it.'}</Text>
      <TouchableOpacity style={styles.btn} onPress={ask} accessibilityLabel="Unlock with fingerprint">
        <Ionicons name="finger-print-outline" size={20} color="#FFF" />
        <Text style={styles.btnText}>Unlock</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { ...StyleSheet.absoluteFillObject, zIndex: 5000, elevation: 50, backgroundColor: '#0E192D', alignItems: 'center', justifyContent: 'center', padding: 30, gap: 12 },
  badge: { width: 110, height: 110, borderRadius: 55, backgroundColor: 'rgba(53,200,245,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  title: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  hint: { color: '#9FB3D1', fontSize: 14, textAlign: 'center' },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#2C6BFF', borderRadius: 14, paddingHorizontal: 26, paddingVertical: 13, marginTop: 10 },
  btnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
