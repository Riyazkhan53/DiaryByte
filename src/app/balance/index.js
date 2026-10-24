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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Header from '../../components/Header';
import SyncRow from '../../components/SyncRow';
import { useTheme } from '../../hooks/useTheme';
import { useSyncedCollection } from '../../hooks/useSyncedCollection';

// Shares the banking collection with Banking Details → Bank Accounts.
// Adding accounts there automatically shows them here for balance tracking.
const STORAGE_KEY = '@diarybyte_banking';

const money = (n) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function BalanceScreen() {
  const { theme } = useTheme();
  const { items, synced, persist, pulling, pullInfo, pullNow } = useSyncedCollection(
    'banking',
    STORAGE_KEY
  );
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [balanceDraft, setBalanceDraft] = useState('');

  const openEdit = (item) => {
    setEditingId(item.id);
    setBalanceDraft(item.balance != null ? String(item.balance) : '');
    setEditModalVisible(true);
  };

  const saveBalance = () => {
    if (!editingId) return;
    const parsed = parseFloat(balanceDraft.replace(/[^\d.]/g, ''));
    const hasBalance = balanceDraft.trim() !== '' && !Number.isNaN(parsed);
    persist(
      items.map((i) =>
        i.id === editingId ? { ...i, balance: hasBalance ? parsed : null } : i
      )
    );
    setEditModalVisible(false);
  };

  const totalBalance = items.reduce((s, i) => s + (i.balance || 0), 0);
  const accountsWithBalance = items.filter((i) => i.balance != null).length;

  const maskAccount = (num) => {
    if (!num) return '';
    if (num.length <= 4) return num;
    return '•'.repeat(num.length - 4) + num.slice(-4);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
      <Header title="My Account Balance" subtitle="Bank balances at a glance" />

      <View style={styles.content}>
        <SyncRow synced={synced} pulling={pulling} pullInfo={pullInfo} onPull={pullNow} />

        <View
          style={[
            styles.summaryCard,
            { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow },
          ]}
        >
          <View>
            <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Total balance</Text>
            <Text style={[styles.summaryAmount, { color: theme.text }]}>
              {money(totalBalance)}
            </Text>
            <Text style={[styles.summarySub, { color: theme.textSecondary }]}>
              across {items.length} account{items.length === 1 ? '' : 's'}
              {accountsWithBalance > 0 ? ` · ${accountsWithBalance} with balance set` : ''}
            </Text>
          </View>
          <View style={[styles.summaryIcon, { backgroundColor: theme.accent + '33' }]}>
            <Ionicons name="cash-outline" size={26} color={theme.accent} />
          </View>
        </View>

        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="business-outline" size={56} color={theme.textMuted} />
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                No bank accounts yet. Add your accounts in Banking Details first.
              </Text>
              <TouchableOpacity
                style={[styles.goBtn, { backgroundColor: theme.secondary }]}
                onPress={() => router.push('/banking')}
              >
                <Text style={styles.goBtnText}>Go to Banking Details</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <View
              style={[
                styles.row,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  shadowColor: theme.shadow,
                },
              ]}
            >
              <View style={[styles.bankIcon, { backgroundColor: theme.accent + '33' }]}>
                <Ionicons name="business-outline" size={19} color={theme.accent} />
              </View>
              <View style={styles.rowBody}>
                <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
                  {item.bankName}
                </Text>
                <Text style={[styles.rowSub, { color: theme.textSecondary }]}>
                  {item.accountType} · {maskAccount(item.accountNumber)}
                </Text>
              </View>
              <TouchableOpacity style={styles.balanceBox} onPress={() => openEdit(item)}>
                <Text style={[styles.balanceLabel, { color: theme.textMuted }]}>Balance</Text>
                <Text
                  style={[
                    styles.balanceValue,
                    { color: item.balance != null ? theme.text : theme.textMuted },
                  ]}
                >
                  {money(item.balance)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(item)}>
                <Ionicons name="create-outline" size={18} color={theme.primaryDark} />
              </TouchableOpacity>
            </View>
          )}
        />
      </View>

      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Update Balance</Text>
            <Text style={[styles.modalSub, { color: theme.textSecondary }]}>
              {items.find((i) => i.id === editingId)?.bankName}
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
              placeholder="Current balance (₹)"
              placeholderTextColor={theme.textMuted}
              keyboardType="decimal-pad"
              value={balanceDraft}
              onChangeText={setBalanceDraft}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.cancelBtn, { backgroundColor: theme.surfaceAlt }]}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: theme.primary }]}
                onPress={saveBalance}
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
  list: { paddingBottom: 40 },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryLabel: { fontSize: 12, fontWeight: '600' },
  summaryAmount: { fontSize: 28, fontWeight: 'bold', marginTop: 4 },
  summarySub: { fontSize: 12, marginTop: 4 },
  summaryIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { alignItems: 'center', marginTop: 60 },
  emptyText: { marginTop: 12, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
  goBtn: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, marginTop: 20 },
  goBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  bankIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowSub: { fontSize: 12, marginTop: 2 },
  balanceBox: { alignItems: 'flex-end', marginRight: 4 },
  balanceLabel: { fontSize: 10, fontWeight: '600' },
  balanceValue: { fontSize: 15, fontWeight: '800', marginTop: 2 },
  editBtn: { padding: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modal: { borderRadius: 20, padding: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  modalSub: { fontSize: 13, marginTop: 4, marginBottom: 16 },
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
