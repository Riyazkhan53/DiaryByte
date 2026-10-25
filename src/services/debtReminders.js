import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { ensureNotificationPermission, setupAutopayNotifications } from './autopayReminders';
import {
  REMIND_DAYS_BEFORE,
  addDays,
  daysBetween,
  dueLabel,
  formatDate,
  fromKey,
  money,
  todayKey,
} from '../utils/autopay';
import { upcomingDues } from '../utils/debts';

export const DEBTS_STORAGE_KEY = '@diarybyte_debts';
const WEB_NOTIFIED_KEY = '@diarybyte_debt_web_notified';
const CHANNEL_ID = 'debts';
const REMIND_AT_HOUR = 9; // 9 AM local time
// iOS keeps at most 64 pending local notifications per app, shared with
// autopay reminders.
const MAX_SCHEDULED = 30;

const isNative = Platform.OS !== 'web';

const KIND_LABEL = { emi: 'EMI', card: 'Credit card bill', bill: 'Bill' };

function reminderContent(due, daysLeft) {
  return {
    title: `${due.title} · ${dueLabel(daysLeft).toLowerCase()}`,
    body: `${KIND_LABEL[due.kind] || 'Payment'} of ${money(due.amount)} due on ${formatDate(due.dueDate)}`,
    data: { type: 'debt', key: due.key, due: due.dueDate },
  };
}

// ------- scheduling (native) -------

let channelPromise = null;

function setupDebtChannel() {
  if (Platform.OS !== 'android') return Promise.resolve();
  if (!channelPromise) {
    channelPromise = Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'EMI & bill reminders',
      importance: Notifications.AndroidImportance.HIGH,
    }).catch((error) => {
      channelPromise = null;
      console.error('Failed to set up debt notification channel', error);
    });
  }
  return channelPromise;
}

/**
 * Replace every scheduled EMI/bill reminder with a fresh set built from
 * `debts`: 9 AM on 2 days before, 1 day before and the due day of each
 * unpaid EMI and bill.
 */
let rescheduleQueue = Promise.resolve();

export function rescheduleDebtReminders(debts) {
  if (!isNative) return Promise.resolve();
  // One at a time, so overlapping calls can't leave duplicates behind.
  rescheduleQueue = rescheduleQueue.then(() => rescheduleNow(debts));
  return rescheduleQueue;
}

async function rescheduleNow(debts) {
  try {
    await setupAutopayNotifications();
    await setupDebtChannel();
    const granted = await ensureNotificationPermission();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => n.content?.data?.type === 'debt')
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
    );
    if (!granted) return;

    const now = Date.now();
    const pending = [];
    upcomingDues(debts).forEach((due) => {
      for (let before = REMIND_DAYS_BEFORE; before >= 0; before -= 1) {
        const at = fromKey(addDays(due.dueDate, -before));
        at.setHours(REMIND_AT_HOUR, 0, 0, 0);
        if (at.getTime() > now) pending.push({ at, due, daysLeft: before });
      }
    });
    pending.sort((a, b) => a.at - b.at);

    for (const { at, due, daysLeft } of pending.slice(0, MAX_SCHEDULED)) {
      await Notifications.scheduleNotificationAsync({
        content: reminderContent(due, daysLeft),
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: at,
          channelId: CHANNEL_ID,
        },
      });
    }
  } catch (error) {
    console.error('Failed to schedule EMI/bill reminders', error);
  }
}

// ------- browser alerts (web) -------

/**
 * Web can't schedule notifications for when the tab is closed, so while the
 * app is open, raise one browser notification per EMI/bill per day when it
 * is due within the next 2 days.
 */
export async function showDueDebtWebNotifications(debts) {
  if (isNative || typeof window === 'undefined' || !('Notification' in window)) return;
  if (window.Notification.permission !== 'granted') return;
  const today = todayKey();
  let notified = {};
  try {
    notified = JSON.parse((await AsyncStorage.getItem(WEB_NOTIFIED_KEY)) || '{}');
  } catch (_error) {
    notified = {};
  }
  const dues = upcomingDues(debts);
  // Forget dues that have passed so the record doesn't grow forever.
  const fresh = {};
  dues.forEach((due) => {
    if (notified[due.key]) fresh[due.key] = notified[due.key];
  });
  let changed = Object.keys(fresh).length !== Object.keys(notified).length;
  dues.forEach((due) => {
    const daysLeft = daysBetween(today, due.dueDate);
    if (daysLeft > REMIND_DAYS_BEFORE || fresh[due.key] === today) return;
    try {
      const { title, body } = reminderContent(due, daysLeft);
      new window.Notification(title, { body, tag: `debt-${due.key}` });
      fresh[due.key] = today;
      changed = true;
    } catch (_error) {
      // Some mobile browsers only allow notifications from a service worker.
    }
  });
  if (changed) {
    await AsyncStorage.setItem(WEB_NOTIFIED_KEY, JSON.stringify(fresh)).catch(() => {});
  }
}
