import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { createWatchPairCode, serverAddress } from '../services/api';
import { isGuest } from '../services/session';

/** Settings: pair the DiaryByte Wear OS app with a one-time code. */
export function WatchPairSection({ sectionStyle, titleStyle, hintStyle }) {
  const { theme } = useTheme();
  const [pair, setPair] = useState(null); // { code, expiresAt }
  const [left, setLeft] = useState(0); // seconds until the code lapses
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!pair) return undefined;
    const tick = () => {
      const s = Math.max(0, Math.round((Date.parse(pair.expiresAt) - Date.now()) / 1000));
      setLeft(s);
      if (!s) setPair(null);
    };
    const timer = setInterval(tick, 1000);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(timer);
      clearTimeout(first);
    };
  }, [pair]);

  const makeCode = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setPair(await createWatchPairCode());
    } catch (e) {
      setError(
        e.status === 404
          ? 'The server needs updating first (redeploy it on Render).'
          : e.serverMessage || "Couldn't reach the server. Try again."
      );
    } finally {
      setBusy(false);
    }
  };

  const guest = isGuest();
  return (
    <View style={sectionStyle}>
      <Text style={titleStyle}>Wear OS watch</Text>
      {guest ? (
        <Text style={[hintStyle, { color: theme.textMuted }]}>Sign in to pair a watch. Guest data stays on this phone.</Text>
      ) : pair ? (
        <View style={styles.codeBox}>
          <Text style={[styles.code, { color: theme.text }]} accessibilityLabel={`Pairing code ${pair.code.split('').join(' ')}`}>
            {pair.code.slice(0, 3)} {pair.code.slice(3)}
          </Text>
          <Text style={[styles.left, { color: theme.textMuted }]}>
            Type this on the watch · works once · {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} left
          </Text>
        </View>
      ) : (
        <TouchableOpacity style={styles.row} onPress={makeCode} activeOpacity={0.7} accessibilityLabel="Pair a watch">
          {busy ? <ActivityIndicator color={theme.accent} /> : <Ionicons name="watch-outline" size={22} color={theme.accent} />}
          <Text style={[styles.label, { color: theme.text }]}>Pair a watch</Text>
        </TouchableOpacity>
      )}
      {error ? <Text style={[hintStyle, { color: '#E5383B' }]}>{error}</Text> : null}
      {!guest ? (
        <Text style={[hintStyle, { color: theme.textMuted }]}>
          Open DiaryByte on the watch and enter the code. If the watch asks for the server, it is {serverAddress()}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  label: { fontSize: 16, fontWeight: '500' },
  codeBox: { alignItems: 'center', paddingVertical: 12 },
  code: { fontSize: 40, fontWeight: '800', letterSpacing: 6, fontVariant: ['tabular-nums'] },
  left: { fontSize: 12, marginTop: 4 },
});
