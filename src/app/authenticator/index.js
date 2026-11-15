import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { scanFromURLAsync } from 'expo-camera';
import { router, useFocusEffect } from 'expo-router';
import Header from '../../components/Header';
import VaultDoor from '../../components/vault/VaultDoor';
import SyncRow from '../../components/SyncRow';
import QrCode from '../../components/QrCode';
import QrScanner from '../../components/QrScanner';
import { useTheme } from '../../hooks/useTheme';
import { useSyncedCollection } from '../../hooks/useSyncedCollection';
import { confirmDelete } from '../../utils/confirm';
import { vaultLock } from '../../utils/vaultLock';
import { decryptItem, encryptItem, isEncryptedItem } from '../../utils/vaultCrypto';
import { codeFor, exportQrs, readScanned, sameAccount, spaced } from '../../utils/totp';

const AUTH_STORAGE_KEY = '@diarybyte_authenticator';

// Decrypted accounts by ciphertext while the screen is open. Cleared when it locks.
const opened = new Map();
const COLORS = ['#4285F4', '#EA4335', '#FBBC05', '#34A853', '#7C3AED', '#0EA5E9', '#F97316', '#EC4899'];
const colorFor = (s) => COLORS[[...String(s || '?')].reduce((n, c) => n + c.charCodeAt(0), 0) % COLORS.length];

/**
 * Authenticator: two-factor codes (like Google Authenticator), imported from
 * Google Authenticator's "Transfer accounts" QR codes, a website's setup QR,
 * or a setup key; exported back the same way. Opens with the vault code;
 * the secret keys are encrypted on the phone before they're saved or
 * synced, and the watch unlocks them with the same code.
 */
export default function AuthenticatorScreen() {
  const { theme } = useTheme();
  const { items: stored, loadError, synced, persist, pulling, pullInfo, pullNow } = useSyncedCollection('authenticator', AUTH_STORAGE_KEY);
  const [unlocked, setUnlocked] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState(null);
  const [paste, setPaste] = useState(null); // { text, name, issuer } while typing a key
  const [notice, setNotice] = useState(null); // { tone, text }
  const [busy, setBusy] = useState(null);
  const [editing, setEditing] = useState(null); // account being renamed
  const [exportQ, setExportQ] = useState(null); // { codes, index }
  const [batch, setBatch] = useState(null); // Google export being scanned: { id, size, seen: [indexes] }

  useFocusEffect(
    useCallback(
      () => () => {
        vaultLock.lock();
        opened.clear();
        setUnlocked(false);
        setExportQ(null);
        setEditing(null);
      },
      []
    )
  );

  // Codes change every 30 s: tick each second while open.
  useEffect(() => {
    if (!unlocked) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [unlocked]);

  const accounts = useMemo(() => {
    if (!unlocked) {
      opened.clear();
      return [];
    }
    const key = vaultLock.key();
    return stored
      .map((raw) => {
        if (!isEncryptedItem(raw)) return { id: raw.id, unreadable: true };
        if (!opened.has(raw.enc)) opened.set(raw.enc, decryptItem(key, raw));
        return opened.get(raw.enc) || { id: raw.id, createdAt: raw.createdAt, unreadable: true };
      })
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.issuer || a.name).localeCompare(String(b.issuer || b.name)));
  }, [stored, unlocked]);

  const readable = accounts.filter((a) => !a.unreadable);
  const shown = query.trim()
    ? accounts.filter((a) => `${a.issuer} ${a.name}`.toLowerCase().includes(query.trim().toLowerCase()))
    : accounts;

  // Save the full (decrypted) list: each account sealed with the vault key.
  const saveAll = (list) => {
    const key = vaultLock.key();
    if (!key) {
      setNotice({ tone: 'bad', text: 'The vault is locked. Open it again.' });
      return false;
    }
    const keep = stored.filter((raw) => !list.some((a) => a.id === raw.id) && accounts.find((a) => a.id === raw.id)?.unreadable);
    persist([...list.map((a) => encryptItem(key, a)), ...keep]);
    return true;
  };

  /** Add accounts (skipping ones already here). Returns how many were new. */
  const addAccounts = (incoming) => {
    const fresh = incoming.filter((a) => !readable.some((b) => sameAccount(a, b)));
    if (!fresh.length) return 0;
    const base = Date.now();
    const made = fresh.map((a, i) => ({
      ...a,
      id: `${base.toString(36)}${i}${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date(base).toISOString(),
      order: readable.length + i,
    }));
    return saveAll([...readable, ...made]) ? made.length : 0;
  };

  const take = (text) => {
    const r = readScanned(text);
    if (r.error) return { added: 0, error: r.error };
    const added = addAccounts(r.accounts);
    return { added, total: r.accounts.length, batch: r.batch, skipped: r.skipped || 0 };
  };

  const describe = ({ added, total, skipped }) =>
    `${added ? `Added ${added} account${added === 1 ? '' : 's'}` : 'Nothing new'}${total > added ? ` (${total - added} already here)` : ''}${skipped ? `; ${skipped} unsupported skipped` : ''}.`;

  const onScan = (data) => {
    const r = take(data);
    if (r.error) {
      setScanStatus(r.error);
      return;
    }
    if (r.batch && r.batch.size > 1) {
      const prev = batch && batch.id === r.batch.id ? batch.seen : [];
      const seen = prev.includes(r.batch.index) ? prev : [...prev, r.batch.index];
      if (seen.length < r.batch.size) {
        setBatch({ id: r.batch.id, size: r.batch.size, seen });
        setScanStatus(`${describe(r)} Code ${seen.length} of ${r.batch.size} done: show the next one.`);
        return;
      }
    }
    setBatch(null);
    setScanning(false);
    setScanStatus(null);
    setNotice({ tone: 'ok', text: describe(r) });
  };

  const fromScreenshots = async () => {
    setAddOpen(false);
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 10, quality: 1 });
    if (res.canceled || !res.assets?.length) return;
    setBusy('Reading the QR codes…');
    let added = 0;
    let found = 0;
    let problem = null;
    for (const asset of res.assets) {
      try {
        const codes = await scanFromURLAsync(asset.uri, ['qr']);
        for (const c of codes) {
          found += 1;
          const r = take(c.data);
          if (r.error) problem = r.error;
          else added += r.added;
        }
      } catch (_error) {
        problem = "Couldn't read that picture.";
      }
    }
    setBusy(null);
    setNotice(
      found
        ? { tone: added ? 'ok' : 'warn', text: `${added ? `Added ${added} account${added === 1 ? '' : 's'}` : 'Nothing new to add'} from ${found} QR code${found === 1 ? '' : 's'}.${problem ? ` ${problem}` : ''}` }
        : { tone: 'bad', text: 'No QR code found in that picture. Crop it to the code, or scan it with the camera.' }
    );
  };

  function startScan() {
    setAddOpen(false);
    setBatch(null);
    setScanStatus(null);
    setScanning(true);
  }

  function startPaste() {
    setAddOpen(false);
    setPaste({ text: '', name: '', issuer: '' });
  }

  function closeScanner() {
    setScanning(false);
    if (batch) setNotice({ tone: 'warn', text: `Scanned ${batch.seen.length} of ${batch.size} export codes. Scan the rest to add those accounts too.` });
    setBatch(null);
  }

  const savePaste = () => {
    const r = readScanned(paste.text, { name: paste.name.trim(), issuer: paste.issuer.trim() });
    if (r.error) {
      setNotice({ tone: 'bad', text: r.error });
      return;
    }
    const added = addAccounts(r.accounts);
    setPaste(null);
    setNotice({ tone: added ? 'ok' : 'warn', text: added ? 'Account added.' : 'That account is already here.' });
  };

  const copy = async (a, code) => {
    await Clipboard.setStringAsync(code);
    setCopied(a.id);
    setTimeout(() => setCopied((c) => (c === a.id ? null : c)), 1500);
  };

  const nextHotp = (a) => saveAll(readable.map((x) => (x.id === a.id ? { ...x, counter: (x.counter || 0) + 1 } : x)));

  const remove = (a) =>
    confirmDelete(
      'Remove account',
      `Remove ${a.issuer || a.name}? Make sure you can still sign in (another authenticator, or turn 2FA off first): its codes can't be recovered from here.`,
      () => {
        persist(stored.filter((raw) => raw.id !== a.id));
        setEditing(null);
      }
    );

  const saveEdit = () => {
    saveAll(readable.map((x) => (x.id === editing.id ? { ...x, name: editing.name.trim() || x.name, issuer: editing.issuer.trim() } : x)));
    setEditing(null);
  };

  const card = [styles.card, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }];
  const input = [styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }];

  if (!unlocked) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
        <Header title="Authenticator" subtitle="Enter your vault code to open" />
        <View style={styles.doorArea}>
          <VaultDoor onOpen={() => setUnlocked(true)} onSetCode={() => router.push('/settings')} />
        </View>
      </SafeAreaView>
    );
  }

  const renderItem = ({ item: a }) => {
    if (a.unreadable) {
      return (
        <View style={card}>
          <Text style={[styles.small, { color: theme.textMuted }]}>An account that can&apos;t be opened with this vault code.</Text>
        </View>
      );
    }
    const c = codeFor(a, now);
    const low = c.remaining != null && c.remaining <= 5;
    const tint = colorFor(a.issuer || a.name);
    return (
      <TouchableOpacity style={card} activeOpacity={0.8} onPress={() => copy(a, c.code)} onLongPress={() => setEditing({ ...a })} accessibilityLabel={`Copy code for ${a.issuer || a.name}`}>
        <View style={styles.row}>
          <View style={[styles.avatar, { backgroundColor: tint + '26' }]}>
            <Text style={[styles.avatarText, { color: tint }]}>{(a.issuer || a.name || '?').slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={[styles.issuer, { color: theme.text }]} numberOfLines={1}>
              {a.issuer || a.name}
            </Text>
            {a.issuer ? (
              <Text style={[styles.small, { color: theme.textMuted }]} numberOfLines={1}>
                {a.name}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity onPress={() => setEditing({ ...a })} style={styles.iconBtn} accessibilityLabel={`Edit ${a.issuer || a.name}`}>
            <Ionicons name="ellipsis-vertical" size={18} color={theme.textMuted} />
          </TouchableOpacity>
        </View>
        <View style={styles.codeRow}>
          <Text style={[styles.code, { color: low ? '#E5383B' : theme.primary }]} accessibilityLabel={`Code ${c.code}`}>
            {spaced(c.code)}
          </Text>
          {copied === a.id ? (
            <Text style={[styles.copied, { color: '#2DA44E' }]}>Copied</Text>
          ) : a.type === 'hotp' ? (
            <TouchableOpacity onPress={() => nextHotp(a)} style={[styles.nextBtn, { borderColor: theme.borderNeutral }]} accessibilityLabel="Next code">
              <Ionicons name="refresh" size={16} color={theme.textSecondary} />
            </TouchableOpacity>
          ) : (
            <Text style={[styles.secs, { color: low ? '#E5383B' : theme.textMuted }]}>{c.remaining}s</Text>
          )}
        </View>
        {a.type !== 'hotp' ? (
          <View style={[styles.track, { backgroundColor: theme.surfaceAlt }]}>
            <View style={[styles.fill, { width: `${Math.round(c.progress * 100)}%`, backgroundColor: low ? '#E5383B' : tint }]} />
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
      <Header title="Authenticator" subtitle="2-step codes · also on your watch" />
      <View style={styles.content}>
        <SyncRow synced={synced} pulling={pulling} pullInfo={pullInfo} onPull={pullNow} error={loadError} />
        <FlatList
          data={shown}
          keyExtractor={(a) => a.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View>
              <View style={styles.headRow}>
                <Ionicons name="lock-closed" size={14} color={theme.textMuted} />
                <Text style={[styles.small, styles.flex, { color: theme.textMuted }]}>Keys are encrypted with your vault code. Tap a code to copy it.</Text>
                {readable.length ? (
                  <TouchableOpacity onPress={() => setExportQ({ codes: exportQrs(readable), index: 0 })} accessibilityLabel="Export to Google Authenticator" style={styles.iconBtn}>
                    <Ionicons name="qr-code-outline" size={20} color={theme.primary} />
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  onPress={() => {
                    vaultLock.lock();
                    opened.clear();
                    setUnlocked(false);
                  }}
                  accessibilityLabel="Lock authenticator"
                  style={styles.iconBtn}
                >
                  <Ionicons name="lock-closed-outline" size={20} color={theme.primary} />
                </TouchableOpacity>
              </View>
              {readable.length > 4 ? <TextInput style={[input, styles.search]} placeholder="Search" placeholderTextColor={theme.textMuted} value={query} onChangeText={setQuery} /> : null}
              {notice ? (
                <TouchableOpacity onPress={() => setNotice(null)} style={[styles.notice, { backgroundColor: (notice.tone === 'ok' ? '#2DA44E' : notice.tone === 'warn' ? '#F59E0B' : '#E5383B') + '1F' }]}>
                  <Text style={[styles.small, { color: notice.tone === 'ok' ? '#2DA44E' : notice.tone === 'warn' ? '#B45309' : '#E5383B' }]}>{notice.text}</Text>
                </TouchableOpacity>
              ) : null}
              {busy ? (
                <View style={styles.busy}>
                  <ActivityIndicator color={theme.primary} />
                  <Text style={[styles.small, { color: theme.textSecondary }]}>{busy}</Text>
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <View style={[card, styles.empty]}>
              <Ionicons name="shield-checkmark-outline" size={36} color={theme.primary} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>Bring your codes from Google Authenticator</Text>
              <Text style={[styles.small, { color: theme.textSecondary }]}>
                1. In Google Authenticator: ☰ menu → Transfer accounts → Export accounts.{'\n'}2. Choose the accounts, then tap + here → Scan QR code (or screenshots of the codes).{'\n'}3. Your codes then also show on your watch: DiaryByte → Codes.
              </Text>
            </View>
          }
          ListFooterComponent={
            readable.length ? (
              <Text style={[styles.small, styles.footer, { color: theme.textMuted }]}>
                On your watch: DiaryByte → Codes (enter your vault code there once). Long-press an account to rename or remove it.
              </Text>
            ) : null
          }
        />
      </View>

      <TouchableOpacity style={[styles.fab, { backgroundColor: theme.secondary, shadowColor: theme.secondary }]} onPress={() => setAddOpen(true)} accessibilityLabel="Add account">
        <Ionicons name="add" size={32} color="#FFF" />
      </TouchableOpacity>

      {/* Add */}
      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setAddOpen(false)}>
          <View style={[styles.sheet, { backgroundColor: theme.sheet }]}>
            <Text style={[styles.sheetTitle, { color: theme.text }]}>Add accounts</Text>
            {[
              ['qr-code-outline', 'Scan QR code', 'Google Authenticator export, or a website’s 2FA setup code', startScan],
              ['images-outline', 'From screenshots', 'Pick screenshots of the export QR codes', fromScreenshots],
              ['key-outline', 'Enter a setup key or link', 'The key a website shows under its QR code', startPaste],
            ].map(([icon, label, sub, onPress]) => (
              <TouchableOpacity key={label} style={[styles.option, { borderColor: theme.borderNeutral }]} onPress={onPress} accessibilityLabel={label}>
                <Ionicons name={icon} size={22} color={theme.primary} />
                <View style={styles.flex}>
                  <Text style={[styles.optionTitle, { color: theme.text }]}>{label}</Text>
                  <Text style={[styles.small, { color: theme.textMuted }]}>{sub}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <QrScanner
        visible={scanning}
        title="Scan 2FA QR code"
        status={scanStatus || 'Point the camera at the QR code. For several export codes, scan them one after another.'}
        onScan={onScan}
        onClose={closeScanner}
      />

      {/* Setup key / link */}
      <Modal visible={!!paste} transparent animationType="fade" onRequestClose={() => setPaste(null)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: theme.sheet }]}>
            {paste ? (
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={[styles.sheetTitle, { color: theme.text }]}>Setup key</Text>
                <TextInput style={input} placeholder="Key (e.g. JBSW Y3DP EHPK 3PXP) or otpauth:// link" placeholderTextColor={theme.textMuted} value={paste.text} onChangeText={(t) => setPaste((p) => ({ ...p, text: t }))} autoCapitalize="characters" autoCorrect={false} accessibilityLabel="Setup key" />
                <TextInput style={[input, styles.gap]} placeholder="Service (e.g. Instagram)" placeholderTextColor={theme.textMuted} value={paste.issuer} onChangeText={(t) => setPaste((p) => ({ ...p, issuer: t }))} accessibilityLabel="Service" />
                <TextInput style={[input, styles.gap]} placeholder="Account (e.g. your email)" placeholderTextColor={theme.textMuted} value={paste.name} onChangeText={(t) => setPaste((p) => ({ ...p, name: t }))} autoCapitalize="none" accessibilityLabel="Account name" />
                <View style={styles.actions}>
                  <TouchableOpacity style={[styles.btn, { backgroundColor: theme.surfaceAlt }]} onPress={() => setPaste(null)}>
                    <Text style={[styles.btnText, { color: theme.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btn, { backgroundColor: theme.primary }, !paste.text.trim() && styles.disabled]} onPress={savePaste} disabled={!paste.text.trim()} accessibilityLabel="Add key">
                    <Text style={[styles.btnText, { color: theme.onPrimary }]}>Add</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Rename / remove */}
      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: theme.sheet }]}>
            {editing ? (
              <>
                <Text style={[styles.sheetTitle, { color: theme.text }]}>Edit account</Text>
                <TextInput style={input} placeholder="Service" placeholderTextColor={theme.textMuted} value={editing.issuer} onChangeText={(t) => setEditing((e) => ({ ...e, issuer: t }))} accessibilityLabel="Edit service" />
                <TextInput style={[input, styles.gap]} placeholder="Account" placeholderTextColor={theme.textMuted} value={editing.name} onChangeText={(t) => setEditing((e) => ({ ...e, name: t }))} autoCapitalize="none" accessibilityLabel="Edit account" />
                <View style={styles.actions}>
                  <TouchableOpacity style={[styles.btn, { backgroundColor: theme.surfaceAlt }]} onPress={() => remove(editing)} accessibilityLabel="Remove account">
                    <Text style={[styles.btnText, { color: '#E5383B' }]}>Remove</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btn, { backgroundColor: theme.primary }]} onPress={saveEdit} accessibilityLabel="Save account">
                    <Text style={[styles.btnText, { color: theme.onPrimary }]}>Save</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => setEditing(null)} style={styles.cancelLink}>
                  <Text style={[styles.small, { color: theme.textMuted }]}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Export to Google Authenticator */}
      <Modal visible={!!exportQ} transparent animationType="fade" onRequestClose={() => setExportQ(null)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, styles.center, { backgroundColor: theme.sheet }]}>
            {exportQ ? (
              <>
                <Text style={[styles.sheetTitle, { color: theme.text }]}>Export to Google Authenticator</Text>
                <Text style={[styles.small, styles.centerText, { color: theme.textSecondary }]}>
                  On the other phone: Google Authenticator → Transfer accounts → Import accounts → scan{exportQ.codes.length > 1 ? ' each code' : ''}.
                </Text>
                <View style={styles.qrBox}>
                  <QrCode value={exportQ.codes[exportQ.index]} size={270} />
                </View>
                <Text style={[styles.small, { color: theme.textMuted }]}>
                  Code {exportQ.index + 1} of {exportQ.codes.length}
                </Text>
                <Text style={[styles.small, styles.centerText, { color: '#E5383B' }]}>Anyone who sees this code can copy your 2-step codes. Don&apos;t share or screenshot it.</Text>
                <View style={styles.actions}>
                  {exportQ.codes.length > 1 ? (
                    <TouchableOpacity
                      style={[styles.btn, { backgroundColor: theme.surfaceAlt }, exportQ.index === 0 && styles.disabled]}
                      disabled={exportQ.index === 0}
                      onPress={() => setExportQ((q) => ({ ...q, index: q.index - 1 }))}
                    >
                      <Text style={[styles.btnText, { color: theme.text }]}>Previous</Text>
                    </TouchableOpacity>
                  ) : null}
                  {exportQ.index < exportQ.codes.length - 1 ? (
                    <TouchableOpacity style={[styles.btn, { backgroundColor: theme.primary }]} onPress={() => setExportQ((q) => ({ ...q, index: q.index + 1 }))} accessibilityLabel="Next export code">
                      <Text style={[styles.btnText, { color: theme.onPrimary }]}>Next</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={[styles.btn, { backgroundColor: theme.primary }]} onPress={() => setExportQ(null)} accessibilityLabel="Done exporting">
                      <Text style={[styles.btnText, { color: theme.onPrimary }]}>Done</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 20 },
  doorArea: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  flex: { flex: 1 },
  list: { paddingBottom: 110 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  small: { fontSize: 12, lineHeight: 17 },
  search: { marginBottom: 10 },
  notice: { borderRadius: 10, padding: 10, marginBottom: 10 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  card: { borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 10, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 17, fontWeight: '800' },
  issuer: { fontSize: 15, fontWeight: '700' },
  iconBtn: { padding: 6 },
  codeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  code: { flex: 1, fontSize: 32, fontWeight: '800', letterSpacing: 3, fontVariant: ['tabular-nums'] },
  secs: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  copied: { fontSize: 14, fontWeight: '700' },
  nextBtn: { borderWidth: 1, borderRadius: 16, padding: 7 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 8 },
  fill: { height: '100%', borderRadius: 2 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  emptyTitle: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  footer: { textAlign: 'center', marginTop: 6 },
  fab: { position: 'absolute', right: 24, bottom: 32, width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 },
  sheet: { borderRadius: 20, padding: 18, maxHeight: '92%' },
  center: { alignItems: 'center' },
  centerText: { textAlign: 'center' },
  sheetTitle: { fontSize: 19, fontWeight: '800', marginBottom: 12 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 12 },
  optionTitle: { fontSize: 15, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  gap: { marginTop: 10 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16, alignSelf: 'stretch' },
  btn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  btnText: { fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  cancelLink: { alignSelf: 'center', paddingTop: 12 },
  qrBox: { marginVertical: 14 },
});
