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
import SyncRow from '../../components/SyncRow';
import { useTheme } from '../../hooks/useTheme';
import { useSyncedCollection } from '../../hooks/useSyncedCollection';

const STORAGE_KEY = '@diarybyte_expenditure';

const CATEGORIES = [
  { key: 'Food', icon: 'restaurant-outline', color: '#FFAB91' },
  { key: 'Travel', icon: 'car-outline', color: '#81D4FA' },
  { key: 'Shopping', icon: 'bag-outline', color: '#CE93D8' },
  { key: 'Bills', icon: 'receipt-outline', color: '#FFCC80' },
  { key: 'Entertainment', icon: 'film-outline', color: '#A5D6A7' },
  { key: 'Health', icon: 'medkit-outline', color: '#EF9A9A' },
  { key: 'Education', icon: 'school-outline', color: '#90CAF9' },
  { key: 'Other', icon: 'wallet-outline', color: '#BDBDBD' },
];

const makeId = () =>
  `${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`;

const formatAmount = (n) =>
  `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const categoryMeta = (key) =>
  CATEGORIES.find((c) => c.key === key) || CATEGORIES[CATEGORIES.length - 1];

const sameMonth = (iso, now) => {
  const d = new Date(iso);
  return (
    d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  );
};

export default function ExpenditureScreen() {
  const { theme } = useTheme();
  const { items, synced, persist, pulling, pullInfo, pullNow } = useSyncedCollection(
    'expenditure',
    STORAGE_KEY
  );
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Food');
  const [filter, setFilter] = useState('all');

  const openAdd = () => {
    setTitle('');
    setAmount('');
    setCategory('Food');
    setModalVisible(true);
  };

  const addItem = () => {
    const parsed = parseFloat(amount.replace(/[^\d.]/g, ''));
    if (!title.trim() || !parsed || parsed <= 0) return;
    persist([
      {
        id: makeId(),
        title: title.trim(),
        amount: parsed,
        category,
        date: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      ...items,
    ]);
    setTitle('');
    setAmount('');
    setCategory('Food');
    setModalVisible(false);
  };

  const deleteItem = (id) => {
    Alert.alert('Delete Expense', 'Remove this expense?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => persist(items.filter((i) => i.id !== id)),
      },
    ]);
  };

  const now = new Date();
  const monthItems = items.filter((i) => sameMonth(i.date || i.createdAt, now));
  const monthTotal = monthItems.reduce((sum, i) => sum + (i.amount || 0), 0);
  const monthByCategory = monthItems.reduce((acc, i) => {
    acc[i.category] = (acc[i.category] || 0) + (i.amount || 0);
    return acc;
  }, {});
  const topCategory = Object.entries(monthByCategory).sort((a, b) => b[1] - a[1])[0];

  const visible = filter === 'all' ? items : items.filter((i) => i.category === filter);
  const visibleTotal = visible.reduce((sum, i) => sum + (i.amount || 0), 0);

  const formatDate = (iso) =>
    new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Header title="My Expenditure" subtitle="Track where your money goes" />

      <View style={styles.content}>
        <SyncRow synced={synced} pulling={pulling} pullInfo={pullInfo} onPull={pullNow} />

        <View
          style={[
            styles.summaryCard,
            { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow },
          ]}
        >
          <View>
            <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>
              Spent this month
            </Text>
            <Text style={[styles.summaryAmount, { color: theme.text }]}>
              {formatAmount(monthTotal)}
            </Text>
            <Text style={[styles.summarySub, { color: theme.textSecondary }]}>
              {monthItems.length} expense{monthItems.length === 1 ? '' : 's'}
              {topCategory ? ` · mostly ${topCategory[0]}` : ''}
            </Text>
          </View>
          <View style={[styles.summaryIcon, { backgroundColor: theme.secondary + '33' }]}>
            <Ionicons name="wallet-outline" size={26} color={theme.secondary} />
          </View>
        </View>

        <View style={styles.filterRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterChips}
          >
            <TouchableOpacity
              style={[
                styles.chip,
                {
                  backgroundColor: filter === 'all' ? theme.primary : theme.surface,
                  borderColor: filter === 'all' ? theme.primaryDark : theme.borderNeutral,
                },
              ]}
              onPress={() => setFilter('all')}
            >
              <Text style={[styles.chipText, { color: theme.text }]}>All</Text>
            </TouchableOpacity>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c.key}
                style={[
                  styles.chip,
                  {
                    backgroundColor: filter === c.key ? c.color : theme.surface,
                    borderColor: filter === c.key ? c.color : theme.borderNeutral,
                  },
                ]}
                onPress={() => setFilter(c.key)}
              >
                <Text style={[styles.chipText, { color: theme.text }]}>{c.key}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {visible.length > 0 ? (
          <Text style={[styles.visibleTotal, { color: theme.textMuted }]}>
            {filter === 'all' ? 'All expenses' : filter} · {formatAmount(visibleTotal)}
          </Text>
        ) : null}

        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="wallet-outline" size={56} color={theme.textMuted} />
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                No expenses yet. Tap + to record one.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const meta = categoryMeta(item.category);
            return (
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
                <View style={[styles.catIcon, { backgroundColor: meta.color + '40' }]}>
                  <Ionicons name={meta.icon} size={19} color="#455A64" />
                </View>
                <View style={styles.rowBody}>
                  <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={[styles.rowSub, { color: theme.textSecondary }]}>
                    {item.category} · {formatDate(item.date || item.createdAt)}
                  </Text>
                </View>
                <Text style={[styles.rowAmount, { color: theme.text }]}>
                  {formatAmount(item.amount)}
                </Text>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteItem(item.id)}>
                  <Ionicons name="trash-outline" size={19} color={theme.danger} />
                </TouchableOpacity>
              </View>
            );
          }}
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
          <View style={[styles.modal, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Add Expense</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
              placeholder="What did you spend on?"
              placeholderTextColor={theme.textMuted}
              value={title}
              onChangeText={setTitle}
            />
            <TextInput
              style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
              placeholder="Amount (₹)"
              placeholderTextColor={theme.textMuted}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />
            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Category</Text>
            <View style={styles.catRow}>
              {CATEGORIES.map((c) => {
                const selected = category === c.key;
                return (
                  <TouchableOpacity
                    key={c.key}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected ? c.color : theme.surfaceAlt,
                        borderColor: selected ? c.color : theme.borderNeutral,
                      },
                    ]}
                    onPress={() => setCategory(c.key)}
                  >
                    <Text style={[styles.chipText, { color: theme.text }]}>{c.key}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
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
                disabled={!title.trim() || !parseFloat(amount.replace(/[^\d.]/g, ''))}
              >
                <Text style={[styles.saveText, { color: theme.text }]}>Add</Text>
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
  filterRow: { marginBottom: 10 },
  filterChips: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  visibleTotal: { fontSize: 11, fontWeight: '600', marginBottom: 10 },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyText: { marginTop: 12, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
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
  catIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowSub: { fontSize: 12, marginTop: 2 },
  rowAmount: { fontSize: 15, fontWeight: '700', marginRight: 6 },
  deleteBtn: { padding: 6 },
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
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600' },
  saveBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '600' },
});
