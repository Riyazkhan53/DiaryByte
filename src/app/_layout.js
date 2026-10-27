import { Stack, ThemeProvider as NavigationThemeProvider, DefaultTheme, DarkTheme } from 'expo-router';
import { ShareIntentProvider } from 'expo-share-intent';
import { ThemeProvider, useTheme } from '../hooks/useTheme';
import ServerGate from '../components/ServerGate';
import GlassBackground from '../components/GlassBackground';
import AutopayReminderService from '../components/AutopayReminderService';
import DebtReminderService from '../components/DebtReminderService';
import SipService from '../components/SipService';
import ShareIntentHandler from '../components/ShareIntentHandler';

const renderScreen = ({ children }) => <GlassBackground>{children}</GlassBackground>;

function GlassRoot() {
  const { theme, isDark } = useTheme();
  // Navigation paints its own opaque background behind every screen unless
  // told otherwise, which hides GlassBackground.
  const base = isDark ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: { ...base.colors, background: 'transparent', card: 'transparent', primary: theme.primary },
  };
  return (
    <NavigationThemeProvider value={navigationTheme}>
      <GlassBackground>
        <AutopayReminderService />
        <DebtReminderService />
        <SipService />
        <ServerGate>
          <Stack
            // Each screen gets its own backdrop so slide transitions don't
            // show the previous screen through the translucent glass.
            screenLayout={renderScreen}
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: 'transparent' },
              animation: 'slide_from_right',
            }}
          />
          <ShareIntentHandler />
        </ServerGate>
      </GlassBackground>
    </NavigationThemeProvider>
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
