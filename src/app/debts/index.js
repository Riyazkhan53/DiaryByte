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
import { loanStatus, endMonthLabel } from '../../utils/debts';

const STORAGE_KEY = '@diarybyte_debts';

const DEBT_TYPES = [
  { key: 'Personal Loan', icon: 'person-outline', color: '#FF6F61' },
  { key: 'Home Loan', icon: 'home-outline', color: '#32ADE6' },
  { key: 'Car Loan', icon: 'car-outline', color: '#AF52DE' },
  { key: 'Education Loan', icon: 'school-outline', color: '#007AFF' },
  { key: 'Credit Card', icon: 'card-outline', color: '#FF9500' },
  { key: 'Borrowed', icon: 'people-outline', color: '#34C759' },
  { key: 'Other', icon: 'ellipsis-horizontal-outline', color: '#8E8E93' },
];

const makeId = () =>
  `${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`;

const money = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const toNum = (text) => parseFloat(String(text).replace(/[^\d.]/g, ''));

const typeMeta = (key) => DEBT_TYPES.find((t) => t.key === key) || DEBT_TYPES[DEBT_TYPES.length - 1];

export default function DebtsScreen() {
  const { theme } = useTheme();
  const { items, synced, persist, pulling, pullInfo, pullNow } = useSyncedCollection(
    'debts',
    STORAGE_KEY
  );
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('Personal Loan');
  const [principal, setPrincipal] = useState('');
  const [outstanding, setOutstanding] = useState('');
  const [emi, setEmi] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [filter, setFilter] = useState('all');

  // "Update" sheet: EMI + remaining EMIs (+ optional rate) → outstanding.
  const [updating, setUpdating] = useState(null);
  const [uEmi, setUEmi] = useState('');
  const [uRemaining, setURemaining] = useState('');
  const [uRate, setURate] = useState('');
  const [uOutstanding, setUOutstanding] = useState('');

  const openUpdate = (item) => {
    setUpdating(item);
    setUEmi(item.emi ? String(item.emi) : '');
    setURemaining(item.remainingEmis != null ? String(item.remainingEmis) : '');
    setURate(item.interestRate ? String(item.interestRate) : '');
    setUOutstanding(item.outstanding != null ? String(item.outstanding) : '');
  };

  const uEmiNum = toNum(uEmi) || 0;
  const uRemainingNum = uRemaining.trim() === '' ? null : Math.max(0, Math.round(toNum(uRemaining) || 0));
  const uRateNum = toNum(uRate) || 0;
  // With an EMI and a count of EMIs left we can calculate; otherwise the
  // remaining amount is entered by hand (e.g. money borrowed from a friend).
  const usesEmiMaths = uEmiNum > 0 && uRemainingNum != null;
  const preview = updating
    ? usesEmiMaths
      ? loanStatus({
          principal: updating.principal,
          emi: uEmiNum,
          remainingEmis: uRemainingNum,
          interestRate: uRateNum,
        })
      : (() => {
          const outstandingNum = Math.max(0, toNum(uOutstanding) || 0);
          const paidOffNum = Math.max(0, (updating.principal || 0) - outstandingNum);
          return {
            outstanding: outstandingNum,
            paidOff: paidOffNum,
            paidPct: updating.principal > 0 ? Math.min((paidOffNum / updating.principal) * 100, 100) : 0,
          };
        })()
    : null;
  const updateValid = usesEmiMaths || uOutstanding.trim() !== '';

  const payOneEmi = () => {
    if (uRemainingNum != null && uRemainingNum > 0) setURemaining(String(uRemainingNum - 1));
  };

  const saveUpdate = () => {
    if (!updating || !updateValid) return;
    const updated = {
      ...updating,
      emi: uEmiNum,
      remainingEmis: uRemainingNum,
      interestRate: uRateNum,
      outstanding: preview.outstanding,
      updatedAt: new Date().toISOString(),
    };
    persist(items.map((i) => (i.id === updating.id ? updated : i)));
    setUpdating(null);
  };

  const openAdd = () => {
    setEditingId(null);
    setName('');
    setType('Personal Loan');
    setPrincipal('');
    setOutstanding('');
    setEmi('');
    setDueDate('');
    setNote('');
    setModalVisible(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setName(item.name);
    setType(item.type);
    setPrincipal(item.principal != null ? String(item.principal) : '');
    setOutstanding(item.outstanding != null ? String(item.outstanding) : '');
    setEmi(item.emi != null ? String(item.emi) : '');
    setDueDate(item.dueDate || '');
    setNote(item.note || '');
    setModalVisible(true);
  };

  const saveItem = () => {
    const principalNum = parseFloat(principal.replace(/[^\d.]/g, ''));
    const outstandingNum = parseFloat(outstanding.replace(/[^\d.]/g, ''));
    const emiNum = parseFloat(emi.replace(/[^\d.]/g, '')) || 0;
    if (!name.trim() || !principalNum || !outstandingNum) return;
    const existing = editingId ? items.find((i) => i.id === editingId) : null;
    const entry = {
      // Keep fields this form doesn't edit (remaining EMIs, rate, updatedAt).
      ...existing,
      id: editingId || makeId(),
      name: name.trim(),
      type,
      principal: principalNum,
      outstanding: outstandingNum,
      emi: emiNum,
      dueDate: dueDate.trim(),
      note: note.trim(),
      createdAt: editingId
        ? items.find((i) => i.id === editingId)?.createdAt || new Date().toISOString()
        : new Date().toISOString(),
    };
    persist(editingId ? items.map((i) => (i.id === editingId ? entry : i)) : [entry, ...items]);
    setModalVisible(false);
  };

  const deleteItem = (item) => {
    Alert.alert('Delete Debt', `Remove ${item.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => persist(items.filter((i) => i.id !== item.id)),
      },
    ]);
  };

  const totalOutstanding = items.reduce((s, i) => s + (i.outstanding || 0), 0);
  const totalEmi = items.reduce((s, i) => s + (i.emi || 0), 0);
  const totalPrincipal = items.reduce((s, i) => s + (i.principal || 0), 0);
  const paidOff = totalPrincipal - totalOutstanding;
  const paidPct = totalPrincipal > 0 ? Math.min((paidOff / totalPrincipal) * 100, 100) : 0;

  const visible = filter === 'all' ? items : items.filter((i) => i.type === filter);
  const formValid =
    name.trim() &&
    parseFloat(principal.replace(/[^\d.]/g, '')) > 0 &&
    parseFloat(outstanding.replace(/[^\d.]/g, '')) > 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
      <Header title="My Debts" subtitle="Loans and money you owe" />

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
              <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Total outstanding</Text>
              <Text style={[styles.summaryValue, { color: '#E5383B' }]}>
                {money(totalOutstanding)}
              </Text>
            </View>
            <View style={styles.summaryCol}>
              <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Monthly EMI</Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>{money(totalEmi)}</Text>
            </View>
          </View>
          <View style={[styles.plRow, { borderTopColor: theme.borderNeutral }]}>
            <Text style={[styles.plLabel, { color: theme.textMuted }]}>
              Paid off {money(paidOff)} of {money(totalPrincipal)}
            </Text>
            <Text style={[styles.plValue, { color: '#2DA44E' }]}>{paidPct.toFixed(0)}%</Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: theme.surfaceAlt }]}>
            <View style={[styles.progressFill, { width: `${paidPct}%`, backgroundColor: theme.primary }]} />
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
            {DEBT_TYPES.map((t) => (
              <TouchableOpacity
                key={t.key}
                style={[
                  styles.chip,
                  {
                    backgroundColor: filter === t.key ? t.color : theme.surface,
                    borderColor: filter === t.key ? t.color : theme.borderNeutral,
                  },
                ]}
                onPress={() => setFilter(t.key)}
              >
                <Text style={[styles.chipText, { color: theme.text }]}>{t.key}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="checkmark-circle-outline" size={56} color={theme.textMuted} />
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                Debt-free! Or add a loan or borrowed money to track it here.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const meta = typeMeta(item.type);
            const itemPaid = (item.principal || 0) - (item.outstanding || 0);
            const itemPct =
              item.principal > 0 ? Math.min((itemPaid / item.principal) * 100, 100) : 0;
            const cleared = (item.outstanding || 0) <= 0;
            return (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.surface,
                    borderColor: cleared ? theme.primary : theme.border,
                    shadowColor: theme.shadow,
                  },
                ]}
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.typeIcon, { backgroundColor: meta.color + '40' }]}>
                    <Ionicons name={meta.icon} size={19} color="#455A64" />
                  </View>
                  <View style={styles.cardMeta}>
                    <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[styles.cardSub, { color: theme.textSecondary }]}>
                      {item.type}
                      {item.dueDate ? ` · by ${item.dueDate}` : ''}
                      {item.remainingEmis > 0
                        ? ` · ${item.remainingEmis} EMI${item.remainingEmis === 1 ? '' : 's'} left · ends ${endMonthLabel(item.remainingEmis)}`
                        : ''}
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
                    <Text style={[styles.amountLabel, { color: theme.textMuted }]}>Outstanding</Text>
                    <Text
                      style={[
                        styles.amountValue,
                        { color: cleared ? '#2DA44E' : '#E5383B' },
                      ]}
                    >
                      {cleared ? 'Cleared' : money(item.outstanding)}
                    </Text>
                  </View>
                  {item.emi ? (
                    <View style={styles.amountCol}>
                      <Text style={[styles.amountLabel, { color: theme.textMuted }]}>EMI / month</Text>
                      <Text style={[styles.amountValue, { color: theme.text }]}>
                        {money(item.emi)}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.amountCol}>
                    <Text style={[styles.amountLabel, { color: theme.textMuted }]}>Principal</Text>
                    <Text style={[styles.amountValue, { color: theme.text }]}>
                      {money(item.principal)}
                    </Text>
                  </View>
                </View>

                <View style={[styles.progressTrack, { backgroundColor: theme.surfaceAlt }]}>
                  <View style={[styles.progressFill, { width: `${itemPct}%`, backgroundColor: theme.primary }]} />
                </View>
                <View style={styles.progressRow}>
                  <Text style={[styles.progressLabel, { color: theme.textMuted }]}>
                    {itemPct.toFixed(0)}% paid off
                    {item.updatedAt
                      ? ` · updated ${new Date(item.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
                      : ''}
                  </Text>
                  {!cleared ? (
                    <TouchableOpacity
                      style={[styles.updateBtn, { backgroundColor: theme.primary }]}
                      onPress={() => openUpdate(item)}
                    >
                      <Ionicons name="refresh-outline" size={14} color={theme.onPrimary} />
                      <Text style={[styles.updateBtnText, { color: theme.onPrimary }]}>Update</Text>
                    </TouchableOpacity>
                  ) : null}
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
                {editingId ? 'Edit Debt' : 'Add Debt'}
              </Text>

              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                placeholder="Lender / person (e.g. SBI, Ravi)"
                placeholderTextColor={theme.textMuted}
                value={name}
                onChangeText={setName}
              />

              <Text style={[styles.fieldLabelText, { color: theme.textSecondary }]}>Type</Text>
              <View style={styles.typeRow}>
                {DEBT_TYPES.map((t) => {
                  const selected = type === t.key;
                  return (
                    <TouchableOpacity
                      key={t.key}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: selected ? t.color : theme.surfaceAlt,
                          borderColor: selected ? t.color : theme.borderNeutral,
                        },
                      ]}
                      onPress={() => setType(t.key)}
                    >
                      <Text style={[styles.chipText, { color: theme.text }]}>{t.key}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.amountRow}>
                <TextInput
                  style={[styles.input, styles.smallInput, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                  placeholder="Principal (₹)"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="decimal-pad"
                  value={principal}
                  onChangeText={setPrincipal}
                />
                <TextInput
                  style={[styles.input, styles.smallInput, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                  placeholder="Outstanding (₹)"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="decimal-pad"
                  value={outstanding}
                  onChangeText={setOutstanding}
                />
              </View>
              <View style={styles.amountRow}>
                <TextInput
                  style={[styles.input, styles.smallInput, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                  placeholder="EMI / month (₹, optional)"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="decimal-pad"
                  value={emi}
                  onChangeText={setEmi}
                />
                <TextInput
                  style={[styles.input, styles.smallInput, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                  placeholder="Due / end date (optional)"
                  placeholderTextColor={theme.textMuted}
                  value={dueDate}
                  onChangeText={setDueDate}
                />
              </View>
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
                  style={[styles.saveBtn, { backgroundColor: theme.primary }, !formValid && styles.btnDisabled]}
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
      <Modal visible={!!updating} transparent animationType="fade" onRequestClose={() => setUpdating(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.sheet }]}>
            {updating ? (
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={[styles.modalTitle, styles.updateTitle, { color: theme.text }]}>
                  Update {updating.name}
                </Text>
                <Text style={[styles.updateSub, { color: theme.textMuted }]}>
                  Principal {money(updating.principal)} · {updating.type}
                </Text>

                <Text style={[styles.fieldLabelText, { color: theme.textSecondary }]}>EMI amount (₹ / month)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                  placeholder="e.g. 12500"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="decimal-pad"
                  value={uEmi}
                  onChangeText={setUEmi}
                />

                <Text style={[styles.fieldLabelText, { color: theme.textSecondary }]}>Remaining EMIs</Text>
                <View style={styles.amountRow}>
                  <TextInput
                    style={[styles.input, styles.smallInput, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                    placeholder="e.g. 24"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="number-pad"
                    value={uRemaining}
                    onChangeText={setURemaining}
                  />
                  <TouchableOpacity
                    style={[styles.payBtn, { borderColor: theme.primaryDark }, !(uRemainingNum > 0) && styles.btnDisabled]}
                    onPress={payOneEmi}
                    disabled={!(uRemainingNum > 0)}
                  >
                    <Ionicons name="checkmark-done-outline" size={16} color={theme.primaryDark} />
                    <Text style={[styles.payBtnText, { color: theme.primaryDark }]}>Paid 1 EMI</Text>
                  </TouchableOpacity>
                </View>

                <Text style={[styles.fieldLabelText, { color: theme.textSecondary }]}>Interest rate (% per year, optional)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                  placeholder="e.g. 10.5 — leave blank if unknown"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="decimal-pad"
                  value={uRate}
                  onChangeText={setURate}
                />

                {!usesEmiMaths ? (
                  <>
                    <Text style={[styles.fieldLabelText, { color: theme.textSecondary }]}>
                      No EMI? Enter the remaining amount (₹)
                    </Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                      placeholder="Remaining amount"
                      placeholderTextColor={theme.textMuted}
                      keyboardType="decimal-pad"
                      value={uOutstanding}
                      onChangeText={setUOutstanding}
                    />
                  </>
                ) : null}

                <View style={[styles.calcBox, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral }]}>
                  <CalcRow label="Outstanding principal" value={money(preview.outstanding)} theme={theme} strong />
                  {usesEmiMaths ? (
                    <>
                      <CalcRow label="Total EMIs left to pay" value={money(preview.totalPayable)} theme={theme} />
                      {uRateNum > 0 ? (
                        <CalcRow label="Interest left" value={money(preview.interestLeft)} theme={theme} />
                      ) : null}
                    </>
                  ) : null}
                  <CalcRow
                    label="Principal paid off"
                    value={`${money(preview.paidOff)} · ${preview.paidPct.toFixed(0)}%`}
                    theme={theme}
                  />
                  {usesEmiMaths ? (
                    <CalcRow label="Loan ends" value={preview.endsOn || 'Cleared 🎉'} theme={theme} />
                  ) : null}
                  {usesEmiMaths && !(uRateNum > 0) ? (
                    <Text style={[styles.calcHint, { color: theme.textMuted }]}>
                      Add the interest rate to split EMIs into principal and interest.
                    </Text>
                  ) : null}
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.cancelBtn, { backgroundColor: theme.surfaceAlt }]}
                    onPress={() => setUpdating(null)}
                  >
                    <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.saveBtn, { backgroundColor: theme.primary }, !updateValid && styles.btnDisabled]}
                    onPress={saveUpdate}
                    disabled={!updateValid}
                  >
                    <Text style={[styles.saveText, { color: theme.onPrimary }]}>Save</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
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
    marginBottom: 10,
  },
  plLabel: { fontSize: 13, fontWeight: '600' },
  plValue: { fontSize: 16, fontWeight: '800' },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  filterRow: { marginBottom: 14 },
  filterChips: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '600' },
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
  typeIcon: {
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
  amountsRow: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  amountCol: { flex: 1 },
  amountLabel: { fontSize: 11, fontWeight: '600' },
  amountValue: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  progressLabel: { flex: 1, fontSize: 11 },
  progressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 },
  updateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  updateBtnText: { fontSize: 12, fontWeight: '700' },
  updateTitle: { marginBottom: 2 },
  updateSub: { fontSize: 13, marginBottom: 16 },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  payBtnText: { fontSize: 13, fontWeight: '700' },
  calcBox: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8, marginBottom: 6 },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  calcLabel: { fontSize: 13 },
  calcValue: { fontSize: 13, fontWeight: '700' },
  calcStrong: { fontSize: 16, color: '#E5383B' },
  calcHint: { fontSize: 11, marginTop: 2 },
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
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  amountRow: { flexDirection: 'row', gap: 12 },
  smallInput: { flex: 1, minWidth: 0 },
  noteInput: { minHeight: 70, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600' },
  saveBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '600' },
  btnDisabled: { opacity: 0.4 },
});
