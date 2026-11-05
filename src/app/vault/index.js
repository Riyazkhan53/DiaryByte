import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  Modal,
  Image,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import Header from '../../components/Header';
import VaultDoor from '../../components/vault/VaultDoor';
import SyncRow from '../../components/SyncRow';
import { useTheme } from '../../hooks/useTheme';
import { useSyncedCollection } from '../../hooks/useSyncedCollection';
import { confirmDelete } from '../../utils/confirm';
import { MAX_PHOTOS, pickVaultPhotos } from '../../services/vaultPhotos';
import { VAULT_STORAGE_KEY, sealPlainItems, vaultLock } from '../../utils/vaultLock';
import { decryptItem, encryptItem, isEncryptedItem } from '../../utils/vaultCrypto';

const STORAGE_KEY = VAULT_STORAGE_KEY;

// Decrypted items by ciphertext, only while the vault is open (decrypting
// photos is slow, so each sealed item is decrypted once). Cleared on locking.
const opened = new Map();

export default function VaultScreen() {
  const { theme } = useTheme();
  // `stored` is what's saved and synced: encrypted when a vault code is set.
  const { items: stored, synced, persist, pulling, pullInfo, pullNow } = useSyncedCollection(
    'vault',
    STORAGE_KEY
  );
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [photos, setPhotos] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [picking, setPicking] = useState(false);
  const [photoError, setPhotoError] = useState(null);
  const [viewer, setViewer] = useState(null); // { photos, index } — full-screen photo
  const [revealed, setRevealed] = useState({});
  // Locked behind the vault door every time you come back to this screen.
  const [unlocked, setUnlocked] = useState(false);
  useFocusEffect(
    useCallback(
      () => () => {
        vaultLock.lock();
        opened.clear();
        setUnlocked(false);
        setRevealed({});
        setViewer(null);
      },
      []
    )
  );

  // Readable items, only while the vault is open.
  const items = useMemo(() => {
    if (!unlocked) {
      opened.clear();
      return [];
    }
    const key = vaultLock.key();
    return stored.map((raw) => {
      if (!isEncryptedItem(raw)) return raw;
      if (!opened.has(raw.enc)) opened.set(raw.enc, decryptItem(key, raw));
      return opened.get(raw.enc) || { id: raw.id, createdAt: raw.createdAt, unreadable: true };
    });
  }, [stored, unlocked]);

  // Items saved before the code was set: encrypt them now.
  useEffect(() => {
    if (!unlocked) return;
    const sealed = sealPlainItems(stored);
    if (sealed) persist(sealed);
  }, [unlocked, stored, persist]);

  // Items this device can't open were probably re-encrypted on another
  // device after a code change: fetch the server's copies, once.
  const refetched = useRef(false);
  const unreadable = items.some((item) => item.unreadable);
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

  const lockVault = () => {
    vaultLock.lock();
    opened.clear();
    setUnlocked(false);
    setRevealed({});
  };

  const openAdd = () => {
    setEditingId(null);
    setTitle('');
    setContent('');
    setPhotos([]);
    setPhotoError(null);
    setModalVisible(true);
  };
  const openEdit = (item) => {
    if (item.unreadable) return;
    setEditingId(item.id);
    setTitle(item.title || '');
    setContent(item.content || '');
    setPhotos(item.photos || []);
    setPhotoError(null);
    setModalVisible(true);
  };

  const addPhotos = async (source) => {
    setPicking(true);
    setPhotoError(null);
    try {
      const result = await pickVaultPhotos(source, MAX_PHOTOS - photos.length);
      if (result.error) setPhotoError(result.error);
      if (result.photos.length) setPhotos((list) => [...list, ...result.photos].slice(0, MAX_PHOTOS));
    } catch (_error) {
      setPhotoError("Couldn't add that photo.");
    } finally {
      setPicking(false);
    }
  };

  // A title and either details or at least one photo.
  const canSave = !!title.trim() && (!!content.trim() || photos.length > 0);
  const saveItem = () => {
    if (!canSave) return;
    const existing = editingId ? items.find((i) => i.id === editingId) : null;
    const entry = {
      ...existing,
      id: editingId || Date.now().toString(),
      title: title.trim(),
      content: content.trim(),
      photos: photos.length ? photos : undefined,
      createdAt: existing?.createdAt || new Date().toISOString(),
    };
    const key = vaultLock.key();
    const toStore = key ? encryptItem(key, entry) : entry;
    persist(editingId ? stored.map((i) => (i.id === editingId ? toStore : i)) : [toStore, ...stored]);
    setModalVisible(false);
  };

  const deleteItem = (id) => {
    confirmDelete('Delete item', 'Remove this from your vault?', () => persist(stored.filter((i) => i.id !== id)));
  };

  const formatDate = (iso) =>
    new Date(iso).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  if (!unlocked) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
        <Header title="Personal Vault" subtitle="Enter the combination to open" />
        <View style={styles.doorArea}>
          <VaultDoor onOpen={() => setUnlocked(true)} onSetCode={() => router.push('/settings')} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
      <Header title="Personal Vault" subtitle="Keep your secrets safe" />

      <View style={styles.content}>
        <View style={styles.topRow}>
          <View style={styles.flex}>
            <SyncRow synced={synced} pulling={pulling} pullInfo={pullInfo} onPull={pullNow} />
          </View>
          <TouchableOpacity
            style={[styles.lockBtn, { backgroundColor: theme.surfaceAlt }]}
            onPress={lockVault}
            accessibilityLabel="Lock the vault"
          >
            <Ionicons name="lock-closed" size={16} color={theme.text} />
            <Text style={[styles.lockText, { color: theme.text }]}>Lock</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="lock-closed-outline" size={56} color={theme.textMuted} />
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                Your vault is empty. Tap + to add a secret note.
              </Text>
            </View>
          }
          renderItem={({ item }) => item.unreadable ? (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}>
              <View style={styles.cardHeader}>
                <Ionicons name="alert-circle-outline" size={18} color={theme.textMuted} />
                <Text style={[styles.flex, styles.cardTitle, { color: theme.textMuted }]} numberOfLines={2}>
                  Can&apos;t open this item: it was locked with a different code
                </Text>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteItem(item.id)}>
                  <Ionicons name="trash-outline" size={19} color={theme.danger} />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  shadowColor: theme.shadow,
                },
              ]}
            >
              <View style={styles.cardHeader}>
                <Ionicons name="lock-closed" size={18} color={theme.secondary} />
                <TouchableOpacity style={styles.flex} onPress={() => openEdit(item)} accessibilityLabel={`Edit ${item.title}`}>
                  <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                </TouchableOpacity>
                {item.photos?.length ? (
                  <View style={styles.photoCount}>
                    <Ionicons name="images-outline" size={14} color={theme.textSecondary} />
                    <Text style={[styles.photoCountText, { color: theme.textSecondary }]}>{item.photos.length}</Text>
                  </View>
                ) : null}
                <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteItem(item.id)}>
                  <Ionicons name="trash-outline" size={19} color={theme.danger} />
                </TouchableOpacity>
              </View>
              {item.content ? (
                <Text
                  style={[styles.cardContent, { color: theme.textSecondary }]}
                  numberOfLines={revealed[item.id] ? undefined : 1}
                >
                  {revealed[item.id] ? item.content : '••••••••••••••••'}
                </Text>
              ) : null}
              {item.photos?.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
                  {item.photos.map((uri, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() =>
                        revealed[item.id]
                          ? setViewer({ photos: item.photos, index: i })
                          : setRevealed((prev) => ({ ...prev, [item.id]: true }))
                      }
                      accessibilityLabel={revealed[item.id] ? `Open photo ${i + 1}` : 'Reveal photos'}
                    >
                      <Image source={{ uri }} style={styles.thumb} blurRadius={revealed[item.id] ? 0 : 18} />
                      {revealed[item.id] ? null : (
                        <View style={styles.thumbCover}>
                          <Ionicons name="eye-off-outline" size={16} color="#FFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : null}
              <View style={styles.cardFooter}>
                <Text style={[styles.date, { color: theme.textMuted }]}>
                  {formatDate(item.createdAt)}
                </Text>
                <TouchableOpacity
                  style={styles.revealBtn}
                  onPress={() =>
                    setRevealed((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                  }
                >
                  <Ionicons
                    name={revealed[item.id] ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={theme.textSecondary}
                  />
                  <Text style={[styles.revealText, { color: theme.textSecondary }]}>
                    {revealed[item.id] ? 'Hide' : 'Reveal'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      </View>

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.secondary, shadowColor: theme.secondary }]}
        onPress={openAdd}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={32} color="#FFF" />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.sheet }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[styles.modalTitle, { color: theme.text }]}>{editingId ? 'Edit vault item' : 'Add to Vault'}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                placeholder="Title (e.g. WiFi password, locker code)"
                placeholderTextColor={theme.textMuted}
                value={title}
                onChangeText={setTitle}
              />
              <TextInput
                style={[styles.textArea, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                placeholder={photos.length ? 'Details (optional)' : 'Details...'}
                placeholderTextColor={theme.textMuted}
                value={content}
                onChangeText={setContent}
                multiline
                textAlignVertical="top"
              />
              {photos.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
                  {photos.map((uri, i) => (
                    <View key={i}>
                      <Image source={{ uri }} style={styles.thumb} />
                      <TouchableOpacity
                        style={styles.thumbRemove}
                        onPress={() => setPhotos((list) => list.filter((_, j) => j !== i))}
                        accessibilityLabel={`Remove photo ${i + 1}`}
                      >
                        <Ionicons name="close" size={14} color="#FFF" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              ) : null}
              <View style={styles.photoBtns}>
                {Platform.OS !== 'web' ? (
                  <TouchableOpacity
                    style={[styles.photoBtn, { borderColor: theme.borderNeutral }]}
                    onPress={() => addPhotos('camera')}
                    disabled={picking || photos.length >= MAX_PHOTOS}
                    accessibilityLabel="Take a photo"
                  >
                    <Ionicons name="camera-outline" size={18} color={theme.text} />
                    <Text style={[styles.photoBtnText, { color: theme.text }]}>Camera</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={[styles.photoBtn, { borderColor: theme.borderNeutral }]}
                  onPress={() => addPhotos('library')}
                  disabled={picking || photos.length >= MAX_PHOTOS}
                  accessibilityLabel="Add photos from gallery"
                >
                  {picking ? (
                    <ActivityIndicator size="small" color={theme.text} />
                  ) : (
                    <Ionicons name="images-outline" size={18} color={theme.text} />
                  )}
                  <Text style={[styles.photoBtnText, { color: theme.text }]}>Gallery</Text>
                </TouchableOpacity>
              </View>
              <Text style={[styles.photoHint, { color: photoError ? theme.danger : theme.textMuted }]}>
                {photoError ||
                  `${photos.length}/${MAX_PHOTOS} photos. Photos stay inside the vault: ones you take here aren't saved to your gallery.`}
              </Text>
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { backgroundColor: theme.surfaceAlt }]}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: theme.primary }]}
                  onPress={saveItem}
                  disabled={!canSave}
                  accessibilityLabel="Save vault item"
                >
                  <Text style={[styles.saveText, { color: theme.onPrimary }]}>Save</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Full-screen photo */}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <View style={styles.viewer}>
          {viewer ? (
            <Image source={{ uri: viewer.photos[viewer.index] }} style={styles.viewerImage} resizeMode="contain" />
          ) : null}
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewer(null)} accessibilityLabel="Close photo">
            <Ionicons name="close" size={26} color="#FFF" />
          </TouchableOpacity>
          {viewer && viewer.photos.length > 1 ? (
            <View style={styles.viewerNav}>
              <TouchableOpacity
                onPress={() => setViewer((v) => ({ ...v, index: (v.index + v.photos.length - 1) % v.photos.length }))}
                style={styles.viewerBtn}
                accessibilityLabel="Previous photo"
              >
                <Ionicons name="chevron-back" size={26} color="#FFF" />
              </TouchableOpacity>
              <Text style={styles.viewerCount}>
                {viewer.index + 1} / {viewer.photos.length}
              </Text>
              <TouchableOpacity
                onPress={() => setViewer((v) => ({ ...v, index: (v.index + 1) % v.photos.length }))}
                style={styles.viewerBtn}
                accessibilityLabel="Next photo"
              >
                <Ionicons name="chevron-forward" size={26} color="#FFF" />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  doorArea: { flex: 1, padding: 16, paddingBottom: 28 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  lockBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, marginBottom: 8 },
  lockText: { fontSize: 13, fontWeight: '600' },
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  list: { paddingBottom: 90 },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyText: { marginTop: 12, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
  card: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
  deleteBtn: { padding: 4 },
  cardContent: { fontSize: 14, lineHeight: 20, marginBottom: 10 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontSize: 12 },
  revealBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  revealText: { fontSize: 12, fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 100,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modal: { borderRadius: 20, padding: 20, maxHeight: '90%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  textArea: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontSize: 16,
    minHeight: 120,
    maxHeight: 220,
    marginBottom: 6,
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  photoCount: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  photoCountText: { fontSize: 12, fontWeight: '600' },
  thumbs: { gap: 8, paddingVertical: 4, marginBottom: 8 },
  thumb: { width: 76, height: 76, borderRadius: 10, backgroundColor: '#222' },
  thumbCover: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  photoBtn: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 12, paddingVertical: 10 },
  photoBtnText: { fontSize: 14, fontWeight: '600' },
  photoHint: { fontSize: 12, marginTop: 6, marginBottom: 4, lineHeight: 16 },
  viewer: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '80%' },
  viewerClose: { position: 'absolute', top: 48, right: 20, padding: 8 },
  viewerNav: { position: 'absolute', bottom: 48, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 24 },
  viewerBtn: { padding: 10 },
  viewerCount: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600' },
  saveBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '600' },
});
