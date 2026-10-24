import { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Header from '../../components/Header';
import SyncRow from '../../components/SyncRow';
import { useTheme } from '../../hooks/useTheme';
import { useSyncedCollection } from '../../hooks/useSyncedCollection';

const STORAGE_KEY = '@diarybyte_todo';
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default function TodoScreen() {
  const { theme } = useTheme();
  const { items, synced, persist, pulling, pullInfo, pullNow } = useSyncedCollection(
    'todo',
    STORAGE_KEY
  );
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [hideDone, setHideDone] = useState(true);

  // Auto-delete completed tasks one week after they were completed.
  const cleanedRef = useRef(false);
  useEffect(() => {
    if (cleanedRef.current) return;
    const now = Date.now();
    const hasStale = items.some(
      (i) => i.done && i.completedAt && now - new Date(i.completedAt).getTime() > ONE_WEEK_MS
    );
    if (!hasStale) return;
    cleanedRef.current = true;
    persist(
      items.filter(
        (i) => !(i.done && i.completedAt && now - new Date(i.completedAt).getTime() > ONE_WEEK_MS)
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const openAdd = () => {
    setTitle('');
    setNote('');
    setModalVisible(true);
  };

  const addItem = () => {
    if (!title.trim()) return;
    persist([
      {
        id: `${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`,
        title: title.trim(),
        note: note.trim(),
        done: false,
        createdAt: new Date().toISOString(),
      },
      ...items,
    ]);
    setTitle('');
    setNote('');
    setModalVisible(false);
  };

  const toggleDone = (item) => {
    persist(
      items.map((i) =>
        i.id === item.id
          ? {
              ...i,
              done: !i.done,
              completedAt: !i.done ? new Date().toISOString() : null,
            }
          : i
      )
    );
  };

  const deleteItem = (id) => {
    persist(items.filter((i) => i.id !== id));
  };

  const clearCompleted = () => {
    const doneCount = items.filter((i) => i.done).length;
    if (doneCount === 0) return;
    Alert.alert('Clear Completed', `Remove ${doneCount} completed task${doneCount === 1 ? '' : 's'}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => persist(items.filter((i) => !i.done)),
      },
    ]);
  };

  const doneCount = items.filter((i) => i.done).length;
  const pendingCount = items.length - doneCount;
  const visible = hideDone ? items.filter((i) => !i.done) : items;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
      <Header
        title="To-Do List"
        subtitle={`Stay on top of your day · ${pendingCount} ${pendingCount === 1 ? 'task' : 'tasks'} pending`}
      />

      <View style={styles.content}>
        <SyncRow synced={synced} pulling={pulling} pullInfo={pullInfo} onPull={pullNow} />

        <View style={styles.statsRow}>
          <View style={[styles.pill, { backgroundColor: theme.surface, borderColor: theme.borderNeutral }]}>
            <Text style={[styles.pillText, { color: theme.text }]}>
              {doneCount} of {items.length} done
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.pill,
              styles.hidePill,
              {
                backgroundColor: hideDone ? theme.secondary : theme.surface,
                borderColor: hideDone ? theme.secondary : theme.borderNeutral,
              },
            ]}
            onPress={() => setHideDone((v) => !v)}
          >
            <Ionicons
              name={hideDone ? 'eye-off-outline' : 'eye-outline'}
              size={14}
              color={theme.text}
              style={{ marginRight: 5 }}
            />
            <Text style={[styles.pillText, { color: theme.text }]}>
              {hideDone ? `Pending (${pendingCount})` : `All (${items.length})`}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.clearBtn} onPress={clearCompleted} disabled={doneCount === 0}>
            <Ionicons
              name="trash-outline"
              size={16}
              color={doneCount === 0 ? theme.borderNeutral : theme.danger}
            />
          </TouchableOpacity>
        </View>

        {doneCount > 0 ? (
          <Text style={[styles.autoDeleteHint, { color: theme.textMuted }]}>
            Completed tasks are removed automatically after 1 week.
          </Text>
        ) : null}

        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="checkmark-done-outline" size={56} color={theme.textMuted} />
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                Nothing to do yet. Tap + to add a task.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.surface,
                  borderColor: item.done ? theme.primary : theme.border,
                  shadowColor: theme.shadow,
                },
              ]}
            >
              <TouchableOpacity style={styles.checkBtn} onPress={() => toggleDone(item)}>
                <Ionicons
                  name={item.done ? 'checkmark-circle' : 'ellipse-outline'}
                  size={26}
                  color={item.done ? theme.primaryDark : theme.textMuted}
                />
              </TouchableOpacity>
              <View style={styles.body}>
                <Text
                  style={[
                    styles.title,
                    { color: theme.text },
                    item.done && styles.titleDone,
                  ]}
                  numberOfLines={2}
                >
                  {item.title}
                </Text>
                {item.note ? (
                  <Text style={[styles.note, { color: theme.textSecondary }]} numberOfLines={2}>
                    {item.note}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteItem(item.id)}>
                <Ionicons name="trash-outline" size={19} color={theme.danger} />
              </TouchableOpacity>
            </View>
          )}
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
            <Text style={[styles.modalTitle, { color: theme.text }]}>Add Task</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
              placeholder="What needs to be done?"
              placeholderTextColor={theme.textMuted}
              value={title}
              onChangeText={setTitle}
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
                style={[styles.saveBtn, { backgroundColor: theme.primary }]}
                onPress={addItem}
                disabled={!title.trim()}
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
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  autoDeleteHint: { fontSize: 11, marginBottom: 12, marginLeft: 2 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  pillText: { fontSize: 12, fontWeight: '600' },
  hidePill: { marginLeft: 'auto' },
  clearBtn: { padding: 6, marginLeft: 4 },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyText: { marginTop: 12, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
  card: {
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
  checkBtn: { marginRight: 12 },
  body: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600' },
  titleDone: { textDecorationLine: 'line-through', opacity: 0.55 },
  note: { fontSize: 12, marginTop: 3 },
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
  noteInput: { minHeight: 80, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600' },
  saveBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '600' },
});
