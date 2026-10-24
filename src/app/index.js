import { StyleSheet, Text, View, ScrollView, TouchableOpacity, SafeAreaView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { useSyncedCollection } from '../hooks/useSyncedCollection';
import { AUTOPAY_STORAGE_KEY } from '../services/autopayReminders';
import { UpdateReadyBanner } from '../components/AppUpdates';
import { activeReminder, dueLabel, formatDate, money } from '../utils/autopay';
import { TICKETS_STORAGE_KEY, ticketType, countdownLabel, daysUntil, sortTickets } from '../utils/tickets';
import { DATES_STORAGE_KEY, sortDates, daysUntil as daysUntilDate } from '../utils/importantDates';

const TABS = [
  {
    key: 'diary',
    label: 'Personal Diary',
    description: 'Write and revisit your daily thoughts',
    icon: 'book-outline',
    route: '/diary',
    gradient: ['#C8E6C9', '#A5D6A7'],
  },
  {
    key: 'movies',
    label: 'Movies Watch List',
    description: 'Track films you want to watch',
    icon: 'film-outline',
    route: '/movies',
    gradient: ['#B3E5FC', '#81D4FA'],
  },
  {
    key: 'passwords',
    label: 'Saved Passwords',
    description: 'Keep your login credentials handy',
    icon: 'key-outline',
    route: '/passwords',
    gradient: ['#E1BEE7', '#CE93D8'],
  },
  {
    key: 'banking',
    label: 'Banking Details',
    description: 'Accounts, cards and UPI at a glance',
    icon: 'card-outline',
    route: '/banking',
    gradient: ['#FFCCBC', '#FFAB91'],
  },
  {
    key: 'vault',
    label: 'Personal Vault',
    description: 'Private notes and important info',
    icon: 'lock-closed-outline',
    route: '/vault',
    gradient: ['#D1C4E9', '#B39DDB'],
  },
  {
    key: 'todo',
    label: 'To-Do List',
    description: 'Tasks to keep your day on track',
    icon: 'checkbox-outline',
    route: '/todo',
    gradient: ['#C8E6C9', '#A5D6A7'],
  },
  {
    key: 'expenditure',
    label: 'My Expenditure',
    description: 'Track where your money goes',
    icon: 'wallet-outline',
    route: '/expenditure',
    gradient: ['#FFE0B2', '#FFCC80'],
  },
  {
    key: 'investments',
    label: 'My Investments',
    description: 'Mutual funds, stocks, gold & FDs',
    icon: 'trending-up-outline',
    route: '/investments',
    gradient: ['#B2DFDB', '#80CBC4'],
  },
  {
    key: 'balance',
    label: 'Account Balance',
    description: 'Bank balances at a glance',
    icon: 'cash-outline',
    route: '/balance',
    gradient: ['#BBDEFB', '#90CAF9'],
  },
  {
    key: 'debts',
    label: 'My Debts',
    description: 'Loans and money owed',
    icon: 'alert-circle-outline',
    route: '/debts',
    gradient: ['#FFCDD2', '#EF9A9A'],
  },
  {
    key: 'autopays',
    label: 'My Autopays',
    description: 'Recurring payments with reminders',
    icon: 'repeat-outline',
    route: '/autopays',
    gradient: ['#F8BBD0', '#F48FB1'],
  },
  {
    key: 'tickets',
    label: 'My Tickets',
    description: 'Flights, trains, movies & events',
    icon: 'ticket-outline',
    route: '/tickets',
    gradient: ['#C5CAE9', '#9FA8DA'],
  },
  {
    key: 'dates',
    label: 'Important Dates',
    description: 'Birthdays, anniversaries & occasions',
    icon: 'calendar-outline',
    route: '/important-dates',
    gradient: ['#FFECB3', '#FFD54F'],
  },
  {
    key: 'settings',
    label: 'Settings',
    description: 'Personalize your experience',
    icon: 'settings-outline',
    route: '/settings',
    gradient: ['#E0E0E0', '#BDBDBD'],
  },
];

export default function Dashboard() {
  const { theme, userName } = useTheme();
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

  return (
    <LinearGradient colors={theme.backgroundGradient} style={styles.root}>
      <SafeAreaView style={styles.container}>
        <StatusBar style={theme.statusBar} />
        <LinearGradient
          colors={theme.headerGradient}
          style={styles.header}
        >
          <Text style={styles.greetingEmoji}>{getGreetingEmoji()}</Text>
          <Text style={[styles.greeting, { color: theme.text }]}>
            Hi, {getGreeting()} {userName}!!
          </Text>
          <Text style={[styles.welcome, { color: theme.textSecondary }]}>
            Welcome back to your personal space
          </Text>
        </LinearGradient>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
        >
          <UpdateReadyBanner />
          {reminders.map(({ item, reminder }) => (
            <View
              key={item.id}
              style={[
                styles.reminder,
                { backgroundColor: theme.glassSurfaceStrong, borderColor: theme.border },
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
                colors={['#FFD54F', '#FFCA28']}
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
                { backgroundColor: theme.glassSurface, borderColor: theme.border },
              ]}
              onPress={() => router.push(tab.route)}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={tab.gradient}
                style={styles.iconWrap}
              >
                <Ionicons name={tab.icon} size={26} color="#37474F" />
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
    </LinearGradient>
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
    paddingTop: 60,
    paddingBottom: 32,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderTopWidth: 0,
  },
  greetingEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  greeting: {
    fontSize: 26,
    fontWeight: 'bold',
  },
  welcome: {
    fontSize: 15,
    marginTop: 6,
  },
  content: {
    flex: 1,
  },
  grid: {
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    paddingBottom: 30,
  },
  reminder: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FFB74D',
    paddingLeft: 14,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  reminderMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  reminderText: { flex: 1 },
  reminderTitle: { fontSize: 15, fontWeight: '700' },
  reminderSub: { fontSize: 12, marginTop: 2 },
  reminderDismiss: { padding: 14 },
  ticketBannerWrap: { width: '100%' },
  ticketBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  ticketBannerTitle: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  ticketBannerSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 2 },
  card: {
    width: '47%',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  cardDescription: {
    fontSize: 12,
    lineHeight: 17,
  },
});
