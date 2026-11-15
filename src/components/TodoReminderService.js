import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { readLocal, subscribeLocal } from '../services/sync';
import { TODO_STORAGE_KEY, rescheduleTodoReminders, showDueTodoWebNotifications } from '../services/todoReminders';

/**
 * Renders nothing. Keeps "1 hour before" to-do reminders current: re-plans
 * them on launch, on every change (done tasks drop out) and when the app
 * comes back. On the web it checks every minute while the tab is open.
 */
export default function TodoReminderService() {
  useEffect(() => {
    const refresh = (items) => {
      if (Platform.OS === 'web') showDueTodoWebNotifications(items || []);
      else rescheduleTodoReminders(items || []);
    };
    const refreshFromStorage = () => readLocal(TODO_STORAGE_KEY).then(refresh).catch(() => {});
    refreshFromStorage();
    const unsubscribe = subscribeLocal(TODO_STORAGE_KEY, refresh);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshFromStorage();
    });
    const timer = Platform.OS === 'web' ? setInterval(refreshFromStorage, 60000) : null;
    return () => {
      unsubscribe();
      appState.remove();
      if (timer) clearInterval(timer);
    };
  }, []);
  return null;
}
