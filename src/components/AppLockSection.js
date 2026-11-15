import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { LOCK_AFTER, appLockPrefs, appLockSupported, biometricStatus, loadAppLock, setAppLock, setLockAfter } from '../utils/appLock';
import { vaultLock } from '../utils/vaultLock';

/** Settings → App lock: fingerprint to open DiaryByte, and to open the vault. */
export function AppLockSection({ sectionStyle, titleStyle, hintStyle }) {
  const { theme } = useTheme();
  const [status, setStatus] = useState(null);
  const [prefs, setPrefs] = useState(appLockPrefs());
  const [vaultFp, setVaultFp] = useState(vaultLock.fingerprintOn());
  const [hasCode, setHasCode] = useState(vaultLock.enabled());
  const [note, setNote] = useState(null);

  useEffect(() => {
    biometricStatus().then(setStatus);
    loadAppLock().then((p) => setPrefs({ ...p }));
    vaultLock.load().then(() => {
      setVaultFp(vaultLock.fingerprintOn());
      setHasCode(vaultLock.enabled());
    });
    return vaultLock.subscribe(() => {
      setVaultFp(vaultLock.fingerprintOn());
      setHasCode(vaultLock.enabled());
    });
  }, []);

  if (!appLockSupported) return null;
  const ready = status?.hardware && status?.enrolled;

  const toggleApp = async (on) => {
    setNote(null);
    if (await setAppLock(on)) setPrefs({ ...appLockPrefs() });
    else setNote('Fingerprint not confirmed.');
  };

  const toggleVault = async (on) => {
    setNote(null);
    if (!on) {
      await vaultLock.disableFingerprint();
      return;
    }
    // Needs the vault's key: open, or "don't ask" on. Otherwise open the vault once first.
    if (!(await vaultLock.enableFingerprint())) {
      setNote(vaultLock.key() ? 'Fingerprint not confirmed.' : 'Open the Personal Vault once (turn the dials), then turn this on.');
    }
  };

  const sw = (value, onChange, label, disabled) => (
    <Switch
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      trackColor={{ false: theme.surfaceAlt, true: '#34C759' }}
      ios_backgroundColor={theme.surfaceAlt}
      activeThumbColor="#FFFFFF"
      thumbColor="#FFFFFF"
      accessibilityLabel={label}
    />
  );

  return (
    <View style={sectionStyle}>
      <Text style={titleStyle}>App lock</Text>
      {status && !ready ? (
        <Text style={[hintStyle, { color: '#B45309' }]}>
          {status.hardware ? 'Add a fingerprint in your phone’s Settings → Security first.' : 'This phone has no fingerprint sensor.'}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Ionicons name="finger-print" size={22} color={theme.primary} />
        <Text style={[styles.label, { color: theme.text }]}>Lock DiaryByte with fingerprint</Text>
        {sw(!!prefs.enabled, toggleApp, 'Lock DiaryByte with fingerprint', !ready)}
      </View>
      {prefs.enabled ? (
        <View style={styles.chips}>
          {LOCK_AFTER.map(([secs, label]) => {
            const on = (prefs.after || 0) === secs;
            return (
              <TouchableOpacity
                key={secs}
                style={[styles.chip, { backgroundColor: on ? theme.primary : theme.surfaceAlt, borderColor: on ? theme.primary : theme.borderNeutral }]}
                onPress={() => setLockAfter(secs).then(() => setPrefs({ ...appLockPrefs() }))}
                accessibilityLabel={`Lock ${label.toLowerCase()}`}
              >
                <Text style={[styles.chipText, { color: on ? theme.onPrimary : theme.text }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
      {hasCode ? (
        <View style={styles.row}>
          <Ionicons name="lock-open-outline" size={22} color={theme.secondary} />
          <Text style={[styles.label, { color: theme.text }]}>Open the vault with fingerprint</Text>
          {sw(vaultFp, toggleVault, 'Open the vault with fingerprint', !ready)}
        </View>
      ) : null}
      {note ? <Text style={[styles.note, { color: '#E5383B' }]}>{note}</Text> : null}
      <Text style={[hintStyle, { color: theme.textMuted }]}>
        The app lock asks for your fingerprint (or the phone’s PIN) when DiaryByte opens, and when you come back after the
        time you choose. “Open the vault with fingerprint” lets the Vault, Personal Documents and Authenticator open with
        your fingerprint instead of the dials; the key stays in the phone’s secure storage.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  label: { flex: 1, fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  chip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 13, fontWeight: '600' },
  note: { fontSize: 13, marginTop: 4 },
});
