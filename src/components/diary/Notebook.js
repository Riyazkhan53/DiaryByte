import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Caveat_400Regular, Caveat_700Bold, useFonts } from '@expo-google-fonts/caveat';
import { LinearGradient } from 'expo-linear-gradient';
import { MOODS } from '../../constants/theme';
import { todayKey } from '../../utils/autopay';
import { confirmDelete } from '../../utils/confirm';

// Paper and ink. The page stays paper-coloured in dark mode too, like a real notebook.
const PAPER = '#FFFDF4';
const RULE = '#BFD4EA';
const MARGIN = '#E8A0A0';
const INK = '#1E3A8A';
const INK_SOFT = '#4B5F99';
const LINE = 34; // ruled line spacing; handwriting uses it as its line height
const TOP = 64; // space above the first ruled line (date, page number)
const MARGIN_X = 46;
const useNativeDriver = Platform.OS !== 'web';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateLabel = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return y ? `${d} ${MONTHS[m - 1]} ${y}` : '';
};
// Entries are stored with full ISO times; a day label uses the phone's local date.
const localDay = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Ruled paper: a red margin and a blue line every LINE, as tall as its content. */
function RuledPaper({ children, minLines = 18 }) {
  const [height, setHeight] = useState(TOP + minLines * LINE);
  const lines = Math.max(minLines, Math.ceil((height - TOP) / LINE) + 1);
  return (
    <View style={styles.paper} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      <View style={styles.rules} pointerEvents="none">
        {Array.from({ length: lines }, (_, i) => (
          <View key={i} style={[styles.rule, { top: TOP + (i + 1) * LINE - 1 }]} />
        ))}
        <View style={styles.marginLine} />
        <View style={[styles.marginLine, styles.marginLine2]} />
      </View>
      <View style={{ minHeight: TOP + minLines * LINE }}>{children}</View>
    </View>
  );
}

/**
 * Personal diary as a notebook: a blue cover that opens onto an index of
 * every note with its date; each note is a ruled page in handwriting, written
 * and edited right on the lines; pages turn with a page-flip, by the arrows or
 * a swipe. `entries` newest first (as stored); pages run oldest first.
 */
export default function Notebook({ entries, userName, onSave, onDelete, onOpenCalendar, onPull, pulling }) {
  const [fontsLoaded] = useFonts({ Caveat_400Regular, Caveat_700Bold });
  const hand = fontsLoaded ? { fontFamily: 'Caveat_400Regular' } : { fontStyle: 'italic' };
  const handBold = fontsLoaded ? { fontFamily: 'Caveat_700Bold' } : { fontWeight: '700', fontStyle: 'italic' };

  const pages = useMemo(() => [...entries].sort((a, b) => String(a.date).localeCompare(String(b.date))), [entries]);

  const [view, setView] = useState('cover'); // 'cover' | 'index' | 'page'
  const [current, setCurrent] = useState(0); // page index; pages.length = a new page
  const [editing, setEditing] = useState(null); // { title, content, mood } while writing
  const [turning, setTurning] = useState(null); // { from, to, dir } during a page turn
  const [width, setWidth] = useState(360);
  const [{ flip, cover }] = useState(() => ({ flip: new Animated.Value(0), cover: new Animated.Value(0) }));

  // A transform that swings a page around its left edge (the spine).
  const hinge = (angle) => [
    { perspective: 1600 },
    { translateX: -width / 2 },
    { rotateY: angle },
    { translateX: width / 2 },
  ];

  // ------- cover -------
  const openBook = () => {
    setView('index');
    cover.setValue(0);
    Animated.timing(cover, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.cubic), useNativeDriver }).start();
  };
  const closeBook = () => {
    setEditing(null);
    Animated.timing(cover, { toValue: 0, duration: 550, easing: Easing.inOut(Easing.cubic), useNativeDriver }).start(
      () => setView('cover')
    );
  };

  // ------- page turns -------
  const turnTo = (to, after) => {
    if (turning || to === current || to < 0 || to > pages.length) return;
    const dir = to > current ? 'next' : 'prev';
    setTurning({ from: current, to, dir });
    flip.setValue(dir === 'next' ? 0 : 1);
    Animated.timing(flip, {
      toValue: dir === 'next' ? 1 : 0,
      duration: 520,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver,
    }).start(() => {
      setCurrent(to);
      setTurning(null);
      after?.();
    });
  };
  const openPage = (i) => {
    setEditing(null);
    setCurrent(i);
    setView('page');
  };
  const newPage = () => {
    setCurrent(pages.length);
    setEditing({ title: '', content: '', mood: null });
    setView('page');
  };

  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
        onPanResponderRelease: (_, g) => {
          if (g.dx < -60) turnTo(current + 1);
          else if (g.dx > 60) turnTo(current - 1);
        },
      }),
    // turnTo reads the latest page and state each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, turning, pages.length, width]
  );

  // ------- writing -------
  const startEdit = (entry) =>
    setEditing({ id: entry.id, title: entry.title || '', content: entry.content || '', mood: entry.mood || null });
  const saveEdit = async () => {
    if (!editing?.content.trim()) return;
    const isNew = !editing.id;
    await onSave({
      ...(isNew ? {} : pages.find((p) => p.id === editing.id)),
      id: editing.id,
      title: editing.title.trim() || 'Untitled',
      content: editing.content.trim(),
      mood: editing.mood,
    }, isNew);
    setEditing(null);
  };
  const removePage = (entry) =>
    confirmDelete('Tear out this page?', `"${entry.title}" will be deleted.`, async () => {
      await onDelete(entry.id);
      setCurrent((c) => Math.max(0, Math.min(c, pages.length - 2)));
      setEditing(null);
    });

  // ------- one page of the notebook -------
  const renderPage = (i, interactive) => {
    const entry = pages[i];
    const draft = interactive && editing && (editing.id ? editing.id === entry?.id : !entry) ? editing : null;
    const dateIso = entry ? entry.date : null;
    return (
      <ScrollView
        style={styles.pageScroll}
        contentContainerStyle={styles.pageContent}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={interactive}
      >
        <RuledPaper minLines={16}>
          <View style={styles.pageHead}>
            <Text style={[styles.pageNo, hand]}>{entry ? `Page ${i + 1}` : 'New page'}</Text>
            <View style={styles.flex} />
            {(draft ? draft.mood : entry?.mood) ? (
              <Text style={styles.moodEmoji}>{(draft ? draft.mood : entry.mood).emoji}</Text>
            ) : null}
            <Text style={[styles.pageDate, hand]}>{dateLabel(dateIso ? localDay(dateIso) : todayKey())}</Text>
          </View>
          {draft ? (
            <>
              <TextInput
                style={[styles.title, handBold, styles.input]}
                value={draft.title}
                onChangeText={(title) => setEditing((d) => ({ ...d, title }))}
                placeholder="Title"
                placeholderTextColor="#9AA8C7"
                accessibilityLabel="Page title"
              />
              <TextInput
                style={[styles.body, hand, styles.input, styles.bodyInput]}
                value={draft.content}
                onChangeText={(content) => setEditing((d) => ({ ...d, content }))}
                placeholder="Dear diary…"
                placeholderTextColor="#9AA8C7"
                multiline
                textAlignVertical="top"
                scrollEnabled={false}
                accessibilityLabel="Write your note"
              />
              <View style={styles.moodRow}>
                {MOODS.map((m) => (
                  <TouchableOpacity
                    key={m.label}
                    onPress={() => setEditing((d) => ({ ...d, mood: d.mood?.label === m.label ? null : m }))}
                    style={[styles.moodChip, draft.mood?.label === m.label && styles.moodChipOn]}
                    accessibilityLabel={`Mood ${m.label}`}
                  >
                    <Text style={styles.moodChipText}>{m.emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : entry ? (
            <>
              <Text style={[styles.title, handBold]}>{entry.title}</Text>
              <Text style={[styles.body, hand]}>{entry.content}</Text>
              {entry.imageUri ? <Image source={{ uri: entry.imageUri }} style={styles.photo} /> : null}
            </>
          ) : (
            <Text style={[styles.body, hand, styles.faint]}>Tap ✎ to write on this page.</Text>
          )}
        </RuledPaper>
      </ScrollView>
    );
  };

  // ------- index -------
  const renderIndex = () => (
    <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageContent}>
      <RuledPaper minLines={Math.max(16, pages.length + 3)}>
        <View style={styles.pageHead}>
          <Text style={[styles.indexTitle, handBold]}>Index</Text>
          <View style={styles.flex} />
          <Text style={[styles.pageDate, hand]}>
            {pages.length} {pages.length === 1 ? 'note' : 'notes'}
          </Text>
        </View>
        {pages.length === 0 ? (
          <Text style={[styles.body, hand, styles.faint]}>No notes yet. Tap “New page” to write the first one.</Text>
        ) : (
          pages.map((p, i) => (
            <TouchableOpacity
              key={p.id}
              style={styles.indexRow}
              onPress={() => openPage(i)}
              accessibilityLabel={`Open ${p.title}, ${dateLabel(localDay(p.date))}`}
            >
              <Text style={[styles.indexNo, hand]}>{i + 1}.</Text>
              <Text style={[styles.indexName, hand]} numberOfLines={1}>
                {p.mood?.emoji ? `${p.mood.emoji} ` : ''}
                {p.title}
              </Text>
              <Text style={[styles.indexDate, hand]}>{dateLabel(localDay(p.date))}</Text>
            </TouchableOpacity>
          ))
        )}
      </RuledPaper>
    </ScrollView>
  );

  // ------- the book -------
  const coverAngle = cover.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-90deg'] });
  const coverShade = cover.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] });
  const flipAngle = flip.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-90deg'] });
  const flipShade = flip.interpolate({ inputRange: [0, 1], outputRange: [0, 0.3] });

  const coverFace = (
    <TouchableOpacity activeOpacity={0.95} onPress={openBook} style={styles.flex} accessibilityLabel="Open the diary">
      <LinearGradient colors={['#1D4ED8', '#1E3A8A', '#172554']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cover}>
        <View style={styles.spine} />
        <View style={styles.stitch}>
          <View style={styles.label}>
            <Text style={[styles.labelTitle, handBold]}>My Diary</Text>
            {userName ? <Text style={[styles.labelName, hand]}>{userName}</Text> : null}
            <Text style={[styles.labelCount, hand]}>
              {pages.length} {pages.length === 1 ? 'page' : 'pages'} written
            </Text>
          </View>
          <Text style={[styles.tapHint, hand]}>Tap to open</Text>
        </View>
        <View style={styles.band} />
      </LinearGradient>
    </TouchableOpacity>
  );

  const onIndex = view === 'index';
  const atPage = view === 'page';
  const page = pages[current];

  return (
    <View style={styles.flex}>
      {/* Toolbar */}
      {view !== 'cover' ? (
        <View style={styles.toolbar}>
          {atPage ? (
            <TouchableOpacity style={styles.tool} onPress={() => { setEditing(null); setView('index'); }} accessibilityLabel="Back to index">
              <Ionicons name="list" size={20} color={INK} />
              <Text style={styles.toolText}>Index</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.tool} onPress={closeBook} accessibilityLabel="Close the diary">
              <Ionicons name="book" size={19} color={INK} />
              <Text style={styles.toolText}>Close</Text>
            </TouchableOpacity>
          )}
          <View style={styles.flex} />
          {onIndex ? (
            <>
              <TouchableOpacity style={styles.toolIcon} onPress={onOpenCalendar} accessibilityLabel="Open calendar">
                <Ionicons name="calendar-outline" size={20} color={INK} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.toolIcon} onPress={onPull} disabled={pulling} accessibilityLabel="Get notes from the server">
                {pulling ? <ActivityIndicator size="small" color={INK} /> : <Ionicons name="cloud-download-outline" size={20} color={INK} />}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.tool, styles.toolPrimary]} onPress={newPage} accessibilityLabel="New page">
                <Ionicons name="add" size={18} color="#FFF" />
                <Text style={[styles.toolText, styles.toolTextOn]}>New page</Text>
              </TouchableOpacity>
            </>
          ) : editing ? (
            <>
              <TouchableOpacity style={styles.tool} onPress={() => (page ? setEditing(null) : setView('index'))}>
                <Text style={styles.toolText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tool, styles.toolPrimary, !editing.content.trim() && styles.disabled]}
                onPress={saveEdit}
                disabled={!editing.content.trim()}
                accessibilityLabel="Save page"
              >
                <Ionicons name="checkmark" size={18} color="#FFF" />
                <Text style={[styles.toolText, styles.toolTextOn]}>Save</Text>
              </TouchableOpacity>
            </>
          ) : page ? (
            <>
              <TouchableOpacity style={styles.toolIcon} onPress={() => startEdit(page)} accessibilityLabel="Edit page">
                <Ionicons name="create-outline" size={21} color={INK} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.toolIcon} onPress={() => removePage(page)} accessibilityLabel="Delete page">
                <Ionicons name="trash-outline" size={20} color="#C0392B" />
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      ) : null}

      {/* The book */}
      <View style={styles.book} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} {...(atPage && !editing ? swipe.panHandlers : {})}>
        {/* Bottom layer */}
        <View style={StyleSheet.absoluteFill}>
          {view === 'cover' || onIndex
            ? renderIndex()
            : renderPage(turning ? (turning.dir === 'next' ? turning.to : turning.from) : current, !turning)}
        </View>

        {/* Turning page on top */}
        {turning ? (
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.backface, { transform: hinge(flipAngle) }]}
          >
            {renderPage(turning.dir === 'next' ? turning.from : turning.to, false)}
            <Animated.View style={[StyleSheet.absoluteFill, styles.shade, { opacity: flipShade }]} />
          </Animated.View>
        ) : null}

        {/* Cover, swinging open on its spine */}
        {view === 'cover' || onIndex ? (
          <Animated.View
            pointerEvents={view === 'cover' ? 'auto' : 'none'}
            style={[StyleSheet.absoluteFill, styles.backface, { transform: hinge(coverAngle) }]}
          >
            {coverFace}
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.shade, { opacity: coverShade }]} />
          </Animated.View>
        ) : null}
      </View>

      {/* Page controls */}
      {atPage && !editing ? (
        <View style={styles.pager}>
          <TouchableOpacity
            style={[styles.pagerBtn, current === 0 && styles.disabled]}
            onPress={() => turnTo(current - 1)}
            disabled={current === 0}
            accessibilityLabel="Previous page"
          >
            <Ionicons name="chevron-back" size={20} color={INK} />
          </TouchableOpacity>
          <Text style={[styles.pagerText, hand]}>
            {Math.min(current + 1, pages.length)} / {pages.length}
          </Text>
          <TouchableOpacity
            style={[styles.pagerBtn, current >= pages.length - 1 && styles.disabled]}
            onPress={() => turnTo(current + 1)}
            disabled={current >= pages.length - 1}
            accessibilityLabel="Next page"
          >
            <Ionicons name="chevron-forward" size={20} color={INK} />
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  book: { flex: 1, marginHorizontal: 4, marginBottom: 8 },
  backface: { backfaceVisibility: 'hidden' },
  shade: { backgroundColor: '#000' },

  // cover
  cover: {
    flex: 1,
    borderRadius: 14,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
    padding: 18,
    paddingLeft: 34,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  spine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 18, backgroundColor: 'rgba(0,0,0,0.25)' },
  stitch: {
    flex: 1,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(191, 219, 254, 0.55)',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    backgroundColor: '#FFFDF4',
    borderRadius: 8,
    paddingVertical: 18,
    paddingHorizontal: 28,
    alignItems: 'center',
    transform: [{ rotate: '-2deg' }],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 4,
  },
  labelTitle: { fontSize: 44, color: INK },
  labelName: { fontSize: 24, color: INK_SOFT, marginTop: 2 },
  labelCount: { fontSize: 18, color: INK_SOFT, marginTop: 6 },
  tapHint: { position: 'absolute', bottom: 24, fontSize: 22, color: 'rgba(219, 234, 254, 0.85)' },
  band: { position: 'absolute', right: 34, top: 0, bottom: 0, width: 14, backgroundColor: '#0F172A', opacity: 0.85 },

  // paper
  pageScroll: { flex: 1, borderRadius: 10 },
  pageContent: { flexGrow: 1 },
  paper: {
    flexGrow: 1,
    backgroundColor: PAPER,
    borderRadius: 10,
    paddingLeft: MARGIN_X + 10,
    paddingRight: 16,
    paddingBottom: LINE,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 5,
  },
  rules: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  rule: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: RULE },
  marginLine: { position: 'absolute', top: 0, bottom: 0, left: MARGIN_X, width: 1.5, backgroundColor: MARGIN },
  marginLine2: { left: MARGIN_X + 4 },

  pageHead: { height: TOP, flexDirection: 'row', alignItems: 'flex-end', paddingBottom: 6 },
  pageNo: { fontSize: 20, color: INK_SOFT },
  pageDate: { fontSize: 22, color: INK, marginLeft: 8 },
  moodEmoji: { fontSize: 20 },
  title: { fontSize: 30, lineHeight: LINE, color: INK, minHeight: LINE },
  body: { fontSize: 25, lineHeight: LINE, color: INK, minHeight: LINE },
  input: { padding: 0, margin: 0, borderWidth: 0, backgroundColor: 'transparent', textAlignVertical: 'top' },
  bodyInput: { minHeight: LINE * 10 },
  faint: { color: '#9AA8C7' },
  photo: { width: '90%', aspectRatio: 4 / 3, borderRadius: 6, marginTop: LINE / 2 },
  moodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  moodChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 14 },
  moodChipOn: { backgroundColor: '#DBEAFE' },
  moodChipText: { fontSize: 22 },

  // index
  indexTitle: { fontSize: 36, color: INK },
  indexRow: { height: LINE, flexDirection: 'row', alignItems: 'flex-end' },
  indexNo: { width: 30, fontSize: 22, lineHeight: LINE, color: INK_SOFT },
  indexName: { flex: 1, fontSize: 24, lineHeight: LINE, color: INK },
  indexDate: { fontSize: 20, lineHeight: LINE, color: INK_SOFT, marginLeft: 8 },

  // toolbar + pager
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingHorizontal: 4 },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: '#E8EEFB' },
  toolIcon: { padding: 8, borderRadius: 18, backgroundColor: '#E8EEFB' },
  toolPrimary: { backgroundColor: INK },
  toolText: { fontSize: 14, fontWeight: '600', color: INK },
  toolTextOn: { color: '#FFF' },
  disabled: { opacity: 0.4 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, paddingBottom: 8 },
  pagerBtn: { padding: 8, borderRadius: 20, backgroundColor: '#E8EEFB' },
  pagerText: { fontSize: 22, color: INK, minWidth: 60, textAlign: 'center' },
});
