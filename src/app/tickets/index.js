import { useEffect, useRef, useState } from 'react';
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
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { isSupported as tripAlarmSupported, readTripAlarm } from '../../services/tripAlarm';
import { formatDistance } from '../../utils/tripAlarm';
import { useShareIntentContext } from 'expo-share-intent';
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
  isUpcoming,
  sortTickets,
} from '../../utils/tickets';
import { linkLabel, parseBookingText } from '../../utils/ticketShare';
import { quickFieldsFromShare, shrinkTicketImage } from '../../services/sharedTicket';
import { readTicketWithAi } from '../../services/api';
import { isGuest } from '../../services/session';
import { confirmDelete } from '../../utils/confirm';

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
  link: '',
  note: '',
  image: null,
};

// Ticket photos sync to the server inside the collection, so every image is
// shrunk (shrinkTicketImage) before it is kept. No base64 from the picker:
// a full-size photo as text is several MB and froze the app.
const PICKER_OPTIONS = { mediaTypes: ['images'], quality: 1 };
// Images saved before shrinking existed can be MBs; shrink those too.
const BIG_IMAGE_CHARS = 700000;

const pickedAsset = (result) => (result.canceled || !result.assets?.length ? null : result.assets[0]);

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
  // AI ticket reading: { busy, message, error }
  const [reading, setReading] = useState(null);
  // Values filled in automatically (pasted, shared, AI): later reads may replace
  // these, but never something you typed yourself.
  const autoRef = useRef({});

  // The dashboard links straight to a pass with /tickets?open=<id>.
  const { open } = useLocalSearchParams();
  const activeId = viewingId || (linkDismissed ? null : open);
  const viewing = activeId ? items.find((t) => t.id === activeId) || null : null;

  // Something shared from another app (BookMyShow, an airline, a screenshot):
  // open the form pre-filled so it can be checked and saved.
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();

  // Fill the form with found fields, leaving anything you've changed alone.
  const applyFound = (fields) => {
    setForm((prev) => {
      const next = { ...prev };
      Object.entries(fields).forEach(([k, v]) => {
        if (!v) return;
        const untouched =
          !prev[k] || prev[k] === autoRef.current[k] || (k === 'date' && prev.date === todayKey()) || (k === 'type' && prev.type === EMPTY_FORM.type);
        if (untouched) next[k] = v;
      });
      autoRef.current = { ...autoRef.current, ...fields };
      return next;
    });
  };

  // Ask the server's AI to read the ticket (message and/or image).
  const readWithAi = async ({ text, image }) => {
    if (isGuest() || (!text && !image)) return;
    setReading({ busy: true, message: 'Reading your ticket with AI…' });
    try {
      const res = await readTicketWithAi({ text, image, today: todayKey() });
      if (!res.found) {
        setReading({ busy: false, error: true, message: "That doesn't look like a ticket. Fill it in by hand." });
        return;
      }
      applyFound(res.fields);
      setReading({ busy: false, message: 'Filled from your ticket. Check the details before saving.' });
    } catch (e) {
      setReading({
        busy: false,
        error: true,
        message:
          e?.status === 404
            ? 'AI reading needs a server update (redeploy it on Render).'
            : e?.serverMessage || "Couldn't read it with AI right now. Check the details by hand.",
      });
    }
  };

  // Something shared from another app (BookMyShow, AbhiBus, an airline, a
  // screenshot): open the form at once with what the message shows, then
  // shrink the image and let the AI fill in the rest.
  useEffect(() => {
    if (!hasShareIntent) return;
    const shared = shareIntent;
    // Just after this render (not inside the effect itself).
    Promise.resolve().then(async () => {
      const { fields, text, file } = quickFieldsFromShare(shared);
      autoRef.current = fields;
      setViewingId(null);
      setLinkDismissed(true);
      setEditingId(null);
      setReading(null);
      setForm({ ...EMPTY_FORM, date: todayKey(), ...fields });
      setFormVisible(true);
      resetShareIntent();
      let image = null;
      if (file) {
        setReading({ busy: true, message: 'Preparing the screenshot…' });
        try {
          image = await shrinkTicketImage(file.path, file.width);
          setForm((prev) => ({ ...prev, image }));
        } catch {
          // Unreadable image: keep the rest of the ticket.
        }
      }
      if (text || image) await readWithAi({ text, image });
      else setReading(null);
    });
    // Runs once per share; shareIntent and resetShareIntent change with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasShareIntent]);

  // Tickets saved earlier with full-size images make every save slow: shrink them once.
  const shrinkingOld = useRef(false);
  useEffect(() => {
    const big = items.filter((t) => typeof t.image === 'string' && t.image.length > BIG_IMAGE_CHARS);
    if (!big.length || shrinkingOld.current) return;
    shrinkingOld.current = true;
    (async () => {
      const smaller = {};
      for (const t of big) {
        try {
          smaller[t.id] = await shrinkTicketImage(t.image);
        } catch {
          // Leave it as it is.
        }
      }
      if (Object.keys(smaller).length) persist(items.map((t) => (smaller[t.id] ? { ...t, image: smaller[t.id] } : t)));
    })();
  }, [items, persist]);

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
    autoRef.current = {};
    setReading(null);
    setEditingId(null);
    setForm({ ...EMPTY_FORM, date: todayKey() });
    setFormVisible(true);
  };

  const openEdit = (ticket) => {
    autoRef.current = {};
    setReading(null);
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
      link: (form.link || '').trim(),
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

  // Done with it (trip taken, show watched): move it to Past now.
  const toggleCompleted = (ticket) => {
    const completed = !ticket.completed;
    const next = { ...ticket, completed, completedAt: completed ? new Date().toISOString() : undefined };
    persist(items.map((t) => (t.id === ticket.id ? next : t)));
    setViewing(next);
  };

  const deleteTicket = (ticket) => {
    confirmDelete('Delete ticket', `Remove "${ticket.title}" from your tickets?`, () => {
      setViewing(null);
      persist(items.filter((t) => t.id !== ticket.id));
    });
  };

  // Fill the form from a booking message copied from SMS, email or WhatsApp.
  const pasteBookingMessage = async () => {
    const text = await Clipboard.getStringAsync();
    const fields = text ? parseBookingText(text) : {};
    const aiCanTry = !isGuest() && (text || '').trim().length >= 20;
    if (!fields.title && !fields.date && !fields.bookingRef && !fields.link && !aiCanTry) {
      Alert.alert(
        'Nothing to fill',
        'Copy the booking message first (from BookMyShow, SMS, email or WhatsApp), then tap Paste again.'
      );
      return;
    }
    applyFound(fields);
    // The AI reads the same message more accurately.
    readWithAi({ text: text.slice(0, 6000) });
  };

  // On phones this opens the booking app (e.g. BookMyShow) when it's installed.
  const openLink = async (url) => {
    if (Platform.OS === 'web') {
      window.open(url, '_blank', 'noopener');
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Could not open link', url);
    }
  };

  // Keep a small copy of the picked image; for a new ticket, read it with AI.
  const takeImage = async (asset) => {
    if (!asset) return;
    setReading({ busy: true, message: 'Preparing the image…' });
    let image;
    try {
      image = await shrinkTicketImage(asset.uri, asset.width);
    } catch {
      setReading({ busy: false, error: true, message: "Couldn't open that image. Try another screenshot." });
      return;
    }
    setField('image')(image);
    if (!form.title.trim() || !editingId) await readWithAi({ image, text: '' });
    else setReading(null);
  };

  const pickFromGallery = async () => {
    takeImage(pickedAsset(await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS)));
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera access needed', 'Allow camera access to photograph a ticket.');
      return;
    }
    takeImage(pickedAsset(await ImagePicker.launchCameraAsync(PICKER_OPTIONS)));
  };

  const inputStyle = [
    styles.input,
    { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text },
  ];

  const renderPass = ({ item }) => {
    const type = ticketType(item.type);
    const past = !isUpcoming(item);
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
            {item.image || item.link ? (
              <View style={styles.qrHint}>
                {item.link ? <Ionicons name="link" size={20} color="#FFF" /> : null}
                {item.image ? <Ionicons name="qr-code-outline" size={22} color="#FFF" /> : null}
              </View>
            ) : null}
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  const viewingType = viewing ? ticketType(viewing.type) : null;

  // The trip alarm's status for the card above the list.
  const [tripAlarm, setTripAlarm] = useState(null);
  useEffect(() => {
    if (!tripAlarmSupported) return undefined;
    const load = () => readTripAlarm().then(setTripAlarm);
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, []);
  const tripOn = tripAlarm && (tripAlarm.status === 'active' || tripAlarm.status === 'ringing');

  const openAlarm = (to) => {
    setViewing(null);
    router.push(to ? { pathname: '/tickets/alarm', params: { to } } : '/tickets/alarm');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
      <Header title="My Tickets" subtitle="All your passes in one wallet" />

      <View style={styles.content}>
        <SyncRow synced={synced} pulling={pulling} pullInfo={pullInfo} onPull={pullNow} />

        <TouchableOpacity onPress={() => openAlarm()} activeOpacity={0.85} accessibilityLabel="Open trip alarm">
          <LinearGradient
            colors={tripAlarm?.status === 'ringing' ? ['#E5383B', '#FF6A3D'] : ['#5E5CE6', '#8C9BFF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.alarmCard}
          >
            <Ionicons name={tripOn ? 'alarm' : 'alarm-outline'} size={20} color="#FFF" />
            <View style={styles.alarmBody}>
              <Text style={styles.alarmTitle}>{tripOn ? `Trip alarm on · ${tripAlarm.name}` : 'Trip alarm'}</Text>
              <Text style={styles.alarmSub} numberOfLines={1}>
                {tripOn
                  ? `${formatDistance(tripAlarm.lastDistanceKm)} to go · rings at ${formatDistance(tripAlarm.radiusKm)}`
                  : 'Wake me when I’m near my stop'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#FFF" />
          </LinearGradient>
        </TouchableOpacity>

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
          <SafeAreaView style={[styles.viewer, { backgroundColor: 'transparent' }]}>
            <LinearGradient colors={viewingType.gradient} style={styles.viewerHeader}>
              <View style={styles.viewerTopRow}>
                <TouchableOpacity onPress={() => setViewing(null)} style={styles.iconBtn} accessibilityLabel="Close">
                  <Ionicons name="close" size={26} color="#FFF" />
                </TouchableOpacity>
                <View style={styles.viewerActions}>
                  <TouchableOpacity
                    onPress={() => toggleCompleted(viewing)}
                    style={styles.doneBtn}
                    accessibilityLabel={viewing.completed ? 'Move back to upcoming' : 'Mark ticket completed'}
                  >
                    <Ionicons name={viewing.completed ? 'arrow-undo' : 'checkmark-done'} size={18} color="#FFF" />
                    <Text style={styles.doneText}>{viewing.completed ? 'Not done' : 'Completed'}</Text>
                  </TouchableOpacity>
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
              {viewingType.travel && viewing.to && !viewing.completed ? (
                <TouchableOpacity
                  style={styles.wakeBtn}
                  onPress={() => openAlarm(viewing.to)}
                  accessibilityLabel={`Wake me before ${viewing.to}`}
                >
                  <Ionicons name="alarm-outline" size={16} color="#FFF" />
                  <Text style={styles.wakeText}>Wake me before {viewing.to}</Text>
                </TouchableOpacity>
              ) : null}
            </LinearGradient>

            <ScrollView contentContainerStyle={styles.viewerBody}>
              <View style={[styles.detailGrid, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Detail label="Date" value={formatDate(viewing.date)} theme={theme} />
                <Detail label="Time" value={viewing.time} theme={theme} />
                <Detail label="Seat" value={viewing.seat} theme={theme} />
                <Detail label="Booking ref / PNR" value={viewing.bookingRef} theme={theme} selectable />
              </View>

              {viewing.link ? (
                <TouchableOpacity
                  style={[styles.openLinkBtn, { backgroundColor: viewingType.gradient[1] }]}
                  onPress={() => openLink(viewing.link)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="open-outline" size={18} color="#FFF" />
                  <Text style={styles.openLinkText}>{linkLabel(viewing.link)}</Text>
                </TouchableOpacity>
              ) : null}

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
          <View style={[styles.modal, { backgroundColor: theme.sheet }]}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {editingId ? 'Edit Ticket' : 'Add Ticket'}
              </Text>

              <TouchableOpacity
                style={[styles.pasteBtn, { borderColor: theme.secondary }]}
                onPress={pasteBookingMessage}
                accessibilityLabel="Fill from a copied booking message"
              >
                <Ionicons name="clipboard-outline" size={18} color={theme.secondary} />
                <Text style={[styles.pasteText, { color: theme.secondary }]}>Paste booking message</Text>
              </TouchableOpacity>

              {reading ? (
                <View style={[styles.readingBox, { backgroundColor: reading.error ? '#E5383B18' : '#7C3AED18' }]}>
                  {reading.busy ? <ActivityIndicator size="small" color="#7C3AED" /> : <Ionicons name={reading.error ? 'alert-circle-outline' : 'sparkles'} size={16} color={reading.error ? '#E5383B' : '#7C3AED'} />}
                  <Text style={[styles.readingText, { color: theme.text }]}>{reading.message}</Text>
                </View>
              ) : null}
              {!isGuest() && (form.image || form.note.trim()) && !reading?.busy ? (
                <TouchableOpacity
                  style={[styles.pasteBtn, { borderColor: '#7C3AED' }]}
                  onPress={() => readWithAi({ image: form.image, text: form.note })}
                  accessibilityLabel="Fill details with AI"
                >
                  <Ionicons name="sparkles" size={18} color="#7C3AED" />
                  <Text style={[styles.pasteText, { color: '#7C3AED' }]}>Fill details with AI</Text>
                </TouchableOpacity>
              ) : null}

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
                style={inputStyle}
                placeholder="Ticket link (e.g. from BookMyShow, optional)"
                placeholderTextColor={theme.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                value={form.link}
                onChangeText={setField('link')}
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
  qrHint: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8 },

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
  viewerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
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
  openLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 14,
  },
  openLinkText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  pasteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 11,
    marginBottom: 14,
  },
  pasteText: { fontSize: 14, fontWeight: '700' },
  readingBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 10, marginBottom: 12 },
  readingText: { flex: 1, fontSize: 13, lineHeight: 18 },
  doneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 4,
  },
  doneText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  alarmCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12 },
  alarmBody: { flex: 1 },
  alarmTitle: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  alarmSub: { color: '#FFFFFFD9', fontSize: 12, marginTop: 1 },
  wakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 12,
  },
  wakeText: { color: '#FFF', fontSize: 13, fontWeight: '700' },

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
