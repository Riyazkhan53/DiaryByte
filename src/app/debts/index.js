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
import { useLocalSearchParams } from 'expo-router';
import Header from '../../components/Header';
import SyncRow from '../../components/SyncRow';
import DatePicker from '../../components/DatePicker';
import { useTheme } from '../../hooks/useTheme';
import { useSyncedCollection } from '../../hooks/useSyncedCollection';
import { confirmDelete } from '../../utils/confirm';
import { todayKey } from '../../utils/autopay';
import { savedCardLabel } from '../../utils/cards';
import {
  requestWebNotificationPermission,
  webNotificationPermission,
} from '../../services/autopayReminders';
import {
  addMonths,
  billMonth,
  billSourceId,
  buildSchedule,
  calcEmi,
  currentMonthKey,
  dueDateFor,
  emiSourceId,
  isRecurringBill,
  loanSummary,
  markDuePaid,
  markDueUnpaid,
  monthLabel,
  ONE_MONTH_LOAN,
  oneMonthAfter,
  recurringBillDues,
  sectionOf,
  shortDate,
} from '../../utils/debts';

const STORAGE_KEY = '@diarybyte_debts';
const EXPENSES_KEY = '@diarybyte_expenditure';
const CARDS_KEY = '@diarybyte_cards';
const MONTHS_KEY = '@diarybyte_months';

const SECTIONS = [
  { key: 'emi', label: 'My EMIs', icon: 'calendar-outline' },
  { key: 'card', label: 'Credit Cards', icon: 'card-outline' },
  { key: 'bill', label: 'Other Bills', icon: 'receipt-outline' },
];

const LOAN_TYPES = [
  { key: 'Personal Loan', icon: 'person-outline', color: '#FF6F61' },
  { key: 'Home Loan', icon: 'home-outline', color: '#32ADE6' },
  { key: 'Car Loan', icon: 'car-outline', color: '#AF52DE' },
  { key: 'Bike Loan', icon: 'bicycle-outline', color: '#5856D6' },
  { key: 'Education Loan', icon: 'school-outline', color: '#007AFF' },
  { key: 'Gold Loan', icon: 'diamond-outline', color: '#FFCC00' },
  { key: 'Consumer Loan', icon: 'phone-portrait-outline', color: '#00A99D' },
  { key: 'Credit Card', icon: 'card-outline', color: '#FF9500' },
  { key: 'Borrowed', icon: 'people-outline', color: '#34C759' },
  { key: 'Other', icon: 'ellipsis-horizontal-outline', color: '#8E8E93' },
];

const BILL_TYPES = [
  { key: 'Electricity', icon: 'flash-outline', color: '#FFCC00' },
  { key: 'Rent', icon: 'home-outline', color: '#32ADE6' },
  { key: 'Mobile', icon: 'phone-portrait-outline', color: '#5856D6' },
  { key: 'Internet', icon: 'wifi-outline', color: '#007AFF' },
  { key: 'Water', icon: 'water-outline', color: '#5AC8FA' },
  { key: 'Gas', icon: 'flame-outline', color: '#FF6F61' },
  { key: 'Insurance', icon: 'shield-checkmark-outline', color: '#34C759' },
  { key: 'School Fees', icon: 'school-outline', color: '#AF52DE' },
  { key: 'Subscription', icon: 'tv-outline', color: '#FF375F' },
  { key: 'One-month loan', icon: 'cash-outline', color: '#30B0C7' },
  { key: 'Other', icon: 'receipt-outline', color: '#8E8E93' },
];


// Expense category a paid bill is filed under.
const billCategory = (kind, billType) =>
  kind === 'card' ? 'Credit Card' : billType === ONE_MONTH_LOAN ? 'EMI' : 'Bills';


const CARD_META = { icon: 'card-outline', color: '#FF9500' };

const makeId = () => `${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`;

const money = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const toNum = (text) => parseFloat(String(text ?? '').replace(/[^\d.]/g, ''));

const loanMeta = (key) => LOAN_TYPES.find((t) => t.key === key) || LOAN_TYPES[LOAN_TYPES.length - 1];
const billMeta = (key) => BILL_TYPES.find((t) => t.key === key) || BILL_TYPES[BILL_TYPES.length - 1];

const EMPTY_LOAN = {
  name: '',
  type: 'Personal Loan',
  manual: false,
  principal: '',
  interestRate: '',
  tenure: '',
  emi: '',
  startMonth: currentMonthKey(),
  emiDay: '5',
  paidBefore: true,
  // Add the loan amount to this month's income (null = yes for a loan whose EMIs start later).
  addToIncome: null,
  fromIncome: false,
  outstanding: '',
  dueDate: '',
  note: '',
};

const EMPTY_BILL = {
  name: '',
  billType: 'Electricity',
  amount: '',
  minDue: '',
  dueDate: '',
  note: '',
  cardId: null,
  cardLast4: '',
  recurring: false,
  variable: false,
};

// A one-off bill as the due it represents (monthly bills come from recurringBillDues).
const oneOffDue = (item) => ({
  key: billSourceId(item.id),
  kind: sectionOf(item),
  debtId: item.id,
  month: billMonth(item),
  title: item.name,
  amount: Number(item.amount) || 0,
  dueDate: item.dueDate,
  paid: !!item.paid,
  category: billCategory(sectionOf(item), item.billType),
});

export default function DebtsScreen() {
  const { theme } = useTheme();
  const { items, synced, persist, pulling, pullInfo, pullNow } = useSyncedCollection('debts', STORAGE_KEY);
  const { items: expenses, persist: persistExpenses } = useSyncedCollection('expenditure', EXPENSES_KEY);
  const { items: savedCards } = useSyncedCollection('cards', CARDS_KEY);
  const { items: monthDocs, persist: persistMonths } = useSyncedCollection('months', MONTHS_KEY);
  const creditCards = savedCards.filter((c) => c.cardType === 'Credit');
  const thisMonth = currentMonthKey();
  const today = todayKey();

  const [section, setSection] = useState('emi');
  const [webPermission, setWebPermission] = useState(webNotificationPermission);

  // Loan form. "New loan" income in My Expenditure opens it here, prefilled
  // (?newLoan=1&principal=…&name=…): first EMI next month, none paid yet.
  const params = useLocalSearchParams();
  const fromIncome = params.newLoan === '1';
  const [loanVisible, setLoanVisible] = useState(fromIncome);
  const [editingId, setEditingId] = useState(null);
  const [loan, setLoan] = useState(() =>
    fromIncome
      ? {
          ...EMPTY_LOAN,
          name: typeof params.name === 'string' ? params.name : '',
          principal: typeof params.principal === 'string' ? params.principal : '',
          startMonth: addMonths(currentMonthKey(), 1),
          paidBefore: false,
          fromIncome: true, // its income is already added
        }
      : EMPTY_LOAN
  );
  const setLoanField = (key) => (value) => setLoan((f) => ({ ...f, [key]: value }));

  // Bill form (credit card + other bills)
  const [billVisible, setBillVisible] = useState(false);
  const [bill, setBill] = useState(EMPTY_BILL);
  const setBillField = (key) => (value) => setBill((f) => ({ ...f, [key]: value }));

  // "This month's amount" sheet for monthly bills whose amount changes
  const [amountDue, setAmountDue] = useState(null);
  const [amountDraft, setAmountDraft] = useState('');

  // Schedule sheet and manual "update remaining" sheet
  const [scheduleId, setScheduleId] = useState(null);
  const [manualId, setManualId] = useState(null);
  const [manualOutstanding, setManualOutstanding] = useState('');

  const [showPaid, setShowPaid] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  const loans = items.filter((i) => sectionOf(i) === 'emi');
  const cards = items.filter((i) => sectionOf(i) === 'card');
  const bills = items.filter((i) => sectionOf(i) === 'bill');

  // ------- paying -------

  const applyPayment = (due, paid) => {
    const result = paid ? markDuePaid(due, items, expenses) : markDueUnpaid(due, items, expenses);
    persist(result.debts);
    persistExpenses(result.expenses);
  };

  const payEmi = (item, row, paid = true) =>
    applyPayment(
      {
        key: emiSourceId(item.id, row.month),
        kind: 'emi',
        debtId: item.id,
        month: row.month,
        title: `${item.name} EMI`,
        amount: row.payment,
        dueDate: row.dueDate,
        category: 'EMI',
      },
      paid
    );

  const toggleBillPaid = ({ item, due }) => {
    // Monthly bills whose amount changes ask for this month's figure first.
    if (!due.paid && due.recurring && item.variable) {
      setAmountDue(due);
      setAmountDraft(String(due.amount || ''));
      return;
    }
    applyPayment(due, !due.paid);
  };

  const saveAmountPaid = () => {
    const amount = toNum(amountDraft);
    if (!(amount > 0)) return;
    applyPayment({ ...amountDue, amount }, true);
    setAmountDue(null);
  };

  // EMIs from before you started tracking: mark paid without adding expenses.
  const markEarlierPaid = (item) => {
    const earlier = buildSchedule(item)
      .filter((row) => row.month < thisMonth)
      .map((row) => row.month);
    const updated = {
      ...item,
      paidMonths: Array.from(new Set([...(item.paidMonths || []), ...earlier])).sort(),
      updatedAt: new Date().toISOString(),
    };
    updated.outstanding = loanSummary(updated).outstanding;
    persist(items.map((i) => (i.id === item.id ? updated : i)));
  };

  // ------- loan form -------

  const openAddLoan = () => {
    setEditingId(null);
    setLoan({ ...EMPTY_LOAN, startMonth: thisMonth });
    setLoanVisible(true);
  };

  const openEditLoan = (item) => {
    setEditingId(item.id);
    const manual = !!item.manual || !(item.tenure > 0 && item.startMonth);
    setLoan({
      name: item.name || '',
      type: item.type || 'Personal Loan',
      manual,
      principal: item.principal != null ? String(item.principal) : '',
      interestRate: item.interestRate ? String(item.interestRate) : '',
      // Older loans stored "EMIs left"; use it as a starting point for tenure.
      tenure: item.tenure ? String(item.tenure) : item.remainingEmis ? String(item.remainingEmis) : '',
      emi: item.emi ? String(item.emi) : '',
      startMonth: item.startMonth || thisMonth,
      emiDay: item.emiDay ? String(item.emiDay) : '5',
      paidBefore: false,
      outstanding: item.outstanding != null ? String(item.outstanding) : '',
      dueDate: item.dueDate || '',
      note: item.note || '',
    });
    setLoanVisible(true);
  };

  const principalNum = toNum(loan.principal) || 0;
  const rateNum = toNum(loan.interestRate) || 0;
  const tenureNum = Math.round(toNum(loan.tenure) || 0);
  const autoEmi = calcEmi(principalNum, rateNum, tenureNum);
  const emiNum = toNum(loan.emi) || autoEmi;
  const emiDayNum = Math.min(31, Math.max(1, Math.round(toNum(loan.emiDay) || 1)));

  const draftLoan = {
    section: 'emi',
    manual: loan.manual,
    principal: principalNum,
    interestRate: rateNum,
    tenure: tenureNum,
    emi: emiNum,
    startMonth: loan.startMonth,
    emiDay: emiDayNum,
  };
  const existingLoan = editingId ? items.find((i) => i.id === editingId) : null;
  const draftRows = loan.manual ? [] : buildSchedule(draftLoan);
  const draftPaidMonths = existingLoan
    ? existingLoan.paidMonths || []
    : loan.paidBefore
      ? draftRows.filter((r) => r.month < thisMonth).map((r) => r.month)
      : [];
  const draftSummary = loan.manual ? null : loanSummary({ ...draftLoan, paidMonths: draftPaidMonths });

  const loanValid = loan.manual
    ? loan.name.trim() && principalNum > 0 && String(loan.outstanding).trim() !== ''
    : loan.name.trim() && principalNum > 0 && tenureNum > 0 && draftRows.length > 0;

  const offerIncome = !editingId && !loan.fromIncome && principalNum > 0;
  const addIncome = loan.addToIncome ?? (!loan.manual && loan.startMonth > thisMonth);

  const saveLoan = () => {
    if (!loanValid) return;
    const base = {
      ...existingLoan,
      id: editingId || makeId(),
      section: 'emi',
      name: loan.name.trim(),
      type: loan.type,
      principal: principalNum,
      note: loan.note.trim(),
      createdAt: existingLoan?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const entry = loan.manual
      ? {
          ...base,
          manual: true,
          outstanding: Math.max(0, toNum(loan.outstanding) || 0),
          emi: toNum(loan.emi) || 0,
          interestRate: rateNum,
          dueDate: loan.dueDate.trim(),
        }
      : {
          ...base,
          manual: false,
          interestRate: rateNum,
          tenure: tenureNum,
          emi: emiNum,
          startMonth: loan.startMonth,
          emiDay: emiDayNum,
          paidMonths: draftPaidMonths,
          outstanding: draftSummary.outstanding,
          remainingEmis: draftSummary.remainingCount,
        };
    persist(editingId ? items.map((i) => (i.id === editingId ? entry : i)) : [entry, ...items]);
    // A new loan's money arrives this month: add it to My Expenditure's income.
    if (offerIncome && addIncome) {
      const income = { id: makeId(), source: 'New loan', note: entry.name, amount: principalNum, loanId: entry.id };
      const doc = monthDocs.find((m) => m.month === thisMonth);
      persistMonths(
        doc
          ? monthDocs.map((m) => (m.month === thisMonth ? { ...m, incomes: [...(m.incomes || []), income] } : m))
          : [{ id: thisMonth, month: thisMonth, incomes: [income], createdAt: new Date().toISOString() }, ...monthDocs]
      );
    }
    setLoanVisible(false);
  };

  // ------- bill form -------

  const openAddBill = () => {
    setEditingId(null);
    setBill({ ...EMPTY_BILL, dueDate: today });
    setBillVisible(true);
  };

  const openEditBill = (item) => {
    setEditingId(item.id);
    setBill({
      name: item.name || '',
      billType: item.billType || 'Other',
      amount: item.amount != null ? String(item.amount) : '',
      minDue: item.minDue ? String(item.minDue) : '',
      dueDate: isRecurringBill(item) ? dueDateFor(item.startMonth, item.dueDay) : item.dueDate || today,
      note: item.note || '',
      cardId: item.cardId || null,
      cardLast4: item.cardLast4 || '',
      recurring: isRecurringBill(item),
      variable: !!item.variable,
    });
    setBillVisible(true);
  };

  const billValid = bill.name.trim() && toNum(bill.amount) > 0 && !!bill.dueDate;
  const isMonthlyForm = section === 'bill' && bill.recurring;
  const isLoanForm = section === 'bill' && !bill.recurring && bill.billType === ONE_MONTH_LOAN;
  // One time / Every month / One-month loan
  const billKind = bill.recurring ? 'monthly' : bill.billType === ONE_MONTH_LOAN ? 'loan' : 'once';
  const pickBillKind = (kind) =>
    setBill((f) => ({
      ...f,
      recurring: kind === 'monthly',
      billType:
        kind === 'loan' ? ONE_MONTH_LOAN : f.billType === ONE_MONTH_LOAN ? 'Other' : f.billType,
      // A new loan is due a month from today; an edited one keeps its date.
      dueDate: kind === 'loan' && !editingId ? oneMonthAfter(today) : f.dueDate,
    }));
  const editingBill = editingId ? items.find((i) => i.id === editingId) : null;

  const saveBill = () => {
    if (!billValid) return;
    const existing = editingId ? items.find((i) => i.id === editingId) : null;
    if (section === 'bill' && bill.recurring) {
      const entry = {
        ...existing,
        id: editingId || makeId(),
        section,
        name: bill.name.trim(),
        billType: bill.billType,
        amount: toNum(bill.amount),
        recurring: true,
        variable: bill.variable,
        startMonth: bill.dueDate.slice(0, 7),
        dueDay: Number(bill.dueDate.slice(8, 10)) || 1,
        paidMonths: existing?.paidMonths || [],
        amounts: existing?.amounts || {},
        // One-off fields don't apply to a monthly bill.
        dueDate: undefined,
        month: undefined,
        paid: undefined,
        paidAt: undefined,
        note: bill.note.trim(),
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      persist(editingId ? items.map((i) => (i.id === editingId ? entry : i)) : [entry, ...items]);
      setBillVisible(false);
      return;
    }
    const entry = {
      ...existing,
      recurring: undefined,
      variable: undefined,
      id: editingId || makeId(),
      section,
      name: bill.name.trim(),
      billType: section === 'bill' ? bill.billType : undefined,
      amount: toNum(bill.amount),
      minDue: section === 'card' ? toNum(bill.minDue) || 0 : undefined,
      cardId: section === 'card' ? bill.cardId || undefined : undefined,
      cardLast4: section === 'card' ? bill.cardLast4 || undefined : undefined,
      dueDate: bill.dueDate,
      month: bill.dueDate.slice(0, 7),
      paid: existing?.paid || false,
      note: bill.note.trim(),
      createdAt: existing?.createdAt || new Date().toISOString(),
    };
    let nextDebts = editingId ? items.map((i) => (i.id === editingId ? entry : i)) : [entry, ...items];
    persist(nextDebts);
    // Keep an already-paid bill's expense in step with the edit.
    if (existing?.paid) {
      const result = markDuePaid(
        {
          key: billSourceId(entry.id),
          kind: section,
          debtId: entry.id,
          month: entry.month,
          title: entry.name,
          amount: entry.amount,
          dueDate: entry.dueDate,
          category: billCategory(section, entry.billType),
        },
        nextDebts,
        expenses
      );
      persistExpenses(result.expenses);
    }
    setBillVisible(false);
  };

  // Copy a bill to next month (same name/type/amount, unpaid).
  const repeatNextMonth = (item) => {
    const month = addMonths(billMonth(item), 1);
    const day = Number((item.dueDate || '').slice(8, 10)) || 1;
    const entry = {
      ...item,
      id: makeId(),
      dueDate: dueDateFor(month, day),
      month,
      paid: false,
      paidAt: null,
      createdAt: new Date().toISOString(),
    };
    persist([entry, ...items]);
  };

  const deleteItem = (item) => {
    confirmDelete(
      'Delete',
      isRecurringBill(item)
        ? `Remove ${item.name} for every month? Payments already added to My Expenditure stay there. To keep its history, edit it and tap "Stop after this month" instead.`
        : `Remove ${item.name}? Payments already added to My Expenditure stay there.`,
      () => persist(items.filter((i) => i.id !== item.id))
    );
  };

  // Stop a monthly bill after this month (e.g. moving out), or start it again.
  const setBillEnded = (ended) => {
    persist(
      items.map((i) =>
        i.id === editingId
          ? { ...i, endMonth: ended ? thisMonth : undefined, updatedAt: new Date().toISOString() }
          : i
      )
    );
    setBillVisible(false);
  };

  // ------- manual loan update -------

  const openManual = (item) => {
    setManualId(item.id);
    setManualOutstanding(item.outstanding != null ? String(item.outstanding) : '');
  };

  const saveManual = () => {
    const value = Math.max(0, toNum(manualOutstanding) || 0);
    persist(
      items.map((i) =>
        i.id === manualId ? { ...i, outstanding: value, updatedAt: new Date().toISOString() } : i
      )
    );
    setManualId(null);
  };

  // ------- summaries -------

  const loanSummaries = Object.fromEntries(loans.map((l) => [l.id, loanSummary(l)]));
  const totalOutstanding = loans.reduce((s, l) => s + loanSummaries[l.id].outstanding, 0);
  const totalPrincipal = loans.reduce((s, l) => s + (Number(l.principal) || 0), 0);
  // Completed: every scheduled EMI paid, or (no schedule) nothing left to repay.
  const isCompleted = (l) => {
    const s = loanSummaries[l.id];
    return s.scheduled ? s.remainingCount === 0 : s.outstanding <= 0;
  };
  const activeLoans = loans.filter((l) => !isCompleted(l));
  const completedLoans = loans.filter(isCompleted);
  // EMIs still to pay this month, plus earlier months not marked paid.
  const pendingEmis = activeLoans
    .flatMap((l) => {
      const s = loanSummaries[l.id];
      const paid = new Set(l.paidMonths || []);
      return s.rows
        .filter((r) => r.month <= thisMonth && !paid.has(r.month))
        .map((r) => ({ loan: l, row: r, overdue: r.month < thisMonth }));
    })
    .sort((a, b) => a.row.dueDate.localeCompare(b.row.dueDate));
  const pendingEmiTotal = pendingEmis.reduce((s, x) => s + x.row.payment, 0);
  const totalPaidOff = Math.max(0, totalPrincipal - totalOutstanding);
  const paidPct = totalPrincipal > 0 ? Math.min((totalPaidOff / totalPrincipal) * 100, 100) : 0;
  const monthEmiRows = loans
    .map((l) => ({ loan: l, row: loanSummaries[l.id].rows.find((r) => r.month === thisMonth) }))
    .filter((x) => x.row);
  const monthEmiTotal = monthEmiRows.reduce((s, x) => s + x.row.payment, 0);
  const monthEmiPaid = monthEmiRows
    .filter((x) => (x.loan.paidMonths || []).includes(thisMonth))
    .reduce((s, x) => s + x.row.payment, 0);

  // Each row is one payment: a one-off bill, or one month of a monthly bill.
  const billRows = (list) =>
    list.flatMap((item) => {
      if (!isRecurringBill(item)) return [{ rowKey: item.id, item, due: oneOffDue(item) }];
      const { pending, paid } = recurringBillDues(item, thisMonth);
      return [...pending, ...paid].map((due) => ({ rowKey: due.key, item, due }));
    });
  const sectionRows = billRows(section === 'card' ? cards : bills);
  const pendingBills = sectionRows
    .filter((r) => !r.due.paid)
    .sort((a, b) => (a.due.dueDate || '').localeCompare(b.due.dueDate || ''));
  const paidBills = sectionRows
    .filter((r) => r.due.paid)
    .sort((a, b) => (b.due.dueDate || '').localeCompare(a.due.dueDate || ''));
  const pendingTotal = pendingBills.reduce((s, r) => s + r.due.amount, 0);
  const overdueTotal = pendingBills
    .filter((r) => r.due.dueDate && r.due.dueDate < today)
    .reduce((s, r) => s + r.due.amount, 0);
  const paidThisMonth = paidBills
    .filter((r) => r.due.month === thisMonth)
    .reduce((s, r) => s + r.due.amount, 0);

  const counts = {
    emi: activeLoans.length,
    card: billRows(cards).filter((r) => !r.due.paid).length,
    bill: billRows(bills).filter((r) => !r.due.paid).length,
  };

  const inputStyle = [
    styles.input,
    { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text },
  ];
  const cardStyle = { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow };

  // ------- rendering -------

  const renderLoan = ({ item }) => {
    const meta = loanMeta(item.type);
    const s = loanSummaries[item.id];
    const cleared = s.outstanding <= 0;
    const nextPaidThisMonth = s.scheduled && s.next && s.next.month <= thisMonth;
    return (
      <View style={[styles.card, cardStyle, cleared && { borderColor: theme.primary }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.typeIcon, { backgroundColor: meta.color + '40' }]}>
            <Ionicons name={meta.icon} size={19} color="#455A64" />
          </View>
          <View style={styles.cardMeta}>
            <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={[styles.cardSub, { color: theme.textSecondary }]} numberOfLines={2}>
              {item.type}
              {item.interestRate ? ` · ${item.interestRate}%` : ''}
              {s.scheduled
                ? ` · ${s.paidCount}/${s.totalCount} paid · ends ${monthLabel(s.endsMonth)}`
                : item.dueDate
                  ? ` · by ${item.dueDate}`
                  : ''}
            </Text>
          </View>
          <TouchableOpacity style={styles.iconBtn} onPress={() => openEditLoan(item)} accessibilityLabel={`Edit ${item.name}`}>
            <Ionicons name="create-outline" size={19} color={theme.primaryDark} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => deleteItem(item)} accessibilityLabel={`Delete ${item.name}`}>
            <Ionicons name="trash-outline" size={19} color={theme.danger} />
          </TouchableOpacity>
        </View>

        <View style={styles.amountsRow}>
          <View style={styles.amountCol}>
            <Text style={[styles.amountLabel, { color: theme.textMuted }]}>Outstanding</Text>
            <Text style={[styles.amountValue, { color: cleared ? '#2DA44E' : '#E5383B' }]}>
              {cleared ? 'Cleared' : money(s.outstanding)}
            </Text>
          </View>
          {s.emi ? (
            <View style={styles.amountCol}>
              <Text style={[styles.amountLabel, { color: theme.textMuted }]}>EMI / month</Text>
              <Text style={[styles.amountValue, { color: theme.text }]}>{money(s.emi)}</Text>
            </View>
          ) : null}
          <View style={styles.amountCol}>
            <Text style={[styles.amountLabel, { color: theme.textMuted }]}>Loan amount</Text>
            <Text style={[styles.amountValue, { color: theme.text }]}>{money(item.principal)}</Text>
          </View>
        </View>

        <View style={[styles.progressTrack, { backgroundColor: theme.surfaceAlt }]}>
          <View style={[styles.progressFill, { width: `${s.paidPct}%`, backgroundColor: theme.primary }]} />
        </View>
        <Text style={[styles.progressLabel, { color: theme.textMuted }]}>
          {s.paidPct.toFixed(0)}% principal paid off
          {s.scheduled && s.interestLeft > 0 ? ` · ${money(s.interestLeft)} interest left` : ''}
        </Text>

        {s.scheduled && s.overdue.length > 1 ? (
          <Text style={[styles.warnText, { color: theme.danger }]}>
            {s.overdue.length} earlier EMIs not marked paid
          </Text>
        ) : null}

        {s.scheduled && s.next ? (
          <View style={[styles.nextRow, { borderTopColor: theme.borderNeutral }]}>
            <View style={styles.flex}>
              <Text style={[styles.nextLabel, { color: theme.textMuted }]}>
                {s.next.month < thisMonth ? 'Overdue EMI' : 'Next EMI'}
              </Text>
              <Text
                style={[
                  styles.nextValue,
                  { color: s.next.month < thisMonth ? theme.danger : theme.text },
                ]}
              >
                {money(s.next.payment)} · {shortDate(s.next.dueDate)} {s.next.dueDate.slice(0, 4)}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.ghostBtn, { borderColor: theme.borderNeutral }]}
              onPress={() => setScheduleId(item.id)}
            >
              <Ionicons name="list-outline" size={14} color={theme.text} />
              <Text style={[styles.ghostBtnText, { color: theme.text }]}>Schedule</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.payBtn, { backgroundColor: nextPaidThisMonth ? theme.primary : theme.surfaceAlt }]}
              onPress={() => payEmi(item, s.next)}
            >
              <Ionicons
                name="checkmark-outline"
                size={14}
                color={nextPaidThisMonth ? theme.onPrimary : theme.text}
              />
              <Text style={[styles.payBtnText, { color: nextPaidThisMonth ? theme.onPrimary : theme.text }]}>
                Paid
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!s.scheduled && !cleared ? (
          <View style={[styles.nextRow, { borderTopColor: theme.borderNeutral }]}>
            <Text style={[styles.nextLabel, styles.flex, { color: theme.textMuted }]}>
              No EMI schedule — update the remaining amount when you repay.
            </Text>
            <TouchableOpacity style={[styles.payBtn, { backgroundColor: theme.primary }]} onPress={() => openManual(item)}>
              <Ionicons name="refresh-outline" size={14} color={theme.onPrimary} />
              <Text style={[styles.payBtnText, { color: theme.onPrimary }]}>Update</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {item.note ? (
          <Text style={[styles.note, { color: theme.textSecondary }]} numberOfLines={2}>
            {item.note}
          </Text>
        ) : null}
      </View>
    );
  };

  const renderBill = ({ item: row }) => {
    const { item, due } = row;
    const recurring = !!due.recurring;
    const meta = section === 'card' ? CARD_META : billMeta(item.billType);
    const overdue = !due.paid && due.dueDate && due.dueDate < today;
    return (
      <View style={[styles.card, cardStyle, styles.billCard]}>
        <View style={[styles.typeIcon, { backgroundColor: meta.color + '40' }]}>
          <Ionicons name={meta.icon} size={19} color="#455A64" />
        </View>
        <TouchableOpacity style={styles.cardMeta} onPress={() => openEditBill(item)}>
          <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text
            style={[styles.cardSub, { color: overdue ? theme.danger : theme.textSecondary }]}
            numberOfLines={1}
          >
            {due.paid ? 'Paid' : overdue ? 'Overdue' : 'Due'} {shortDate(due.dueDate)}
            {section === 'bill' && item.billType ? ` · ${item.billType}` : ''}
            {section === 'card' && item.minDue ? ` · min ${money(item.minDue)}` : ''}
          </Text>
        </TouchableOpacity>
        <Text style={[styles.billAmount, { color: due.paid ? theme.textMuted : theme.text }]}>
          {recurring && item.variable && !due.paid ? '~' : ''}
          {money(due.amount)}
        </Text>
        <TouchableOpacity
          style={[styles.checkBtn, { borderColor: due.paid ? '#2DA44E' : theme.borderNeutral, backgroundColor: due.paid ? '#2DA44E' : 'transparent' }]}
          onPress={() => toggleBillPaid(row)}
          accessibilityLabel={due.paid ? `Mark ${item.name} unpaid` : `Mark ${item.name} paid`}
        >
          <Ionicons name="checkmark" size={16} color={due.paid ? '#FFF' : theme.textMuted} />
        </TouchableOpacity>
        {recurring ? (
          <View style={styles.iconBtn} accessibilityLabel="Repeats every month">
            <Ionicons name="repeat-outline" size={17} color={theme.textMuted} />
          </View>
        ) : (
          <TouchableOpacity style={styles.iconBtn} onPress={() => repeatNextMonth(item)} accessibilityLabel="Copy to next month">
            <Ionicons name="copy-outline" size={17} color={theme.primaryDark} />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.iconBtn} onPress={() => deleteItem(item)} accessibilityLabel={`Delete ${item.name}`}>
          <Ionicons name="trash-outline" size={17} color={theme.danger} />
        </TouchableOpacity>
      </View>
    );
  };

  const tabs = (
    <View style={[styles.tabs, { backgroundColor: theme.surfaceAlt }]}>
      {SECTIONS.map((s) => {
        const selected = section === s.key;
        return (
          <TouchableOpacity
            key={s.key}
            style={[styles.tab, selected && { backgroundColor: theme.sheet, shadowColor: theme.shadow }, selected && styles.tabSelected]}
            onPress={() => {
              setSection(s.key);
              setShowPaid(false);
            }}
          >
            <Text style={[styles.tabText, { color: selected ? theme.text : theme.textSecondary }]} numberOfLines={1}>
              {s.label}
              {counts[s.key] ? ` (${counts[s.key]})` : ''}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const loanHeader = (
    <View>
      <View style={[styles.summaryCard, cardStyle]}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCol}>
            <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Total outstanding</Text>
            <Text style={[styles.summaryValue, { color: '#E5383B' }]}>{money(totalOutstanding)}</Text>
          </View>
          <View style={styles.summaryCol}>
            <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>EMIs in {monthLabel(thisMonth)}</Text>
            <Text style={[styles.summaryValue, { color: theme.text }]}>{money(monthEmiTotal)}</Text>
            {monthEmiTotal > 0 ? (
              <Text style={[styles.summarySub, { color: theme.textMuted }]}>
                {money(monthEmiPaid)} paid · {money(monthEmiTotal - monthEmiPaid)} left
              </Text>
            ) : null}
          </View>
        </View>
        <View style={[styles.plRow, { borderTopColor: theme.borderNeutral }]}>
          <Text style={[styles.plLabel, { color: theme.textMuted }]}>
            Paid off {money(totalPaidOff)} of {money(totalPrincipal)}
          </Text>
          <Text style={[styles.plValue, { color: '#2DA44E' }]}>{paidPct.toFixed(0)}%</Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: theme.surfaceAlt }]}>
          <View style={[styles.progressFill, { width: `${paidPct}%`, backgroundColor: theme.primary }]} />
        </View>
      </View>

      {loans.length ? (
        <>
          <Text style={[styles.listTitle, { color: theme.text }]}>
            Pending in {monthLabel(thisMonth)}
            {pendingEmis.length ? ` (${pendingEmis.length} · ${money(pendingEmiTotal)})` : ''}
          </Text>
          {pendingEmis.length === 0 ? (
            <Text style={[styles.emptyInline, { color: theme.textMuted }]}>
              {activeLoans.some((l) => loanSummaries[l.id].scheduled)
                ? `All EMIs for ${monthLabel(thisMonth)} are paid.`
                : 'No EMIs due this month.'}
            </Text>
          ) : (
            <View style={[styles.pendingCard, cardStyle]}>
              {pendingEmis.map(({ loan: l, row, overdue }, i) => {
                const meta = loanMeta(l.type);
                return (
                  <View
                    key={`${l.id}-${row.month}`}
                    style={[styles.pendingRow, i > 0 && { borderTopWidth: 1, borderTopColor: theme.borderNeutral }]}
                  >
                    <View style={[styles.pendingIcon, { backgroundColor: meta.color + '40' }]}>
                      <Ionicons name={meta.icon} size={16} color="#455A64" />
                    </View>
                    <View style={styles.flex}>
                      <Text style={[styles.pendingName, { color: theme.text }]} numberOfLines={1}>
                        {l.name}
                      </Text>
                      <Text style={[styles.pendingSub, { color: overdue ? theme.danger : theme.textMuted }]}>
                        {overdue ? `Overdue · ${monthLabel(row.month)}` : `Due ${shortDate(row.dueDate)}`}
                      </Text>
                    </View>
                    <Text style={[styles.pendingAmount, { color: theme.text }]}>{money(row.payment)}</Text>
                    <TouchableOpacity
                      style={[styles.payBtn, { backgroundColor: theme.surfaceAlt }]}
                      onPress={() => payEmi(l, row)}
                      accessibilityLabel={`Mark ${l.name} paid for ${monthLabel(row.month)}`}
                    >
                      <Ionicons name="checkmark-outline" size={14} color={theme.text} />
                      <Text style={[styles.payBtnText, { color: theme.text }]}>Paid</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}
          {activeLoans.length ? <Text style={[styles.listTitle, { color: theme.text }]}>My EMIs</Text> : null}
        </>
      ) : null}
    </View>
  );

  const loanFooter =
    completedLoans.length > 0 ? (
      <View>
        <TouchableOpacity style={styles.paidToggle} onPress={() => setShowCompleted(!showCompleted)}>
          <Text style={[styles.listTitle, styles.noMargin, { color: theme.text }]}>
            Completed EMIs ({completedLoans.length})
          </Text>
          <Ionicons name={showCompleted ? 'chevron-up' : 'chevron-down'} size={18} color={theme.text} />
        </TouchableOpacity>
        {showCompleted ? completedLoans.map((l) => <View key={l.id}>{renderLoan({ item: l })}</View>) : null}
      </View>
    ) : null;

  const billHeader = (
    <View>
      <View style={[styles.summaryCard, cardStyle]}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCol}>
            <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>To pay</Text>
            <Text style={[styles.summaryValue, { color: '#E5383B' }]}>{money(pendingTotal)}</Text>
            {overdueTotal > 0 ? (
              <Text style={[styles.summarySub, { color: theme.danger }]}>{money(overdueTotal)} overdue</Text>
            ) : null}
          </View>
          <View style={styles.summaryCol}>
            <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Paid in {monthLabel(thisMonth)}</Text>
            <Text style={[styles.summaryValue, { color: '#2DA44E' }]}>{money(paidThisMonth)}</Text>
          </View>
        </View>
        <Text style={[styles.hint, { color: theme.textMuted }]}>
          {section === 'bill'
            ? 'Tick a bill when you pay it — it\u2019s added to My Expenditure for the month it\u2019s due. Make rent, current bill and the like monthly, and they come back every month like an EMI.'
            : 'Tick a bill when you pay it — it\u2019s added to My Expenditure for the month it\u2019s due. Use the copy icon to add next month\u2019s bill.'}
        </Text>
      </View>
      <Text style={[styles.listTitle, { color: theme.text }]}>Pending</Text>
      {pendingBills.length === 0 ? (
        <Text style={[styles.emptyInline, { color: theme.textMuted }]}>
          Nothing pending. Tap + to add a {section === 'card' ? 'credit card bill' : 'bill'}.
        </Text>
      ) : null}
    </View>
  );

  const billFooter =
    paidBills.length > 0 ? (
      <View>
        <TouchableOpacity style={styles.paidToggle} onPress={() => setShowPaid(!showPaid)}>
          <Text style={[styles.listTitle, styles.noMargin, { color: theme.text }]}>Paid ({paidBills.length})</Text>
          <Ionicons name={showPaid ? 'chevron-up' : 'chevron-down'} size={18} color={theme.text} />
        </TouchableOpacity>
        {showPaid ? paidBills.map((row) => <View key={row.rowKey}>{renderBill({ item: row })}</View>) : null}
      </View>
    ) : null;

  const scheduleLoan = scheduleId ? items.find((i) => i.id === scheduleId) : null;
  const scheduleSummary = scheduleLoan ? loanSummary(scheduleLoan) : null;
  const schedulePaid = new Set(scheduleLoan?.paidMonths || []);
  const unpaidEarlier = scheduleSummary
    ? scheduleSummary.rows.filter((r) => r.month < thisMonth && !schedulePaid.has(r.month)).length
    : 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
      <Header title="My Debts" subtitle="EMIs, credit card bills and other bills" />

      <View style={styles.content}>
        <SyncRow synced={synced} pulling={pulling} pullInfo={pullInfo} onPull={pullNow} />
        {webPermission === 'default' && (
          <TouchableOpacity
            style={[styles.alertBtn, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral }]}
            onPress={async () => setWebPermission(await requestWebNotificationPermission())}
          >
            <Ionicons name="notifications-outline" size={18} color={theme.secondaryDark} />
            <Text style={[styles.alertBtnText, { color: theme.secondaryDark }]}>
              Enable browser alerts for EMIs and bills
            </Text>
          </TouchableOpacity>
        )}
        {tabs}

        {section === 'emi' ? (
          <FlatList
            data={activeLoans}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={loanHeader}
            ListFooterComponent={loanFooter}
            renderItem={renderLoan}
            ListEmptyComponent={
              completedLoans.length ? null : (
                <View style={styles.empty}>
                  <Ionicons name="checkmark-circle-outline" size={56} color={theme.textMuted} />
                  <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                    No loans. Tap + to add one — enter the loan amount, interest rate and tenure and every EMI is planned for you.
                  </Text>
                </View>
              )
            }
          />
        ) : (
          <FlatList
            data={pendingBills}
            keyExtractor={(row) => row.rowKey}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={billHeader}
            ListFooterComponent={billFooter}
            renderItem={renderBill}
          />
        )}
      </View>

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.secondary, shadowColor: theme.secondary }]}
        onPress={section === 'emi' ? openAddLoan : openAddBill}
        activeOpacity={0.8}
        accessibilityLabel="Add"
      >
        <Ionicons name="add" size={32} color="#FFF" />
      </TouchableOpacity>

      {/* Add / edit loan */}
      <Modal visible={loanVisible} transparent animationType="fade" onRequestClose={() => setLoanVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.sheet }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[styles.modalTitle, { color: theme.text }]}>{editingId ? 'Edit Loan' : 'Add Loan'}</Text>

              <TextInput
                style={inputStyle}
                placeholder="Lender / person (e.g. SBI, Bajaj, Ravi)"
                placeholderTextColor={theme.textMuted}
                value={loan.name}
                onChangeText={setLoanField('name')}
              />

              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Type</Text>
              <View style={styles.chipWrap}>
                {LOAN_TYPES.map((t) => {
                  const selected = loan.type === t.key;
                  return (
                    <TouchableOpacity
                      key={t.key}
                      style={[styles.chip, { backgroundColor: selected ? t.color : theme.surfaceAlt, borderColor: selected ? t.color : theme.borderNeutral }]}
                      onPress={() => setLoan((f) => ({ ...f, type: t.key, manual: t.key === 'Borrowed' ? true : f.manual }))}
                    >
                      <Text style={[styles.chipText, { color: theme.text }]}>{t.key}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={[styles.segment, { backgroundColor: theme.surfaceAlt }]}>
                {[
                  { key: false, label: 'Monthly EMI' },
                  { key: true, label: 'No EMI (borrowed)' },
                ].map((opt) => (
                  <TouchableOpacity
                    key={String(opt.key)}
                    style={[styles.segmentItem, loan.manual === opt.key && { backgroundColor: theme.sheet }]}
                    onPress={() => setLoanField('manual')(opt.key)}
                  >
                    <Text style={[styles.tabText, { color: theme.text }]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.amountRow}>
                <LabeledInput label="Loan amount (₹)" theme={theme} value={loan.principal} onChangeText={setLoanField('principal')} placeholder="e.g. 500000" />
                <LabeledInput label="Interest (% / year)" theme={theme} value={loan.interestRate} onChangeText={setLoanField('interestRate')} placeholder={loan.manual ? 'optional' : 'e.g. 10.5'} />
              </View>

              {loan.manual ? (
                <>
                  <View style={styles.amountRow}>
                    <LabeledInput label="Remaining (₹)" theme={theme} value={loan.outstanding} onChangeText={setLoanField('outstanding')} placeholder="still to repay" />
                    <LabeledInput label="Repay by (optional)" theme={theme} value={loan.dueDate} onChangeText={setLoanField('dueDate')} placeholder="e.g. Dec 2026" keyboardType="default" />
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.amountRow}>
                    <LabeledInput label="Tenure (months)" theme={theme} value={loan.tenure} onChangeText={setLoanField('tenure')} placeholder="e.g. 60" keyboardType="number-pad" />
                    <LabeledInput
                      label="EMI (₹ / month)"
                      theme={theme}
                      value={loan.emi}
                      onChangeText={setLoanField('emi')}
                      placeholder={autoEmi ? `${autoEmi} (auto)` : 'auto'}
                    />
                  </View>
                  <Text style={[styles.hint, styles.hintTight, { color: theme.textMuted }]}>
                    Leave EMI blank to calculate it. If your bank&apos;s EMI is slightly different, type it in.
                  </Text>

                  <View style={styles.amountRow}>
                    <View style={styles.flex}>
                      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>First EMI month</Text>
                      <View style={[styles.stepper, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral }]}>
                        <TouchableOpacity onPress={() => setLoanField('startMonth')(addMonths(loan.startMonth, -1))} accessibilityLabel="Previous month">
                          <Ionicons name="chevron-back" size={20} color={theme.text} />
                        </TouchableOpacity>
                        <Text style={[styles.stepperText, { color: theme.text }]}>{monthLabel(loan.startMonth)}</Text>
                        <TouchableOpacity onPress={() => setLoanField('startMonth')(addMonths(loan.startMonth, 1))} accessibilityLabel="Next month">
                          <Ionicons name="chevron-forward" size={20} color={theme.text} />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <LabeledInput label="EMI date (day)" theme={theme} value={loan.emiDay} onChangeText={setLoanField('emiDay')} placeholder="5" keyboardType="number-pad" />
                  </View>

                  {!editingId && loan.startMonth < thisMonth ? (
                    <TouchableOpacity style={styles.checkRow} onPress={() => setLoanField('paidBefore')(!loan.paidBefore)}>
                      <Ionicons name={loan.paidBefore ? 'checkbox' : 'square-outline'} size={20} color={theme.primary} />
                      <Text style={[styles.checkText, { color: theme.text }]}>
                        EMIs before {monthLabel(thisMonth)} are already paid
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  {offerIncome ? (
                    <TouchableOpacity style={styles.checkRow} onPress={() => setLoanField('addToIncome')(!addIncome)}>
                      <Ionicons name={addIncome ? 'checkbox' : 'square-outline'} size={20} color={theme.primary} />
                      <Text style={[styles.checkText, { color: theme.text }]}>
                        Add {money(principalNum)} to {monthLabel(thisMonth)} income (new loan received)
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  {draftSummary && draftRows.length ? (
                    <View style={[styles.calcBox, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral }]}>
                      <CalcRow label="EMI" value={money(draftSummary.emi)} theme={theme} />
                      <CalcRow label="Outstanding principal now" value={money(draftSummary.outstanding)} theme={theme} strong />
                      <CalcRow label="EMIs left" value={`${draftSummary.remainingCount} of ${draftSummary.totalCount}`} theme={theme} />
                      <CalcRow label="Interest left to pay" value={money(draftSummary.interestLeft)} theme={theme} />
                      <CalcRow label="Total interest on loan" value={money(draftSummary.totalInterest)} theme={theme} />
                      <CalcRow label="Last EMI" value={monthLabel(draftSummary.endsMonth, true)} theme={theme} />
                    </View>
                  ) : null}
                </>
              )}

              <TextInput
                style={[inputStyle, styles.noteInput]}
                placeholder="Note (optional, e.g. loan account no. last 4)"
                placeholderTextColor={theme.textMuted}
                value={loan.note}
                onChangeText={setLoanField('note')}
                multiline
              />

              <ModalActions
                theme={theme}
                onCancel={() => setLoanVisible(false)}
                onSave={saveLoan}
                valid={!!loanValid}
                saveLabel={editingId ? 'Update' : 'Save'}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Add / edit credit card or other bill */}
      <Modal visible={billVisible} transparent animationType="fade" onRequestClose={() => setBillVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.sheet }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {editingId ? 'Edit' : 'Add'} {section === 'card' ? 'Credit Card Bill' : 'Bill'}
              </Text>
              <TextInput
                style={inputStyle}
                placeholder={section === 'card' ? 'Card (e.g. HDFC Millennia)' : 'Bill name (e.g. TNEB, Airtel)'}
                placeholderTextColor={theme.textMuted}
                value={bill.name}
                // Typing a different name unlinks the picked card.
                onChangeText={(name) => setBill((f) => ({ ...f, name, cardId: null, cardLast4: '' }))}
              />
              {section === 'card' ? (
                <>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Pick from your cards</Text>
                  {creditCards.length ? (
                    <View style={styles.chipWrap}>
                      {creditCards.map((card) => {
                        const selected = bill.cardId === card.id;
                        return (
                          <TouchableOpacity
                            key={card.id}
                            style={[styles.chip, styles.cardChip, { backgroundColor: selected ? theme.secondary : theme.surfaceAlt, borderColor: selected ? theme.secondary : theme.borderNeutral }]}
                            onPress={() =>
                              setBill((f) =>
                                selected
                                  ? { ...f, cardId: null, cardLast4: '' }
                                  : { ...f, name: savedCardLabel(card), cardId: card.id, cardLast4: (card.number || '').slice(-4) }
                              )
                            }
                          >
                            <Ionicons name="card-outline" size={14} color={selected ? '#FFF' : theme.text} />
                            <Text style={[styles.chipText, { color: selected ? '#FFF' : theme.text }]}>{savedCardLabel(card)}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={[styles.cardHint, { color: theme.textMuted }]}>
                      Credit cards you add in Banking &amp; Cards show up here, so you don&apos;t have to type them again.
                    </Text>
                  )}
                </>
              ) : null}
              {section === 'bill' ? (
                <>
                  <View style={[styles.segment, { backgroundColor: theme.surfaceAlt }]}>
                    {[
                      { key: 'once', label: 'One time' },
                      { key: 'monthly', label: 'Every month' },
                      { key: 'loan', label: '1-month loan' },
                    ].map((opt) => (
                      <TouchableOpacity
                        key={opt.key}
                        style={[styles.segmentItem, billKind === opt.key && { backgroundColor: theme.sheet }]}
                        onPress={() => pickBillKind(opt.key)}
                      >
                        <Text style={[styles.tabText, { color: theme.text }]} numberOfLines={1}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {bill.recurring ? (
                    <View style={[styles.segment, { backgroundColor: theme.surfaceAlt }]}>
                      {[
                        { key: false, label: 'Same amount' },
                        { key: true, label: 'Amount changes' },
                      ].map((opt) => (
                        <TouchableOpacity
                          key={String(opt.key)}
                          style={[styles.segmentItem, bill.variable === opt.key && { backgroundColor: theme.sheet }]}
                          onPress={() => setBillField('variable')(opt.key)}
                        >
                          <Text style={[styles.tabText, { color: theme.text }]}>{opt.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Type</Text>
                  <View style={styles.chipWrap}>
                    {BILL_TYPES.filter((t) => t.key !== ONE_MONTH_LOAN || isLoanForm).map((t) => {
                      const selected = bill.billType === t.key;
                      return (
                        <TouchableOpacity
                          key={t.key}
                          style={[styles.chip, { backgroundColor: selected ? t.color : theme.surfaceAlt, borderColor: selected ? t.color : theme.borderNeutral }]}
                          onPress={() => setBillField('billType')(t.key)}
                        >
                          <Text style={[styles.chipText, { color: theme.text }]}>{t.key}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              ) : null}
              <View style={styles.amountRow}>
                <LabeledInput
                  label={
                    section === 'card'
                      ? 'Total due (₹)'
                      : bill.recurring && bill.variable
                        ? 'Usual amount (₹)'
                        : bill.recurring
                          ? 'Monthly amount (₹)'
                          : isLoanForm
                            ? 'Amount to repay (₹)'
                            : 'Amount (₹)'
                  }
                  theme={theme}
                  value={bill.amount}
                  onChangeText={setBillField('amount')}
                  placeholder="e.g. 12500"
                />
                {section === 'card' ? (
                  <LabeledInput label="Minimum due (optional)" theme={theme} value={bill.minDue} onChangeText={setBillField('minDue')} placeholder="₹" />
                ) : null}
              </View>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                {isMonthlyForm ? 'First due date' : isLoanForm ? 'Repay by' : 'Due date'} ·{' '}
                {bill.dueDate ? `${shortDate(bill.dueDate)} ${bill.dueDate.slice(0, 4)}` : 'pick one'}
              </Text>
              {/* Keyed so the calendar jumps to the new date when the kind changes it. */}
              <DatePicker key={billKind} value={bill.dueDate} onChange={setBillField('dueDate')} />
              {isLoanForm ? (
                <Text style={[styles.formHint, { color: theme.textMuted }]}>
                  Repaid in one go, a month from when you borrow (change the date if needed). It shows as pending until
                  you tick it paid, then goes to My Expenditure as an EMI.
                </Text>
              ) : null}
              {isMonthlyForm && bill.dueDate ? (
                <Text style={[styles.formHint, { color: theme.textMuted }]}>
                  Due on day {Number(bill.dueDate.slice(8, 10))} of every month from{' '}
                  {monthLabel(bill.dueDate.slice(0, 7), true)}
                  {Number(bill.dueDate.slice(8, 10)) > 28 ? ' (last day in shorter months)' : ''}.
                  {bill.variable ? ' You enter the actual amount each month when you tick it paid.' : ''}
                </Text>
              ) : null}
              <TextInput
                style={[inputStyle, styles.noteInput, styles.spaced]}
                placeholder="Note (optional)"
                placeholderTextColor={theme.textMuted}
                value={bill.note}
                onChangeText={setBillField('note')}
                multiline
              />
              {isMonthlyForm && editingBill && isRecurringBill(editingBill) ? (
                <TouchableOpacity
                  style={[styles.stopBtn, { borderColor: theme.borderNeutral }]}
                  onPress={() => setBillEnded(!editingBill.endMonth)}
                >
                  <Ionicons
                    name={editingBill.endMonth ? 'play-outline' : 'stop-circle-outline'}
                    size={18}
                    color={editingBill.endMonth ? theme.primary : theme.danger}
                  />
                  <Text style={[styles.stopText, { color: editingBill.endMonth ? theme.primary : theme.danger }]}>
                    {editingBill.endMonth
                      ? `Stopped after ${monthLabel(editingBill.endMonth)} · Resume`
                      : `Stop after ${monthLabel(thisMonth)}`}
                  </Text>
                </TouchableOpacity>
              ) : null}
              <ModalActions
                theme={theme}
                onCancel={() => setBillVisible(false)}
                onSave={saveBill}
                valid={!!billValid}
                saveLabel={editingId ? 'Update' : 'Save'}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* EMI schedule */}
      <Modal visible={!!scheduleLoan} transparent animationType="fade" onRequestClose={() => setScheduleId(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, styles.tallModal, { backgroundColor: theme.sheet }]}>
            {scheduleLoan && scheduleSummary ? (
              <>
                <Text style={[styles.modalTitle, styles.titleTight, { color: theme.text }]}>{scheduleLoan.name}</Text>
                <Text style={[styles.modalSub, { color: theme.textMuted }]}>
                  {money(scheduleSummary.outstanding)} outstanding · {scheduleSummary.remainingCount} EMIs left · {money(scheduleSummary.interestLeft)} interest left
                </Text>
                {unpaidEarlier > 0 ? (
                  <TouchableOpacity
                    style={[styles.ghostBtn, styles.earlierBtn, { borderColor: theme.primary }]}
                    onPress={() => markEarlierPaid(scheduleLoan)}
                  >
                    <Ionicons name="checkmark-done-outline" size={15} color={theme.primary} />
                    <Text style={[styles.ghostBtnText, { color: theme.primary }]}>
                      Mark {unpaidEarlier} EMIs before {monthLabel(thisMonth)} as paid (not added to expenses)
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <View style={[styles.schedHead, { borderBottomColor: theme.borderNeutral }]}>
                  <Text style={[styles.schedCell, styles.schedMonth, { color: theme.textMuted }]}>Month</Text>
                  <Text style={[styles.schedCell, { color: theme.textMuted }]}>Principal</Text>
                  <Text style={[styles.schedCell, { color: theme.textMuted }]}>Interest</Text>
                  <Text style={[styles.schedCell, { color: theme.textMuted }]}>Balance</Text>
                  <View style={styles.schedCheck} />
                </View>
                <FlatList
                  style={styles.schedList}
                  data={scheduleSummary.rows}
                  keyExtractor={(row) => row.month}
                  initialScrollIndex={Math.max(0, (scheduleSummary.next?.index || 1) - 2)}
                  getItemLayout={(_, index) => ({ length: SCHED_ROW_HEIGHT, offset: SCHED_ROW_HEIGHT * index, index })}
                  renderItem={({ item: row }) => {
                    const paid = schedulePaid.has(row.month);
                    const current = row.month === thisMonth;
                    return (
                      <View
                        style={[
                          styles.schedRow,
                          { borderBottomColor: theme.borderNeutral },
                          current && { backgroundColor: theme.primary + '1A' },
                        ]}
                      >
                        <View style={[styles.schedCell, styles.schedMonth]}>
                          <Text style={[styles.schedText, { color: theme.text }]}>{monthLabel(row.month)}</Text>
                          <Text style={[styles.schedSmall, { color: theme.textMuted }]}>
                            #{row.index} · {money(row.payment)}
                          </Text>
                        </View>
                        <Text style={[styles.schedCell, styles.schedText, { color: theme.text }]}>{money(row.principal)}</Text>
                        <Text style={[styles.schedCell, styles.schedText, { color: theme.textSecondary }]}>{money(row.interest)}</Text>
                        <Text style={[styles.schedCell, styles.schedText, { color: theme.text }]}>{money(row.balance)}</Text>
                        <TouchableOpacity
                          style={[styles.schedCheck, styles.checkBtn, { borderColor: paid ? '#2DA44E' : theme.borderNeutral, backgroundColor: paid ? '#2DA44E' : 'transparent' }]}
                          onPress={() => payEmi(scheduleLoan, row, !paid)}
                          accessibilityLabel={`${paid ? 'Unmark' : 'Mark'} ${monthLabel(row.month)} EMI paid`}
                        >
                          <Ionicons name="checkmark" size={15} color={paid ? '#FFF' : theme.textMuted} />
                        </TouchableOpacity>
                      </View>
                    );
                  }}
                />
                <TouchableOpacity
                  style={[styles.cancelBtn, styles.closeBtn, { backgroundColor: theme.surfaceAlt }]}
                  onPress={() => setScheduleId(null)}
                >
                  <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Close</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Monthly bill with a changing amount: this month's figure */}
      <Modal visible={!!amountDue} transparent animationType="fade" onRequestClose={() => setAmountDue(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.sheet }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {amountDue ? `${amountDue.title} · ${monthLabel(amountDue.month)}` : ''}
            </Text>
            <LabeledInput
              label="Amount paid this month (₹)"
              theme={theme}
              value={amountDraft}
              onChangeText={setAmountDraft}
              placeholder="e.g. 1450"
              autoFocus
            />
            <ModalActions
              theme={theme}
              onCancel={() => setAmountDue(null)}
              onSave={saveAmountPaid}
              valid={toNum(amountDraft) > 0}
              saveLabel="Mark paid"
            />
          </View>
        </View>
      </Modal>

      {/* Manual loan: update remaining amount */}
      <Modal visible={!!manualId} transparent animationType="fade" onRequestClose={() => setManualId(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.sheet }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Remaining amount</Text>
            <TextInput
              style={inputStyle}
              placeholder="₹ still to repay"
              placeholderTextColor={theme.textMuted}
              keyboardType="decimal-pad"
              value={manualOutstanding}
              onChangeText={setManualOutstanding}
            />
            <ModalActions theme={theme} onCancel={() => setManualId(null)} onSave={saveManual} valid saveLabel="Save" />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const SCHED_ROW_HEIGHT = 48;

function LabeledInput({ label, theme, keyboardType = 'decimal-pad', ...props }) {
  return (
    <View style={styles.flex}>
      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{label}</Text>
      <TextInput
        style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
        placeholderTextColor={theme.textMuted}
        keyboardType={keyboardType}
        {...props}
      />
    </View>
  );
}

function ModalActions({ theme, onCancel, onSave, valid, saveLabel }) {
  return (
    <View style={styles.modalActions}>
      <TouchableOpacity style={[styles.cancelBtn, { backgroundColor: theme.surfaceAlt }]} onPress={onCancel}>
        <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: theme.primary }, !valid && styles.btnDisabled]}
        onPress={onSave}
        disabled={!valid}
      >
        <Text style={[styles.saveText, { color: theme.onPrimary }]}>{saveLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

function CalcRow({ label, value, theme, strong }) {
  return (
    <View style={styles.calcRow}>
      <Text style={[styles.calcLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.calcValue, { color: theme.text }, strong && styles.calcStrong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  list: { paddingBottom: 90 },
  flex: { flex: 1, minWidth: 0 },
  tabs: { flexDirection: 'row', borderRadius: 12, padding: 3, marginBottom: 14 },
  alertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  alertBtnText: { fontSize: 14, fontWeight: '600' },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  tabSelected: { shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3, elevation: 2 },
  tabText: { fontSize: 13, fontWeight: '600' },
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
  summaryRow: { flexDirection: 'row', gap: 12 },
  summaryCol: { flex: 1 },
  summaryLabel: { fontSize: 12, fontWeight: '600' },
  summaryValue: { fontSize: 22, fontWeight: 'bold', marginTop: 4 },
  summarySub: { fontSize: 11, marginTop: 2 },
  plRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    marginTop: 14,
    paddingTop: 12,
    marginBottom: 10,
  },
  plLabel: { fontSize: 13, fontWeight: '600' },
  plValue: { fontSize: 16, fontWeight: '800' },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  hint: { fontSize: 11, marginTop: 12 },
  hintTight: { marginTop: -4, marginBottom: 12 },
  listTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  noMargin: { marginBottom: 0 },
  pendingCard: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, marginBottom: 16 },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  pendingIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pendingName: { fontSize: 14, fontWeight: '600' },
  pendingSub: { fontSize: 12, marginTop: 2 },
  pendingAmount: { fontSize: 14, fontWeight: '700' },
  emptyInline: { fontSize: 13, marginBottom: 14 },
  paidToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 10 },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '600' },
  cardChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardHint: { fontSize: 12, marginBottom: 14 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  empty: { alignItems: 'center', marginTop: 40 },
  emptyText: { marginTop: 12, fontSize: 14, textAlign: 'center', paddingHorizontal: 30 },
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
  billCard: { flexDirection: 'row', alignItems: 'center' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  typeIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  cardMeta: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardSub: { fontSize: 12, marginTop: 2 },
  iconBtn: { padding: 6 },
  amountsRow: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  amountCol: { flex: 1 },
  amountLabel: { fontSize: 11, fontWeight: '600' },
  amountValue: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  progressLabel: { fontSize: 11, marginTop: 6 },
  warnText: { fontSize: 11, fontWeight: '600', marginTop: 4 },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, marginTop: 10, paddingTop: 10 },
  nextLabel: { fontSize: 11, fontWeight: '600' },
  nextValue: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  payBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14 },
  payBtnText: { fontSize: 12, fontWeight: '700' },
  ghostBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1 },
  ghostBtnText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  earlierBtn: { marginBottom: 10, alignSelf: 'flex-start' },
  billAmount: { fontSize: 15, fontWeight: '700', marginHorizontal: 6 },
  checkBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modal: { borderRadius: 20, padding: 20, maxHeight: '88%' },
  tallModal: { height: '85%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  titleTight: { marginBottom: 2 },
  modalSub: { fontSize: 12, marginBottom: 12 },
  input: { borderRadius: 12, borderWidth: 1, padding: 13, fontSize: 16, marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6, letterSpacing: 0.3 },
  segment: { flexDirection: 'row', borderRadius: 12, padding: 3, marginBottom: 14 },
  formHint: { fontSize: 12, marginTop: 8, lineHeight: 17 },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  stopText: { fontSize: 14, fontWeight: '600' },
  segmentItem: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  amountRow: { flexDirection: 'row', gap: 12 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 12,
    marginBottom: 12,
  },
  stepperText: { fontSize: 15, fontWeight: '600' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  checkText: { fontSize: 13, flex: 1 },
  spaced: { marginTop: 12 },
  noteInput: { minHeight: 60, textAlignVertical: 'top' },
  calcBox: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8, marginBottom: 12 },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  calcLabel: { fontSize: 13 },
  calcValue: { fontSize: 13, fontWeight: '700' },
  calcStrong: { fontSize: 15, color: '#E5383B' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  closeBtn: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', marginTop: 12 },
  cancelText: { fontSize: 15, fontWeight: '600' },
  saveBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '600' },
  btnDisabled: { opacity: 0.4 },
  schedHead: { flexDirection: 'row', alignItems: 'center', paddingBottom: 6, borderBottomWidth: 1 },
  schedList: { flex: 1 },
  schedRow: { flexDirection: 'row', alignItems: 'center', height: SCHED_ROW_HEIGHT, borderBottomWidth: StyleSheet.hairlineWidth },
  schedCell: { flex: 1, fontSize: 11, textAlign: 'right' },
  schedMonth: { flex: 1.3, textAlign: 'left' },
  schedText: { fontSize: 12, fontWeight: '600' },
  schedSmall: { fontSize: 10 },
  schedCheck: { width: 28, marginLeft: 8 },
});
