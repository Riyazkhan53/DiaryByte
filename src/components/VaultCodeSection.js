import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { VAULT_CODE_LENGTH, isVaultCode, vaultCode } from '../utils/vaultLock';

/** Settings: the Personal Vault's 6-digit combination — set, change or remove it. */
export function VaultCodeSection({ sectionStyle, titleStyle, hintStyle }) {
  const { theme } = useTheme();
  const [hasCode, setHasCode] = useState(vaultCode.enabled());
  const [mode, setMode] = useState(null); // 'set' | 'change' | 'remove'
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    const unsubscribe = vaultCode.subscribe(() => setHasCode(vaultCode.enabled()));
    vaultCode.refresh().then(() => setHasCode(vaultCode.enabled()));
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
    if ((mode === 'change' || mode === 'remove') && !vaultCode.check(current)) {
      setError('Current code is wrong.');
      return;
    }
    if (mode === 'remove') {
      await vaultCode.clear();
      setMode(null);
      setNotice('Vault code removed. The vault door now opens without a code.');
      return;
    }
    if (!isVaultCode(next)) {
      setError(`The code must be exactly ${VAULT_CODE_LENGTH} digits.`);
      return;
    }
    if (next !== again) {
      setError("The two codes don't match.");
      return;
    }
    await vaultCode.set(next);
    setMode(null);
    setNotice(mode === 'change' ? 'Vault code changed.' : 'Vault code set. Turn the dials to it to open the vault.');
  };

  const input = (label, value, onChange) => (
    <TextInput
      style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
      value={value}
      onChangeText={(v) => {
        onChange(v.replace(/\D/g, '').slice(0, VAULT_CODE_LENGTH));
        setError(null);
      }}
      placeholder={label}
      placeholderTextColor={theme.textMuted}
      keyboardType="number-pad"
      maxLength={VAULT_CODE_LENGTH}
      secureTextEntry
      accessibilityLabel={label}
    />
  );

  return (
    <View style={sectionStyle}>
      <Text style={titleStyle}>Vault code</Text>
      <View style={styles.row}>
        <Ionicons name="keypad-outline" size={22} color={theme.secondary} />
        <Text style={[styles.label, { color: theme.text }]}>
          {hasCode ? '6-digit combination is set' : 'No combination set'}
        </Text>
      </View>

      {mode ? (
        <View style={styles.form}>
          {mode !== 'set' ? input('Current code', current, setCurrent) : null}
          {mode !== 'remove' ? (
            <>
              {input(mode === 'change' ? 'New 6-digit code' : '6-digit code', next, setNext)}
              {input('Type it again', again, setAgain)}
            </>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, { backgroundColor: theme.surfaceAlt }]} onPress={() => setMode(null)}>
              <Text style={[styles.btnText, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: mode === 'remove' ? '#E5383B' : theme.primary }]}
              onPress={submit}
              accessibilityLabel={mode === 'remove' ? 'Remove vault code' : 'Save vault code'}
            >
              <Text style={[styles.btnText, { color: '#FFF' }]}>{mode === 'remove' ? 'Remove' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.links}>
          {hasCode ? (
            <>
              <TouchableOpacity style={styles.link} onPress={() => open('change')} accessibilityLabel="Change vault code">
                <Ionicons name="key-outline" size={18} color={theme.primary} />
                <Text style={[styles.linkText, { color: theme.primary }]}>Change code</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.link} onPress={() => open('remove')} accessibilityLabel="Remove vault code">
                <Ionicons name="close-circle-outline" size={18} color="#E5383B" />
                <Text style={[styles.linkText, { color: '#E5383B' }]}>Remove</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.link} onPress={() => open('set')} accessibilityLabel="Set vault code">
              <Ionicons name="add-circle-outline" size={18} color={theme.primary} />
              <Text style={[styles.linkText, { color: theme.primary }]}>Set a code</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {notice ? <Text style={[styles.notice, { color: '#2DA44E' }]}>{notice}</Text> : null}
      <Text style={[hintStyle, { color: theme.textMuted }]}>
        The Personal Vault opens behind a safe door: turn its six dials to this code and turn the handle. Saved as a hash
        and synced, so all your devices use the same code. There&apos;s no reset: changing or removing it needs the current code.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  label: { flex: 1, fontSize: 15 },
  form: { gap: 8, marginTop: 6 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 18, letterSpacing: 6 },
  error: { color: '#E5383B', fontSize: 13 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  btnText: { fontSize: 15, fontWeight: '700' },
  links: { flexDirection: 'row', gap: 18 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  linkText: { fontSize: 14, fontWeight: '600' },
  notice: { fontSize: 13, marginTop: 6 },
});
