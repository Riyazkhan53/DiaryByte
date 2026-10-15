import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { readLocal, subscribeLocal } from '../services/sync';
import {
  ACK_ACTION_ID,
  AUTOPAY_STORAGE_KEY,
  acknowledgeAutopayCycle,
  rescheduleAutopayReminders,
  setupAutopayNotifications,
  showDueWebNotifications,
} from '../services/autopayReminders';

const handledResponses = new Set();

async function handleResponse(response) {
  if (!response) return;
  const id = response.notification.request.identifier;
  if (handledResponses.has(id)) return;
  handledResponses.add(id);
  const data = response.notification.request.content.data || {};
  if (response.actionIdentifier === ACK_ACTION_ID && data.type === 'autopay') {
    await acknowledgeAutopayCycle(data.autopayId, data.due);
    await Notifications.dismissNotificationAsync(id).catch(() => {});
  }
}

/**
 * Renders nothing. Keeps autopay reminders current for the whole app:
 * re-plans them on launch, on every edit and when the app is reopened
 * (so recurring cycles keep rolling forward), and handles the
 * "Don't remind this cycle" notification button.
 */
export default function AutopayReminderService() {
  useEffect(() => {
    const refresh = (items) => {
      if (Platform.OS === 'web') showDueWebNotifications(items);
      else rescheduleAutopayReminders(items);
    };
    const refreshFromStorage = () => readLocal(AUTOPAY_STORAGE_KEY).then(refresh).catch(() => {});

    refreshFromStorage();
    const unsubscribe = subscribeLocal(AUTOPAY_STORAGE_KEY, refresh);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshFromStorage();
    });
    // Web tabs can stay open across days; re-check hourly.
    const timer = Platform.OS === 'web' ? setInterval(refreshFromStorage, 3600000) : null;

    let responseSub = null;
    if (Platform.OS !== 'web') {
      setupAutopayNotifications().then(() =>
        Notifications.getLastNotificationResponseAsync().then(handleResponse).catch(() => {})
      );
      responseSub = Notifications.addNotificationResponseReceivedListener(handleResponse);
    }

    return () => {
      unsubscribe();
      appState.remove();
      if (timer) clearInterval(timer);
      if (responseSub) responseSub.remove();
    };
  }, []);

  return null;
}
