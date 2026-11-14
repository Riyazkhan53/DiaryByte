import { StyleSheet, Text, View, ScrollView, TouchableOpacity, SafeAreaView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { useSyncedCollection } from '../hooks/useSyncedCollection';
import { AUTOPAY_STORAGE_KEY } from '../services/autopayReminders';
import { UpdateReadyBanner } from '../components/AppUpdates';
import { GlassIconButton } from '../components/Header';
import { activeReminder, dueLabel, formatDate, money, todayKey } from '../utils/autopay';
import { TICKETS_STORAGE_KEY, ticketType, countdownLabel, daysUntil, sortTickets } from '../utils/tickets';
import { DATES_STORAGE_KEY, sortDates, daysUntil as daysUntilDate } from '../utils/importantDates';
import { currentMonthKey } from '../utils/debts';
import { netWorth, upcomingItems } from '../utils/dashboard';
import TripAlarmCard from '../components/TripAlarmCard';

const TABS = [
  {
    key: 'diary',
    label: 'Personal Diary',
    description: 'Write and revisit your daily thoughts',
    icon: 'book-outline',
    route: '/diary',
    gradient: ['#FFB340', '#FF8A00'],
  },
  {
    key: 'movies',
    label: 'Movies Watch List',
    description: 'Track films you want to watch',
    icon: 'film-outline',
    route: '/movies',
    gradient: ['#FF6482', '#FF2D55'],
  },
  {
    key: 'passwords',
    label: 'Saved Passwords',
    description: 'Keep your login credentials handy',
    icon: 'key-outline',
    route: '/passwords',
    gradient: ['#8E8CF8', '#5856D6'],
  },
  {
    key: 'banking',
    label: 'Banking Details',
    description: 'Accounts, cards and UPI at a glance',
    icon: 'card-outline',
    route: '/banking',
    gradient: ['#5AC8FA', '#0A84FF'],
  },
  {
    key: 'vault',
    label: 'Personal Vault',
    description: 'Private notes and important info',
    icon: 'lock-closed-outline',
    route: '/vault',
    gradient: ['#C77DFF', '#AF52DE'],
  },
  {
    key: 'documents',
    label: 'Personal Documents',
    description: 'Aadhaar, PAN, passport and other IDs',
    icon: 'id-card-outline',
    route: '/documents',
    gradient: ['#4F8EF7', '#1E40AF'],
  },
  {
    key: 'todo',
    label: 'To-Do List',
    description: 'Tasks to keep your day on track',
    icon: 'checkbox-outline',
    route: '/todo',
    gradient: ['#5EDC7E', '#34C759'],
  },
  {
    key: 'expenditure',
    label: 'My Expenditure',
    description: 'Track where your money goes',
    icon: 'wallet-outline',
    route: '/expenditure',
    gradient: ['#FFD60A', '#FF9F0A'],
  },
  {
    key: 'investments',
    label: 'My Investments',
    description: 'Mutual funds, stocks, metals & FDs',
    icon: 'trending-up-outline',
    route: '/investments',
    gradient: ['#4FD8C8', '#00A99D'],
  },
  {
    key: 'trading',
    label: 'My Trading',
    description: 'Setup checks and paper trades',
    icon: 'pulse-outline',
    route: '/trading',
    gradient: ['#FF8A65', '#E5383B'],
  },
  {
    key: 'ipos',
    label: 'IPO Watch',
    description: 'Open and upcoming IPOs with an AI view',
    icon: 'rocket-outline',
    route: '/ipos',
    gradient: ['#34C759', '#0E8A6A'],
  },
  {
    key: 'balance',
    label: 'Account Balance',
    description: 'Bank balances at a glance',
    icon: 'cash-outline',
    route: '/balance',
    gradient: ['#64B5FF', '#007AFF'],
  },
  {
    key: 'debts',
    label: 'My Debts',
    description: 'Loans and money owed',
    icon: 'alert-circle-outline',
    route: '/debts',
    gradient: ['#FF7B72', '#FF3B30'],
  },
  {
    key: 'vouchers',
    label: 'Vouchers & Gift Cards',
    description: 'Codes, PINs & expiry for every store',
    icon: 'gift-outline',
    route: '/vouchers',
    gradient: ['#FF9A8B', '#FF6A88'],
  },
  {
    key: 'autopays',
    label: 'My Autopays',
    description: 'Recurring payments with reminders',
    icon: 'repeat-outline',
    route: '/autopays',
    gradient: ['#FF8FB1', '#FF375F'],
  },
  {
    key: 'tickets',
    label: 'My Tickets',
    description: 'Flights, trains, movies & events',
    icon: 'ticket-outline',
    route: '/tickets',
    gradient: ['#8C9BFF', '#5E5CE6'],
  },
  {
    key: 'dates',
    label: 'Important Dates',
    description: 'Birthdays, anniversaries & occasions',
    icon: 'calendar-outline',
    route: '/important-dates',
    gradient: ['#FFD75E', '#FFB300'],
  },
  {
    key: 'settings',
    label: 'Settings',
    description: 'Personalize your experience',
    icon: 'settings-outline',
    route: '/settings',
    gradient: ['#B5B5BA', '#8E8E93'],
  },
];

export default function Dashboard() {
  const { theme, userName, isDark, toggleTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { items: autopays, persist: persistAutopays } = useSyncedCollection(
    'autopays',
    AUTOPAY_STORAGE_KEY
  );
  const reminders = autopays
    .map((item) => ({ item, reminder: activeReminder(item) }))
    .filter(({ reminder }) => reminder)
    .sort((a, b) => a.reminder.daysLeft - b.reminder.daysLeft);

  const { items: tickets } = useSyncedCollection('tickets', TICKETS_STORAGE_KEY);
  const soonTickets = sortTickets(tickets).upcoming.filter((t) => daysUntil(t) <= 1);

  const { items: dates } = useSyncedCollection('dates', DATES_STORAGE_KEY);
  const soonDates = sortDates(dates).upcoming.filter((d) => daysUntilDate(d) <= 7);

  // Dashboard card: net worth and how much is coming up.
  const { items: investments } = useSyncedCollection('investments', '@diarybyte_investments');
  const { items: debts } = useSyncedCollection('debts', '@diarybyte_debts');
  const { items: expenses } = useSyncedCollection('expenditure', '@diarybyte_expenditure');
  const { items: months } = useSyncedCollection('months', '@diarybyte_months');
  const { items: demat } = useSyncedCollection('demat', '@diarybyte_demat');
  const { items: spends } = useSyncedCollection('spends', '@diarybyte_spends');
  const worth = netWorth({ investments, debts, expenses, months, demat, spends }, currentMonthKey()).total;
  const { items: vouchers } = useSyncedCollection('vouchers', '@diarybyte_vouchers');
  // Only { remind: { type, expiry } } is readable without the vault code.
  const { items: iddocs } = useSyncedCollection('iddocs', '@diarybyte_iddocs');
  const comingUp = upcomingItems({ autopays, investments, debts, tickets, dates, vouchers, iddocs }, 5, todayKey()).length;

  const stopReminders = (item, due) => {
    persistAutopays(autopays.map((i) => (i.id === item.id ? { ...i, ackDue: due } : i)));
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    if (hour < 21) return 'Good Evening';
    return 'Good Night';
  };

  const getGreetingEmoji = () => {
    const hour = new Date().getHours();
    if (hour < 12) return '🌅';
    if (hour < 17) return '☀️';
    if (hour < 21) return '🌇';
    return '🌙';
  };

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container}>
        <StatusBar style={theme.statusBar} />
        <View style={[styles.header, { paddingTop: Platform.OS === 'ios' ? 10 : insets.top + 16 }]}>
          <View style={styles.headerRow}>
            <Text style={[styles.dateLine, { color: theme.textMuted }]}>
              {today.toUpperCase()}
            </Text>
            <GlassIconButton
              icon={isDark ? 'sunny-outline' : 'moon-outline'}
              onPress={toggleTheme}
              accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            />
          </View>
          <Text style={[styles.greeting, { color: theme.text }]}>
            {getGreeting()} {getGreetingEmoji()}
          </Text>
          <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
            {userName}
          </Text>
          <Text style={[styles.welcome, { color: theme.textMuted }]}>
            Welcome back to your personal space
          </Text>
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
        >
          <UpdateReadyBanner />
          <TripAlarmCard />
          <TouchableOpacity
            style={styles.dashWrap}
            onPress={() => router.push('/dashboard')}
            activeOpacity={0.85}
            accessibilityLabel="Open dashboard"
          >
            <LinearGradient
              colors={worth >= 0 ? ['#11998E', '#38B26B'] : ['#CB2D3E', '#EF473A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.dash}
            >
              <View style={styles.dashIcon}>
                <Ionicons name="speedometer" size={22} color="#FFF" />
              </View>
              <View style={styles.reminderText}>
                <Text style={styles.dashLabel}>DASHBOARD · NET WORTH</Text>
                <Text style={styles.dashValue} numberOfLines={1} adjustsFontSizeToFit>
                  {worth < 0 ? '−' : '+'}₹{Math.round(Math.abs(worth)).toLocaleString('en-IN')}
                </Text>
                <Text style={styles.dashSub}>
                  {comingUp ? `${comingUp} thing${comingUp === 1 ? '' : 's'} in the next 5 days` : 'Nothing due in the next 5 days'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color="#FFF" />
            </LinearGradient>
          </TouchableOpacity>
          {reminders.map(({ item, reminder }) => (
            <View
              key={item.id}
              style={[
                styles.reminder,
                { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow },
              ]}
            >
              <TouchableOpacity
                style={styles.reminderMain}
                onPress={() => router.push('/autopays')}
                activeOpacity={0.7}
              >
                <Ionicons name="notifications" size={20} color="#E65100" />
                <View style={styles.reminderText}>
                  <Text style={[styles.reminderTitle, { color: theme.text }]} numberOfLines={1}>
                    {item.name} · {money(item.amount)}
                  </Text>
                  <Text style={[styles.reminderSub, { color: theme.textSecondary }]}>
                    {dueLabel(reminder.daysLeft)} · {formatDate(reminder.due)}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => stopReminders(item, reminder.due)}
                style={styles.reminderDismiss}
                accessibilityLabel={`Don't remind me about ${item.name} this cycle`}
              >
                <Ionicons name="notifications-off-outline" size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
          ))}
          {soonTickets.map((ticket) => {
            const type = ticketType(ticket.type);
            return (
              <TouchableOpacity
                key={ticket.id}
                style={styles.ticketBannerWrap}
                onPress={() => router.push({ pathname: '/tickets', params: { open: ticket.id } })}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={type.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.ticketBanner}
                >
                  <Ionicons name={type.icon} size={20} color="#FFF" />
                  <View style={styles.reminderText}>
                    <Text style={styles.ticketBannerTitle} numberOfLines={1}>
                      {ticket.title}
                    </Text>
                    <Text style={styles.ticketBannerSub} numberOfLines={1}>
                      {countdownLabel(ticket)}
                      {ticket.time ? ` · ${ticket.time}` : ''}
                      {ticket.seat ? ` · Seat ${ticket.seat}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="qr-code-outline" size={20} color="#FFF" />
                </LinearGradient>
              </TouchableOpacity>
            );
          })}
          {soonDates.map((date) => (
            <TouchableOpacity
              key={date.id}
              style={styles.ticketBannerWrap}
              onPress={() => router.push({ pathname: '/important-dates', params: { open: date.id } })}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#FFCC00', '#FFCA28']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.ticketBanner}
              >
                <Ionicons name="calendar" size={20} color="#FFF" />
                <View style={styles.reminderText}>
                  <Text style={styles.ticketBannerTitle} numberOfLines={1}>
                    {date.title}
                  </Text>
                  <Text style={styles.ticketBannerSub} numberOfLines={1}>
                    {date.section === 'recurring' ? '🎉 Every year' : '📌 Upcoming occasion'}
                    {' · '}
                    {daysUntilDate(date) === 0 ? 'Today' : daysUntilDate(date) === 1 ? 'Tomorrow' : `In ${daysUntilDate(date)} days`}
                  </Text>
                </View>
                <Ionicons name="gift-outline" size={20} color="#FFF" />
              </LinearGradient>
            </TouchableOpacity>
          ))}
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.card,
                { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow },
              ]}
              onPress={() => router.push(tab.route)}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={tab.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconWrap}
              >
                <Ionicons name={tab.icon} size={24} color="#FFFFFF" />
              </LinearGradient>
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                {tab.label}
              </Text>
              <Text style={[styles.cardDescription, { color: theme.textMuted }]}>
                {tab.description}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  dateLine: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  greeting: {
    fontSize: 22,
    fontWeight: '600',
  },
  name: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  welcome: {
    fontSize: 15,
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  grid: {
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingBottom: 40,
  },
  reminder: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    paddingLeft: 14,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 24,
  },
  reminderMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  reminderText: { flex: 1 },
  reminderTitle: { fontSize: 15, fontWeight: '700' },
  reminderSub: { fontSize: 12, marginTop: 2 },
  reminderDismiss: { padding: 14 },
  ticketBannerWrap: { width: '100%' },
  dashWrap: { width: '100%' },
  dash: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 22, padding: 16 },
  dashIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFFFFF33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashLabel: { color: '#FFFFFFCC', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  dashValue: { color: '#FFF', fontSize: 26, fontWeight: '800', marginTop: 2 },
  dashSub: { color: '#FFFFFFD9', fontSize: 12, marginTop: 2 },
  ticketBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  ticketBannerTitle: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  ticketBannerSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 2 },
  card: {
    width: '47.8%',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    // No Android elevation: it draws a grey shadow through translucent views.
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 24,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 12,
    lineHeight: 17,
  },
});
