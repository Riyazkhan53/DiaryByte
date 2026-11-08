import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import {
  SNOOZE_ACTION,
  STOP_ACTION,
  isSupported,
  setupTripNotifications,
  snoozeTripAlarm,
  stopTripAlarm,
} from '../services/tripAlarm';

const handled = new Set();

async function handleResponse(response) {
  if (!response) return;
  const data = response.notification.request.content.data || {};
  if (data.type !== 'trip-alarm' && data.type !== 'trip-status') return;
  const key = `${response.notification.request.identifier}:${response.notification.date}:${response.actionIdentifier}`;
  if (handled.has(key)) return;
  handled.add(key);
  if (response.actionIdentifier === STOP_ACTION) await stopTripAlarm('stopped');
  else if (response.actionIdentifier === SNOOZE_ACTION) await snoozeTripAlarm();
  router.push('/tickets/alarm');
}

/**
 * Renders nothing. Loads the trip alarm's background task with the app
 * (importing the service defines it) and handles the alarm notification's
 * Stop / Snooze buttons and taps.
 */
export default function TripAlarmService() {
  useEffect(() => {
    if (!isSupported) return undefined;
    setupTripNotifications().then(() => Notifications.getLastNotificationResponseAsync().then(handleResponse).catch(() => {}));
    const sub = Notifications.addNotificationResponseReceivedListener(handleResponse);
    return () => sub.remove();
  }, []);
  return null;
}
