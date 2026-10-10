import { useState, useEffect, useCallback } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Header from '../../components/Header';
import { useTheme } from '../../hooks/useTheme';

const STORAGE_KEY = '@diarybyte_passwords';

export default function PasswordsScreen() {
  const { theme } = useTheme();
  const [items, setItems] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [site, setSite] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [revealed, setRevealed] = useState({});

  const load = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) setItems(JSON.parse(stored));
    } catch (error) {
      console.error('Failed to load passwords', error);
    }
  }, []);

  useEffect(() => {
    const initialize = async () => {
      await load();
    };
    initialize();
  }, [load]);

  const persist = async (updated) => {
    setItems(updated);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to save passwords', error);
    }
  };

  const addItem = () => {
    if (!site.trim() || !password.trim()) return;
    const entry = {
      id: Date.now().toString(),
      site: site.trim(),
      username: username.trim(),
      password: password.trim(),
      createdAt: new Date().toISOString(),
    };
    persist([entry, ...items]);
    setSite('');
    setUsername('');
    setPassword('');
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
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Header title="Saved Passwords" subtitle="Your credentials, privately stored" />

      <View style={styles.content}>
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
                <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteItem(item.id)}>
                  <Ionicons name="trash-outline" size={20} color={theme.danger} />
                </TouchableOpacity>
              </View>

              <View style={styles.fieldRow}>
                <Ionicons name="person-outline" size={16} color={theme.textMuted} />
                <Text style={[styles.fieldValue, { color: theme.textSecondary }]} numberOfLines={1}>
                  {item.username || '—'}
                </Text>
              </View>
              <View style={styles.fieldRow}>
                <Ionicons name="lock-closed-outline" size={16} color={theme.textMuted} />
                <Text style={[styles.fieldValue, { color: theme.textSecondary }]}>
                  {revealed[item.id] ? item.password : maskPassword(item.password)}
                </Text>
                <TouchableOpacity
                  style={styles.eyeBtn}
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
        onPress={() => setModalVisible(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={32} color="#FFF" />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Add Password</Text>
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
                onPress={addItem}
                disabled={!site.trim() || !password.trim()}
              >
                <Text style={[styles.saveText, { color: theme.text }]}>Save</Text>
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
  deleteBtn: { padding: 6 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 8 },
  fieldValue: { flex: 1, fontSize: 14 },
  eyeBtn: { padding: 4 },
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
