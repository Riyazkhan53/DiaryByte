import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Header from '../../components/Header';
import { useTheme } from '../../hooks/useTheme';
import { fetchIpoNews, fetchIpoReview, fetchIpos } from '../../services/api';
import HScroll from '../../components/HScroll';

// Saved on this device (IndexedDB on the web), so the screen opens instantly.
const LIST_KEY = '@diarybyte_ipos';
const REVIEWS_KEY = '@diarybyte_ipo_reviews';
const MAX_SAVED_REVIEWS = 40;
const readJson = async (key) => {
  try {
    return JSON.parse((await AsyncStorage.getItem(key)) || 'null');
  } catch {
    return null;
  }
};
const writeJson = (key, value) => AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});
const reviewKey = (name) => String(name || '').trim().toLowerCase();

async function saveReview(name, data) {
  const all = (await readJson(REVIEWS_KEY)) || {};
  all[reviewKey(name)] = { ...data, savedAt: new Date().toISOString() };
  const keep = Object.entries(all)
    .sort((a, b) => String(b[1].savedAt).localeCompare(String(a[1].savedAt)))
    .slice(0, MAX_SAVED_REVIEWS);
  await writeJson(REVIEWS_KEY, Object.fromEntries(keep));
}

const GREEN = '#2DA44E';
const RED = '#E5383B';
const AMBER = '#F59E0B';

const SECTIONS = [
  { key: 'open', title: 'Open now', icon: 'flash', color: GREEN },
  { key: 'upcoming', title: 'Upcoming', icon: 'calendar', color: '#5C6BC0' },
  { key: 'closed', title: 'Bidding closed · awaiting listing', icon: 'hourglass', color: AMBER },
  { key: 'listed', title: 'Listed recently', icon: 'trending-up', color: '#AF52DE' },
];

// Which IPOs to show. Default: the ones you can still apply for.
const STATUS_FILTERS = [
  { key: 'current', label: 'Open & upcoming', statuses: ['open', 'upcoming'] },
  { key: 'closed', label: 'Closed', statuses: ['closed'] },
  { key: 'listed', label: 'Listed', statuses: ['listed'] },
  { key: 'all', label: 'All', statuses: ['open', 'upcoming', 'closed', 'listed'] },
];
const BOARD_FILTERS = [
  { key: 'all', label: 'All boards' },
  { key: 'mainboard', label: 'Mainboard' },
  { key: 'sme', label: 'SME' },
];

function FilterChips({ options, value, onChange, counts, theme }) {
  return (
    <HScroll contentContainerStyle={styles.chips}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <TouchableOpacity
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`Show ${o.label}`}
            style={[styles.filterChip, { backgroundColor: on ? GREEN : theme.surface, borderColor: on ? GREEN : theme.border }]}
          >
            <Text style={[styles.filterText, { color: on ? '#fff' : theme.text }]}>
              {o.label}
              {counts && counts[o.key] != null ? ` · ${counts[o.key]}` : ''}
            </Text>
          </TouchableOpacity>
        );
      })}
    </HScroll>
  );
}

const VERDICT = {
  APPLY: { color: GREEN, icon: 'checkmark-circle', label: 'Apply' },
  NEUTRAL: { color: AMBER, icon: 'remove-circle', label: 'Neutral' },
  AVOID: { color: RED, icon: 'close-circle', label: 'Avoid' },
};

const inr = (n) => (n == null ? '—' : `₹${Math.round(n).toLocaleString('en-IN')}`);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (key) => {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  return `${Number(key.slice(8))} ${MONTHS[Number(key.slice(5, 7)) - 1]}`;
};
const ago = (iso, now) => {
  if (!iso || !now) return '';
  const mins = Math.round((now - Date.parse(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} days ago`;
};
const scoreColor = (s) => (s >= 70 ? GREEN : s >= 45 ? AMBER : RED);
const errorText = (e) =>
  e?.status === 'guest'
    ? 'Sign in to use IPO Watch. It needs the server.'
    : e?.status === 404
      ? 'The server needs updating first (redeploy it on Render).'
      : e?.serverMessage || "Couldn't reach the server. Try again.";

function datesLine(ipo) {
  const open = shortDate(ipo.openDate);
  const close = shortDate(ipo.closeDate);
  const list = shortDate(ipo.listingDate);
  const parts = [];
  if (open || close) parts.push(`Bids ${open || '?'} – ${close || '?'}`);
  if (list) parts.push(`${ipo.status === 'listed' ? 'Listed' : 'Lists'} ${list}`);
  return parts.join(' · ') || 'Dates not announced';
}

function priceLine(ipo) {
  const band =
    ipo.priceHigh == null ? 'Price band not out yet' : ipo.priceLow && ipo.priceLow !== ipo.priceHigh ? `₹${ipo.priceLow}–${ipo.priceHigh}` : `₹${ipo.priceHigh}`;
  const lot = ipo.lotSize ? ` · lot ${ipo.lotSize}` : '';
  const min = ipo.minAmount ? ` = ${inr(ipo.minAmount)}` : '';
  return band + lot + min;
}

/** Subscription by category as small bars (log scale: 1× short, 100× full). */
function SubscriptionBars({ sub, theme }) {
  if (!sub) return null;
  const rows = [
    ['QIB', sub.qib],
    ['NII', sub.nii],
    ['Retail', sub.retail],
    ['Total', sub.overall],
  ].filter(([, v]) => v != null);
  if (!rows.length) return null;
  return (
    <View style={styles.subBox}>
      {rows.map(([label, v]) => {
        const pct = Math.max(4, Math.min(100, (Math.log10(1 + v) / 2) * 100));
        const color = v >= 10 ? GREEN : v >= 1 ? AMBER : RED;
        return (
          <View key={label} style={styles.subRow}>
            <Text style={[styles.subLabel, { color: theme.textMuted }]}>{label}</Text>
            <View style={[styles.subTrack, { backgroundColor: theme.surfaceAlt }]}>
              <View style={[styles.subFill, { width: `${pct}%`, backgroundColor: color }]} />
            </View>
            <Text style={[styles.subValue, { color: theme.text }]}>{v}×</Text>
          </View>
        );
      })}
      {sub.asOf ? <Text style={[styles.tiny, { color: theme.textMuted }]}>Subscription as of {sub.asOf}</Text> : null}
    </View>
  );
}

function ScoreChip({ score }) {
  if (!score) return null;
  const color = scoreColor(score.score);
  return (
    <View style={[styles.chip, { backgroundColor: color + '22' }]}>
      <Text style={[styles.chipText, { color }]}>
        {score.score} · {score.label}
      </Text>
    </View>
  );
}

function IpoCard({ ipo, onOpen, theme }) {
  const gmpColor = ipo.gmp == null ? theme.textMuted : ipo.gmp >= 0 ? GREEN : RED;
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => onOpen(ipo)}
      accessibilityLabel={`${ipo.name}: open the AI review`}
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}
    >
      <View style={styles.cardTop}>
        <View style={styles.flex}>
          <Text style={[styles.name, { color: theme.text }]} numberOfLines={2}>
            {ipo.name}
          </Text>
          {ipo.oneLine ? (
            <Text style={[styles.oneLine, { color: theme.textMuted }]} numberOfLines={1}>
              {ipo.oneLine}
            </Text>
          ) : null}
        </View>
        <View style={[styles.board, { backgroundColor: ipo.board === 'sme' ? '#FF950022' : '#5C6BC022' }]}>
          <Text style={[styles.boardText, { color: ipo.board === 'sme' ? '#FF9500' : '#5C6BC0' }]}>{ipo.board === 'sme' ? 'SME' : 'Mainboard'}</Text>
        </View>
      </View>
      <Text style={[styles.line, { color: theme.textSecondary }]}>{datesLine(ipo)}</Text>
      <Text style={[styles.line, { color: theme.text }]}>{priceLine(ipo)}</Text>
      <SubscriptionBars sub={ipo.subscription} theme={theme} />
      <View style={styles.cardBottom}>
        {ipo.status === 'listed' && ipo.listingGainPct != null ? (
          <Text style={[styles.gmp, { color: ipo.listingGainPct >= 0 ? GREEN : RED }]}>
            Listed {ipo.listingGainPct >= 0 ? '+' : ''}
            {ipo.listingGainPct}% at {inr(ipo.listingPrice)}
          </Text>
        ) : ipo.gmp != null ? (
          <Text style={[styles.gmp, { color: gmpColor }]}>
            GMP {ipo.gmp >= 0 ? '+' : '−'}₹{Math.abs(ipo.gmp)}
            {ipo.gmpPct != null ? ` (${ipo.gmpPct >= 0 ? '+' : ''}${ipo.gmpPct}%)` : ''}
          </Text>
        ) : (
          <Text style={[styles.gmp, { color: theme.textMuted }]}>{ipo.status === 'upcoming' ? 'Score after bidding opens' : 'No GMP reported'}</Text>
        )}
        <ScoreChip score={ipo.score} />
        <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

function ReviewModal({ target, onClose, theme }) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [news, setNews] = useState(null);
  const name = target?.name;

  const load = useCallback(
    (refresh) => {
      if (!name) return;
      setState((s) => ({ ...s, loading: true, error: null }));
      fetchIpoReview(name, refresh)
        .then((data) => {
          setState({ loading: false, data, error: null });
          saveReview(name, data);
        })
        .catch((e) => setState((s) => ({ ...s, loading: false, error: s.data ? `${errorText(e)} Showing the saved review.` : errorText(e) })));
    },
    [name]
  );

  useEffect(() => {
    if (!name) return undefined;
    let live = true;
    // A saved review shows at once; the server's (usually cached) copy follows.
    readJson(REVIEWS_KEY).then((all) => {
      const saved = all?.[reviewKey(name)];
      if (live && saved) setState((s) => (s.data ? s : { ...s, data: saved }));
    });
    const start = setTimeout(() => load(false), 0);
    fetchIpoNews(name)
      .then((r) => live && setNews(r.items || []))
      .catch(() => live && setNews([]));
    return () => {
      live = false;
      clearTimeout(start);
    };
  }, [name, load]);

  const review = state.data?.review;
  const v = review ? VERDICT[review.verdict] || VERDICT.NEUTRAL : null;
  const [now, setNow] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(t);
  }, [state.data]);

  return (
    <Modal visible={!!target} animationType="slide" onRequestClose={onClose} transparent>
      <View style={styles.modalBackdrop}>
        <View style={[styles.sheet, { backgroundColor: theme.background === '#000000' ? '#1C1C1E' : '#FFFFFF' }]}>
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { color: theme.text }]} numberOfLines={2}>
              {name}
            </Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={theme.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.sheetBody}>
            {state.loading && !review ? (
              <View style={styles.center}>
                <ActivityIndicator color={GREEN} />
                <Text style={[styles.line, { color: theme.textMuted, textAlign: 'center' }]}>
                  Searching the web and reading the numbers… this takes about a minute.
                </Text>
              </View>
            ) : null}
            {state.error ? <Text style={[styles.line, { color: RED }]}>{state.error}</Text> : null}
            {review ? (
              <>
                <LinearGradient colors={[v.color, v.color + 'BB']} style={styles.verdict}>
                  <Ionicons name={v.icon} size={28} color="#fff" />
                  <View style={styles.flex}>
                    <Text style={styles.verdictLabel}>AI view: {v.label}</Text>
                    <Text style={styles.verdictSub}>Confidence {review.confidence}%</Text>
                  </View>
                  {review.score ? (
                    <View style={styles.verdictScore}>
                      <Text style={styles.verdictScoreNum}>{review.score.score}</Text>
                      <Text style={styles.verdictScoreLbl}>demand</Text>
                    </View>
                  ) : null}
                </LinearGradient>
                <Text style={[styles.summary, { color: theme.text }]}>{review.summary}</Text>
                <Text style={[styles.line, { color: theme.textSecondary }]}>{datesLine(review)}</Text>
                <Text style={[styles.line, { color: theme.text }]}>{priceLine(review)}</Text>
                {review.issueSizeCr ? <Text style={[styles.line, { color: theme.textSecondary }]}>Issue size ₹{review.issueSizeCr.toLocaleString('en-IN')} cr</Text> : null}
                <SubscriptionBars sub={review.subscription} theme={theme} />
                {review.gmp != null ? (
                  <Text style={[styles.line, { color: review.gmp >= 0 ? GREEN : RED }]}>
                    GMP {review.gmp >= 0 ? '+' : '−'}₹{Math.abs(review.gmp)}
                    {review.gmpPct != null ? ` (${review.gmpPct >= 0 ? '+' : ''}${review.gmpPct}%)` : ''}
                    {review.gmpAsOf ? ` · ${review.gmpAsOf}` : ''} (unofficial)
                  </Text>
                ) : null}
                {review.score ? (
                  <>
                    <Text style={[styles.sub, { color: theme.textSecondary }]}>How the demand score is made</Text>
                    {review.score.parts.map((p) => (
                      <Text key={p.name} style={[styles.line, { color: theme.text }]}>
                        • {p.name} {p.note}: {p.points}/{p.max}
                      </Text>
                    ))}
                  </>
                ) : null}
                <Text style={[styles.sub, { color: theme.textSecondary }]}>Why</Text>
                {review.reasons.map((r) => (
                  <Text key={r} style={[styles.line, { color: theme.text }]}>
                    • {r}
                  </Text>
                ))}
                {review.risks.length ? (
                  <>
                    <Text style={[styles.sub, { color: theme.textSecondary }]}>Risks</Text>
                    {review.risks.map((r) => (
                      <Text key={r} style={[styles.line, { color: theme.text }]}>
                        • {r}
                      </Text>
                    ))}
                  </>
                ) : null}
                {[
                  ['Business', review.business],
                  ['Financials', review.financials],
                  ['Valuation', review.valuation],
                ]
                  .filter(([, t]) => t)
                  .map(([label, t]) => (
                    <View key={label}>
                      <Text style={[styles.sub, { color: theme.textSecondary }]}>{label}</Text>
                      <Text style={[styles.line, { color: theme.text }]}>{t}</Text>
                    </View>
                  ))}
              </>
            ) : null}

            <Text style={[styles.sub, { color: theme.textSecondary }]}>Latest news</Text>
            {news == null ? (
              <ActivityIndicator color={theme.textMuted} style={styles.newsSpin} />
            ) : news.length ? (
              news.map((n) => (
                <TouchableOpacity key={n.url} onPress={() => Linking.openURL(n.url).catch(() => {})} style={[styles.news, { borderColor: theme.border }]}>
                  <Text style={[styles.newsTitle, { color: theme.text }]} numberOfLines={3}>
                    {n.title}
                  </Text>
                  <Text style={[styles.tiny, { color: theme.textMuted }]}>
                    {[n.source, n.publishedAt && now ? ago(n.publishedAt, now) : null].filter(Boolean).join(' · ')}
                  </Text>
                </TouchableOpacity>
              ))
            ) : (
              <Text style={[styles.line, { color: theme.textMuted }]}>No recent news found.</Text>
            )}

            {state.data?.sources?.length ? (
              <>
                <Text style={[styles.sub, { color: theme.textSecondary }]}>Sources the AI read</Text>
                {state.data.sources.slice(0, 6).map((src) => (
                  <Text key={src.url} style={[styles.link, { color: '#0A84FF' }]} numberOfLines={1} onPress={() => Linking.openURL(src.url).catch(() => {})}>
                    {src.title}
                  </Text>
                ))}
              </>
            ) : null}
            {state.data ? (
              <View style={styles.footRow}>
                <Text style={[styles.tiny, { color: theme.textMuted, flex: 1 }]}>
                  Checked {ago(state.data.fetchedAt, now)}. AI decision support from public web pages, not investment advice.
                </Text>
                <TouchableOpacity onPress={() => load(true)} disabled={state.loading} accessibilityLabel="Check again">
                  <Text style={[styles.refresh, { color: GREEN }]}>{state.loading ? 'Checking…' : 'Check again'}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function IposScreen() {
  const { theme } = useTheme();
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [open, setOpen] = useState(null);
  const [lookup, setLookup] = useState('');
  const [now, setNow] = useState(0);
  const [statusFilter, setStatusFilter] = useState('current');
  const [boardFilter, setBoardFilter] = useState('all');

  const again = useRef({ timer: null, tries: 0 });
  const [retry, setRetry] = useState(0);

  const load = useCallback((refresh) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchIpos(refresh)
      .then((data) => {
        setState({ loading: false, data, error: null });
        setNow(Date.now());
        if (data.ipos?.length) writeJson(LIST_KEY, data);
        // The server is searching in the background: ask again in a bit.
        clearTimeout(again.current.timer);
        if (data.refreshing && again.current.tries < 3) {
          again.current.tries += 1;
          again.current.timer = setTimeout(() => setRetry((n) => n + 1), 75000);
        } else if (!data.refreshing) {
          again.current.tries = 0;
        }
      })
      .catch((e) =>
        setState((s) => ({ ...s, loading: false, error: s.data ? `${errorText(e)} Showing the saved list.` : errorText(e) }))
      );
  }, []);

  useEffect(() => {
    let live = true;
    const pending = again.current;
    // The saved list shows at once, then the server's answer replaces it.
    readJson(LIST_KEY).then((saved) => {
      if (live && saved?.ipos) {
        setState((s) => (s.data ? s : { ...s, data: saved }));
        setNow(Date.now());
      }
    });
    const t = setTimeout(() => load(false), 0);
    return () => {
      live = false;
      clearTimeout(t);
      clearTimeout(pending.timer);
    };
  }, [load]);

  // Asked again while the server searches in the background.
  useEffect(() => {
    if (!retry) return undefined;
    const t = setTimeout(() => load(false), 0);
    return () => clearTimeout(t);
  }, [retry, load]);

  const all = state.data?.ipos || [];
  const onBoard = all.filter((i) => boardFilter === 'all' || i.board === boardFilter);
  const statuses = STATUS_FILTERS.find((f) => f.key === statusFilter).statuses;
  const ipos = onBoard.filter((i) => statuses.includes(i.status));
  const statusCounts = Object.fromEntries(STATUS_FILTERS.map((f) => [f.key, onBoard.filter((i) => f.statuses.includes(i.status)).length]));
  const boardCounts = Object.fromEntries(
    BOARD_FILTERS.map((f) => [f.key, all.filter((i) => statuses.includes(i.status) && (f.key === 'all' || i.board === f.key)).length])
  );
  const findIpo = () => {
    const q = lookup.trim();
    if (q.length >= 2) setOpen({ name: q });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
      <Header title="IPO Watch" subtitle="Open & upcoming IPOs with an AI view" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.searchRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name="search" size={18} color={theme.textMuted} />
          <TextInput
            value={lookup}
            onChangeText={setLookup}
            onSubmitEditing={findIpo}
            placeholder="Look up any IPO by name"
            placeholderTextColor={theme.textMuted}
            returnKeyType="search"
            style={[styles.searchInput, { color: theme.text }]}
          />
          {lookup.trim().length >= 2 ? (
            <TouchableOpacity onPress={findIpo} accessibilityLabel="Review this IPO">
              <Text style={[styles.refresh, { color: GREEN }]}>Review</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.statusRow}>
          <Text style={[styles.tiny, { color: theme.textMuted, flex: 1 }]}>
            {state.loading
              ? state.data
                ? `Showing saved IPOs · checking for updates…`
                : 'Finding IPOs… the first search takes about a minute.'
              : state.data?.refreshing
                ? `Showing saved IPOs (searched ${ago(state.data.fetchedAt, now)}) · looking for new ones in the background…`
                : state.data
                  ? `Updated ${ago(state.data.fetchedAt, now)} · tap an IPO for the AI review`
                  : ''}
          </Text>
          <TouchableOpacity onPress={() => load(true)} disabled={state.loading} accessibilityLabel="Refresh the IPO list">
            {state.loading ? <ActivityIndicator color={GREEN} /> : <Ionicons name="refresh" size={20} color={GREEN} />}
          </TouchableOpacity>
        </View>
        {state.error ? <Text style={[styles.line, { color: RED, marginBottom: 10 }]}>{state.error}</Text> : null}
        {state.data ? (
          <>
            <FilterChips options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} counts={statusCounts} theme={theme} />
            <FilterChips options={BOARD_FILTERS} value={boardFilter} onChange={setBoardFilter} counts={boardCounts} theme={theme} />
          </>
        ) : null}
        {!state.loading && state.data && !ipos.length ? (
          <Text style={[styles.line, { color: theme.textMuted }]}>
            {all.length
              ? `No ${STATUS_FILTERS.find((f) => f.key === statusFilter).label.toLowerCase()} IPOs${boardFilter === 'all' ? '' : ` on ${boardFilter === 'sme' ? 'SME' : 'Mainboard'}`} right now. Try another filter, or look one up by name.`
              : 'No IPOs found right now. Pull a refresh later, or look one up by name.'}
          </Text>
        ) : null}

        {SECTIONS.map((sec) => {
          const list = ipos.filter((i) => i.status === sec.key);
          if (!list.length) return null;
          return (
            <View key={sec.key}>
              <View style={styles.sectionHead}>
                <Ionicons name={sec.icon} size={16} color={sec.color} />
                <Text style={[styles.sectionTitle, { color: theme.text }]}>{sec.title}</Text>
                <Text style={[styles.tiny, { color: theme.textMuted }]}>{list.length}</Text>
              </View>
              {list.map((ipo) => (
                <IpoCard key={ipo.id} ipo={ipo} onOpen={setOpen} theme={theme} />
              ))}
            </View>
          );
        })}

        {state.data ? (
          <Text style={[styles.tiny, styles.disclaimer, { color: theme.textMuted }]}>
            Found by AI web search of public IPO pages, so figures can lag. Demand score: QIB 40, overall 20, retail 10, GMP 30 points. GMP is unofficial. Decision support, not
            investment advice. Refreshing runs a new search (uses AI credit).
          </Text>
        ) : null}
      </ScrollView>
      <ReviewModal key={open?.name || 'none'} target={open} onClose={() => setOpen(null)} theme={theme} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  flex: { flex: 1 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  chips: { gap: 8, paddingBottom: 8 },
  filterChip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  filterText: { fontSize: 13, fontWeight: '700' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, marginBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '800', flexShrink: 1 },
  card: { borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 12, gap: 4, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  name: { fontSize: 16, fontWeight: '800' },
  oneLine: { fontSize: 12, marginTop: 1 },
  board: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  boardText: { fontSize: 10, fontWeight: '800' },
  line: { fontSize: 13, lineHeight: 19 },
  tiny: { fontSize: 11, lineHeight: 15 },
  subBox: { marginTop: 6, gap: 4 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  subLabel: { width: 42, fontSize: 11, fontWeight: '700' },
  subTrack: { flex: 1, height: 7, borderRadius: 4, overflow: 'hidden' },
  subFill: { height: 7, borderRadius: 4 },
  subValue: { width: 52, fontSize: 12, fontWeight: '800', textAlign: 'right' },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  gmp: { flex: 1, fontSize: 13, fontWeight: '700' },
  chip: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 11, fontWeight: '800' },
  disclaimer: { marginTop: 8 },
  modalBackdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, marginBottom: 8 },
  sheetTitle: { flex: 1, fontSize: 19, fontWeight: '800' },
  sheetBody: { paddingHorizontal: 20, paddingBottom: 36, gap: 6 },
  center: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  verdict: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 14, marginBottom: 4 },
  verdictLabel: { color: '#fff', fontSize: 18, fontWeight: '800' },
  verdictSub: { color: '#ffffffDD', fontSize: 12, marginTop: 1 },
  verdictScore: { alignItems: 'center', backgroundColor: '#00000026', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  verdictScoreNum: { color: '#fff', fontSize: 20, fontWeight: '900' },
  verdictScoreLbl: { color: '#ffffffDD', fontSize: 10 },
  summary: { fontSize: 14, lineHeight: 21, fontWeight: '600' },
  sub: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 10 },
  news: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8, gap: 2 },
  newsTitle: { fontSize: 14, lineHeight: 19, fontWeight: '600' },
  newsSpin: { marginVertical: 8 },
  link: { fontSize: 12, textDecorationLine: 'underline' },
  footRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  refresh: { fontSize: 14, fontWeight: '800' },
});
