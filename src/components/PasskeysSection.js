import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { listPasskeys, removePasskey } from '../services/api';
import { addPasskey, passkeyError, passkeysSupported } from '../services/passkeys';
import { confirmDelete } from '../utils/confirm';

/**
 * Settings → Passkeys: sign in to the DiaryByte web app in any browser with
 * the device's screen lock instead of the password.
 */
export function PasskeysSection({ sectionStyle, titleStyle, hintStyle }) {
  const { theme } = useTheme();
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const web = passkeysSupported();
  const here = typeof window !== 'undefined' ? window.location?.hostname : null;

  const refresh = useCallback(() => {
    listPasskeys()
      .then((r) => setItems(r.items || []))
      .catch((e) => {
        setItems([]);
        if (e?.status === 404) setNote({ bad: true, text: 'The server needs an update for passkeys (redeploy it on Render).' });
      });
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const add = async () => {
    setBusy(true);
    setNote(null);
    try {
      await addPasskey();
      setNote({ text: 'Passkey added. Next time, tap “Sign in with a passkey” on the sign-in page.' });
      refresh();
    } catch (e) {
      setNote({ bad: true, text: passkeyError(e) });
    } finally {
      setBusy(false);
    }
  };

  const remove = (p) =>
    confirmDelete('Remove passkey', `Stop signing in with “${p.name}”? You can still use your password.`, () =>
      removePasskey(p.id).then(refresh).catch((e) => setNote({ bad: true, text: passkeyError(e) }))
    );

  return (
    <View style={sectionStyle}>
      <Text style={titleStyle}>Passkeys</Text>
      {(items || []).map((p) => (
        <View key={p.id} style={[styles.row, { borderColor: theme.borderNeutral }]}>
          <Ionicons name="key-outline" size={20} color={theme.primary} />
          <View style={styles.flex}>
            <Text style={[styles.name, { color: theme.text }]}>{p.name}</Text>
            <Text style={[styles.small, { color: theme.textMuted }]}>
              {p.rpID}
              {p.lastUsedAt ? ` · used ${new Date(p.lastUsedAt).toLocaleDateString()}` : ' · not used yet'}
            </Text>
          </View>
          <TouchableOpacity onPress={() => remove(p)} accessibilityLabel={`Remove passkey ${p.name}`} style={styles.iconBtn}>
            <Ionicons name="trash-outline" size={18} color={theme.danger} />
          </TouchableOpacity>
        </View>
      ))}
      {items && !items.length ? <Text style={[styles.small, { color: theme.textMuted }]}>No passkeys yet.</Text> : null}
      {web ? (
        <TouchableOpacity style={[styles.btn, { backgroundColor: theme.primary }, busy && styles.dim]} onPress={add} disabled={busy} accessibilityLabel="Add a passkey on this device">
          {busy ? <ActivityIndicator color="#FFF" /> : <Ionicons name="add-circle-outline" size={18} color="#FFF" />}
          <Text style={styles.btnText}>Add a passkey on this device</Text>
        </TouchableOpacity>
      ) : null}
      {note ? <Text style={[styles.small, { color: note.bad ? '#E5383B' : '#2DA44E' }]}>{note.text}</Text> : null}
      <Text style={[hintStyle, { color: theme.textMuted }]}>
        {web
          ? `Sign in to DiaryByte in this browser with your fingerprint, face or PIN instead of the password. A passkey saved on your phone also signs you in on a computer: choose “Use a phone” there and scan the QR code. Passkeys work on the address they were made on (${here || 'this site'}).`
          : 'Passkeys sign you in to the DiaryByte web app in a browser (phone or computer) with the device’s fingerprint, face or PIN instead of the password. Open the web app in that browser, sign in once, and add a passkey here in Settings. One saved on your phone’s browser also signs you in on a computer by scanning a QR code.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  flex: { flex: 1 },
  name: { fontSize: 14, fontWeight: '700' },
  small: { fontSize: 12, lineHeight: 17 },
  iconBtn: { padding: 6 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 12, marginTop: 8 },
  btnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  dim: { opacity: 0.6 },
});
