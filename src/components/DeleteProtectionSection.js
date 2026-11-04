import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import {
  checkDeletePassword,
  clearDeletePassword,
  deleteGuardEnabled,
  loadDeleteGuard,
  setDeletePassword,
  subscribeDeleteGuard,
} from '../utils/deleteGuard';

const MIN_LENGTH = 4;

/** Settings: "Password to confirm delete" — on, off, or change it. */
export function DeleteProtectionSection({ sectionStyle, titleStyle, hintStyle }) {
  const { theme } = useTheme();
  const [enabled, setEnabled] = useState(deleteGuardEnabled());
  const [mode, setMode] = useState(null); // 'set' | 'change' | 'off'
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    const unsubscribe = subscribeDeleteGuard(() => setEnabled(deleteGuardEnabled()));
    loadDeleteGuard().then(() => setEnabled(deleteGuardEnabled()));
    return unsubscribe;
  }, []);

  const open = (m) => {
    setMode(m);
    setCurrent('');
    setNext('');
    setAgain('');
    setError(null);
    setNotice(null);
  };

  const submit = async () => {
    if ((mode === 'change' || mode === 'off') && !checkDeletePassword(current)) {
      setError('Current password is wrong.');
      return;
    }
    if (mode === 'off') {
      await clearDeletePassword();
      setMode(null);
      setNotice('Delete password turned off. Deletes still ask you to confirm.');
      return;
    }
    if (next.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (next !== again) {
      setError("The two passwords don't match.");
      return;
    }
    await setDeletePassword(next);
    setMode(null);
    setNotice(mode === 'change' ? 'Delete password changed.' : 'Delete password set. Every delete now asks for it.');
  };

  const input = (label, value, onChange) => (
    <TextInput
      style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
      value={value}
      onChangeText={(v) => {
        onChange(v);
        setError(null);
      }}
      placeholder={label}
      placeholderTextColor={theme.textMuted}
      secureTextEntry
      autoCapitalize="none"
      accessibilityLabel={label}
    />
  );

  return (
    <View style={sectionStyle}>
      <Text style={titleStyle}>Delete protection</Text>
      <View style={styles.row}>
        <Ionicons name="lock-closed-outline" size={22} color={theme.secondary} />
        <Text style={[styles.label, { color: theme.text }]}>Password to confirm delete</Text>
        <Switch
          value={enabled || mode === 'set'}
          onValueChange={(on) => open(on ? 'set' : enabled ? 'off' : null)}
          trackColor={{ false: theme.surfaceAlt, true: '#34C759' }}
          ios_backgroundColor={theme.surfaceAlt}
          activeThumbColor="#FFFFFF"
          thumbColor="#FFFFFF"
          accessibilityLabel="Password to confirm delete"
        />
      </View>

      {mode ? (
        <View style={styles.form}>
          {mode === 'change' || mode === 'off' ? input('Current password', current, setCurrent) : null}
          {mode !== 'off' ? (
            <>
              {input(mode === 'change' ? 'New password' : 'Set a password', next, setNext)}
              {input('Type it again', again, setAgain)}
            </>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, { backgroundColor: theme.surfaceAlt }]} onPress={() => setMode(null)}>
              <Text style={[styles.btnText, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: mode === 'off' ? '#E5383B' : theme.primary }]}
              onPress={submit}
              accessibilityLabel={mode === 'off' ? 'Turn off delete password' : 'Save delete password'}
            >
              <Text style={[styles.btnText, { color: '#FFF' }]}>{mode === 'off' ? 'Turn off' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : enabled ? (
        <TouchableOpacity style={styles.change} onPress={() => open('change')} accessibilityLabel="Change delete password">
          <Ionicons name="key-outline" size={18} color={theme.primary} />
          <Text style={[styles.changeText, { color: theme.primary }]}>Change password</Text>
        </TouchableOpacity>
      ) : null}

      {notice ? <Text style={[styles.notice, { color: '#2DA44E' }]}>{notice}</Text> : null}
      <Text style={[hintStyle, { color: theme.textMuted }]}>
        Every delete in the app asks you to confirm. With this on, it also asks for this password. It is kept only on
        this device, as a hash. There&apos;s no reset: changing or turning it off needs the current password.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  label: { flex: 1, fontSize: 15 },
  form: { gap: 8, marginTop: 6 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 15 },
  error: { color: '#E5383B', fontSize: 13 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  btnText: { fontSize: 15, fontWeight: '700' },
  change: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  changeText: { fontSize: 14, fontWeight: '600' },
  notice: { fontSize: 13, marginTop: 6 },
});
