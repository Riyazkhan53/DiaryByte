import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { readLocal, subscribeLocal } from '../services/sync';
import { IPO_LIST_KEY } from '../utils/ipoApps';
import { IPOAPPS_STORAGE_KEY, rescheduleIpoReminders, showDueIpoWebNotifications } from '../services/ipoReminders';

/**
 * Renders nothing. Keeps IPO reminders current: "good to apply" on the day
 * bidding opens (GMP above 20%), the allotment check after bidding closes and
 * listing day of allotted IPOs. Re-plans on launch, on every change and when
 * the app comes back.
 */
export default function IpoReminderService() {
  useEffect(() => {
    // The IPO list as IPO Watch / the home screen last saved it.
    const savedIpos = () =>
      AsyncStorage.getItem(IPO_LIST_KEY)
        .then((raw) => JSON.parse(raw || 'null')?.ipos || [])
        .catch(() => []);
    const refresh = async (items) => {
      const ipos = await savedIpos();
      if (Platform.OS === 'web') showDueIpoWebNotifications(items || [], ipos);
      else rescheduleIpoReminders(items || [], ipos);
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
