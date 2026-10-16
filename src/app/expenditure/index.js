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
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Header from '../../components/Header';
import SyncRow from '../../components/SyncRow';
import { useTheme } from '../../hooks/useTheme';
import { useSyncedCollection } from '../../hooks/useSyncedCollection';
import { confirmDelete } from '../../utils/confirm';

const STORAGE_KEY = '@diarybyte_expenditure';
const MONTHS_STORAGE_KEY = '@diarybyte_months';

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

const INCOME_SOURCES = [
  { key: 'Salary', icon: 'briefcase-outline' },
  { key: 'Business', icon: 'storefront-outline' },
  { key: 'Freelance', icon: 'laptop-outline' },
  { key: 'Rental', icon: 'home-outline' },
  { key: 'Interest', icon: 'trending-up-outline' },
  { key: 'Other', icon: 'cash-outline' },
];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const makeId = () =>
  `${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`;

const formatAmount = (n) =>
  `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const parseAmount = (text) => parseFloat(String(text).replace(/[^\d.]/g, ''));

const categoryMeta = (key) =>
  CATEGORIES.find((c) => c.key === key) || CATEGORIES[CATEGORIES.length - 1];

const sourceMeta = (key) =>
  INCOME_SOURCES.find((s) => s.key === key) || INCOME_SOURCES[INCOME_SOURCES.length - 1];

// Months are 'YYYY-MM' strings in local time; they sort correctly as text.
const monthKeyOf = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

// Older expenses have no `month` field; place them by their date.
const expenseMonth = (item) => item.month || monthKeyOf(new Date(item.date || item.createdAt));

const monthLabel = (key, long = false) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: long ? 'long' : 'short',
    year: 'numeric',
  });
};

// Expenses added to a past or future month are dated the 1st of that month.
const dateForMonth = (key) => {
  const now = new Date();
  if (key === monthKeyOf(now)) return now.toISOString();
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1, 12).toISOString();
};

export default function ExpenditureScreen() {
  const { theme } = useTheme();
  const { items, synced, persist, pulling, pullInfo, pullNow } = useSyncedCollection(
    'expenditure',
    STORAGE_KEY
  );
  const { items: months, persist: persistMonths } = useSyncedCollection(
    'months',
    MONTHS_STORAGE_KEY
  );
  const currentMonth = monthKeyOf(new Date());
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [filter, setFilter] = useState('all');

  // Expense modal
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Food');

  // Income modal
  const [incomeVisible, setIncomeVisible] = useState(false);
  const [editingIncomeId, setEditingIncomeId] = useState(null);
  const [incomeSource, setIncomeSource] = useState('Salary');
  const [incomeNote, setIncomeNote] = useState('');
  const [incomeAmount, setIncomeAmount] = useState('');

  // Month picker
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());

  const monthDoc = months.find((m) => m.month === selectedMonth);
  const incomes = monthDoc?.incomes || [];

  const monthKeys = Array.from(
    new Set([
      currentMonth,
      selectedMonth,
      ...months.map((m) => m.month),
      ...items.map(expenseMonth),
    ])
  ).sort((a, b) => b.localeCompare(a));

  const saveMonthIncomes = (monthKey, updatedIncomes) => {
    const existing = months.find((m) => m.month === monthKey);
    const doc = existing
      ? { ...existing, incomes: updatedIncomes }
      : { id: monthKey, month: monthKey, incomes: updatedIncomes, createdAt: new Date().toISOString() };
    persistMonths(existing ? months.map((m) => (m.month === monthKey ? doc : m)) : [doc, ...months]);
  };

  // ------- expenses -------

  const openAdd = () => {
    setTitle('');
    setAmount('');
    setCategory('Food');
    setModalVisible(true);
  };

  const addItem = () => {
    const parsed = parseAmount(amount);
    if (!title.trim() || !parsed || parsed <= 0) return;
    persist([
      {
        id: makeId(),
        title: title.trim(),
        amount: parsed,
        category,
        month: selectedMonth,
        date: dateForMonth(selectedMonth),
        createdAt: new Date().toISOString(),
      },
      ...items,
    ]);
    setModalVisible(false);
  };

  const deleteItem = (id) => {
    confirmDelete('Delete Expense', 'Remove this expense?', () =>
      persist(items.filter((i) => i.id !== id))
    );
  };

  // ------- income -------

  const openAddIncome = () => {
    setEditingIncomeId(null);
    setIncomeSource('Salary');
    setIncomeNote('');
    setIncomeAmount('');
    setIncomeVisible(true);
  };

  const openEditIncome = (income) => {
    setEditingIncomeId(income.id);
    setIncomeSource(income.source);
    setIncomeNote(income.note || '');
    setIncomeAmount(String(income.amount));
    setIncomeVisible(true);
  };

  const saveIncome = () => {
    const parsed = parseAmount(incomeAmount);
    if (!parsed || parsed <= 0) return;
    const entry = {
      id: editingIncomeId || makeId(),
      source: incomeSource,
      note: incomeNote.trim(),
      amount: parsed,
    };
    saveMonthIncomes(
      selectedMonth,
      editingIncomeId ? incomes.map((i) => (i.id === editingIncomeId ? entry : i)) : [...incomes, entry]
    );
    setIncomeVisible(false);
  };

  const deleteIncome = (income) => {
    confirmDelete('Delete Income', `Remove ${income.note || income.source}?`, () =>
      saveMonthIncomes(
        selectedMonth,
        incomes.filter((i) => i.id !== income.id)
      )
    );
  };

  // ------- months -------

  const openMonthPicker = () => {
    setPickerYear(Number(selectedMonth.slice(0, 4)));
    setPickerVisible(true);
  };

  const addMonth = (key) => {
    if (!months.some((m) => m.month === key)) saveMonthIncomes(key, []);
    setSelectedMonth(key);
    setFilter('all');
    setPickerVisible(false);
  };

  // ------- this month's numbers -------

  const monthItems = items.filter((i) => expenseMonth(i) === selectedMonth);
  const totalIncome = incomes.reduce((sum, i) => sum + (i.amount || 0), 0);
  const totalSpent = monthItems.reduce((sum, i) => sum + (i.amount || 0), 0);
  const balance = totalIncome - totalSpent;
  const spentPct = totalIncome > 0 ? Math.min((totalSpent / totalIncome) * 100, 100) : totalSpent > 0 ? 100 : 0;
  const overspent = balance < 0;

  const monthByCategory = monthItems.reduce((acc, i) => {
    acc[i.category] = (acc[i.category] || 0) + (i.amount || 0);
    return acc;
  }, {});
  const topCategory = Object.entries(monthByCategory).sort((a, b) => b[1] - a[1])[0];

  const visible = filter === 'all' ? monthItems : monthItems.filter((i) => i.category === filter);
  const visibleTotal = visible.reduce((sum, i) => sum + (i.amount || 0), 0);

  const formatDate = (iso) =>
    new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  const inputStyle = [
    styles.input,
    { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text },
  ];
  const cardStyle = [
    styles.summaryCard,
    { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow },
  ];

  const listHeader = (
    <View>
      <SyncRow synced={synced} pulling={pulling} pullInfo={pullInfo} onPull={pullNow} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.monthChips}
        style={styles.monthRow}
      >
        <TouchableOpacity
          style={[styles.chip, styles.addMonthChip, { borderColor: theme.secondary }]}
          onPress={openMonthPicker}
          accessibilityLabel="Add month"
        >
          <Ionicons name="add" size={16} color={theme.secondaryDark} />
          <Text style={[styles.chipText, { color: theme.secondaryDark }]}>Month</Text>
        </TouchableOpacity>
        {monthKeys.map((key) => {
          const selected = key === selectedMonth;
          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? theme.secondary : theme.surface,
                  borderColor: selected ? theme.secondary : theme.borderNeutral,
                },
              ]}
              onPress={() => {
                setSelectedMonth(key);
                setFilter('all');
              }}
            >
              <Text style={[styles.chipText, { color: selected ? '#FFFFFF' : theme.text }]}>
                {monthLabel(key)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={cardStyle}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>{monthLabel(selectedMonth, true)}</Text>
        <View style={styles.statsRow}>
          <View style={styles.statCol}>
            <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Income</Text>
            <Text style={[styles.statValue, { color: '#2E7D32' }]}>{formatAmount(totalIncome)}</Text>
          </View>
          <View style={styles.statCol}>
            <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Spent</Text>
            <Text style={[styles.statValue, { color: '#C62828' }]}>{formatAmount(totalSpent)}</Text>
          </View>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: theme.surfaceAlt }]}>
          <View
            style={[
              styles.progressFill,
              { width: `${spentPct}%`, backgroundColor: overspent ? '#E57373' : theme.primary },
            ]}
          />
        </View>
        <View style={[styles.balanceRow, { borderTopColor: theme.borderNeutral }]}>
          <View>
            <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>
              {overspent ? 'Overspent' : 'In hand'}
            </Text>
            <Text style={[styles.balanceValue, { color: overspent ? '#C62828' : '#2E7D32' }]}>
              {overspent ? '−' : ''}
              {formatAmount(Math.abs(balance))}
            </Text>
          </View>
          <Text style={[styles.summarySub, { color: theme.textSecondary }]}>
            {totalIncome > 0
              ? `${Math.round((totalSpent / totalIncome) * 100)}% of income spent`
              : totalSpent > 0
                ? 'No income added yet'
                : ''}
            {topCategory ? `\nmostly ${topCategory[0]}` : ''}
          </Text>
        </View>
      </View>

      <View style={cardStyle}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.cardTitle, styles.noMargin, { color: theme.text }]}>My Income</Text>
          <TouchableOpacity
            style={[styles.smallBtn, { backgroundColor: theme.primary }]}
            onPress={openAddIncome}
            accessibilityLabel="Add income"
          >
            <Ionicons name="add" size={16} color={theme.text} />
            <Text style={[styles.smallBtnText, { color: theme.text }]}>Income</Text>
          </TouchableOpacity>
        </View>
        {incomes.length === 0 ? (
          <Text style={[styles.summarySub, { color: theme.textMuted }]}>
            No income added for {monthLabel(selectedMonth, true)}.
          </Text>
        ) : (
          incomes.map((income) => (
            <View key={income.id} style={styles.incomeRow}>
              <View style={[styles.catIcon, styles.incomeIcon]}>
                <Ionicons name={sourceMeta(income.source).icon} size={17} color="#2E7D32" />
              </View>
              <TouchableOpacity style={styles.rowBody} onPress={() => openEditIncome(income)}>
                <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
                  {income.note || income.source}
                </Text>
                {income.note ? (
                  <Text style={[styles.rowSub, { color: theme.textSecondary }]}>{income.source}</Text>
                ) : null}
              </TouchableOpacity>
              <Text style={[styles.rowAmount, { color: '#2E7D32' }]}>+{formatAmount(income.amount)}</Text>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => deleteIncome(income)}
                accessibilityLabel={`Delete ${income.note || income.source}`}
              >
                <Ionicons name="trash-outline" size={18} color={theme.danger} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <Text style={[styles.listTitle, { color: theme.text }]}>Expenses</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterChips}
        style={styles.filterRow}
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

      {visible.length > 0 ? (
        <Text style={[styles.visibleTotal, { color: theme.textMuted }]}>
          {filter === 'all' ? 'All expenses' : filter} · {formatAmount(visibleTotal)}
        </Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Header title="My Expenditure" subtitle="Income and spending, month by month" />

      <FlatList
        style={styles.content}
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="wallet-outline" size={48} color={theme.textMuted} />
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              No expenses in {monthLabel(selectedMonth, true)}. Tap + to record one.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const meta = categoryMeta(item.category);
          return (
            <View
              style={[
                styles.row,
                { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow },
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
              <Text style={[styles.rowAmount, { color: theme.text }]}>{formatAmount(item.amount)}</Text>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => deleteItem(item.id)}
                accessibilityLabel={`Delete ${item.title}`}
              >
                <Ionicons name="trash-outline" size={19} color={theme.danger} />
              </TouchableOpacity>
            </View>
          );
        }}
      />

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.secondary, shadowColor: theme.secondary }]}
        onPress={openAdd}
        activeOpacity={0.8}
        accessibilityLabel="Add expense"
      >
        <Ionicons name="add" size={32} color="#FFF" />
      </TouchableOpacity>

      {/* Add expense */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Add Expense</Text>
            <Text style={[styles.modalSub, { color: theme.textSecondary }]}>
              {monthLabel(selectedMonth, true)}
            </Text>
            <TextInput
              style={inputStyle}
              placeholder="What did you spend on?"
              placeholderTextColor={theme.textMuted}
              value={title}
              onChangeText={setTitle}
            />
            <TextInput
              style={inputStyle}
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
                style={[
                  styles.saveBtn,
                  { backgroundColor: theme.primary },
                  !(title.trim() && parseAmount(amount) > 0) && styles.btnDisabled,
                ]}
                onPress={addItem}
                disabled={!(title.trim() && parseAmount(amount) > 0)}
              >
                <Text style={[styles.saveText, { color: theme.text }]}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add / edit income */}
      <Modal visible={incomeVisible} transparent animationType="fade" onRequestClose={() => setIncomeVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {editingIncomeId ? 'Edit Income' : 'Add Income'}
            </Text>
            <Text style={[styles.modalSub, { color: theme.textSecondary }]}>
              {monthLabel(selectedMonth, true)}
            </Text>
            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Source</Text>
            <View style={styles.catRow}>
              {INCOME_SOURCES.map((s) => {
                const selected = incomeSource === s.key;
                return (
                  <TouchableOpacity
                    key={s.key}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected ? '#A5D6A7' : theme.surfaceAlt,
                        borderColor: selected ? '#81C784' : theme.borderNeutral,
                      },
                    ]}
                    onPress={() => setIncomeSource(s.key)}
                  >
                    <Text style={[styles.chipText, { color: selected ? '#1B5E20' : theme.text }]}>{s.key}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TextInput
              style={[inputStyle, styles.spaced]}
              placeholder="Name (optional, e.g. Company name)"
              placeholderTextColor={theme.textMuted}
              value={incomeNote}
              onChangeText={setIncomeNote}
            />
            <TextInput
              style={inputStyle}
              placeholder="Amount (₹)"
              placeholderTextColor={theme.textMuted}
              value={incomeAmount}
              onChangeText={setIncomeAmount}
              keyboardType="decimal-pad"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.cancelBtn, { backgroundColor: theme.surfaceAlt }]}
                onPress={() => setIncomeVisible(false)}
              >
                <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  { backgroundColor: theme.primary },
                  !(parseAmount(incomeAmount) > 0) && styles.btnDisabled,
                ]}
                onPress={saveIncome}
                disabled={!(parseAmount(incomeAmount) > 0)}
              >
                <Text style={[styles.saveText, { color: theme.text }]}>
                  {editingIncomeId ? 'Update' : 'Add'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add month */}
      <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={() => setPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Add Month</Text>
            <View style={styles.yearRow}>
              <TouchableOpacity onPress={() => setPickerYear(pickerYear - 1)} accessibilityLabel="Previous year">
                <Ionicons name="chevron-back" size={22} color={theme.text} />
              </TouchableOpacity>
              <Text style={[styles.yearText, { color: theme.text }]}>{pickerYear}</Text>
              <TouchableOpacity onPress={() => setPickerYear(pickerYear + 1)} accessibilityLabel="Next year">
                <Ionicons name="chevron-forward" size={22} color={theme.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.monthGrid}>
              {MONTH_NAMES.map((name, i) => {
                const key = `${pickerYear}-${String(i + 1).padStart(2, '0')}`;
                const exists = monthKeys.includes(key);
                return (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.monthCell,
                      {
                        backgroundColor: exists ? theme.secondary + '33' : theme.surfaceAlt,
                        borderColor: key === selectedMonth ? theme.secondary : theme.borderNeutral,
                      },
                    ]}
                    onPress={() => addMonth(key)}
                  >
                    <Text style={[styles.chipText, { color: theme.text }]}>{name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={[styles.cancelBtn, styles.pickerCancel, { backgroundColor: theme.surfaceAlt }]}
              onPress={() => setPickerVisible(false)}
            >
              <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
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
  monthRow: { marginBottom: 12, flexGrow: 0 },
  monthChips: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  addMonthChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderStyle: 'dashed' },
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
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  noMargin: { marginBottom: 0 },
  statsRow: { flexDirection: 'row', marginBottom: 12 },
  statCol: { flex: 1 },
  statValue: { fontSize: 20, fontWeight: 'bold', marginTop: 4 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    marginTop: 14,
    paddingTop: 12,
  },
  balanceValue: { fontSize: 26, fontWeight: 'bold', marginTop: 2 },
  summaryLabel: { fontSize: 12, fontWeight: '600' },
  summarySub: { fontSize: 12, textAlign: 'right' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  smallBtnText: { fontSize: 13, fontWeight: '700' },
  incomeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  incomeIcon: { backgroundColor: '#C8E6C9', width: 34, height: 34 },
  listTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  filterRow: { marginBottom: 10, flexGrow: 0 },
  filterChips: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  visibleTotal: { fontSize: 11, fontWeight: '600', marginBottom: 10 },
  empty: { alignItems: 'center', marginTop: 30 },
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
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  modalSub: { fontSize: 13, marginTop: 2, marginBottom: 16 },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  spaced: { marginTop: 8 },
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
  btnDisabled: { opacity: 0.4 },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  yearText: { fontSize: 18, fontWeight: '700' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  monthCell: {
    width: '30%',
    flexGrow: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  pickerCancel: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', marginTop: 16 },
});
