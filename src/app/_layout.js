import { Stack } from 'expo-router';
import { ShareIntentProvider } from 'expo-share-intent';
import { ThemeProvider } from '../hooks/useTheme';
import ServerGate from '../components/ServerGate';
import AutopayReminderService from '../components/AutopayReminderService';
import ShareIntentHandler from '../components/ShareIntentHandler';

export default function RootLayout() {
  return (
    <ShareIntentProvider>
      <ThemeProvider>
        <AutopayReminderService />
        <ServerGate>
          <Stack screenOptions={{ headerShown: false }} />
          <ShareIntentHandler />
        </ServerGate>
      </ThemeProvider>
    </ShareIntentProvider>
  );
}
