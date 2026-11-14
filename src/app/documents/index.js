import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import Header from '../../components/Header';
import VaultDoor from '../../components/vault/VaultDoor';
import SyncRow from '../../components/SyncRow';
import DatePicker from '../../components/DatePicker';
import { useTheme } from '../../hooks/useTheme';
import { useSyncedCollection } from '../../hooks/useSyncedCollection';
import { confirmDelete } from '../../utils/confirm';
import { formatDate } from '../../utils/autopay';
import { vaultLock } from '../../utils/vaultLock';
import { decryptItem, encryptItem, isEncryptedItem } from '../../utils/vaultCrypto';
import {
  DOC_TYPES,
  IDDOCS_STORAGE_KEY,
  docTitle,
  docType,
  expiryStatus,
  formatNumber,
  maskNumber,
} from '../../utils/idDocs';
import { MAX_FILES, pickFromFiles, pickPhotos, shareDocFile } from '../../services/idDocFiles';

// Decrypted documents by ciphertext while the screen is open (decrypting
// images is slow). Cleared when it locks.
const opened = new Map();

const TONE = { ok: '#2DA44E', soon: '#F59E0B', expired: '#E5383B' };
const EMPTY = { type: 'aadhaar', title: '', number: '', fields: {}, expiry: '', note: '', files: [] };

/**
 * Personal Documents: Aadhaar, PAN, voter ID, passport, driving licence,
 * passport photos and other papers, with their pictures or PDFs. Opens with
 * the vault code; everything is encrypted on the phone before it's saved
 * or synced.
 */
export default function DocumentsScreen() {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const { items: stored, synced, persist, pulling, pullInfo, pullNow } = useSyncedCollection('iddocs', IDDOCS_STORAGE_KEY);
  const [unlocked, setUnlocked] = useState(false);
  const [viewingId, setViewingId] = useState(null);
  const [shown, setShown] = useState({}); // id → number revealed
  const [form, setForm] = useState(null); // null, or the draft being edited
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(null); // text while picking / saving
  const [problem, setProblem] = useState(null);
  const [viewer, setViewer] = useState(null); // image data URI shown full screen
  const [copied, setCopied] = useState(null);

  // Locked again every time you leave the screen.
  useFocusEffect(
    useCallback(
      () => () => {
        vaultLock.lock();
        opened.clear();
        setUnlocked(false);
        setViewingId(null);
        setShown({});
        setViewer(null);
        setForm(null);
      },
      []
    )
  );

  const docs = useMemo(() => {
    if (!unlocked) {
      opened.clear();
      return [];
    }
    const key = vaultLock.key();
    return stored
      .map((raw) => {
        if (!isEncryptedItem(raw)) return { ...raw, unreadable: true };
        if (!opened.has(raw.enc)) opened.set(raw.enc, decryptItem(key, raw));
        return opened.get(raw.enc) || { id: raw.id, createdAt: raw.createdAt, type: raw.remind?.type, unreadable: true };
      })
      .sort((a, b) => DOC_TYPES.findIndex((t) => t.key === a.type) - DOC_TYPES.findIndex((t) => t.key === b.type));
  }, [stored, unlocked]);

  // Documents this device can't open were probably re-sealed on another
  // device after a code change: fetch the server's copies, once.
  const refetched = useRef(false);
  const unreadable = docs.some((d) => d.unreadable);
  useEffect(() => {
    if (!unlocked) {
      refetched.current = false;
      return;
    }
    if (unreadable && !refetched.current) {
      refetched.current = true;
      pullNow();
    }
  }, [unlocked, unreadable, pullNow]);

  const viewing = viewingId ? docs.find((d) => d.id === viewingId) || null : null;

  const copy = async (doc) => {
    await Clipboard.setStringAsync(String(doc.number || '').replace(/\s+/g, ''));
    setCopied(doc.id);
    setTimeout(() => setCopied((c) => (c === doc.id ? null : c)), 1800);
  };

  const openAdd = (type = 'aadhaar') => {
    setEditingId(null);
    setProblem(null);
    setForm({ ...EMPTY, type });
  };
  const openEdit = (doc) => {
    setViewingId(null);
    setEditingId(doc.id);
    setProblem(null);
    setForm({ ...EMPTY, ...doc, fields: { ...doc.fields }, files: [...(doc.files || [])] });
  };
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const setFieldValue = (key) => (value) => setForm((f) => ({ ...f, fields: { ...f.fields, [key]: value } }));

  const addFiles = async (source) => {
    const room = MAX_FILES - (form?.files?.length || 0);
    setProblem(null);
    setBusy(source === 'files' ? 'Reading files…' : 'Preparing photos…');
    try {
      const result = source === 'files' ? await pickFromFiles(room) : await pickPhotos(source, room);
      if (result.files.length) setForm((f) => ({ ...f, files: [...f.files, ...result.files].slice(0, MAX_FILES) }));
      if (result.error) setProblem(result.error);
    } catch (_error) {
      setProblem("Couldn't add that. Try another file.");
    } finally {
      setBusy(null);
    }
  };

  const type = form ? docType(form.type) : null;
  const canSave = !!form && (!!String(form.number || '').trim() || form.files.length > 0 || !!form.title.trim());

  const save = async () => {
    if (!canSave) return;
    const key = vaultLock.key();
    if (!key) {
      setProblem('The vault is locked. Close this and open it again.');
      return;
    }
    setBusy('Encrypting and saving…');
    // Let the spinner show before the (CPU-heavy) encryption.
    await new Promise((r) => setTimeout(r, 30));
    try {
      const now = new Date().toISOString();
      const t = docType(form.type);
      const entry = {
        id: editingId || `${Date.now()}`,
        createdAt: editingId ? docs.find((d) => d.id === editingId)?.createdAt || now : now,
        type: form.type,
        title: form.title.trim(),
        number: t.number ? formatNumber(form.number, form.type) : '',
        fields: Object.fromEntries(Object.entries(form.fields || {}).filter(([k, v]) => t.fields.some(([fk]) => fk === k) && String(v || '').trim())),
        expiry: t.expiry ? form.expiry || '' : '',
        note: form.note.trim(),
        files: form.files,
        updatedAt: now,
      };
      const sealed = encryptItem(key, entry);
      // Only the type and expiry date stay readable, for the dashboard reminder.
      if (entry.expiry) sealed.remind = { type: entry.type, expiry: entry.expiry };
      persist(editingId ? stored.map((d) => (d.id === editingId ? sealed : d)) : [sealed, ...stored]);
      setForm(null);
    } catch (_error) {
      setProblem("Couldn't save it. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const remove = (doc) =>
    confirmDelete('Delete document', `Remove ${docTitle(doc)} and its files?`, () => {
      setViewingId(null);
      persist(stored.filter((d) => d.id !== doc.id));
    });

  const share = async (file) => {
    setProblem(null);
    try {
      await shareDocFile(file);
    } catch (e) {
      setProblem(e?.message || "Couldn't open it.");
    }
  };

  const card = [styles.card, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }];
  const input = [styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }];

  if (!unlocked) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
        <Header title="Personal Documents" subtitle="Enter your vault code to open" />
        <View style={styles.doorArea}>
          <VaultDoor onOpen={() => setUnlocked(true)} onSetCode={() => router.push('/settings')} />
        </View>
      </SafeAreaView>
    );
  }

  const numberRow = (doc, big) => (
    <NumberRow
      doc={doc}
      big={big}
      open={!!shown[doc.id]}
      copied={copied === doc.id}
      theme={theme}
      onToggle={() => setShown((s) => ({ ...s, [doc.id]: !s[doc.id] }))}
      onCopy={() => copy(doc)}
    />
  );

  const renderDoc = ({ item: doc }) => {
    const t = docType(doc.type);
    const exp = expiryStatus(doc.expiry);
    const images = (doc.files || []).filter((f) => f.kind === 'image');
    const pdfs = (doc.files || []).filter((f) => f.kind === 'pdf');
    return (
      <TouchableOpacity style={card} activeOpacity={0.85} onPress={() => !doc.unreadable && setViewingId(doc.id)} accessibilityLabel={`Open ${docTitle(doc)}`}>
        <View style={styles.cardHead}>
          <View style={[styles.typeIcon, { backgroundColor: t.color + '26' }]}>
            <Ionicons name={t.icon} size={20} color={t.color} />
          </View>
          <View style={styles.flex}>
            <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
              {doc.unreadable ? `${t.label} (can't open on this device)` : docTitle(doc)}
            </Text>
            {doc.title && !doc.unreadable ? <Text style={[styles.small, { color: theme.textMuted }]}>{t.label}</Text> : null}
          </View>
          {exp ? (
            <View style={[styles.badge, { backgroundColor: TONE[exp.tone] + '22' }]}>
              <Text style={[styles.badgeText, { color: TONE[exp.tone] }]}>{exp.tone === 'ok' ? 'Valid' : exp.label}</Text>
            </View>
          ) : null}
        </View>
        {!doc.unreadable ? numberRow(doc) : null}
        {doc.fields?.name ? <Text style={[styles.small, { color: theme.textSecondary }]}>{doc.fields.name}</Text> : null}
        {images.length || pdfs.length ? (
          <View style={styles.thumbs}>
            {images.slice(0, 3).map((f) => (
              <Image key={f.id} source={{ uri: f.data }} style={[styles.thumb, { borderColor: theme.borderNeutral }]} blurRadius={8} />
            ))}
            {pdfs.map((f) => (
              <View key={f.id} style={[styles.pdfChip, { backgroundColor: theme.surfaceAlt }]}>
                <Ionicons name="document-outline" size={14} color={theme.textSecondary} />
                <Text style={[styles.small, { color: theme.textSecondary }]} numberOfLines={1}>
                  PDF
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
      <Header title="Personal Documents" subtitle="Aadhaar, PAN, passport and more" />
      <View style={styles.content}>
        <SyncRow synced={synced} pulling={pulling} pullInfo={pullInfo} onPull={pullNow} />
        <FlatList
          data={docs}
          keyExtractor={(d) => d.id}
          renderItem={renderDoc}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.headRow}>
              <Ionicons name="lock-closed" size={14} color={theme.textMuted} />
              <Text style={[styles.small, styles.flex, { color: theme.textMuted }]}>
                Encrypted with your vault code on this phone before it&apos;s saved; the server only keeps scrambled data.
              </Text>
              <TouchableOpacity
                onPress={() => {
                  vaultLock.lock();
                  opened.clear();
                  setUnlocked(false);
                }}
                accessibilityLabel="Lock documents"
              >
                <Ionicons name="lock-closed-outline" size={20} color={theme.primary} />
              </TouchableOpacity>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>Add your first document:</Text>
              <View style={styles.typeGrid}>
                {DOC_TYPES.map((t) => (
                  <TouchableOpacity key={t.key} style={[styles.typeTile, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => openAdd(t.key)}>
                    <Ionicons name={t.icon} size={22} color={t.color} />
                    <Text style={[styles.typeTileText, { color: theme.text }]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          }
        />
      </View>

      <TouchableOpacity style={[styles.fab, { backgroundColor: theme.secondary, shadowColor: theme.secondary }]} onPress={() => openAdd()} accessibilityLabel="Add document">
        <Ionicons name="add" size={32} color="#FFF" />
      </TouchableOpacity>

      {/* A document's details */}
      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewingId(null)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: theme.sheet }]}>
            {viewing ? (
              <ScrollView>
                <View style={styles.cardHead}>
                  <View style={[styles.typeIcon, { backgroundColor: docType(viewing.type).color + '26' }]}>
                    <Ionicons name={docType(viewing.type).icon} size={22} color={docType(viewing.type).color} />
                  </View>
                  <Text style={[styles.sheetTitle, styles.flex, { color: theme.text }]}>{docTitle(viewing)}</Text>
                  <TouchableOpacity onPress={() => setViewingId(null)} accessibilityLabel="Close">
                    <Ionicons name="close" size={24} color={theme.textMuted} />
                  </TouchableOpacity>
                </View>
                {viewing.number ? <Text style={[styles.label, { color: theme.textSecondary }]}>{docType(viewing.type).number}</Text> : null}
                {numberRow(viewing, true)}
                {docType(viewing.type)
                  .fields.filter(([k]) => viewing.fields?.[k])
                  .map(([k, label, kind]) => (
                    <View key={k} style={styles.fieldRow}>
                      <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
                      <Text style={[styles.value, { color: theme.text }]} selectable>
                        {kind === 'date' ? formatDate(viewing.fields[k]) : viewing.fields[k]}
                      </Text>
                    </View>
                  ))}
                {viewing.expiry ? (
                  <View style={styles.fieldRow}>
                    <Text style={[styles.label, { color: theme.textSecondary }]}>Valid till</Text>
                    <Text style={[styles.value, { color: TONE[expiryStatus(viewing.expiry).tone] }]}>
                      {formatDate(viewing.expiry)} · {expiryStatus(viewing.expiry).label}
                    </Text>
                  </View>
                ) : null}
                {viewing.note ? <Text style={[styles.value, { color: theme.textSecondary, marginTop: 8 }]}>{viewing.note}</Text> : null}
                {(viewing.files || []).length ? <Text style={[styles.label, { color: theme.textSecondary, marginTop: 12 }]}>Files</Text> : null}
                {(viewing.files || []).map((f) => (
                  <View key={f.id} style={[styles.fileRow, { borderColor: theme.borderNeutral }]}>
                    {f.kind === 'image' ? (
                      <TouchableOpacity onPress={() => setViewer(f.data)} accessibilityLabel={`Show ${f.name}`}>
                        <Image source={{ uri: f.data }} style={styles.fileThumb} />
                      </TouchableOpacity>
                    ) : (
                      <View style={[styles.fileThumb, styles.pdfThumb, { backgroundColor: theme.surfaceAlt }]}>
                        <Ionicons name="document-text-outline" size={26} color="#E5383B" />
                      </View>
                    )}
                    <Text style={[styles.value, styles.flex, { color: theme.text }]} numberOfLines={2}>
                      {f.name}
                    </Text>
                    <TouchableOpacity onPress={() => share(f)} style={styles.iconBtn} accessibilityLabel={`Open or share ${f.name}`}>
                      <Ionicons name={f.kind === 'pdf' ? 'open-outline' : 'share-outline'} size={20} color={theme.primary} />
                    </TouchableOpacity>
                  </View>
                ))}
                {problem ? <Text style={[styles.small, { color: '#E5383B', marginTop: 8 }]}>{problem}</Text> : null}
                <View style={styles.actions}>
                  <TouchableOpacity style={[styles.btn, { backgroundColor: theme.surfaceAlt }]} onPress={() => remove(viewing)}>
                    <Text style={[styles.btnText, { color: '#E5383B' }]}>Delete</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btn, { backgroundColor: theme.primary }]} onPress={() => openEdit(viewing)}>
                    <Text style={[styles.btnText, { color: theme.onPrimary }]}>Edit</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Add / edit */}
      <Modal visible={!!form} transparent animationType="fade" onRequestClose={() => setForm(null)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: theme.sheet }]}>
            {form ? (
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={[styles.sheetTitle, { color: theme.text }]}>{editingId ? 'Edit document' : 'Add document'}</Text>
                <View style={styles.chips}>
                  {DOC_TYPES.map((t) => {
                    const on = form.type === t.key;
                    return (
                      <TouchableOpacity
                        key={t.key}
                        onPress={() => set('type')(t.key)}
                        style={[styles.chip, { backgroundColor: on ? t.color : theme.surfaceAlt, borderColor: on ? t.color : theme.borderNeutral }]}
                      >
                        <Ionicons name={t.icon} size={14} color={on ? '#FFF' : theme.text} />
                        <Text style={[styles.chipText, { color: on ? '#FFF' : theme.text }]}>{t.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TextInput style={input} placeholder={`Title (optional, e.g. "${type.label} – Amma")`} placeholderTextColor={theme.textMuted} value={form.title} onChangeText={set('title')} />
                {type.number ? (
                  <>
                    <Text style={[styles.label, { color: theme.textSecondary }]}>{type.number}</Text>
                    <TextInput
                      style={input}
                      placeholder={type.numberHint}
                      placeholderTextColor={theme.textMuted}
                      value={form.number}
                      onChangeText={set('number')}
                      autoCapitalize="characters"
                      keyboardType={form.type === 'aadhaar' ? 'number-pad' : 'default'}
                    />
                  </>
                ) : null}
                {type.fields.map(([k, label, kind]) => (
                  <View key={k}>
                    <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
                    {kind === 'date' ? (
                      <DateField value={form.fields[k] || ''} onChange={setFieldValue(k)} theme={theme} />
                    ) : (
                      <TextInput style={input} value={form.fields[k] || ''} onChangeText={setFieldValue(k)} placeholderTextColor={theme.textMuted} />
                    )}
                  </View>
                ))}
                {type.expiry ? (
                  <>
                    <Text style={[styles.label, { color: theme.textSecondary }]}>Valid till (for a reminder before it expires)</Text>
                    <DateField value={form.expiry} onChange={set('expiry')} theme={theme} />
                  </>
                ) : null}
                <Text style={[styles.label, { color: theme.textSecondary }]}>Pictures or PDF ({form.files.length}/{MAX_FILES})</Text>
                <View style={styles.thumbs}>
                  {form.files.map((f) => (
                    <View key={f.id} style={styles.editThumb}>
                      {f.kind === 'image' ? (
                        <Image source={{ uri: f.data }} style={[styles.thumbBig, { borderColor: theme.borderNeutral }]} />
                      ) : (
                        <View style={[styles.thumbBig, styles.pdfThumb, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral }]}>
                          <Ionicons name="document-text-outline" size={24} color="#E5383B" />
                          <Text style={[styles.tiny, { color: theme.textSecondary }]} numberOfLines={1}>
                            {f.name}
                          </Text>
                        </View>
                      )}
                      <TouchableOpacity
                        style={styles.removeFile}
                        onPress={() => setForm((x) => ({ ...x, files: x.files.filter((y) => y.id !== f.id) }))}
                        accessibilityLabel={`Remove ${f.name}`}
                      >
                        <Ionicons name="close-circle" size={22} color="#E5383B" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
                <View style={styles.pickRow}>
                  {[
                    ['camera', 'camera-outline', 'Camera'],
                    ['library', 'images-outline', 'Photos'],
                    ['files', 'folder-open-outline', 'Files / Drive'],
                  ].map(([source, icon, label]) => (
                    <TouchableOpacity
                      key={source}
                      style={[styles.pickBtn, { borderColor: theme.borderNeutral, backgroundColor: theme.surfaceAlt }, (!!busy || form.files.length >= MAX_FILES) && styles.disabled]}
                      onPress={() => addFiles(source)}
                      disabled={!!busy || form.files.length >= MAX_FILES}
                      accessibilityLabel={`Add from ${label}`}
                    >
                      <Ionicons name={icon} size={18} color={theme.textSecondary} />
                      <Text style={[styles.pickText, { color: theme.textSecondary }]}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[styles.tiny, { color: theme.textMuted }]}>
                  Files / Drive opens your phone&apos;s file picker: choose Google Drive there to pick a scan or PDF from
                  Drive. Pictures are made smaller; PDFs up to 2.5 MB.
                </Text>
                <TextInput style={[input, styles.note]} placeholder="Note (optional)" placeholderTextColor={theme.textMuted} value={form.note} onChangeText={set('note')} multiline />
                {busy ? (
                  <View style={styles.busyRow}>
                    <ActivityIndicator size="small" color={theme.primary} />
                    <Text style={[styles.small, { color: theme.textSecondary }]}>{busy}</Text>
                  </View>
                ) : null}
                {problem ? <Text style={[styles.small, { color: '#E5383B' }]}>{problem}</Text> : null}
                <View style={styles.actions}>
                  <TouchableOpacity style={[styles.btn, { backgroundColor: theme.surfaceAlt }]} onPress={() => setForm(null)} disabled={!!busy}>
                    <Text style={[styles.btnText, { color: theme.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btn, { backgroundColor: theme.primary }, (!canSave || !!busy) && styles.disabled]} onPress={save} disabled={!canSave || !!busy}>
                    <Text style={[styles.btnText, { color: theme.onPrimary }]}>Save</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Full-screen picture */}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <TouchableOpacity style={styles.viewer} activeOpacity={1} onPress={() => setViewer(null)} accessibilityLabel="Close picture">
          {viewer ? <Image source={{ uri: viewer }} style={{ width: width - 16, height: '85%' }} resizeMode="contain" /> : null}
          <Text style={styles.viewerHint}>Tap to close</Text>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

/** A masked ID number with show/hide and copy buttons. */
function NumberRow({ doc, big, open, copied, theme, onToggle, onCopy }) {
  if (!doc.number) return null;
  return (
    <View style={styles.numberRow}>
      <Text style={[big ? styles.numberBig : styles.number, { color: theme.text }]} selectable={open}>
        {open ? doc.number : maskNumber(doc.number, doc.type)}
      </Text>
      <TouchableOpacity onPress={onToggle} style={styles.iconBtn} accessibilityLabel={open ? 'Hide number' : 'Show number'}>
        <Ionicons name={open ? 'eye-off-outline' : 'eye-outline'} size={18} color={theme.textSecondary} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onCopy} style={styles.iconBtn} accessibilityLabel="Copy number">
        <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color={copied ? '#2DA44E' : theme.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

/** A date chosen with the app's calendar; tap to open, "Clear" to remove. */
function DateField({ value, onChange, theme }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <View style={styles.dateRow}>
        <TouchableOpacity style={[styles.input, styles.flex, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral }]} onPress={() => setOpen((o) => !o)}>
          <Text style={{ color: value ? theme.text : theme.textMuted, fontSize: 15 }}>{value ? formatDate(value) : 'Choose a date'}</Text>
        </TouchableOpacity>
        {value ? (
          <TouchableOpacity onPress={() => onChange('')} style={styles.iconBtn} accessibilityLabel="Clear date">
            <Ionicons name="close-circle-outline" size={20} color={theme.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>
      {open ? (
        <DatePicker
          value={value || undefined}
          onChange={(d) => {
            onChange(d);
            setOpen(false);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 20 },
  doorArea: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  flex: { flex: 1 },
  list: { paddingBottom: 110 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  card: { borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 12, gap: 6, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  typeIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  small: { fontSize: 12, lineHeight: 17 },
  tiny: { fontSize: 11, lineHeight: 15 },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  numberRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  number: { fontSize: 17, fontWeight: '700', letterSpacing: 1, flex: 1 },
  numberBig: { fontSize: 22, fontWeight: '800', letterSpacing: 1.5, flex: 1 },
  iconBtn: { padding: 6 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  thumb: { width: 54, height: 40, borderRadius: 6, borderWidth: 1 },
  pdfChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, height: 40 },
  empty: { paddingTop: 10 },
  emptyText: { fontSize: 14, marginBottom: 10 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  typeTile: { width: '47%', borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
  typeTileText: { fontSize: 14, fontWeight: '700' },
  fab: { position: 'absolute', right: 24, bottom: 32, width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 },
  sheet: { borderRadius: 20, padding: 18, maxHeight: '92%' },
  sheetTitle: { fontSize: 20, fontWeight: '800', marginBottom: 10 },
  label: { fontSize: 12, fontWeight: '600', marginTop: 10, marginBottom: 4 },
  value: { fontSize: 15, lineHeight: 21 },
  fieldRow: { marginTop: 2 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  fileThumb: { width: 64, height: 46, borderRadius: 6 },
  pdfThumb: { alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 18 },
  btn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  btnText: { fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontSize: 12, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  note: { marginTop: 12, minHeight: 60, textAlignVertical: 'top' },
  editThumb: { position: 'relative' },
  thumbBig: { width: 84, height: 62, borderRadius: 8, borderWidth: 1 },
  removeFile: { position: 'absolute', top: -8, right: -8, backgroundColor: '#FFF', borderRadius: 11 },
  pickRow: { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 6 },
  pickBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingVertical: 11 },
  pickText: { fontSize: 13, fontWeight: '600' },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerHint: { color: '#FFFFFFAA', marginTop: 10, fontSize: 12 },
});
