import { Stack, ThemeProvider as NavigationThemeProvider, DefaultTheme, DarkTheme } from 'expo-router';
import { ShareIntentProvider } from 'expo-share-intent';
import * as SplashScreen from 'expo-splash-screen';
import { ThemeProvider, useTheme } from '../hooks/useTheme';
import ServerGate from '../components/ServerGate';
import AuthGate from '../components/AuthGate';
import { isGuest } from '../services/session';
import GlassBackground from '../components/GlassBackground';
import AutopayReminderService from '../components/AutopayReminderService';
import TripAlarmService from '../components/TripAlarmService';
import DebtReminderService from '../components/DebtReminderService';
import SipService from '../components/SipService';
import SyncService from '../components/SyncService';
import ShareIntentHandler from '../components/ShareIntentHandler';
import AnimatedSplash from '../components/AnimatedSplash';
import DeleteConfirmHost from '../components/DeleteConfirmHost';
import ScreenError from '../components/ScreenError';

// A screen that fails to draw shows what went wrong (with Try again / Go
// home) instead of a blank app; the other screens keep working.
export const unstable_settings = { screenErrorBoundary: ScreenError };
// And if the app frame itself fails.
export function ErrorBoundary(props) {
  return <ScreenError {...props} />;
}

// Keep the native splash up until the launch animation has drawn over it.
SplashScreen.preventAutoHideAsync();

const renderScreen = ({ children }) => <GlassBackground>{children}</GlassBackground>;

// Guests never wait for the server: their data is all on the device.
function MaybeServerGate({ children }) {
  return isGuest() ? children : <ServerGate>{children}</ServerGate>;
}

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
        <AuthGate>
          <AutopayReminderService />
          <TripAlarmService />
          <DebtReminderService />
          <SipService />
          <SyncService />
          <MaybeServerGate>
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
          </MaybeServerGate>
        </AuthGate>
      </GlassBackground>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ShareIntentProvider>
      <ThemeProvider>
        <GlassRoot />
        <DeleteConfirmHost />
        <AnimatedSplash />
      </ThemeProvider>
    </ShareIntentProvider>
  );
}
