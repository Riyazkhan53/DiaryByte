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

const STORAGE_KEY = '@diarybyte_investments';

const CATEGORIES = [
  { key: 'Mutual Funds', icon: 'pie-chart-outline', color: '#AF52DE' },
  { key: 'Stocks', icon: 'trending-up-outline', color: '#32ADE6' },
  { key: 'Digital Gold', icon: 'diamond-outline', color: '#FFCC00' },
  { key: 'FD', icon: 'lock-closed-outline', color: '#34C759' },
];

const DETAIL_PLACEHOLDERS = {
  'Mutual Funds': 'Folio number (optional)',
  Stocks: 'Quantity (e.g. 10 shares)',
  'Digital Gold': 'Weight (e.g. 2.5 g)',
  FD: 'Rate & maturity (e.g. 7.1%, 2027)',
};

const CURRENT_LABELS = {
  FD: 'Maturity value (₹)',
};

const makeId = () =>
  `${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`;

const money = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const categoryMeta = (key) =>
  CATEGORIES.find((c) => c.key === key) || CATEGORIES[0];

export default function InvestmentsScreen() {
  const { theme } = useTheme();
  const { items, synced, persist, pulling, pullInfo, pullNow } = useSyncedCollection(
    'investments',
    STORAGE_KEY
  );
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [category, setCategory] = useState('Mutual Funds');
  const [name, setName] = useState('');
  const [invested, setInvested] = useState('');
  const [current, setCurrent] = useState('');
  const [detail, setDetail] = useState('');
  const [note, setNote] = useState('');
  const [filter, setFilter] = useState('all');

  const openAdd = () => {
    setEditingId(null);
    setCategory('Mutual Funds');
    setName('');
    setInvested('');
    setCurrent('');
    setDetail('');
    setNote('');
    setModalVisible(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setCategory(item.category);
    setName(item.name);
    setInvested(item.invested != null ? String(item.invested) : '');
    setCurrent(item.current != null ? String(item.current) : '');
    setDetail(item.detail || '');
    setNote(item.note || '');
    setModalVisible(true);
  };

  const saveItem = () => {
    const investedNum = parseFloat(invested.replace(/[^\d.]/g, ''));
    const currentNum = parseFloat(current.replace(/[^\d.]/g, ''));
    if (!name.trim() || !investedNum || !currentNum) return;
    const entry = {
      id: editingId || makeId(),
      category,
      name: name.trim(),
      invested: investedNum,
      current: currentNum,
      detail: detail.trim(),
      note: note.trim(),
      createdAt: editingId
        ? items.find((i) => i.id === editingId)?.createdAt || new Date().toISOString()
        : new Date().toISOString(),
    };
    persist(editingId ? items.map((i) => (i.id === editingId ? entry : i)) : [entry, ...items]);
    setModalVisible(false);
  };

  const deleteItem = (item) => {
    Alert.alert('Delete Investment', `Remove ${item.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => persist(items.filter((i) => i.id !== item.id)),
      },
    ]);
  };

  const totalInvested = items.reduce((s, i) => s + (i.invested || 0), 0);
  const totalCurrent = items.reduce((s, i) => s + (i.current || 0), 0);
  const pl = totalCurrent - totalInvested;
  const plPct = totalInvested > 0 ? (pl / totalInvested) * 100 : 0;
  const plColor = pl >= 0 ? '#2DA44E' : '#E5383B';

  const visible = filter === 'all' ? items : items.filter((i) => i.category === filter);
  const visibleInvested = visible.reduce((s, i) => s + (i.invested || 0), 0);
  const visibleCurrent = visible.reduce((s, i) => s + (i.current || 0), 0);

  const formValid =
    name.trim() &&
    parseFloat(invested.replace(/[^\d.]/g, '')) > 0 &&
    parseFloat(current.replace(/[^\d.]/g, '')) > 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
      <Header title="My Investments" subtitle="Savings & investments, all in one place" />

      <View style={styles.content}>
        <SyncRow synced={synced} pulling={pulling} pullInfo={pullInfo} onPull={pullNow} />

        <View
          style={[
            styles.summaryCard,
            { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow },
          ]}
        >
          <View style={styles.summaryRow}>
            <View style={styles.summaryCol}>
              <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Invested</Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>{money(totalInvested)}</Text>
            </View>
            <View style={styles.summaryCol}>
              <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Current value</Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>{money(totalCurrent)}</Text>
            </View>
          </View>
          <View style={[styles.plRow, { borderTopColor: theme.borderNeutral }]}>
            <Text style={[styles.plLabel, { color: theme.textMuted }]}>
              Overall {pl >= 0 ? 'gain' : 'loss'}
            </Text>
            <Text style={[styles.plValue, { color: plColor }]}>
              {pl >= 0 ? '+' : ''}
              {money(Math.abs(pl))} ({pl >= 0 ? '+' : ''}
              {plPct.toFixed(1)}%)
            </Text>
          </View>
        </View>

        <View style={styles.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
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
            {filter === 'all' ? 'All holdings' : filter} · invested {money(visibleInvested)} → now{' '}
            {money(visibleCurrent)}
          </Text>
        ) : null}

        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="trending-up-outline" size={56} color={theme.textMuted} />
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                No investments yet. Tap + to add mutual funds, stocks, gold or FDs.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const meta = categoryMeta(item.category);
            const itemPl = (item.current || 0) - (item.invested || 0);
            const itemPlPct =
              item.invested > 0 ? ((item.current - item.invested) / item.invested) * 100 : 0;
            return (
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
                  <View style={[styles.catIcon, { backgroundColor: meta.color + '40' }]}>
                    <Ionicons name={meta.icon} size={19} color="#455A64" />
                  </View>
                  <View style={styles.cardMeta}>
                    <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[styles.cardSub, { color: theme.textSecondary }]}>
                      {item.category}
                      {item.detail ? ` · ${item.detail}` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.iconBtn} onPress={() => openEdit(item)}>
                    <Ionicons name="create-outline" size={19} color={theme.primaryDark} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.iconBtn} onPress={() => deleteItem(item)}>
                    <Ionicons name="trash-outline" size={19} color={theme.danger} />
                  </TouchableOpacity>
                </View>

                <View style={styles.amountsRow}>
                  <View style={styles.amountCol}>
                    <Text style={[styles.amountLabel, { color: theme.textMuted }]}>Invested</Text>
                    <Text style={[styles.amountValue, { color: theme.text }]}>
                      {money(item.invested)}
                    </Text>
                  </View>
                  <Ionicons name="arrow-forward" size={14} color={theme.textMuted} />
                  <View style={styles.amountCol}>
                    <Text style={[styles.amountLabel, { color: theme.textMuted }]}>
                      {item.category === 'FD' ? 'Maturity' : 'Current'}
                    </Text>
                    <Text style={[styles.amountValue, { color: theme.text }]}>
                      {money(item.current)}
                    </Text>
                  </View>
                  <View style={[styles.plBadge, { backgroundColor: itemPl >= 0 ? '#A5D6A740' : '#EF9A9A40' }]}>
                    <Text style={[styles.plBadgeText, { color: itemPl >= 0 ? '#2DA44E' : '#E5383B' }]}>
                      {itemPl >= 0 ? '+' : ''}
                      {itemPlPct.toFixed(1)}%
                    </Text>
                  </View>
                </View>

                {item.note ? (
                  <Text style={[styles.note, { color: theme.textSecondary }]} numberOfLines={2}>
                    {item.note}
                  </Text>
                ) : null}
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
          <View style={[styles.modal, { backgroundColor: theme.sheet }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {editingId ? 'Edit Investment' : 'Add Investment'}
              </Text>

              <Text style={[styles.fieldLabelText, { color: theme.textSecondary }]}>Category</Text>
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

              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                placeholder={
                  category === 'Mutual Funds'
                    ? 'Fund name (e.g. Axis Bluechip)'
                    : category === 'Stocks'
                      ? 'Stock name (e.g. TCS)'
                      : category === 'Digital Gold'
                        ? 'Platform (e.g. Paytm Gold)'
                        : 'Bank / FD name'
                }
                placeholderTextColor={theme.textMuted}
                value={name}
                onChangeText={setName}
              />
              <View style={styles.amountRow}>
                <TextInput
                  style={[styles.input, styles.smallInput, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                  placeholder="Amount invested (₹)"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="decimal-pad"
                  value={invested}
                  onChangeText={setInvested}
                />
                <TextInput
                  style={[styles.input, styles.smallInput, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                  placeholder={CURRENT_LABELS[category] || 'Current value (₹)'}
                  placeholderTextColor={theme.textMuted}
                  keyboardType="decimal-pad"
                  value={current}
                  onChangeText={setCurrent}
                />
              </View>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                placeholder={DETAIL_PLACEHOLDERS[category] || 'Detail (optional)'}
                placeholderTextColor={theme.textMuted}
                value={detail}
                onChangeText={setDetail}
              />
              <TextInput
                style={[styles.input, styles.noteInput, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                placeholder="Note (optional)"
                placeholderTextColor={theme.textMuted}
                value={note}
                onChangeText={setNote}
                multiline
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { backgroundColor: theme.surfaceAlt }]}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.saveBtn,
                    { backgroundColor: theme.primary },
                    !formValid && styles.btnDisabled,
                  ]}
                  onPress={saveItem}
                  disabled={!formValid}
                >
                  <Text style={[styles.saveText, { color: theme.onPrimary }]}>
                    {editingId ? 'Update' : 'Save'}
                  </Text>
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
  summaryCard: {
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryRow: { flexDirection: 'row' },
  summaryCol: { flex: 1 },
  summaryLabel: { fontSize: 12, fontWeight: '600' },
  summaryValue: { fontSize: 22, fontWeight: 'bold', marginTop: 4 },
  plRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    marginTop: 14,
    paddingTop: 12,
  },
  plLabel: { fontSize: 13, fontWeight: '600' },
  plValue: { fontSize: 16, fontWeight: '800' },
  filterRow: { marginBottom: 10 },
  filterChips: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '600' },
  visibleTotal: { fontSize: 11, fontWeight: '600', marginBottom: 10 },
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
  catIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardMeta: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardSub: { fontSize: 12, marginTop: 2 },
  iconBtn: { padding: 6 },
  amountsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  amountCol: { flex: 1 },
  amountLabel: { fontSize: 11, fontWeight: '600' },
  amountValue: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  plBadge: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 10 },
  plBadgeText: { fontSize: 12, fontWeight: '800' },
  note: { fontSize: 12, marginTop: 8 },
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modal: { borderRadius: 20, padding: 20, maxHeight: '85%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  fieldLabelText: { fontSize: 12, fontWeight: '600', marginBottom: 8, letterSpacing: 0.5 },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  amountRow: { flexDirection: 'row', gap: 12 },
  smallInput: { flex: 1 },
  noteInput: { minHeight: 70, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600' },
  saveBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '600' },
  btnDisabled: { opacity: 0.4 },
});
