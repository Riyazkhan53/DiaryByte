import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { ensureNotificationPermission, setupAutopayNotifications } from './autopayReminders';
import { addDays, fromKey, todayKey } from '../utils/autopay';
import { HOT_GMP_PCT, allottedListings, appFor, gmpPctOf } from '../utils/ipoApps';

export { IPOAPPS_STORAGE_KEY } from '../utils/ipoApps';
const WEB_NOTIFIED_KEY = '@diarybyte_ipo_web_notified';
const CHANNEL_ID = 'ipos';
const MAX_SCHEDULED = 10;
const isNative = Platform.OS !== 'web';

/**
 * The reminders to show: 9 AM the day before and on the listing day of each
 * allotted IPO, and 6 PM the day after bidding closes for an applied IPO
 * (allotment is usually out by then). [{ key, date, hour, title, body }]
 */
export function ipoReminders(apps, today = todayKey(), ipos = []) {
  const out = [];
  // "Good to apply" on the morning bidding opens, for IPOs with GMP above
  // 20% you haven't marked (a suggestion: you apply in your broker app).
  (ipos || [])
    .filter((i) => i?.id && i.openDate && !appFor(apps, i) && (gmpPctOf(i) ?? -Infinity) > HOT_GMP_PCT)
    .filter((i) => i.status !== 'listed' && (!i.closeDate || i.closeDate >= today))
    .forEach((i) => {
      const close = i.closeDate ? ` · bidding open till ${Number(i.closeDate.slice(8))} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(i.closeDate.slice(5, 7)) - 1]}` : '';
      out.push({
        key: `ipo-open:${i.id}`,
        date: i.openDate,
        hour: 10,
        title: `👍 Good to apply: ${i.name}`,
        body: `GMP +${gmpPctOf(i)}% (unofficial)${close}. Apply in your broker app if you agree, then mark it applied in DiaryByte.`,
      });
    });
  allottedListings(apps, today)
    .filter((a) => a.listingDate)
    .forEach((a) => {
      out.push({ key: `ipo-list-1:${a.id}`, date: addDays(a.listingDate, -1), hour: 9, title: `${a.name} lists tomorrow`, body: 'Your allotted IPO lists tomorrow.' });
      out.push({ key: `ipo-list-0:${a.id}`, date: a.listingDate, hour: 9, title: `${a.name} lists today`, body: 'Your allotted IPO lists today. Markets open at 10 AM on listing day.' });
    });
  (apps || [])
    .filter((a) => a.status === 'applied' && !a.result && a.closeDate)
    .forEach((a) => {
      out.push({ key: `ipo-allot:${a.id}`, date: addDays(a.closeDate, 1), hour: 18, title: `IPO allotted? ${a.name}`, body: 'Allotment should be out. Open DiaryByte and mark Yes or No.' });
    });
  return out.filter((r) => r.date >= today);
}

let channelPromise = null;
function setupChannel() {
  if (Platform.OS !== 'android') return Promise.resolve();
  if (!channelPromise) {
    channelPromise = Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'IPO reminders',
      importance: Notifications.AndroidImportance.HIGH,
    }).catch(() => {
      channelPromise = null;
    });
  }
  return channelPromise;
}

let queue = Promise.resolve();

/** Replace every scheduled IPO reminder with a fresh set built from `apps`. */
export function rescheduleIpoReminders(apps, ipos = []) {
  if (!isNative) return Promise.resolve();
  queue = queue.then(() => rescheduleNow(apps, ipos));
  return queue;
}

async function rescheduleNow(apps, ipos) {
  try {
    await setupAutopayNotifications();
    await setupChannel();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled.filter((n) => n.content?.data?.type === 'ipo').map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
    );
    const wanted = ipoReminders(apps, todayKey(), ipos);
    if (!wanted.length) return;
    if (!(await ensureNotificationPermission())) return;
    const now = Date.now();
    const pending = wanted
      .map((r) => {
        const at = fromKey(r.date);
        at.setHours(r.hour, 0, 0, 0);
        return { ...r, at };
      })
      .filter((r) => r.at.getTime() > now)
      .sort((a, b) => a.at - b.at)
      .slice(0, MAX_SCHEDULED);
    for (const r of pending) {
      await Notifications.scheduleNotificationAsync({
        content: { title: r.title, body: r.body, data: { type: 'ipo', key: r.key, url: '/ipos' } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at, channelId: CHANNEL_ID },
      });
    }
  } catch (error) {
    console.error('Failed to schedule IPO reminders', error);
  }
}

/** Web: while the app is open, one browser notification per reminder on its day. */
export async function showDueIpoWebNotifications(apps, ipos = []) {
  if (isNative || typeof window === 'undefined' || !('Notification' in window)) return;
  if (window.Notification.permission !== 'granted') return;
  const today = todayKey();
  const hour = new Date().getHours();
  let notified = {};
  try {
    notified = JSON.parse((await AsyncStorage.getItem(WEB_NOTIFIED_KEY)) || '{}');
  } catch {
    notified = {};
  }
  const due = ipoReminders(apps, today, ipos).filter((r) => r.date === today && hour >= r.hour && !notified[r.key]);
  if (!due.length) return;
  due.forEach((r) => {
    try {
      new window.Notification(r.title, { body: r.body, tag: r.key });
      notified[r.key] = today;
    } catch {
      // Some mobile browsers only allow notifications from a service worker.
    }
  });
  // Keep only recent entries.
  const fresh = Object.fromEntries(Object.entries(notified).filter(([, d]) => d >= addDays(today, -14)));
  await AsyncStorage.setItem(WEB_NOTIFIED_KEY, JSON.stringify(fresh)).catch(() => {});
}
