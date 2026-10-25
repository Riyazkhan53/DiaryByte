import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { readLocal, subscribeLocal } from '../services/sync';
import {
  DEBTS_STORAGE_KEY,
  rescheduleDebtReminders,
  showDueDebtWebNotifications,
} from '../services/debtReminders';

/**
 * Renders nothing. Keeps EMI and bill reminders current for the whole app:
 * re-plans them on launch, on every edit (paying a due cancels its
 * reminders) and when the app is reopened, so EMIs keep rolling forward.
 */
export default function DebtReminderService() {
  useEffect(() => {
    const refresh = (items) => {
      if (Platform.OS === 'web') showDueDebtWebNotifications(items);
      else rescheduleDebtReminders(items);
    };
    const refreshFromStorage = () => readLocal(DEBTS_STORAGE_KEY).then(refresh).catch(() => {});

    refreshFromStorage();
    const unsubscribe = subscribeLocal(DEBTS_STORAGE_KEY, refresh);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshFromStorage();
    });
    // Web tabs can stay open across days; re-check hourly.
    const timer = Platform.OS === 'web' ? setInterval(refreshFromStorage, 3600000) : null;

    return () => {
      unsubscribe();
      appState.remove();
      if (timer) clearInterval(timer);
    };
  }, []);

  return null;
}
