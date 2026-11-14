import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';

/**
 * Shown instead of a blank screen when a screen fails to draw. Says what
 * went wrong (so it can be reported) and offers to try again or go home.
 * Plain colours: it must work even if the theme is what failed.
 */
export default function ScreenError({ error, retry }) {
  const [copied, setCopied] = useState(false);
  const message = String(error?.message || error || 'Unknown error');
  const details = `${message}\n${String(error?.stack || '')
    .split('\n')
    .slice(0, 6)
    .join('\n')}`;
  return (
    <View style={styles.screen}>
      <Ionicons name="warning-outline" size={44} color="#F59E0B" />
      <Text style={styles.title}>Something went wrong on this screen</Text>
      <Text style={styles.hint}>Your data is safe. Try again, or go back to Home.</Text>
      <ScrollView style={styles.box} contentContainerStyle={styles.boxInner}>
        <Text style={styles.code} selectable>
          {details}
        </Text>
      </ScrollView>
      <View style={styles.row}>
        <TouchableOpacity style={[styles.btn, styles.primary]} onPress={() => retry?.()} accessibilityLabel="Try again">
          <Text style={styles.btnText}>Try again</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => {
            try {
              router.replace('/');
            } catch (_e) {
              retry?.();
            }
          }}
          accessibilityLabel="Go home"
        >
          <Text style={styles.btnText}>Go home</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        onPress={() => Clipboard.setStringAsync(details).then(() => setCopied(true)).catch(() => {})}
        accessibilityLabel="Copy error details"
      >
        <Text style={styles.copy}>{copied ? 'Copied. Paste it to report the problem.' : 'Copy error details'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0E192D', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  hint: { color: '#9FB3D1', fontSize: 14, textAlign: 'center' },
  box: { maxHeight: 160, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, marginVertical: 6 },
  boxInner: { padding: 10 },
  code: { color: '#FCA5A5', fontSize: 12, fontFamily: 'monospace' },
  row: { flexDirection: 'row', gap: 12, marginTop: 4 },
  btn: { paddingVertical: 12, paddingHorizontal: 22, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)' },
  primary: { backgroundColor: '#2C6BFF' },
  btnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  copy: { color: '#35C8F5', fontSize: 13, fontWeight: '600', marginTop: 6 },
});
