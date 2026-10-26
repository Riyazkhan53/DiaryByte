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
import {
  addMonths,
  duesForMonth,
  dueFromSourceId,
  markDuePaid,
  markDueUnpaid,
  shortDate,
} from '../../utils/debts';
import { todayKey } from '../../utils/autopay';

const STORAGE_KEY = '@diarybyte_expenditure';
const MONTHS_STORAGE_KEY = '@diarybyte_months';
const DEBTS_STORAGE_KEY = '@diarybyte_debts';

const CATEGORIES = [
  { key: 'Food', icon: 'restaurant-outline', color: '#FF6F61' },
  { key: 'Travel', icon: 'car-outline', color: '#32ADE6' },
  { key: 'Shopping', icon: 'bag-outline', color: '#AF52DE' },
  { key: 'Bills', icon: 'receipt-outline', color: '#FF9500' },
  { key: 'EMI', icon: 'calendar-outline', color: '#5856D6' },
  { key: 'Credit Card', icon: 'card-outline', color: '#FF375F' },
  { key: 'Entertainment', icon: 'film-outline', color: '#34C759' },
  { key: 'Health', icon: 'medkit-outline', color: '#FF3B30' },
  { key: 'Education', icon: 'school-outline', color: '#007AFF' },
  { key: 'Other', icon: 'wallet-outline', color: '#8E8E93' },
];

const INCOME_SOURCES = [
  { key: 'Salary', icon: 'briefcase-outline' },
  { key: 'Business', icon: 'storefront-outline' },
  { key: 'Freelance', icon: 'laptop-outline' },
  { key: 'Rental', icon: 'home-outline' },
  { key: 'Interest', icon: 'trending-up-outline' },
  { key: 'Other', icon: 'cash-outline' },
];

// How a month that ended in the red was covered.
const ADJUSTMENT_KINDS = [
  { key: 'borrowed', label: 'Borrowed', icon: 'people-outline' },
  { key: 'savings', label: 'From savings', icon: 'wallet-outline' },
  { key: 'extra', label: 'Extra income', icon: 'add-circle-outline' },
];

const adjustmentMeta = (key) =>
  ADJUSTMENT_KINDS.find((k) => k.key === key) || ADJUSTMENT_KINDS[ADJUSTMENT_KINDS.length - 1];

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
  const { items: debts, persist: persistDebts } = useSyncedCollection('debts', DEBTS_STORAGE_KEY);
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

  // "How was the shortfall covered?" modal
  const [adjustVisible, setAdjustVisible] = useState(false);
  const [adjustKind, setAdjustKind] = useState('borrowed');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjustAddDebt, setAdjustAddDebt] = useState(true);

  // "This month's amount" for monthly bills whose amount changes
  const [amountDue, setAmountDue] = useState(null);
  const [amountDraft, setAmountDraft] = useState('');

  // Month picker
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());

  const monthDoc = months.find((m) => m.month === selectedMonth);
  const incomes = monthDoc?.incomes || [];
  const adjustments = monthDoc?.adjustments || [];

  const monthKeys = Array.from(
    new Set([
      currentMonth,
      selectedMonth,
      ...months.map((m) => m.month),
      ...items.map(expenseMonth),
    ])
  ).sort((a, b) => b.localeCompare(a));

  const saveMonthDoc = (monthKey, changes) => {
    const existing = months.find((m) => m.month === monthKey);
    const doc = existing
      ? { ...existing, ...changes }
      : { id: monthKey, month: monthKey, incomes: [], createdAt: new Date().toISOString(), ...changes };
    persistMonths(existing ? months.map((m) => (m.month === monthKey ? doc : m)) : [doc, ...months]);
  };

  const saveMonthIncomes = (monthKey, updatedIncomes) => saveMonthDoc(monthKey, { incomes: updatedIncomes });

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

  const deleteItem = (item) => {
    const due = dueFromSourceId(item.sourceId, debts);
    confirmDelete(
      'Delete Expense',
      due ? 'Remove this payment? It will be marked unpaid in My Debts too.' : 'Remove this expense?',
      () => {
        if (due) {
          const result = markDueUnpaid(due, debts, items);
          persistDebts(result.debts);
          persist(result.expenses);
        } else {
          persist(items.filter((i) => i.id !== item.id));
        }
      }
    );
  };

  // ------- EMIs and bills due this month -------

  const dues = duesForMonth(debts, selectedMonth);
  const pendingDues = dues.filter((d) => !d.paid);
  const pendingDuesTotal = pendingDues.reduce((sum, d) => sum + d.amount, 0);

  const applyDue = (due, paid) => {
    const result = paid ? markDuePaid(due, debts, items) : markDueUnpaid(due, debts, items);
    persistDebts(result.debts);
    persist(result.expenses);
  };

  const toggleDue = (due) => {
    const variable = due.recurring && debts.find((d) => d.id === due.debtId)?.variable;
    if (!due.paid && variable) {
      setAmountDue(due);
      setAmountDraft(String(due.amount || ''));
      return;
    }
    applyDue(due, !due.paid);
  };

  const saveAmountPaid = () => {
    const value = parseAmount(amountDraft);
    if (!(value > 0)) return;
    applyDue({ ...amountDue, amount: value }, true);
    setAmountDue(null);
  };

  // ------- covering a shortfall -------

  const openAdjust = (suggested) => {
    setAdjustKind('borrowed');
    setAdjustAmount(suggested > 0 ? String(Math.round(suggested)) : '');
    setAdjustNote('');
    setAdjustAddDebt(true);
    setAdjustVisible(true);
  };

  const saveAdjust = () => {
    const parsed = parseAmount(adjustAmount);
    if (!parsed || parsed <= 0) return;
    const entry = {
      id: makeId(),
      kind: adjustKind,
      amount: parsed,
      note: adjustNote.trim(),
      createdAt: new Date().toISOString(),
    };
    // Money borrowed to cover the month is a debt to repay — track it there.
    if (adjustKind === 'borrowed' && adjustAddDebt) {
      const debtId = makeId();
      entry.debtId = debtId;
      persistDebts([
        {
          id: debtId,
          section: 'emi',
          manual: true,
          name: adjustNote.trim() || 'Borrowed',
          type: 'Borrowed',
          principal: parsed,
          outstanding: parsed,
          note: `Borrowed to cover ${monthLabel(selectedMonth, true)}`,
          createdAt: new Date().toISOString(),
        },
        ...debts,
      ]);
    }
    saveMonthDoc(selectedMonth, { adjustments: [...adjustments, entry] });
    setAdjustVisible(false);
  };

  const deleteAdjust = (adj) => {
    confirmDelete('Remove', `Remove ${adjustmentMeta(adj.kind).label} ${formatAmount(adj.amount)}?`, () =>
      saveMonthDoc(selectedMonth, { adjustments: adjustments.filter((a) => a.id !== adj.id) })
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

  // Month-end report: where the money went, and whether a gap was covered.
  const outflow = [
    { key: 'EMI', label: 'EMIs' },
    { key: 'Credit Card', label: 'Credit card bills' },
    { key: 'Bills', label: 'Other bills' },
  ].map((g) => ({ ...g, amount: monthByCategory[g.key] || 0 }));
  const otherSpend = totalSpent - outflow.reduce((sum, g) => sum + g.amount, 0);
  const shortfall = Math.max(0, -balance);
  const covered = adjustments.reduce((sum, a) => sum + (a.amount || 0), 0);
  const untallied = Math.max(0, shortfall - covered);
  const monthOver = selectedMonth < currentMonth;

  // Last month ended short and nothing (or not enough) was recorded to cover it.
  const lastMonth = addMonths(currentMonth, -1);
  const lastMonthGap = (() => {
    const doc = months.find((m) => m.month === lastMonth);
    const income = (doc?.incomes || []).reduce((sum, i) => sum + (i.amount || 0), 0);
    const spent = items
      .filter((i) => expenseMonth(i) === lastMonth)
      .reduce((sum, i) => sum + (i.amount || 0), 0);
    const cover = (doc?.adjustments || []).reduce((sum, a) => sum + (a.amount || 0), 0);
    return Math.max(0, spent - income - cover);
  })();

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

      {selectedMonth === currentMonth && lastMonthGap > 0 ? (
        <TouchableOpacity
          style={[styles.banner, { backgroundColor: '#E5383B1F', borderColor: '#E5383B66' }]}
          onPress={() => {
            setSelectedMonth(lastMonth);
            setFilter('all');
          }}
        >
          <Ionicons name="alert-circle-outline" size={20} color="#E5383B" />
          <Text style={[styles.bannerText, { color: theme.text }]}>
            {monthLabel(lastMonth, true)} ended {formatAmount(lastMonthGap)} short. Tap to tally it — borrowed, from savings or extra income.
          </Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </TouchableOpacity>
      ) : null}

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
            <Text style={[styles.statValue, { color: '#2DA44E' }]}>{formatAmount(totalIncome)}</Text>
          </View>
          <View style={styles.statCol}>
            <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Spent</Text>
            <Text style={[styles.statValue, { color: '#E5383B' }]}>{formatAmount(totalSpent)}</Text>
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
            <Text style={[styles.balanceValue, { color: overspent ? '#E5383B' : '#2DA44E' }]}>
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
        {pendingDuesTotal > 0 ? (
          <View style={[styles.dueLine, { borderTopColor: theme.borderNeutral }]}>
            <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>
              Still to pay · {pendingDues.length} EMI{pendingDues.length === 1 ? '' : 's'}/bill{pendingDues.length === 1 ? '' : 's'}
            </Text>
            <Text style={[styles.dueLineValue, { color: '#E5383B' }]}>{formatAmount(pendingDuesTotal)}</Text>
          </View>
        ) : null}
        {pendingDuesTotal > 0 ? (
          <View style={styles.dueLineTight}>
            <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Left after paying them</Text>
            <Text
              style={[
                styles.dueLineValue,
                { color: balance - pendingDuesTotal < 0 ? '#E5383B' : '#2DA44E' },
              ]}
            >
              {balance - pendingDuesTotal < 0 ? '−' : ''}
              {formatAmount(Math.abs(balance - pendingDuesTotal))}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={cardStyle}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.cardTitle, styles.noMargin, { color: theme.text }]}>My Income</Text>
          <TouchableOpacity
            style={[styles.smallBtn, { backgroundColor: theme.primary }]}
            onPress={openAddIncome}
            accessibilityLabel="Add income"
          >
            <Ionicons name="add" size={16} color={theme.onPrimary} />
            <Text style={[styles.smallBtnText, { color: theme.onPrimary }]}>Income</Text>
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
              <Text style={[styles.rowAmount, { color: '#2DA44E' }]}>+{formatAmount(income.amount)}</Text>
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

      {dues.length > 0 ? (
        <View style={cardStyle}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.cardTitle, styles.noMargin, { color: theme.text }]}>EMIs & Bills</Text>
            <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>
              {dues.length - pendingDues.length}/{dues.length} paid
            </Text>
          </View>
          {dues.map((due) => {
            const overdue = !due.paid && due.dueDate && due.dueDate < todayKey();
            const meta = categoryMeta(due.category);
            return (
              <View key={due.key} style={styles.incomeRow}>
                <View style={[styles.catIcon, styles.dueIcon, { backgroundColor: meta.color + '40' }]}>
                  <Ionicons name={meta.icon} size={16} color="#455A64" />
                </View>
                <View style={styles.rowBody}>
                  <Text style={[styles.rowTitle, { color: due.paid ? theme.textMuted : theme.text }]} numberOfLines={1}>
                    {due.title}
                  </Text>
                  <Text style={[styles.rowSub, { color: overdue ? theme.danger : theme.textSecondary }]}>
                    {due.paid ? 'Paid' : overdue ? 'Overdue' : 'Due'} {shortDate(due.dueDate)} · {due.subtitle}
                  </Text>
                </View>
                <Text style={[styles.rowAmount, { color: due.paid ? theme.textMuted : theme.text }]}>
                  {formatAmount(due.amount)}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.checkBtn,
                    {
                      borderColor: due.paid ? '#2DA44E' : theme.borderNeutral,
                      backgroundColor: due.paid ? '#2DA44E' : 'transparent',
                    },
                  ]}
                  onPress={() => toggleDue(due)}
                  accessibilityLabel={due.paid ? `Mark ${due.title} unpaid` : `Mark ${due.title} paid`}
                >
                  <Ionicons name="checkmark" size={16} color={due.paid ? '#FFF' : theme.textMuted} />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      ) : null}

      <View style={cardStyle}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.cardTitle, styles.noMargin, { color: theme.text }]}>
            {monthOver ? 'Month-end report' : 'Month so far'}
          </Text>
          {shortfall > 0 ? (
            <View
              style={[
                styles.badge,
                { backgroundColor: untallied > 0 ? '#E5383B22' : '#2DA44E22' },
              ]}
            >
              <Text style={[styles.badgeText, { color: untallied > 0 ? '#E5383B' : '#2DA44E' }]}>
                {untallied > 0 ? 'Not tallied' : 'Tallied'}
              </Text>
            </View>
          ) : null}
        </View>
        <ReportRow label="Income" value={formatAmount(totalIncome)} color="#2DA44E" theme={theme} strong />
        {outflow.map((g) => (
          <ReportRow key={g.key} label={g.label} value={`− ${formatAmount(g.amount)}`} theme={theme} indent />
        ))}
        <ReportRow label="Other spending" value={`− ${formatAmount(otherSpend)}`} theme={theme} indent />
        <ReportRow label="Total outgoing" value={formatAmount(totalSpent)} color="#E5383B" theme={theme} strong />
        <View style={[styles.reportDivider, { backgroundColor: theme.borderNeutral }]} />
        <ReportRow
          label={balance < 0 ? 'Shortfall' : 'Saved'}
          value={`${balance < 0 ? '−' : ''}${formatAmount(Math.abs(balance))}`}
          color={balance < 0 ? '#E5383B' : '#2DA44E'}
          theme={theme}
          strong
        />

        {shortfall > 0 ? (
          <View style={[styles.coverBox, { backgroundColor: theme.surfaceAlt }]}>
            <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>
              Spent more than you earned — how was it covered?
            </Text>
            {adjustments.map((adj) => (
              <View key={adj.id} style={styles.coverRow}>
                <Ionicons name={adjustmentMeta(adj.kind).icon} size={16} color={theme.textSecondary} />
                <Text style={[styles.coverText, { color: theme.text }]} numberOfLines={1}>
                  {adjustmentMeta(adj.kind).label}
                  {adj.note ? ` · ${adj.note}` : ''}
                </Text>
                <Text style={[styles.coverAmount, { color: theme.text }]}>{formatAmount(adj.amount)}</Text>
                <TouchableOpacity onPress={() => deleteAdjust(adj)} style={styles.deleteBtn} accessibilityLabel="Remove">
                  <Ionicons name="close-circle-outline" size={18} color={theme.textMuted} />
                </TouchableOpacity>
              </View>
            ))}
            <View style={styles.coverFooter}>
              <Text style={[styles.summaryLabel, { color: untallied > 0 ? '#E5383B' : '#2DA44E' }]}>
                {untallied > 0
                  ? `${formatAmount(untallied)} still to account for`
                  : covered > shortfall
                    ? `Covered, with ${formatAmount(covered - shortfall)} extra`
                    : 'Fully covered'}
              </Text>
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: theme.primary }]}
                onPress={() => openAdjust(untallied)}
              >
                <Ionicons name="add" size={16} color={theme.onPrimary} />
                <Text style={[styles.smallBtnText, { color: theme.onPrimary }]}>Tally</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
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
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
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
                  {item.sourceId ? ' · from My Debts' : ''}
                </Text>
              </View>
              <Text style={[styles.rowAmount, { color: theme.text }]}>{formatAmount(item.amount)}</Text>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => deleteItem(item)}
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
          <View style={[styles.modal, { backgroundColor: theme.sheet }]}>
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
                <Text style={[styles.saveText, { color: theme.onPrimary }]}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add / edit income */}
      <Modal visible={incomeVisible} transparent animationType="fade" onRequestClose={() => setIncomeVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.sheet }]}>
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
                        backgroundColor: selected ? '#34C759' : theme.surfaceAlt,
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
                <Text style={[styles.saveText, { color: theme.onPrimary }]}>
                  {editingIncomeId ? 'Update' : 'Add'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Cover a shortfall */}
      <Modal visible={adjustVisible} transparent animationType="fade" onRequestClose={() => setAdjustVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.sheet }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Tally the shortfall</Text>
            <Text style={[styles.modalSub, { color: theme.textSecondary }]}>
              {monthLabel(selectedMonth, true)} · {formatAmount(untallied)} to account for
            </Text>
            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Covered by</Text>
            <View style={styles.catRow}>
              {ADJUSTMENT_KINDS.map((k) => {
                const selected = adjustKind === k.key;
                return (
                  <TouchableOpacity
                    key={k.key}
                    style={[
                      styles.chip,
                      styles.kindChip,
                      {
                        backgroundColor: selected ? theme.primary : theme.surfaceAlt,
                        borderColor: selected ? theme.primary : theme.borderNeutral,
                      },
                    ]}
                    onPress={() => setAdjustKind(k.key)}
                  >
                    <Ionicons name={k.icon} size={15} color={selected ? theme.onPrimary : theme.text} />
                    <Text style={[styles.chipText, { color: selected ? theme.onPrimary : theme.text }]}>{k.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TextInput
              style={[inputStyle, styles.spaced]}
              placeholder={
                adjustKind === 'borrowed'
                  ? 'From whom? (e.g. Ravi, credit card)'
                  : adjustKind === 'savings'
                    ? 'Which savings? (optional)'
                    : 'Source (e.g. bonus, freelance)'
              }
              placeholderTextColor={theme.textMuted}
              value={adjustNote}
              onChangeText={setAdjustNote}
            />
            <TextInput
              style={inputStyle}
              placeholder="Amount (₹)"
              placeholderTextColor={theme.textMuted}
              value={adjustAmount}
              onChangeText={setAdjustAmount}
              keyboardType="decimal-pad"
            />
            {adjustKind === 'borrowed' ? (
              <TouchableOpacity style={styles.checkRow} onPress={() => setAdjustAddDebt(!adjustAddDebt)}>
                <Ionicons name={adjustAddDebt ? 'checkbox' : 'square-outline'} size={20} color={theme.primary} />
                <Text style={[styles.checkText, { color: theme.text }]}>Also add to My Debts so I repay it</Text>
              </TouchableOpacity>
            ) : null}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.cancelBtn, { backgroundColor: theme.surfaceAlt }]}
                onPress={() => setAdjustVisible(false)}
              >
                <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  { backgroundColor: theme.primary },
                  !(parseAmount(adjustAmount) > 0) && styles.btnDisabled,
                ]}
                onPress={saveAdjust}
                disabled={!(parseAmount(adjustAmount) > 0)}
              >
                <Text style={[styles.saveText, { color: theme.onPrimary }]}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Monthly bill with a changing amount: this month's figure */}
      <Modal visible={!!amountDue} transparent animationType="fade" onRequestClose={() => setAmountDue(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.sheet }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{amountDue?.title}</Text>
            <Text style={[styles.modalSub, { color: theme.textSecondary }]}>
              Amount paid for {amountDue ? monthLabel(amountDue.month, true) : ''}
            </Text>
            <TextInput
              style={inputStyle}
              placeholder="Amount (₹)"
              placeholderTextColor={theme.textMuted}
              value={amountDraft}
              onChangeText={setAmountDraft}
              keyboardType="decimal-pad"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.cancelBtn, { backgroundColor: theme.surfaceAlt }]}
                onPress={() => setAmountDue(null)}
              >
                <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  { backgroundColor: theme.primary },
                  !(parseAmount(amountDraft) > 0) && styles.btnDisabled,
                ]}
                onPress={saveAmountPaid}
                disabled={!(parseAmount(amountDraft) > 0)}
              >
                <Text style={[styles.saveText, { color: theme.onPrimary }]}>Mark paid</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add month */}
      <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={() => setPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.sheet }]}>
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

function ReportRow({ label, value, color, theme, strong, indent }) {
  return (
    <View style={[styles.reportRow, indent && styles.reportIndent]}>
      <Text
        style={[
          styles.reportLabel,
          { color: indent ? theme.textSecondary : theme.text },
          strong && styles.reportStrong,
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.reportValue,
          { color: color || (indent ? theme.textSecondary : theme.text) },
          strong && styles.reportStrong,
        ]}
      >
        {value}
      </Text>
    </View>
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
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '600' },
  dueLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    marginTop: 12,
    paddingTop: 10,
  },
  dueLineTight: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  dueLineValue: { fontSize: 15, fontWeight: '700' },
  dueIcon: { width: 34, height: 34 },
  checkBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  reportRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  reportIndent: { paddingLeft: 12 },
  reportLabel: { fontSize: 13 },
  reportValue: { fontSize: 13, fontWeight: '600' },
  reportStrong: { fontSize: 15, fontWeight: '700' },
  reportDivider: { height: 1, marginVertical: 8 },
  coverBox: { borderRadius: 12, padding: 12, marginTop: 12, gap: 8 },
  coverRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  coverText: { flex: 1, fontSize: 13 },
  coverAmount: { fontSize: 13, fontWeight: '700' },
  coverFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  kindChip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  checkText: { fontSize: 13, flex: 1 },
  pickerCancel: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', marginTop: 16 },
});
