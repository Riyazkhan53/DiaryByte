import { Stack } from 'expo-router';
import { ThemeProvider } from '../hooks/useTheme';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}
