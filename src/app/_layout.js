import { Stack } from 'expo-router';
import { ThemeProvider } from '../hooks/useTheme';
import ServerGate from '../components/ServerGate';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <ServerGate>
        <Stack screenOptions={{ headerShown: false }} />
      </ServerGate>
    </ThemeProvider>
  );
}
