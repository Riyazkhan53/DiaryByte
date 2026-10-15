import { Stack } from 'expo-router';
import { ThemeProvider } from '../hooks/useTheme';
import ServerGate from '../components/ServerGate';
import AutopayReminderService from '../components/AutopayReminderService';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AutopayReminderService />
      <ServerGate>
        <Stack screenOptions={{ headerShown: false }} />
      </ServerGate>
    </ThemeProvider>
  );
}
