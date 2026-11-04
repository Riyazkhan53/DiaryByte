import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { registerDeleteHost } from '../utils/confirm';
import { checkDeletePassword, deleteGuardEnabled, loadDeleteGuard, subscribeDeleteGuard } from '../utils/deleteGuard';

/**
 * The one delete confirmation for the whole app (mounted in the root
 * layout). Shows "Delete … ?" with Cancel / Delete; when the delete password
 * is on (Settings), Delete needs the password too.
 */
export default function DeleteConfirmHost() {
  const { theme } = useTheme();
  const [request, setRequest] = useState(null); // { title, message, onConfirm }
  const [password, setPassword] = useState('');
  const [wrong, setWrong] = useState(false);
  const [guarded, setGuarded] = useState(deleteGuardEnabled());

  useEffect(() => {
    const unsubscribe = subscribeDeleteGuard(() => setGuarded(deleteGuardEnabled()));
    loadDeleteGuard().then(() => setGuarded(deleteGuardEnabled()));
    return unsubscribe;
  }, []);
  useEffect(
    () =>
      registerDeleteHost((req) => {
        setPassword('');
        setWrong(false);
        setRequest(req);
        // Make sure the password setting is loaded before the popup decides.
        loadDeleteGuard().then(() => setGuarded(deleteGuardEnabled()));
      }),
    []
  );

  const close = () => setRequest(null);
  const confirm = async () => {
    // Read the saved setting now, not a possibly stale copy.
    await loadDeleteGuard();
    const needsPassword = deleteGuardEnabled();
    setGuarded(needsPassword);
    if (needsPassword && !checkDeletePassword(password)) {
      setWrong(true);
      return;
    }
    const { onConfirm } = request;
    setRequest(null);
    onConfirm();
  };

  return (
    <Modal visible={!!request} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: theme.sheet }]}>
          <View style={[styles.icon, { backgroundColor: '#FDECEC' }]}>
            <Ionicons name={guarded ? 'lock-closed-outline' : 'trash-outline'} size={26} color="#E5383B" />
          </View>
          <Text style={[styles.title, { color: theme.text }]}>{request?.title || 'Delete?'}</Text>
          {request?.message ? (
            <Text style={[styles.message, { color: theme.textSecondary }]}>{request.message}</Text>
          ) : null}
          {guarded ? (
            <>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: theme.surfaceAlt, color: theme.text, borderColor: wrong ? '#E5383B' : theme.borderNeutral },
                ]}
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  setWrong(false);
                }}
                placeholder="Delete password"
                placeholderTextColor={theme.textMuted}
                secureTextEntry
                autoFocus
                autoCapitalize="none"
                onSubmitEditing={confirm}
                accessibilityLabel="Delete password"
              />
              {wrong ? <Text style={styles.wrong}>Wrong password. Nothing was deleted.</Text> : null}
            </>
          ) : null}
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, { backgroundColor: theme.surfaceAlt }]} onPress={close}>
              <Text style={[styles.btnText, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.deleteBtn, guarded && !password && styles.disabled]}
              onPress={confirm}
              disabled={guarded && !password}
              accessibilityLabel="Confirm delete"
            >
              <Text style={[styles.btnText, styles.deleteText]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  sheet: { borderRadius: 20, padding: 20, alignItems: 'center' },
  icon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  message: { fontSize: 14, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  input: { alignSelf: 'stretch', borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 16, marginTop: 16 },
  wrong: { color: '#E5383B', fontSize: 13, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18, alignSelf: 'stretch' },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  btnText: { fontSize: 15, fontWeight: '700' },
  deleteBtn: { backgroundColor: '#E5383B' },
  deleteText: { color: '#FFF' },
  disabled: { opacity: 0.45 },
});
