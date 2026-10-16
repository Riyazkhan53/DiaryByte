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
  Image,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import Header from '../../components/Header';
import SyncRow from '../../components/SyncRow';
import DatePicker from '../../components/DatePicker';
import { useTheme } from '../../hooks/useTheme';
import { useSyncedCollection } from '../../hooks/useSyncedCollection';
import { formatDate, todayKey } from '../../utils/autopay';
import {
  TICKETS_STORAGE_KEY,
  TICKET_TYPES,
  ticketType,
  countdownLabel,
  sortTickets,
} from '../../utils/tickets';

const FILTERS = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'all', label: 'All' },
];

const EMPTY_FORM = {
  type: 'flight',
  title: '',
  from: '',
  to: '',
  venue: '',
  date: todayKey(),
  time: '',
  seat: '',
  bookingRef: '',
  note: '',
  image: null,
};

// Ticket photos sync to the server inside the collection, so keep them small.
const PICKER_OPTIONS = { mediaTypes: ['images'], quality: 0.5, base64: true };

function assetToUri(result) {
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  return asset.base64 ? `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}` : asset.uri;
}

export default function TicketsScreen() {
  const { theme } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const { items, synced, persist, pulling, pullInfo, pullNow } = useSyncedCollection(
    'tickets',
    TICKETS_STORAGE_KEY
  );
  const [filter, setFilter] = useState('upcoming');
  const [formVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [viewingId, setViewingId] = useState(null);
  const [linkDismissed, setLinkDismissed] = useState(false);

  // The dashboard links straight to a pass with /tickets?open=<id>.
  const { open } = useLocalSearchParams();
  const activeId = viewingId || (linkDismissed ? null : open);
  const viewing = activeId ? items.find((t) => t.id === activeId) || null : null;
  const setViewing = (ticket) => {
    setViewingId(ticket ? ticket.id : null);
    setLinkDismissed(true);
  };

  const { upcoming, past } = sortTickets(items);
  const shown = filter === 'upcoming' ? upcoming : filter === 'past' ? past : [...upcoming, ...past];
  const formType = ticketType(form.type);
  const formValid = form.title.trim() && form.date;

  const setField = (field) => (value) => setForm((prev) => ({ ...prev, [field]: value }));

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, date: todayKey() });
    setFormVisible(true);
  };

  const openEdit = (ticket) => {
    setViewing(null);
    setEditingId(ticket.id);
    setForm({ ...EMPTY_FORM, ...ticket });
    setFormVisible(true);
  };

  const saveTicket = () => {
    if (!formValid) return;
    const travel = ticketType(form.type).travel;
    const ticket = {
      type: form.type,
      title: form.title.trim(),
      from: travel ? form.from.trim() : '',
      to: travel ? form.to.trim() : '',
      venue: travel ? '' : form.venue.trim(),
      date: form.date,
      time: form.time.trim(),
      seat: form.seat.trim(),
      bookingRef: form.bookingRef.trim(),
      note: form.note.trim(),
      image: form.image,
    };
    if (editingId) {
      persist(items.map((t) => (t.id === editingId ? { ...t, ...ticket } : t)));
    } else {
      persist([{ id: Date.now().toString(), ...ticket, createdAt: new Date().toISOString() }, ...items]);
    }
    setFormVisible(false);
  };

  const deleteTicket = (ticket) => {
    Alert.alert('Delete Ticket', `Remove "${ticket.title}" from your tickets?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setViewing(null);
          persist(items.filter((t) => t.id !== ticket.id));
        },
      },
    ]);
  };

  const pickFromGallery = async () => {
    const uri = assetToUri(await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS));
    if (uri) setField('image')(uri);
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera access needed', 'Allow camera access to photograph a ticket.');
      return;
    }
    const uri = assetToUri(await ImagePicker.launchCameraAsync(PICKER_OPTIONS));
    if (uri) setField('image')(uri);
  };

  const inputStyle = [
    styles.input,
    { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text },
  ];

  const renderPass = ({ item }) => {
    const type = ticketType(item.type);
    const past = countdownLabel(item) === 'Used';
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={() => setViewing(item)}>
        <LinearGradient
          colors={type.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.pass, past && styles.passPast]}
        >
          <View style={styles.passTop}>
            <View style={styles.passType}>
              <Ionicons name={type.icon} size={16} color="#FFF" />
              <Text style={styles.passTypeText}>{type.label}</Text>
            </View>
            <View style={styles.countdown}>
              <Text style={styles.countdownText}>{countdownLabel(item)}</Text>
            </View>
          </View>

          <Text style={styles.passTitle} numberOfLines={1}>
            {item.title}
          </Text>

          {type.travel && (item.from || item.to) ? (
            <View style={styles.route}>
              <Text style={styles.routeCity} numberOfLines={1}>
                {item.from || '—'}
              </Text>
              <Ionicons name="arrow-forward" size={18} color="rgba(255,255,255,0.85)" />
              <Text style={[styles.routeCity, styles.routeTo]} numberOfLines={1}>
                {item.to || '—'}
              </Text>
            </View>
          ) : item.venue ? (
            <Text style={styles.passVenue} numberOfLines={1}>
              {item.venue}
            </Text>
          ) : null}

          <View style={styles.perforation} />

          <View style={styles.passBottom}>
            <PassField label="Date" value={formatDate(item.date)} />
            {item.time ? <PassField label="Time" value={item.time} /> : null}
            {item.seat ? <PassField label="Seat" value={item.seat} /> : null}
            {item.image ? (
              <Ionicons name="qr-code-outline" size={22} color="#FFF" style={styles.qrHint} />
            ) : null}
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  const viewingType = viewing ? ticketType(viewing.type) : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Header title="My Tickets" subtitle="All your passes in one wallet" />

      <View style={styles.content}>
        <SyncRow synced={synced} pulling={pulling} pullInfo={pullInfo} onPull={pullNow} />

        <View style={styles.filters}>
          {FILTERS.map((f) => {
            const selected = filter === f.key;
            const count = f.key === 'upcoming' ? upcoming.length : f.key === 'past' ? past.length : items.length;
            return (
              <TouchableOpacity
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: selected ? theme.secondary : theme.surface,
                    borderColor: selected ? theme.secondary : theme.borderNeutral,
                  },
                ]}
              >
                <Text style={[styles.filterText, { color: selected ? '#FFF' : theme.textSecondary }]}>
                  {f.label} · {count}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <FlatList
          data={shown}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={renderPass}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="ticket-outline" size={56} color={theme.textMuted} />
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                {filter === 'past'
                  ? 'No past tickets yet.'
                  : 'No tickets yet. Tap + to save a flight, train, bus, movie or event ticket.'}
              </Text>
            </View>
          }
        />
      </View>

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.secondary, shadowColor: theme.secondary }]}
        onPress={openAdd}
        activeOpacity={0.8}
        accessibilityLabel="Add ticket"
      >
        <Ionicons name="add" size={32} color="#FFF" />
      </TouchableOpacity>

      {/* Full-screen pass, for showing at the gate */}
      <Modal
        visible={!!viewing}
        animationType="slide"
        onRequestClose={() => setViewing(null)}
      >
        {viewing && (
          <SafeAreaView style={[styles.viewer, { backgroundColor: theme.background }]}>
            <LinearGradient colors={viewingType.gradient} style={styles.viewerHeader}>
              <View style={styles.viewerTopRow}>
                <TouchableOpacity onPress={() => setViewing(null)} style={styles.iconBtn} accessibilityLabel="Close">
                  <Ionicons name="close" size={26} color="#FFF" />
                </TouchableOpacity>
                <View style={styles.viewerActions}>
                  <TouchableOpacity onPress={() => openEdit(viewing)} style={styles.iconBtn} accessibilityLabel="Edit ticket">
                    <Ionicons name="create-outline" size={22} color="#FFF" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteTicket(viewing)} style={styles.iconBtn} accessibilityLabel="Delete ticket">
                    <Ionicons name="trash-outline" size={22} color="#FFF" />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.passType}>
                <Ionicons name={viewingType.icon} size={16} color="#FFF" />
                <Text style={styles.passTypeText}>
                  {viewingType.label} · {countdownLabel(viewing)}
                </Text>
              </View>
              <Text style={styles.viewerTitle}>{viewing.title}</Text>
              {viewingType.travel && (viewing.from || viewing.to) ? (
                <View style={styles.route}>
                  <Text style={styles.routeCity}>{viewing.from || '—'}</Text>
                  <Ionicons name="arrow-forward" size={18} color="rgba(255,255,255,0.85)" />
                  <Text style={[styles.routeCity, styles.routeTo]}>{viewing.to || '—'}</Text>
                </View>
              ) : viewing.venue ? (
                <Text style={styles.passVenue}>{viewing.venue}</Text>
              ) : null}
            </LinearGradient>

            <ScrollView contentContainerStyle={styles.viewerBody}>
              <View style={[styles.detailGrid, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Detail label="Date" value={formatDate(viewing.date)} theme={theme} />
                <Detail label="Time" value={viewing.time} theme={theme} />
                <Detail label="Seat" value={viewing.seat} theme={theme} />
                <Detail label="Booking ref / PNR" value={viewing.bookingRef} theme={theme} selectable />
              </View>

              {viewing.image ? (
                <View style={[styles.ticketImageWrap, { borderColor: theme.border }]}>
                  <Image
                    source={{ uri: viewing.image }}
                    style={[styles.ticketImage, { height: windowHeight * 0.6 }]}
                    resizeMode="contain"
                    accessibilityLabel={`Ticket for ${viewing.title}`}
                  />
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.noImage, { borderColor: theme.borderNeutral }]}
                  onPress={() => openEdit(viewing)}
                >
                  <Ionicons name="image-outline" size={28} color={theme.textMuted} />
                  <Text style={[styles.noImageText, { color: theme.textMuted }]}>
                    No ticket image. Tap to add a screenshot or photo.
                  </Text>
                </TouchableOpacity>
              )}

              {viewing.note ? (
                <Text style={[styles.viewerNote, { color: theme.textSecondary }]}>{viewing.note}</Text>
              ) : null}
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>

      {/* Add / edit form */}
      <Modal visible={formVisible} transparent animationType="fade" onRequestClose={() => setFormVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.surface }]}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {editingId ? 'Edit Ticket' : 'Add Ticket'}
              </Text>

              <View style={styles.typeRow}>
                {TICKET_TYPES.map((t) => {
                  const selected = form.type === t.key;
                  return (
                    <TouchableOpacity
                      key={t.key}
                      onPress={() => setField('type')(t.key)}
                      style={[
                        styles.typeChip,
                        {
                          backgroundColor: selected ? t.gradient[0] : theme.surfaceAlt,
                          borderColor: selected ? t.gradient[0] : theme.borderNeutral,
                        },
                      ]}
                    >
                      <Ionicons name={t.icon} size={14} color={selected ? '#FFF' : theme.textSecondary} />
                      <Text style={[styles.typeChipText, { color: selected ? '#FFF' : theme.textSecondary }]}>
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TextInput
                style={inputStyle}
                placeholder={formType.travel ? 'Title (e.g. IndiGo 6E 512, Chennai Express)' : 'Title (e.g. Leo – IMAX, AR Rahman Live)'}
                placeholderTextColor={theme.textMuted}
                value={form.title}
                onChangeText={setField('title')}
              />

              {formType.travel ? (
                <View style={styles.row}>
                  <TextInput
                    style={[inputStyle, styles.half]}
                    placeholder="From"
                    placeholderTextColor={theme.textMuted}
                    value={form.from}
                    onChangeText={setField('from')}
                  />
                  <TextInput
                    style={[inputStyle, styles.half]}
                    placeholder="To"
                    placeholderTextColor={theme.textMuted}
                    value={form.to}
                    onChangeText={setField('to')}
                  />
                </View>
              ) : (
                <TextInput
                  style={inputStyle}
                  placeholder="Venue (e.g. PVR Phoenix, Screen 4)"
                  placeholderTextColor={theme.textMuted}
                  value={form.venue}
                  onChangeText={setField('venue')}
                />
              )}

              <Text style={[styles.label, { color: theme.textSecondary }]}>Date</Text>
              <DatePicker value={form.date} onChange={setField('date')} />

              <View style={[styles.row, styles.afterPicker]}>
                <TextInput
                  style={[inputStyle, styles.half]}
                  placeholder="Time (e.g. 18:30)"
                  placeholderTextColor={theme.textMuted}
                  value={form.time}
                  onChangeText={setField('time')}
                />
                <TextInput
                  style={[inputStyle, styles.half]}
                  placeholder="Seat (e.g. 12A, H14)"
                  placeholderTextColor={theme.textMuted}
                  value={form.seat}
                  onChangeText={setField('seat')}
                />
              </View>
              <TextInput
                style={inputStyle}
                placeholder="Booking ref / PNR (optional)"
                placeholderTextColor={theme.textMuted}
                autoCapitalize="characters"
                value={form.bookingRef}
                onChangeText={setField('bookingRef')}
              />
              <TextInput
                style={[inputStyle, styles.noteInput]}
                placeholder="Note (optional)"
                placeholderTextColor={theme.textMuted}
                value={form.note}
                onChangeText={setField('note')}
                multiline
              />

              <Text style={[styles.label, { color: theme.textSecondary }]}>Ticket image (QR / barcode)</Text>
              {form.image ? (
                <View style={styles.previewWrap}>
                  <Image source={{ uri: form.image }} style={styles.preview} resizeMode="contain" />
                  <TouchableOpacity
                    style={styles.removeImage}
                    onPress={() => setField('image')(null)}
                    accessibilityLabel="Remove ticket image"
                  >
                    <Ionicons name="close-circle" size={26} color={theme.danger} />
                  </TouchableOpacity>
                </View>
              ) : null}
              <View style={styles.row}>
                <TouchableOpacity
                  style={[styles.imageBtn, styles.half, { borderColor: theme.borderNeutral, backgroundColor: theme.surfaceAlt }]}
                  onPress={pickFromGallery}
                >
                  <Ionicons name="images-outline" size={18} color={theme.textSecondary} />
                  <Text style={[styles.imageBtnText, { color: theme.textSecondary }]}>
                    {form.image ? 'Replace' : 'Screenshot'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.imageBtn, styles.half, { borderColor: theme.borderNeutral, backgroundColor: theme.surfaceAlt }]}
                  onPress={takePhoto}
                >
                  <Ionicons name="camera-outline" size={18} color={theme.textSecondary} />
                  <Text style={[styles.imageBtnText, { color: theme.textSecondary }]}>Camera</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { backgroundColor: theme.surfaceAlt }]}
                  onPress={() => setFormVisible(false)}
                >
                  <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: theme.primary }, !formValid && styles.btnDisabled]}
                  onPress={saveTicket}
                  disabled={!formValid}
                >
                  <Text style={[styles.saveText, { color: theme.text }]}>
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

function PassField({ label, value }) {
  return (
    <View style={styles.passField}>
      <Text style={styles.passFieldLabel}>{label}</Text>
      <Text style={styles.passFieldValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Detail({ label, value, theme, selectable }) {
  if (!value) return null;
  return (
    <View style={styles.detail}>
      <Text style={[styles.detailLabel, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: theme.text }]} selectable={selectable}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  list: { paddingBottom: 90 },
  filters: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  filterText: { fontSize: 13, fontWeight: '600' },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyText: { marginTop: 12, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },

  pass: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 5,
  },
  passPast: { opacity: 0.55 },
  passTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  passType: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  passTypeText: { color: '#FFF', fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  countdown: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  countdownText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  passTitle: { color: '#FFF', fontSize: 21, fontWeight: '800', marginTop: 12 },
  passVenue: { color: 'rgba(255,255,255,0.9)', fontSize: 14, marginTop: 4 },
  route: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  routeCity: { flexShrink: 1, color: '#FFF', fontSize: 17, fontWeight: '700' },
  routeTo: { textAlign: 'right' },
  perforation: {
    borderBottomWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.45)',
    marginVertical: 14,
  },
  passBottom: { flexDirection: 'row', alignItems: 'flex-end', gap: 22 },
  passField: { flexShrink: 1 },
  passFieldLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  passFieldValue: { color: '#FFF', fontSize: 14, fontWeight: '700', marginTop: 2 },
  qrHint: { marginLeft: 'auto' },

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

  viewer: { flex: 1 },
  viewerHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 22,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  viewerTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  viewerActions: { flexDirection: 'row', gap: 4 },
  iconBtn: { padding: 6 },
  viewerTitle: { color: '#FFF', fontSize: 24, fontWeight: '800', marginTop: 8 },
  viewerBody: { padding: 16, paddingBottom: 40 },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    rowGap: 12,
    marginBottom: 14,
  },
  detail: { width: '50%', paddingRight: 8 },
  detailLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  detailValue: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  ticketImageWrap: {
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: '#FFF',
    overflow: 'hidden',
  },
  ticketImage: { width: '100%' },
  noImage: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 28,
    gap: 8,
  },
  noImageText: { fontSize: 13, textAlign: 'center' },
  viewerNote: { fontSize: 14, lineHeight: 20, marginTop: 14 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modal: { borderRadius: 20, padding: 20, maxHeight: '92%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 14 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
  },
  typeChipText: { fontSize: 13, fontWeight: '600' },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 13,
    fontSize: 15,
    marginBottom: 10,
  },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1, minWidth: 0 },
  afterPicker: { marginTop: 10 },
  noteInput: { minHeight: 60, textAlignVertical: 'top' },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 2 },
  previewWrap: { marginBottom: 10 },
  preview: { width: '100%', height: 180, borderRadius: 12, backgroundColor: '#FFF' },
  removeImage: { position: 'absolute', top: 6, right: 6 },
  imageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 6,
  },
  imageBtnText: { fontSize: 14, fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600' },
  saveBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
});
