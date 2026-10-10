import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LIGHT_THEME, DARK_THEME } from '../constants/theme';

const THEME_STORAGE_KEY = '@diarybyte_theme';
const PROFILE_STORAGE_KEY = '@diarybyte_profile';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [userName, setUserName] = useState('Riyazkhan');

  useEffect(() => {
    const loadAll = async () => {
      try {
        const [storedTheme, storedName] = await Promise.all([
          AsyncStorage.getItem(THEME_STORAGE_KEY),
          AsyncStorage.getItem(PROFILE_STORAGE_KEY),
        ]);
        if (storedTheme !== null) {
          setIsDark(storedTheme === 'dark');
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

  const toggleTheme = useCallback(async () => {
    const next = !isDark;
    setIsDark(next);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, next ? 'dark' : 'light');
    } catch (error) {
      console.error('Failed to save theme', error);
    }
  }, [isDark]);

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
      value={{ isDark, theme, toggleTheme, isReady, userName, updateUserName }}
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
