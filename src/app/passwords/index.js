import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  Modal,
  Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import Header from '../../components/Header';
import SyncRow from '../../components/SyncRow';
import { useTheme } from '../../hooks/useTheme';
import { useSyncedCollection } from '../../hooks/useSyncedCollection';

const STORAGE_KEY = '@diarybyte_passwords';

export default function PasswordsScreen() {
  const { theme } = useTheme();
  const { items, synced, persist, pulling, pullInfo, pullNow } = useSyncedCollection(
    'passwords',
    STORAGE_KEY
  );
  const [modalVisible, setModalVisible] = useState(false);
  const [site, setSite] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [revealed, setRevealed] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [copied, setCopied] = useState(null);

  const openAdd = () => {
    setEditingId(null);
    setSite('');
    setUsername('');
    setPassword('');
    setModalVisible(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setSite(item.site);
    setUsername(item.username || '');
    setPassword(item.password);
    setModalVisible(true);
  };

  const copyField = async (item, field, value) => {
    if (!value) return;
    await Clipboard.setStringAsync(value);
    setCopied({ id: item.id, field });
    setTimeout(() => setCopied(null), 1500);
  };

  const saveItem = () => {
    if (!site.trim() || !password.trim()) return;
    if (editingId) {
      persist(
        items.map((i) =>
          i.id === editingId
            ? {
                ...i,
                site: site.trim(),
                username: username.trim(),
                password: password.trim(),
              }
            : i
        )
      );
    } else {
      const entry = {
        id: Date.now().toString(),
        site: site.trim(),
        username: username.trim(),
        password: password.trim(),
        createdAt: new Date().toISOString(),
      };
      persist([entry, ...items]);
    }
    setSite('');
    setUsername('');
    setPassword('');
    setEditingId(null);
    setModalVisible(false);
  };

  const deleteItem = (id) => {
    Alert.alert('Delete Password', 'Remove this saved password?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => persist(items.filter((i) => i.id !== id)),
      },
    ]);
  };

  const maskPassword = (pwd) => '•'.repeat(Math.min(pwd.length, 12));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
      <Header title="Saved Passwords" subtitle="Your credentials, privately stored" />

      <View style={styles.content}>
        <SyncRow synced={synced} pulling={pulling} pullInfo={pullInfo} onPull={pullNow} />

        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="key-outline" size={56} color={theme.textMuted} />
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                No saved passwords yet. Tap + to add one.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
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
                <View style={[styles.siteIcon, { backgroundColor: theme.secondary + '33' }]}>
                  <Ionicons name="globe-outline" size={20} color={theme.secondary} />
                </View>
                <Text style={[styles.site, { color: theme.text }]} numberOfLines={1}>
                  {item.site}
                </Text>
                <TouchableOpacity style={styles.iconBtn} onPress={() => openEdit(item)}>
                  <Ionicons name="create-outline" size={20} color={theme.primaryDark} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={() => deleteItem(item.id)}>
                  <Ionicons name="trash-outline" size={20} color={theme.danger} />
                </TouchableOpacity>
              </View>

              <View style={styles.fieldRow}>
                <Ionicons name="person-outline" size={16} color={theme.textMuted} />
                <Text style={[styles.fieldValue, { color: theme.textSecondary }]} numberOfLines={1}>
                  {item.username || '—'}
                </Text>
                {copied && copied.id === item.id && copied.field === 'username' ? (
                  <Text style={[styles.copiedText, { color: theme.primaryDark }]}>Copied!</Text>
                ) : (
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => copyField(item, 'username', item.username)}
                    disabled={!item.username}
                  >
                    <Ionicons
                      name="copy-outline"
                      size={18}
                      color={item.username ? theme.textSecondary : theme.borderNeutral}
                    />
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.fieldRow}>
                <Ionicons name="lock-closed-outline" size={16} color={theme.textMuted} />
                <Text style={[styles.fieldValue, { color: theme.textSecondary }]}>
                  {revealed[item.id] ? item.password : maskPassword(item.password)}
                </Text>
                {copied && copied.id === item.id && copied.field === 'password' ? (
                  <Text style={[styles.copiedText, { color: theme.primaryDark }]}>Copied!</Text>
                ) : (
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => copyField(item, 'password', item.password)}
                  >
                    <Ionicons name="copy-outline" size={18} color={theme.textSecondary} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() =>
                    setRevealed((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                  }
                >
                  <Ionicons
                    name={revealed[item.id] ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={theme.textSecondary}
                  />
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
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {editingId ? 'Edit Password' : 'Add Password'}
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
              placeholder="Site / App name"
              placeholderTextColor={theme.textMuted}
              value={site}
              onChangeText={setSite}
            />
            <TextInput
              style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
              placeholder="Username / Email"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              value={username}
              onChangeText={setUsername}
            />
            <TextInput
              style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
              placeholder="Password"
              placeholderTextColor={theme.textMuted}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
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
                disabled={!site.trim() || !password.trim()}
              >
                <Text style={[styles.saveText, { color: theme.onPrimary }]}>
                  {editingId ? 'Update' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  siteIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  site: { flex: 1, fontSize: 16, fontWeight: '700' },
  iconBtn: { padding: 6 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 8 },
  fieldValue: { flex: 1, fontSize: 14 },
  copiedText: { fontSize: 11, fontWeight: '700' },
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
  modal: { borderRadius: 20, padding: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600' },
  saveBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '600' },
});
