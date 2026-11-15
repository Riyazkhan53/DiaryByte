import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { readLocal, subscribeLocal } from '../services/sync';
import { IPOAPPS_STORAGE_KEY, rescheduleIpoReminders, showDueIpoWebNotifications } from '../services/ipoReminders';

/**
 * Renders nothing. Keeps IPO reminders current: listing day of allotted IPOs
 * and the allotment check after bidding closes. Re-plans on launch, on every
 * change and when the app comes back.
 */
export default function IpoReminderService() {
  useEffect(() => {
    const refresh = (items) => {
      if (Platform.OS === 'web') showDueIpoWebNotifications(items || []);
      else rescheduleIpoReminders(items || []);
    };
    const refreshFromStorage = () => readLocal(IPOAPPS_STORAGE_KEY).then(refresh).catch(() => {});
    refreshFromStorage();
    const unsubscribe = subscribeLocal(IPOAPPS_STORAGE_KEY, refresh);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshFromStorage();
    });
    const timer = Platform.OS === 'web' ? setInterval(refreshFromStorage, 3600000) : null;
    return () => {
      unsubscribe();
      appState.remove();
      if (timer) clearInterval(timer);
    };
  }, []);
  return null;
}
