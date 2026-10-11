import { StyleSheet, Text, ScrollView, TouchableOpacity, SafeAreaView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTheme } from '../hooks/useTheme';

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
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
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
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.card,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                shadowColor: theme.shadow,
              },
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 32,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
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
