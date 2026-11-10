import { Image, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Header from '../components/Header';
import { useTheme } from '../hooks/useTheme';
import { useSyncedCollection } from '../hooks/useSyncedCollection';
import { AUTOPAY_STORAGE_KEY } from '../services/autopayReminders';
import { posterUrl } from '../services/tmdb';
import { TICKETS_STORAGE_KEY } from '../utils/tickets';
import { DATES_STORAGE_KEY } from '../utils/importantDates';
import { currentMonthKey, monthLabel } from '../utils/debts';
import { fromKey, todayKey } from '../utils/autopay';
import { netWorth, nowWatching, pendingTodos, upcomingItems } from '../utils/dashboard';
import TripAlarmCard from '../components/TripAlarmCard';

const DAYS_AHEAD = 5;

const KIND = {
  autopay: { icon: 'repeat', color: '#FF9500', label: 'Autopay' },
  sip: { icon: 'trending-up', color: '#AF52DE', label: 'SIP' },
  emi: { icon: 'cash-outline', color: '#E5383B', label: 'EMI' },
  bill: { icon: 'receipt-outline', color: '#FF375F', label: 'Bill' },
  ticket: { icon: 'ticket', color: '#5C6BC0', label: 'Ticket' },
  date: { icon: 'gift', color: '#F5A623', label: 'Date' },
  voucher: { icon: 'pricetag', color: '#FF6A88', label: 'Voucher' },
};

const inr = (n) => `₹${Math.round(Math.abs(Number(n) || 0)).toLocaleString('en-IN')}`;
const signed = (n) => `${n < 0 ? '−' : '+'}${inr(n)}`;
// Short form for the small tiles: ₹4.86L, ₹1.2Cr, ₹63,000.
const compact = (n) => {
  const a = Math.abs(Number(n) || 0);
  if (a >= 1e7) return `₹${(a / 1e7).toFixed(2).replace(/\.?0+$/, '')}Cr`;
  if (a >= 1e5) return `₹${(a / 1e5).toFixed(2).replace(/\.?0+$/, '')}L`;
  return inr(a);
};

const dayHeading = (key, daysLeft) => {
  if (daysLeft === 0) return 'Today';
  if (daysLeft === 1) return 'Tomorrow';
  return fromKey(key).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
};

export default function DashboardScreen() {
  const { theme } = useTheme();
  const { items: investments } = useSyncedCollection('investments', '@diarybyte_investments');
  const { items: debts } = useSyncedCollection('debts', '@diarybyte_debts');
  const { items: expenses } = useSyncedCollection('expenditure', '@diarybyte_expenditure');
  const { items: months } = useSyncedCollection('months', '@diarybyte_months');
  const { items: autopays } = useSyncedCollection('autopays', AUTOPAY_STORAGE_KEY);
  const { items: tickets } = useSyncedCollection('tickets', TICKETS_STORAGE_KEY);
  const { items: dates } = useSyncedCollection('dates', DATES_STORAGE_KEY);
  const { items: todos, persist: persistTodos } = useSyncedCollection('todo', '@diarybyte_todo');
  const { items: movies } = useSyncedCollection('movies', '@diarybyte_movies');
  const { items: vouchers } = useSyncedCollection('vouchers', '@diarybyte_vouchers');
  const { items: demat } = useSyncedCollection('demat', '@diarybyte_demat');

  const month = currentMonthKey();
  const worth = netWorth({ investments, debts, expenses, months, demat }, month);
  const positive = worth.total >= 0;
  const upcoming = upcomingItems({ autopays, investments, debts, tickets, dates, vouchers }, DAYS_AHEAD, todayKey());
  // Money due out (an expiring voucher's value isn't spending).
  const goingOut = upcoming.reduce((sum, u) => sum + (u.kind === 'voucher' ? 0 : u.amount || 0), 0);
  const todo = pendingTodos(todos);
  const watching = nowWatching(movies);

  // Group the timeline by day.
  const days = [];
  upcoming.forEach((u) => {
    const last = days[days.length - 1];
    if (last && last.date === u.date) last.items.push(u);
    else days.push({ date: u.date, daysLeft: u.daysLeft, items: [u] });
  });

  const card = [styles.card, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }];

  const tickTodo = (item) =>
    persistTodos(
      todos.map((t) => (t.id === item.id ? { ...t, done: true, completedAt: new Date().toISOString() } : t))
    );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
      <Header title="Dashboard" subtitle="Your money and your next few days" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Net worth */}
        <LinearGradient
          colors={positive ? ['#11998E', '#38B26B'] : ['#CB2D3E', '#EF473A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroTop}>
            <Text style={styles.heroLabel}>NET WORTH</Text>
            <View style={styles.heroBadge}>
              <Ionicons name={positive ? 'trending-up' : 'trending-down'} size={14} color="#FFF" />
              <Text style={styles.heroBadgeText}>{positive ? 'In the green' : 'In the red'}</Text>
            </View>
          </View>
          <Text style={styles.heroValue} accessibilityLabel={`Net worth ${signed(worth.total)}`}>
            {signed(worth.total)}
          </Text>
          <Text style={styles.heroSub}>
            Investments{worth.demat ? ' + demat' : ''} + {monthLabel(month)} balance − debts
          </Text>
          {/* Plain rows (two per row with Demat): wrapping % widths break on Android. */}
          {(() => {
            const tiles = [
              { label: 'Investments', value: worth.investments, sign: 1, icon: 'pie-chart', route: '/investments' },
              ...(worth.demat ? [{ label: 'Demat', value: worth.demat, sign: 1, icon: 'stats-chart', route: '/trading' }] : []),
              { label: 'Balance', value: worth.cash.balance, sign: 0, icon: 'wallet', route: '/expenditure' },
              { label: 'Debts', value: worth.debts.total, sign: -1, icon: 'card', route: '/debts' },
            ];
            const rows = tiles.length > 3 ? [tiles.slice(0, 2), tiles.slice(2)] : [tiles];
            return rows.map((row, i) => (
              <View key={row[0].label} style={[styles.heroTiles, i > 0 && styles.heroTilesNext]}>
                {row.map((t) => (
                  <TouchableOpacity
                    key={t.label}
                    style={styles.heroTile}
                    onPress={() => router.push(t.route)}
                    accessibilityLabel={`Open ${t.label}`}
                  >
                    <Ionicons name={t.icon} size={16} color="#FFF" />
                    <Text style={styles.heroTileLabel}>{t.label}</Text>
                    <Text style={styles.heroTileValue} numberOfLines={1} adjustsFontSizeToFit>
                      {t.sign > 0 ? '+' : t.sign < 0 ? '−' : t.value < 0 ? '−' : '+'}
                      {compact(t.value)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ));
          })()}
        </LinearGradient>

        {/* Trip alarm, while one is on */}
        <TripAlarmCard />

        {/* Next few days */}
        <View style={card}>
          <View style={styles.cardHead}>
            <View style={[styles.cardIcon, { backgroundColor: '#5C6BC0' }]}>
              <Ionicons name="calendar" size={16} color="#FFF" />
            </View>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Next {DAYS_AHEAD} days</Text>
            {goingOut > 0 ? (
              <View style={[styles.pill, { backgroundColor: '#E5383B22' }]}>
                <Text style={[styles.pillText, { color: '#E5383B' }]}>{inr(goingOut)} going out</Text>
              </View>
            ) : null}
          </View>
          {days.length === 0 ? (
            <Text style={[styles.empty, { color: theme.textMuted }]}>
              Nothing due — no autopays, SIPs, EMIs, tickets, dates or expiring vouchers in the next {DAYS_AHEAD} days. 🎉
            </Text>
          ) : (
            days.map((day) => (
              <View key={day.date} style={styles.day}>
                <View style={styles.dayHead}>
                  <View style={[styles.dayDot, { backgroundColor: day.daysLeft === 0 ? '#E5383B' : theme.primary }]} />
                  <Text style={[styles.dayTitle, { color: day.daysLeft === 0 ? '#E5383B' : theme.textSecondary }]}>
                    {dayHeading(day.date, day.daysLeft)}
                  </Text>
                </View>
                {day.items.map((u) => {
                  const k = KIND[u.kind];
                  return (
                    <TouchableOpacity
                      key={u.key}
                      style={[styles.row, { borderLeftColor: theme.borderNeutral }]}
                      onPress={() => router.push(u.params ? { pathname: u.route, params: u.params } : u.route)}
                    >
                      <View style={[styles.rowIcon, { backgroundColor: k.color + '22' }]}>
                        <Ionicons name={k.icon} size={17} color={k.color} />
                      </View>
                      <View style={styles.rowBody}>
                        <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
                          {u.title}
                        </Text>
                        <Text style={[styles.rowSub, { color: theme.textMuted }]} numberOfLines={1}>
                          {k.label}
                          {u.sub && u.sub !== k.label ? ` · ${u.sub}` : ''}
                        </Text>
                      </View>
                      {u.amount ? (
                        <Text style={[styles.rowAmount, { color: theme.text }]}>{inr(u.amount)}</Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))
          )}
        </View>

        {/* To-do */}
        <View style={card}>
          <TouchableOpacity style={styles.cardHead} onPress={() => router.push('/todo')}>
            <View style={[styles.cardIcon, { backgroundColor: '#34C759' }]}>
              <Ionicons name="checkbox" size={16} color="#FFF" />
            </View>
            <Text style={[styles.cardTitle, { color: theme.text }]}>To-do</Text>
            <View style={[styles.pill, { backgroundColor: theme.surfaceAlt }]}>
              <Text style={[styles.pillText, { color: theme.textSecondary }]}>{todo.length} pending</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
          </TouchableOpacity>
          {todo.length === 0 ? (
            <Text style={[styles.empty, { color: theme.textMuted }]}>All caught up — nothing pending.</Text>
          ) : (
            todo.slice(0, 5).map((t) => (
              <View key={t.id} style={styles.todoRow}>
                <TouchableOpacity onPress={() => tickTodo(t)} accessibilityLabel={`Mark ${t.title} done`}>
                  <Ionicons name="ellipse-outline" size={22} color="#34C759" />
                </TouchableOpacity>
                <Text style={[styles.todoText, { color: theme.text }]} numberOfLines={1}>
                  {t.title}
                </Text>
              </View>
            ))
          )}
          {todo.length > 5 ? (
            <Text style={[styles.more, { color: theme.primary }]} onPress={() => router.push('/todo')}>
              +{todo.length - 5} more
            </Text>
          ) : null}
        </View>

        {/* Now watching */}
        <View style={card}>
          <TouchableOpacity style={styles.cardHead} onPress={() => router.push('/movies')}>
            <View style={[styles.cardIcon, { backgroundColor: '#FF9500' }]}>
              <Ionicons name="play" size={16} color="#FFF" />
            </View>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Now watching</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
          </TouchableOpacity>
          {watching.length === 0 ? (
            <Text style={[styles.empty, { color: theme.textMuted }]}>
              Nothing in progress. Mark a title as Watching in Movies & Series.
            </Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.posters}>
              {watching.map((m) => {
                const uri = posterUrl(m.posterPath, 'w185') || m.posterUri;
                return (
                  <TouchableOpacity key={m.id} style={styles.poster} onPress={() => router.push('/movies')}>
                    {uri ? (
                      <Image source={{ uri }} style={styles.posterImg} />
                    ) : (
                      <LinearGradient colors={['#FF9500', '#FF5E3A']} style={[styles.posterImg, styles.posterBlank]}>
                        <Ionicons name="film" size={26} color="#FFF" />
                      </LinearGradient>
                    )}
                    <Text style={[styles.posterTitle, { color: theme.text }]} numberOfLines={2}>
                      {m.title}
                    </Text>
                    {m.platform ? (
                      <Text style={[styles.posterSub, { color: theme.textMuted }]} numberOfLines={1}>
                        {m.platform}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  hero: { borderRadius: 24, padding: 20 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroLabel: { color: '#FFFFFFCC', fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF33',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  heroBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  heroValue: { color: '#FFF', fontSize: 38, fontWeight: '800', marginTop: 6, letterSpacing: 0.5 },
  heroSub: { color: '#FFFFFFB3', fontSize: 12, marginTop: 2 },
  heroTiles: { flexDirection: 'row', gap: 8, marginTop: 16 },
  heroTilesNext: { marginTop: 8 },
  heroTile: { flex: 1, backgroundColor: '#FFFFFF26', borderRadius: 14, padding: 10, gap: 2 },
  heroTileLabel: { color: '#FFFFFFCC', fontSize: 11, fontWeight: '600', marginTop: 2 },
  heroTileValue: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 24,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  cardIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
  pill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 11, fontWeight: '700' },
  empty: { fontSize: 13, lineHeight: 19 },
  day: { marginTop: 4 },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  dayDot: { width: 8, height: 8, borderRadius: 4 },
  dayTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginLeft: 3,
    paddingLeft: 13,
    paddingVertical: 7,
    borderLeftWidth: 2,
  },
  rowIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '600' },
  rowSub: { fontSize: 12, marginTop: 1 },
  rowAmount: { fontSize: 14, fontWeight: '700' },
  todoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  todoText: { flex: 1, fontSize: 14 },
  more: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  posters: { gap: 12 },
  poster: { width: 96 },
  posterImg: { width: 96, height: 140, borderRadius: 12, backgroundColor: '#0002' },
  posterBlank: { alignItems: 'center', justifyContent: 'center' },
  posterTitle: { fontSize: 12, fontWeight: '600', marginTop: 6 },
  posterSub: { fontSize: 11, marginTop: 1 },
});
