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
import DatePicker from '../../components/DatePicker';
import { useTheme } from '../../hooks/useTheme';
import { useSyncedCollection } from '../../hooks/useSyncedCollection';
import { confirmDelete } from '../../utils/confirm';
import {
  AUTOPAY_STORAGE_KEY,
  requestWebNotificationPermission,
  webNotificationPermission,
} from '../../services/autopayReminders';
import {
  RECURRENCES,
  activeReminder,
  addDays,
  dueLabel,
  formatDate,
  money,
  nextDue,
  occurrencesFrom,
  recurrenceLabel,
  todayKey,
} from '../../utils/autopay';

const makeId = () =>
  `${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`;

export default function AutopaysScreen() {
  const { theme } = useTheme();
  const { items, synced, persist, pulling, pullInfo, pullNow } = useSyncedCollection(
    'autopays',
    AUTOPAY_STORAGE_KEY
  );
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [recurrence, setRecurrence] = useState('monthly');
  const [startDate, setStartDate] = useState(todayKey());
  const [dates, setDates] = useState([]);
  const [pickedDate, setPickedDate] = useState(todayKey());
  const [webPermission, setWebPermission] = useState(webNotificationPermission);

  const today = todayKey();

  const openAdd = () => {
    setEditingId(null);
    setName('');
    setAmount('');
    setRecurrence('monthly');
    setStartDate(today);
    setDates([]);
    setPickedDate(today);
    setModalVisible(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setName(item.name);
    setAmount(item.amount != null ? String(item.amount) : '');
    setRecurrence(item.recurrence);
    setStartDate(item.startDate || today);
    setDates(item.dates || []);
    setPickedDate(today);
    setModalVisible(true);
  };

  const addPickedDate = () => {
    if (!dates.includes(pickedDate)) setDates([...dates, pickedDate].sort());
  };

  const amountNum = parseFloat(amount.replace(/[^\d.]/g, ''));
  const formValid =
    name.trim() && amountNum > 0 && (recurrence === 'dates' ? dates.length > 0 : !!startDate);

  const saveItem = () => {
    if (!formValid) return;
    const existing = items.find((i) => i.id === editingId);
    const entry = {
      id: editingId || makeId(),
      name: name.trim(),
      amount: amountNum,
      recurrence,
      startDate: recurrence === 'dates' ? '' : startDate,
      dates: recurrence === 'dates' ? dates : [],
      ackDue: '',
      createdAt: existing?.createdAt || new Date().toISOString(),
    };
    // Keep a dismissed cycle dismissed unless the schedule itself changed.
    if (
      existing &&
      existing.recurrence === entry.recurrence &&
      existing.startDate === entry.startDate &&
      (existing.dates || []).join() === entry.dates.join()
    ) {
      entry.ackDue = existing.ackDue || '';
    }
    persist(editingId ? items.map((i) => (i.id === editingId ? entry : i)) : [entry, ...items]);
    setModalVisible(false);
  };

  const deleteItem = (item) => {
    confirmDelete('Delete Autopay', `Remove ${item.name}?`, () =>
      persist(items.filter((i) => i.id !== item.id))
    );
  };

  const stopReminders = (item, due) => {
    persist(items.map((i) => (i.id === item.id ? { ...i, ackDue: due } : i)));
  };

  const enableWebAlerts = async () => {
    setWebPermission(await requestWebNotificationPermission());
  };

  const sorted = [...items].sort((a, b) => {
    const da = nextDue(a, today) || '9999';
    const db = nextDue(b, today) || '9999';
    return da.localeCompare(db);
  });

  // Total of every due date in the next 30 days, including dismissed cycles.
  const in30 = addDays(today, 30);
  const next30Total = items.reduce(
    (sum, item) =>
      sum +
      occurrencesFrom(item, today, 40).filter((d) => d <= in30).length * (item.amount || 0),
    0
  );
  const dueSoon = items.filter((i) => activeReminder(i, today)).length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
      <Header title="My Autopays" subtitle="Recurring payments and reminders" />

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
              <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Next 30 days</Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>{money(next30Total)}</Text>
            </View>
            <View style={styles.summaryCol}>
              <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Due soon</Text>
              <Text style={[styles.summaryValue, { color: dueSoon ? '#E65100' : theme.text }]}>
                {dueSoon}
              </Text>
            </View>
          </View>
          {webPermission === 'default' && (
            <TouchableOpacity
              style={[styles.alertBtn, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral }]}
              onPress={enableWebAlerts}
            >
              <Ionicons name="notifications-outline" size={18} color={theme.secondaryDark} />
              <Text style={[styles.alertBtnText, { color: theme.secondaryDark }]}>
                Enable browser alerts
              </Text>
            </TouchableOpacity>
          )}
          {webPermission === 'denied' && (
            <Text style={[styles.hint, { color: theme.textMuted }]}>
              Browser alerts are blocked for this site. Reminders still show in the app.
            </Text>
          )}
        </View>

        <FlatList
          data={sorted}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="repeat-outline" size={56} color={theme.textMuted} />
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                Add your subscriptions, EMIs and bills to get reminded 2 days before, 1 day
                before and on the day.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const due = nextDue(item, today);
            const reminder = activeReminder(item, today);
            return (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.surface,
                    borderColor: reminder ? '#FFB74D' : theme.border,
                    shadowColor: theme.shadow,
                  },
                ]}
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.typeIcon, { backgroundColor: '#B39DDB40' }]}>
                    <Ionicons name="repeat-outline" size={19} color="#455A64" />
                  </View>
                  <View style={styles.cardMeta}>
                    <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[styles.cardSub, { color: theme.textSecondary }]}>
                      {money(item.amount)} · {recurrenceLabel(item)}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.iconBtn} onPress={() => openEdit(item)}>
                    <Ionicons name="create-outline" size={19} color={theme.primaryDark} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.iconBtn} onPress={() => deleteItem(item)}>
                    <Ionicons name="trash-outline" size={19} color={theme.danger} />
                  </TouchableOpacity>
                </View>

                <View style={styles.dueRow}>
                  <Ionicons name="calendar-outline" size={15} color={theme.textMuted} />
                  <Text style={[styles.dueText, { color: theme.textSecondary }]}>
                    {due ? `Next: ${formatDate(due)}` : 'No upcoming dates'}
                  </Text>
                  {reminder && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{dueLabel(reminder.daysLeft)}</Text>
                    </View>
                  )}
                </View>

                {reminder && (
                  <TouchableOpacity
                    style={[styles.stopBtn, { borderColor: theme.borderNeutral }]}
                    onPress={() => stopReminders(item, reminder.due)}
                  >
                    <Ionicons name="notifications-off-outline" size={16} color={theme.textSecondary} />
                    <Text style={[styles.stopText, { color: theme.textSecondary }]}>
                      Got it, don&apos;t remind me this cycle
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
        />
      </View>

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.secondary, shadowColor: theme.secondary }]}
        onPress={openAdd}
        activeOpacity={0.8}
        accessibilityLabel="Add autopay"
      >
        <Ionicons name="add" size={32} color="#FFF" />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.sheet }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {editingId ? 'Edit Autopay' : 'Add Autopay'}
              </Text>

              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                placeholder="Autopay name (e.g. Netflix, Home EMI)"
                placeholderTextColor={theme.textMuted}
                value={name}
                onChangeText={setName}
              />
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                placeholder="Amount (₹)"
                placeholderTextColor={theme.textMuted}
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
              />

              <Text style={[styles.fieldLabelText, { color: theme.textSecondary }]}>Repeats</Text>
              <View style={styles.typeRow}>
                {RECURRENCES.map((r) => {
                  const selected = recurrence === r.key;
                  return (
                    <TouchableOpacity
                      key={r.key}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: selected ? theme.secondary : theme.surfaceAlt,
                          borderColor: selected ? theme.secondary : theme.borderNeutral,
                        },
                      ]}
                      onPress={() => setRecurrence(r.key)}
                    >
                      <Text style={[styles.chipText, { color: selected ? '#FFFFFF' : theme.text }]}>
                        {r.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {recurrence === 'dates' ? (
                <>
                  <Text style={[styles.fieldLabelText, { color: theme.textSecondary }]}>
                    Pick a date, then tap + to add it
                  </Text>
                  <DatePicker value={pickedDate} onChange={setPickedDate} marked={dates} />
                  <TouchableOpacity
                    style={[styles.addDateBtn, { backgroundColor: theme.secondary }]}
                    onPress={addPickedDate}
                    accessibilityLabel="Add date"
                  >
                    <Ionicons name="add" size={20} color="#FFF" />
                    <Text style={styles.addDateText}>{formatDate(pickedDate)}</Text>
                  </TouchableOpacity>
                  <View style={styles.typeRow}>
                    {dates.map((d) => (
                      <View
                        key={d}
                        style={[styles.chip, styles.dateChip, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral }]}
                      >
                        <Text style={[styles.chipText, { color: theme.text }]}>{formatDate(d)}</Text>
                        <TouchableOpacity
                          onPress={() => setDates(dates.filter((x) => x !== d))}
                          accessibilityLabel={`Remove ${formatDate(d)}`}
                        >
                          <Ionicons name="close-circle" size={16} color={theme.textMuted} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <>
                  <Text style={[styles.fieldLabelText, { color: theme.textSecondary }]}>
                    {recurrence === 'once' ? 'Date' : 'First / next due date'}: {formatDate(startDate)}
                  </Text>
                  <DatePicker value={startDate} onChange={setStartDate} />
                </>
              )}

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
  alertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  alertBtnText: { fontSize: 14, fontWeight: '600' },
  hint: { fontSize: 12, marginTop: 12 },
  empty: { alignItems: 'center', marginTop: 60 },
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
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dueText: { fontSize: 13, flex: 1 },
  badge: { backgroundColor: '#FFE0B2', borderRadius: 10, paddingVertical: 3, paddingHorizontal: 9 },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#E65100' },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  stopText: { fontSize: 13, fontWeight: '600' },
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
  modal: { borderRadius: 20, padding: 20, maxHeight: '90%' },
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
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '600' },
  dateChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  addDateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 12,
  },
  addDateText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600' },
  saveBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '600' },
  btnDisabled: { opacity: 0.4 },
});
