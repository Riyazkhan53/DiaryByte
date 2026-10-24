import { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  Modal,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import Header from '../../components/Header';
import SyncRow from '../../components/SyncRow';
import DatePicker from '../../components/DatePicker';
import { useTheme } from '../../hooks/useTheme';
import { useSyncedCollection } from '../../hooks/useSyncedCollection';
import {
  DATES_STORAGE_KEY,
  DATE_SECTIONS,
  countdownLabel,
  formatDisplayDate,
  sortDates,
  dateSection,
} from '../../utils/importantDates';

const EMPTY_FORM = {
  title: '',
  date: '',
  section: 'recurring',
  note: '',
};

export default function ImportantDatesScreen() {
  const { theme } = useTheme();
  const { open } = useLocalSearchParams();
  const { items, synced, persist, pulling, pullInfo, pullNow } = useSyncedCollection(
    'dates',
    DATES_STORAGE_KEY
  );

  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState(null);
  const [viewingId, setViewingId] = useState(open || null);

  const viewing = viewingId ? items.find((d) => d.id === viewingId) || null : null;

  useEffect(() => {
    if (open && items.find((d) => d.id === open)) {
      const t = setTimeout(() => setViewingId(open), 0);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open, items]);

  const sorted = sortDates(items);
  const totalCount = items.length;
  const upcomingCount = sorted.upcoming.length;
  const recurringCount = sorted.recurring.length;

  const openAdd = (section) => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, section });
    setModalVisible(true);
  };

  const openEdit = (date) => {
    setEditingId(date.id);
    setForm({
      title: date.title || '',
      date: date.date || '',
      section: date.section || 'recurring',
      note: date.note || '',
    });
    setModalVisible(true);
  };

  const save = () => {
    if (!form.title.trim() || !form.date) return;
    const payload = {
      id: editingId || `${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`,
      title: form.title.trim(),
      date: form.date,
      section: form.section,
      note: form.note.trim(),
      updatedAt: new Date().toISOString(),
    };
    if (editingId) {
      persist(items.map((i) => (i.id === editingId ? payload : i)));
    } else {
      persist([payload, ...items]);
    }
    setModalVisible(false);
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
  };

  const deleteDate = (id) => {
    Alert.alert('Delete Date', 'Remove this entry?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => persist(items.filter((i) => i.id !== id)) },
    ]);
  };

  const setField = (field) => (value) => setForm((prev) => ({ ...prev, [field]: value }));

  const renderSection = (section) => {
    const data = section.key === 'recurring' ? sorted.recurring : sorted.upcoming;
    const meta = DATE_SECTIONS.find((s) => s.key === section.key);
    return (
      <View key={section.key} style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name={meta.icon} size={18} color={theme.secondary} />
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{meta.label}</Text>
            <View style={[styles.countPill, { backgroundColor: theme.secondary }]}>
              <Text style={styles.countPillText}>{data.length}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.addSmall, { backgroundColor: theme.secondary }]}
            onPress={() => openAdd(section.key)}
          >
            <Ionicons name="add" size={18} color="#FFF" />
          </TouchableOpacity>
        </View>

        {data.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.glassSurface, borderColor: theme.border }]}>
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              {section.key === 'recurring'
                ? 'No birthdays or anniversaries yet. Add the ones you never want to forget.'
                : 'No upcoming occasions yet. Add a date you are looking forward to.'}
            </Text>
          </View>
        ) : (
          data.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.dateCard,
                { backgroundColor: theme.glassSurface, borderColor: theme.border },
              ]}
              onPress={() => setViewingId(item.id)}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={section.key === 'recurring' ? ['#FFECB3', '#FFD54F'] : ['#B3E5FC', '#81D4FA']}
                style={styles.dateIcon}
              >
                <Text style={styles.dateIconText}>{formatDisplayDate(item).split(' ')[0]}</Text>
                <Text style={styles.dateIconSub}>{formatDisplayDate(item).split(' ')[1] || ''}</Text>
              </LinearGradient>
              <View style={styles.dateBody}>
                <Text style={[styles.dateTitle, { color: theme.text }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={[styles.dateSub, { color: theme.textSecondary }]}>
                  {formatDisplayDate(item)} · {countdownLabel(item)}
                </Text>
                {item.note ? (
                  <Text style={[styles.dateNote, { color: theme.textMuted }]} numberOfLines={1}>
                    {item.note}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteDate(item.id)}>
                <Ionicons name="trash-outline" size={18} color={theme.danger} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
      <Header
        title="Important Dates"
        subtitle={`${totalCount} saved · ${recurringCount} recurring · ${upcomingCount} upcoming`}
      />

      <View style={styles.content}>
        <SyncRow synced={synced} pulling={pulling} pullInfo={pullInfo} onPull={pullNow} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {DATE_SECTIONS.map(renderSection)}
        </ScrollView>
      </View>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {editingId ? 'Edit Date' : 'Add Date'}
            </Text>

            <View style={styles.segment}>
              {DATE_SECTIONS.map((s) => (
                <TouchableOpacity
                  key={s.key}
                  style={[
                    styles.segmentBtn,
                    {
                      backgroundColor:
                        form.section === s.key ? theme.secondary : theme.surfaceAlt,
                      borderColor: theme.borderNeutral,
                    },
                  ]}
                  onPress={() => setField('section')(s.key)}
                >
                  <Text style={[styles.segmentText, { color: theme.text }]} numberOfLines={1}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={[
                styles.input,
                { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text },
              ]}
              placeholder="e.g. Mom's birthday, Wedding anniversary"
              placeholderTextColor={theme.textMuted}
              value={form.title}
              onChangeText={setField('title')}
            />

            <DatePicker value={form.date} onChange={setField('date')} />

            <TextInput
              style={[
                styles.input,
                styles.noteInput,
                { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text },
              ]}
              placeholder="Note (optional)"
              placeholderTextColor={theme.textMuted}
              value={form.note}
              onChangeText={setField('note')}
              multiline
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.cancelBtn, { backgroundColor: theme.surfaceAlt }]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={[styles.cancelText, { color: theme.textSecondary }]}>{'Cancel'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: theme.primary }]}
                onPress={save}
                disabled={!form.title.trim() || !form.date}
              >
                <Text style={[styles.saveText, { color: theme.text }]}>{'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewingId(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.surface }]}>
            {viewing ? (
              <>
                <View style={styles.viewHeader}>
                  <Ionicons
                    name={dateSection(viewing.section).icon}
                    size={28}
                    color={theme.secondary}
                  />
                  <TouchableOpacity
                    style={styles.editBtn}
                    onPress={() => {
                      setViewingId(null);
                      openEdit(viewing);
                    }}
                  >
                    <Ionicons name="create-outline" size={20} color={theme.textSecondary} />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.viewTitle, { color: theme.text }]}>{viewing.title}</Text>
                <Text style={[styles.viewDate, { color: theme.secondary }]}>
                  {formatDisplayDate(viewing)} · {countdownLabel(viewing)}
                </Text>
                {viewing.note ? (
                  <Text style={[styles.viewNote, { color: theme.textSecondary }]}>{viewing.note}</Text>
                ) : null}
                <TouchableOpacity
                  style={[styles.closeBtn, { backgroundColor: theme.surfaceAlt }]}
                  onPress={() => setViewingId(null)}
                >
                  <Text style={[styles.closeText, { color: theme.textSecondary }]}>{'Close'}</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  scrollContent: { paddingBottom: 30 },
  section: { marginBottom: 22 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  countPill: {
    minWidth: 24,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
  },
  countPillText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  addSmall: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
  },
  emptyText: { fontSize: 13, textAlign: 'center' },
  dateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
  },
  dateIcon: {
    width: 48,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateIconText: { color: '#37474F', fontSize: 18, fontWeight: '800' },
  dateIconSub: { color: '#37474F', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  dateBody: { flex: 1, marginHorizontal: 12 },
  dateTitle: { fontSize: 15, fontWeight: '700' },
  dateSub: { fontSize: 12, marginTop: 2 },
  dateNote: { fontSize: 11, marginTop: 3 },
  deleteBtn: { padding: 6 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modal: { borderRadius: 20, padding: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  segment: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  segmentText: { fontSize: 13, fontWeight: '600' },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  noteInput: { minHeight: 80, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600' },
  saveBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '600' },
  viewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  editBtn: { padding: 6 },
  viewTitle: { fontSize: 22, fontWeight: 'bold', marginTop: 8 },
  viewDate: { fontSize: 15, fontWeight: '600', marginTop: 6 },
  viewNote: { fontSize: 14, marginTop: 12, lineHeight: 20 },
  closeBtn: { marginTop: 20, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  closeText: { fontSize: 15, fontWeight: '600' },
});
