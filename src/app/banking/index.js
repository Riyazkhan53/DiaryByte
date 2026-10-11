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
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Header from '../../components/Header';
import { useTheme } from '../../hooks/useTheme';
import { useSyncedCollection } from '../../hooks/useSyncedCollection';

const STORAGE_KEY = '@diarybyte_banking';

export default function BankingScreen() {
  const { theme } = useTheme();
  const { items, synced, persist } = useSyncedCollection('banking', STORAGE_KEY);
  const [modalVisible, setModalVisible] = useState(false);
  const [bankName, setBankName] = useState('');
  const [accountType, setAccountType] = useState('Savings');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [upiId, setUpiId] = useState('');
  const [revealed, setRevealed] = useState({});

  const addItem = () => {
    if (!bankName.trim() || !accountNumber.trim()) return;
    const entry = {
      id: Date.now().toString(),
      bankName: bankName.trim(),
      accountType,
      accountNumber: accountNumber.trim(),
      ifsc: ifsc.trim().toUpperCase(),
      upiId: upiId.trim(),
      createdAt: new Date().toISOString(),
    };
    persist([entry, ...items]);
    setBankName('');
    setAccountType('Savings');
    setAccountNumber('');
    setIfsc('');
    setUpiId('');
    setModalVisible(false);
  };

  const deleteItem = (id) => {
    Alert.alert('Delete Account', 'Remove this banking detail?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => persist(items.filter((i) => i.id !== id)),
      },
    ]);
  };

  const maskAccount = (num) => {
    if (num.length <= 4) return num;
    return '•'.repeat(num.length - 4) + num.slice(-4);
  };

  const field = (icon, label, value) => (
    <View style={styles.fieldRow}>
      <Ionicons name={icon} size={15} color={theme.textMuted} />
      <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[styles.fieldValue, { color: theme.textSecondary }]} numberOfLines={1}>
        {value || '—'}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Header title="Banking Details" subtitle="Accounts and UPI, synced to your cloud" />

      <View style={styles.content}>
        <View style={styles.syncRow}>
          <Ionicons
            name={synced ? 'cloud-done-outline' : 'phone-portrait-outline'}
            size={13}
            color={synced ? theme.primaryDark : theme.textMuted}
          />
          <Text
            style={[
              styles.syncText,
              { color: synced ? theme.primaryDark : theme.textMuted },
            ]}
          >
            {synced ? 'Saved locally · synced to server' : 'Saved on this device'}
          </Text>
        </View>

        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="card-outline" size={56} color={theme.textMuted} />
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                No banking details saved yet. Tap + to add one.
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
                <View style={[styles.bankIcon, { backgroundColor: theme.accent + '33' }]}>
                  <Ionicons name="business-outline" size={20} color={theme.accent} />
                </View>
                <View style={styles.bankMeta}>
                  <Text style={[styles.bankName, { color: theme.text }]} numberOfLines={1}>
                    {item.bankName}
                  </Text>
                  <Text style={[styles.bankType, { color: theme.textMuted }]}>
                    {item.accountType}
                  </Text>
                </View>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteItem(item.id)}>
                  <Ionicons name="trash-outline" size={20} color={theme.danger} />
                </TouchableOpacity>
              </View>

              <View style={styles.fieldRow}>
                <Ionicons name="card-outline" size={15} color={theme.textMuted} />
                <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>A/C</Text>
                <Text style={[styles.fieldValue, { color: theme.textSecondary }]}>
                  {revealed[item.id] ? item.accountNumber : maskAccount(item.accountNumber)}
                </Text>
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() =>
                    setRevealed((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                  }
                >
                  <Ionicons
                    name={revealed[item.id] ? 'eye-off-outline' : 'eye-outline'}
                    size={17}
                    color={theme.textSecondary}
                  />
                </TouchableOpacity>
              </View>
              {field('hash-outline', 'IFSC', item.ifsc)}
              {field('phone-portrait-outline', 'UPI', item.upiId)}
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
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[styles.modalTitle, { color: theme.text }]}>Add Account</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                placeholder="Bank name"
                placeholderTextColor={theme.textMuted}
                value={bankName}
                onChangeText={setBankName}
              />
              <View style={styles.typeRow}>
                {['Savings', 'Current', 'Salary', 'Credit Card'].map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: accountType === type ? theme.accent : theme.surfaceAlt,
                        borderColor: accountType === type ? theme.accent : theme.borderNeutral,
                      },
                    ]}
                    onPress={() => setAccountType(type)}
                  >
                    <Text style={[styles.chipText, { color: theme.text }]}>{type}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                placeholder="Account number"
                placeholderTextColor={theme.textMuted}
                keyboardType="numeric"
                value={accountNumber}
                onChangeText={setAccountNumber}
              />
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                placeholder="IFSC code"
                placeholderTextColor={theme.textMuted}
                autoCapitalize="characters"
                value={ifsc}
                onChangeText={setIfsc}
              />
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                placeholder="UPI ID (optional)"
                placeholderTextColor={theme.textMuted}
                autoCapitalize="none"
                value={upiId}
                onChangeText={setUpiId}
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
                  disabled={!bankName.trim() || !accountNumber.trim()}
                >
                  <Text style={[styles.saveText, { color: theme.text }]}>Save</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
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
  syncRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  syncText: { fontSize: 11, marginLeft: 5, fontWeight: '600' },
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
  bankIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  bankMeta: { flex: 1 },
  bankName: { fontSize: 16, fontWeight: '700' },
  bankType: { fontSize: 12, marginTop: 1 },
  deleteBtn: { padding: 6 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5, gap: 7 },
  fieldLabel: { fontSize: 13, width: 44 },
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
  modal: { borderRadius: 20, padding: 20, maxHeight: '85%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 18,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600' },
  saveBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '600' },
});
