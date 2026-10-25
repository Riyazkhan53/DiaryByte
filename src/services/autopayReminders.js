import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { readLocal, saveAndPush, notifyLocal } from './sync';
import {
  REMIND_DAYS_BEFORE,
  activeReminder,
  addDays,
  dueLabel,
  formatDate,
  fromKey,
  money,
  pendingDues,
} from '../utils/autopay';

export const AUTOPAY_STORAGE_KEY = '@diarybyte_autopays';
const WEB_NOTIFIED_KEY = '@diarybyte_autopay_web_notified';
const CATEGORY_ID = 'autopay-reminder';
const CHANNEL_ID = 'autopays';
export const ACK_ACTION_ID = 'autopay-ack-cycle';
const REMIND_AT_HOUR = 9; // 9 AM local time
const CYCLES_AHEAD = 3;
// iOS keeps at most 64 pending local notifications per app, shared with
// EMI/bill reminders (debtReminders.js).
const MAX_SCHEDULED = 32;

const isNative = Platform.OS !== 'web';

// ------- setup (native) -------

let setupPromise = null;

export function setupAutopayNotifications() {
  if (!isNative) return Promise.resolve();
  if (!setupPromise) {
    setupPromise = (async () => {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
          name: 'Autopay reminders',
          importance: Notifications.AndroidImportance.HIGH,
        });
      }
      await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
        {
          identifier: ACK_ACTION_ID,
          buttonTitle: "Don't remind this cycle",
          // Must open the app, or the action is lost when the app was killed.
          options: { opensAppToForeground: true },
        },
      ]);
    })().catch((error) => {
      setupPromise = null;
      console.error('Failed to set up autopay notifications', error);
    });
  }
  return setupPromise;
}

export async function ensureNotificationPermission() {
  if (!isNative) return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch (error) {
    console.error('Notification permission check failed', error);
    return false;
  }
}

// ------- scheduling (native) -------

function reminderContent(autopay, due, daysLeft) {
  return {
    title: `${autopay.name} · ${dueLabel(daysLeft).toLowerCase()}`,
    body: `${money(autopay.amount)} autopay on ${formatDate(due)}`,
    categoryIdentifier: CATEGORY_ID,
    data: { type: 'autopay', autopayId: autopay.id, due },
  };
}

/**
 * Replace every scheduled autopay reminder with a fresh set built from
 * `autopays`: 9 AM on 2 days before, 1 day before and the due day, for the
 * next few cycles that haven't been dismissed.
 */
let rescheduleQueue = Promise.resolve();

export function rescheduleAutopayReminders(autopays) {
  if (!isNative) return Promise.resolve();
  // Run one at a time, so overlapping calls can't interleave cancel/schedule
  // and leave duplicate reminders behind.
  rescheduleQueue = rescheduleQueue.then(() => rescheduleNow(autopays));
  return rescheduleQueue;
}

async function rescheduleNow(autopays) {
  try {
    await setupAutopayNotifications();
    const granted = await ensureNotificationPermission();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => n.content?.data?.type === 'autopay')
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
    );
    if (!granted) return;

    const now = Date.now();
    const pending = [];
    autopays.forEach((autopay) => {
      pendingDues(autopay, undefined, CYCLES_AHEAD).forEach((due) => {
        for (let before = REMIND_DAYS_BEFORE; before >= 0; before -= 1) {
          const at = fromKey(addDays(due, -before));
          at.setHours(REMIND_AT_HOUR, 0, 0, 0);
          if (at.getTime() > now) pending.push({ at, autopay, due, daysLeft: before });
        }
      });
    });
    pending.sort((a, b) => a.at - b.at);

    for (const { at, autopay, due, daysLeft } of pending.slice(0, MAX_SCHEDULED)) {
      await Notifications.scheduleNotificationAsync({
        content: reminderContent(autopay, due, daysLeft),
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: at,
          channelId: CHANNEL_ID,
        },
      });
    }
  } catch (error) {
    console.error('Failed to schedule autopay reminders', error);
  }
}

// ------- dismissing a cycle -------

/**
 * Stop reminders for one cycle. `ackDue` only moves forward, so dismissing
 * an old notification can't re-enable a later cycle's reminders.
 */
export async function acknowledgeAutopayCycle(autopayId, due) {
  const items = await readLocal(AUTOPAY_STORAGE_KEY);
  let changed = false;
  const updated = items.map((item) => {
    if (item.id !== autopayId || (item.ackDue && item.ackDue >= due)) return item;
    changed = true;
    return { ...item, ackDue: due };
  });
  if (!changed) return;
  notifyLocal(AUTOPAY_STORAGE_KEY, updated);
  await saveAndPush('autopays', AUTOPAY_STORAGE_KEY, updated);
  await rescheduleAutopayReminders(updated);
}

// ------- browser alerts (web) -------

export function webNotificationPermission() {
  if (isNative || typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return window.Notification.permission;
}

export async function requestWebNotificationPermission() {
  if (webNotificationPermission() === 'unsupported') return 'unsupported';
  return window.Notification.requestPermission();
}

/**
 * Web can't schedule notifications for when the tab is closed, so while the
 * app is open, raise one browser notification per autopay per day when it is
 * inside its reminder window.
 */
export async function showDueWebNotifications(autopays) {
  if (webNotificationPermission() !== 'granted') return;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  let notified = {};
  try {
    notified = JSON.parse((await AsyncStorage.getItem(WEB_NOTIFIED_KEY)) || '{}');
  } catch (_error) {
    notified = {};
  }
  let changed = false;
  autopays.forEach((autopay) => {
    const reminder = activeReminder(autopay);
    if (!reminder || notified[autopay.id] === todayStr) return;
    try {
      const { title, body } = reminderContent(autopay, reminder.due, reminder.daysLeft);
      new window.Notification(title, { body, tag: `autopay-${autopay.id}` });
      notified[autopay.id] = todayStr;
      changed = true;
    } catch (_error) {
      // Some mobile browsers only allow notifications from a service worker.
    }
  });
  if (changed) {
    await AsyncStorage.setItem(WEB_NOTIFIED_KEY, JSON.stringify(notified)).catch(() => {});
  }
}
