import { Stack, ThemeProvider as NavigationThemeProvider, DefaultTheme, DarkTheme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { ThemeProvider, useTheme } from '../hooks/useTheme';
import ServerGate from '../components/ServerGate';
import AuthGate from '../components/AuthGate';
import { isGuest } from '../services/session';
import GlassBackground from '../components/GlassBackground';
import AutopayReminderService from '../components/AutopayReminderService';
import TripAlarmService from '../components/TripAlarmService';
import DebtReminderService from '../components/DebtReminderService';
import IpoReminderService from '../components/IpoReminderService';
import SipService from '../components/SipService';
import SyncService from '../components/SyncService';
import ShareIntentHandler from '../components/ShareIntentHandler';
import OttShareHost from '../components/movies/OttShareHost';
import AnimatedSplash from '../components/AnimatedSplash';
import DeleteConfirmHost from '../components/DeleteConfirmHost';
import { AppShareProvider } from '../components/AppShareProvider';
import AppLockGate from '../components/AppLockGate';
import ScreenError from '../components/ScreenError';
import { trace } from '../utils/shareTrace';

// Record JS errors that would crash the app (so the cause can be seen in
// Settings → AI after a restart), then let React Native handle them as usual.
if (globalThis.ErrorUtils?.setGlobalHandler && !globalThis.__diarybyteErrorHook) {
  globalThis.__diarybyteErrorHook = true;
  const previous = globalThis.ErrorUtils.getGlobalHandler?.();
  globalThis.ErrorUtils.setGlobalHandler((error, isFatal) => {
    trace(`JS error${isFatal ? ' (fatal)' : ''}: ${error?.message || error} @ ${String(error?.stack || '').split('\n').slice(1, 3).join(' | ')}`);
    previous?.(error, isFatal);
  });
}

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
          <IpoReminderService />
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
            <OttShareHost />
          </MaybeServerGate>
        </AuthGate>
      </GlassBackground>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AppShareProvider>
      <ThemeProvider>
        <GlassRoot />
        <AppLockGate />
        <DeleteConfirmHost />
        <AnimatedSplash />
      </ThemeProvider>
    </AppShareProvider>
  );
}
