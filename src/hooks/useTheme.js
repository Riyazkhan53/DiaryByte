import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LIGHT_THEME, DARK_THEME } from '../constants/theme';

// 'auto' | 'light' | 'dark'. A new key (not the old '@diarybyte_theme') so
// everyone starts on auto; tapping a theme toggle switches to manual.
const THEME_MODE_STORAGE_KEY = '@diarybyte_theme_mode';
const DARK_FROM_HOUR = 18; // 6 PM
const DARK_UNTIL_HOUR = 6; // 6 AM

export function isNightTime(date = new Date()) {
  const hour = date.getHours();
  return hour >= DARK_FROM_HOUR || hour < DARK_UNTIL_HOUR;
}

// Milliseconds until the next 6 AM / 6 PM switch.
function msUntilNextSwitch(date = new Date()) {
  const next = new Date(date);
  next.setMinutes(0, 0, 0);
  const hour = date.getHours();
  if (hour < DARK_UNTIL_HOUR) {
    next.setHours(DARK_UNTIL_HOUR);
  } else if (hour < DARK_FROM_HOUR) {
    next.setHours(DARK_FROM_HOUR);
  } else {
    next.setDate(next.getDate() + 1);
    next.setHours(DARK_UNTIL_HOUR);
  }
  return next.getTime() - date.getTime();
}
const PROFILE_STORAGE_KEY = '@diarybyte_profile';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [themeMode, setThemeMode] = useState('auto');
  const [night, setNight] = useState(() => isNightTime());
  const [isReady, setIsReady] = useState(false);
  const [userName, setUserName] = useState('Riyazkhan');

  useEffect(() => {
    const loadAll = async () => {
      try {
        const [storedTheme, storedName] = await Promise.all([
          AsyncStorage.getItem(THEME_MODE_STORAGE_KEY),
          AsyncStorage.getItem(PROFILE_STORAGE_KEY),
        ]);
        if (storedTheme === 'light' || storedTheme === 'dark') {
          setThemeMode(storedTheme);
        }
        if (storedName !== null) {
          setUserName(storedName);
        }
      } catch (error) {
        console.error('Failed to load settings', error);
      } finally {
        setIsReady(true);
      }
    };
    loadAll();
  }, []);

  // Re-check the clock at each 6 AM / 6 PM boundary, and whenever the app
  // returns to the foreground (timers don't run while it's suspended).
  useEffect(() => {
    if (themeMode !== 'auto') return undefined;
    let timer;
    const refresh = () => {
      clearTimeout(timer);
      setNight(isNightTime());
      timer = setTimeout(refresh, msUntilNextSwitch() + 1000);
    };
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [themeMode]);

  const isDark = themeMode === 'auto' ? night : themeMode === 'dark';

  const updateThemeMode = useCallback(async (mode) => {
    setThemeMode(mode);
    try {
      await AsyncStorage.setItem(THEME_MODE_STORAGE_KEY, mode);
    } catch (error) {
      console.error('Failed to save theme', error);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    updateThemeMode(isDark ? 'light' : 'dark');
  }, [isDark, updateThemeMode]);

  const updateUserName = useCallback(async (name) => {
    setUserName(name);
    try {
      await AsyncStorage.setItem(PROFILE_STORAGE_KEY, name);
    } catch (error) {
      console.error('Failed to save name', error);
    }
  }, []);

  const theme = isDark ? DARK_THEME : LIGHT_THEME;

  return (
    <ThemeContext.Provider
      value={{
        isDark,
        theme,
        themeMode,
        updateThemeMode,
        toggleTheme,
        isReady,
        userName,
        updateUserName,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
