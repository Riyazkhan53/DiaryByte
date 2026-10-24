import { Stack } from 'expo-router';
import { ShareIntentProvider } from 'expo-share-intent';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';
import { ThemeProvider, useTheme } from '../hooks/useTheme';
import ServerGate from '../components/ServerGate';
import AutopayReminderService from '../components/AutopayReminderService';
import ShareIntentHandler from '../components/ShareIntentHandler';

function GlassRoot() {
  const { theme } = useTheme();
  return (
    <LinearGradient colors={theme.backgroundGradient} style={styles.root}>
      <AutopayReminderService />
      <ServerGate>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: 'transparent' },
            animation: 'slide_from_right',
          }}
        />
        <ShareIntentHandler />
      </ServerGate>
    </LinearGradient>
  );
}

export default function RootLayout() {
  return (
    <ShareIntentProvider>
      <ThemeProvider>
        <GlassRoot />
      </ThemeProvider>
    </ShareIntentProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
