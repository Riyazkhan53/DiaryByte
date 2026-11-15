import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { VAULT_CODE_LENGTH, vaultLock } from '../utils/vaultLock';

const HOUR = 3600 * 1000;
const CHOICES = [
  ['1h', '1 hour', HOUR],
  ['8h', '8 hours', 8 * HOUR],
  ['1d', '1 day', 24 * HOUR],
  ['1w', '1 week', 7 * 24 * HOUR],
  ['custom', 'Custom', 0],
  ['always', 'Always', null],
];

const until = (v) =>
  v === 'always'
    ? 'Opens without the code until you turn this off.'
    : v
      ? `Opens without the code until ${new Date(v).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}.`
      : 'Asks for the code every time.';

/**
 * Settings → Vault code: "Don't ask for the code" for 1 hour … always.
 * The Vault, Personal Documents and Authenticator then open without the
 * code on this phone until then.
 */
export function VaultSkipCode({ hintStyle }) {
  const { theme } = useTheme();
  const [state, setState] = useState(() => vaultLock.skipUntil());
  const [pick, setPick] = useState(null); // choice waiting for the code / custom length
  const [code, setCode] = useState('');
  const [amount, setAmount] = useState('2');
  const [unit, setUnit] = useState('days');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const refresh = () => setState(vaultLock.skipUntil());
    vaultLock.load().then(refresh);
    const t = setInterval(refresh, 30000);
    const unsubscribe = vaultLock.subscribe(refresh);
    return () => {
      clearInterval(t);
      unsubscribe();
    };
  }, []);

  const msFor = (key) => {
    if (key === 'custom') {
      const n = Number(amount);
      if (!(n > 0)) return undefined;
      return n * (unit === 'days' ? 24 * HOUR : HOUR);
    }
    return CHOICES.find((c) => c[0] === key)[2];
  };

  const apply = async (key, withCode) => {
    const ms = msFor(key);
    if (ms === undefined) {
      setError('Enter how long.');
      return;
    }
    setBusy(true);
    setError(null);
    const ok = await vaultLock.skipCodeFor(ms, withCode || null);
    setBusy(false);
    if (!ok) {
      setError(withCode ? 'Wrong code.' : null);
      setPick(key);
      return;
    }
    setPick(null);
    setCode('');
    setState(vaultLock.skipUntil());
  };

  const choose = (key) => {
    setError(null);
    // The vault is open (or already skipping): no need to ask for the code.
    if (key !== 'custom' && vaultLock.key()) {
      apply(key);
      return;
    }
    setPick(key);
  };

  const chip = (on) => [styles.chip, { backgroundColor: on ? theme.primary : theme.surfaceAlt, borderColor: on ? theme.primary : theme.borderNeutral }];

  return (
    <View style={[styles.box, { borderColor: theme.borderNeutral }]}>
      <View style={styles.head}>
        <Ionicons name={state ? 'lock-open-outline' : 'lock-closed-outline'} size={20} color={state ? '#F59E0B' : theme.secondary} />
        <Text style={[styles.title, { color: theme.text }]}>Don&apos;t ask for the code</Text>
      </View>
      <Text style={[styles.status, { color: state ? '#B45309' : theme.textSecondary }]}>{until(state)}</Text>
      <View style={styles.chips}>
        {CHOICES.map(([key, label]) => (
          <TouchableOpacity key={key} style={chip(pick === key)} onPress={() => choose(key)} disabled={busy} accessibilityLabel={`Don't ask for ${label}`}>
            <Text style={[styles.chipText, { color: pick === key ? theme.onPrimary : theme.text }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {pick ? (
        <View style={styles.form}>
          {pick === 'custom' ? (
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.amount, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                value={amount}
                onChangeText={(v) => setAmount(v.replace(/[^\d]/g, '').slice(0, 3))}
                keyboardType="number-pad"
                accessibilityLabel="How long"
              />
              {['hours', 'days'].map((u) => (
                <TouchableOpacity key={u} style={chip(unit === u)} onPress={() => setUnit(u)} accessibilityLabel={`In ${u}`}>
                  <Text style={[styles.chipText, { color: unit === u ? theme.onPrimary : theme.text }]}>{u}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          {!vaultLock.key() ? (
            <TextInput
              style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, VAULT_CODE_LENGTH))}
              placeholder="Vault code (once)"
              placeholderTextColor={theme.textMuted}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={VAULT_CODE_LENGTH}
              accessibilityLabel="Vault code to stop asking"
            />
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, { backgroundColor: theme.surfaceAlt }]} onPress={() => setPick(null)}>
              <Text style={[styles.btnText, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: theme.primary }]}
              onPress={() => apply(pick, vaultLock.key() ? null : code)}
              disabled={busy || (!vaultLock.key() && code.length !== VAULT_CODE_LENGTH)}
              accessibilityLabel="Confirm don't ask"
            >
              {busy ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={[styles.btnText, { color: '#FFF' }]}>Confirm</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      {state ? (
        <TouchableOpacity
          style={styles.link}
          onPress={() => vaultLock.askForCode().then(() => setState(null))}
          accessibilityLabel="Ask for the code every time"
        >
          <Ionicons name="lock-closed-outline" size={16} color={theme.primary} />
          <Text style={[styles.linkText, { color: theme.primary }]}>Ask for the code every time</Text>
        </TouchableOpacity>
      ) : null}
      <Text style={[hintStyle, { color: theme.textMuted }]}>
        For the Vault, Personal Documents and Authenticator on this phone only. While it&apos;s on, anyone who can open your
        phone can open them too, and the key is kept on this phone until then.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 10, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 15, fontWeight: '700' },
  status: { fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 13, fontWeight: '600' },
  form: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 16 },
  amount: { width: 70, textAlign: 'center' },
  error: { color: '#E5383B', fontSize: 13 },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  btnText: { fontSize: 15, fontWeight: '700' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  linkText: { fontSize: 14, fontWeight: '600' },
});
