import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { ensureNotificationPermission, setupAutopayNotifications } from './autopayReminders';
import { TODO_REMIND_BEFORE_MS, dueAtOf, time12, todoReminders } from '../utils/todoDue';

export const TODO_STORAGE_KEY = '@diarybyte_todo';
const WEB_NOTIFIED_KEY = '@diarybyte_todo_web_notified';
const CHANNEL_ID = 'todos';
// iOS keeps at most 64 pending local notifications per app (shared).
const MAX_SCHEDULED = 20;
const isNative = Platform.OS !== 'web';

let channelPromise = null;
function setupChannel() {
  if (Platform.OS !== 'android') return Promise.resolve();
  if (!channelPromise) {
    channelPromise = Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'To-do reminders',
      importance: Notifications.AndroidImportance.HIGH,
    }).catch(() => {
      channelPromise = null;
    });
  }
  return channelPromise;
}

let queue = Promise.resolve();

/** Replace every scheduled to-do reminder with a fresh set built from `todos`. */
export function rescheduleTodoReminders(todos) {
  if (!isNative) return Promise.resolve();
  queue = queue.then(() => rescheduleNow(todos));
  return queue;
}

async function rescheduleNow(todos) {
  try {
    await setupAutopayNotifications();
    await setupChannel();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled.filter((n) => n.content?.data?.type === 'todo').map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
    );
    const wanted = todoReminders(todos).slice(0, MAX_SCHEDULED);
    if (!wanted.length) return;
    if (!(await ensureNotificationPermission())) return;
    for (const r of wanted) {
      await Notifications.scheduleNotificationAsync({
        content: { title: r.title, body: r.body, data: { type: 'todo', id: r.id } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at, channelId: CHANNEL_ID },
      });
    }
  } catch (error) {
    console.error('Failed to schedule to-do reminders', error);
  }
}

/** Web: while the app is open, a browser notification once a task is within 1 hour. */
export async function showDueTodoWebNotifications(todos) {
  if (isNative || typeof window === 'undefined' || !('Notification' in window)) return;
  if (window.Notification.permission !== 'granted') return;
  const now = Date.now();
  let notified = {};
  try {
    notified = JSON.parse((await AsyncStorage.getItem(WEB_NOTIFIED_KEY)) || '{}');
  } catch {
    notified = {};
  }
  let changed = false;
  (todos || [])
    .filter((t) => !t.done)
    .forEach((t) => {
      const due = dueAtOf(t);
      if (!due) return;
      const key = `${t.id}:${t.dueDate}T${t.dueTime}`;
      const left = due.getTime() - now;
      if (left <= 0 || left > TODO_REMIND_BEFORE_MS || notified[key]) return;
      try {
        new window.Notification(`To-do soon: ${t.title}`, { body: `Due at ${time12(t.dueTime)}`, tag: `todo-${key}` });
        notified[key] = now;
        changed = true;
      } catch {
        // Some mobile browsers only allow notifications from a service worker.
      }
    });
  // Forget entries older than 2 days.
  Object.entries(notified).forEach(([k, at]) => {
    if (now - at > 2 * 86400000) {
      delete notified[k];
      changed = true;
    }
  });
  if (changed) await AsyncStorage.setItem(WEB_NOTIFIED_KEY, JSON.stringify(notified)).catch(() => {});
}
