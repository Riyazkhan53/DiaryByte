// Trip alarm: rings when you get within a chosen distance of a destination.
//
// Android runs a background location task (a foreground service with a
// "Trip alarm on" notification) that gets a GPS fix about every 20 seconds
// or 150 m. Each fix updates a "km to go" notification and, once inside the
// radius, rings on the alarm channel (alarm volume, custom tone, strong
// vibration) every 20 s until you tap Stop or Snooze. State lives in
// AsyncStorage on this device only.
//
// The task must be defined when the app's JS loads, so this module is
// imported from the root layout.

import { Platform } from 'react-native';
import './session'; // guest storage applies in the background task too
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { ensureNotificationPermission } from './autopayReminders';
import { TRIP_ALARM_KEY, clampRadius, distanceKm, formatDistance, onFix, snooze } from '../utils/tripAlarm';

export const TRIP_TASK = 'diarybyte-trip-alarm';
export const ALARM_CHANNEL = 'trip-alarm';
const STATUS_CHANNEL = 'trip-status';
export const TRIP_CATEGORY = 'trip-alarm';
export const STOP_ACTION = 'trip-stop';
export const SNOOZE_ACTION = 'trip-snooze';
const STATUS_ID = 'trip-status';
const RING_ID = 'trip-ring';

export const isSupported = Platform.OS === 'android';

const timeOf = (iso) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '');

// ------- state -------

export async function readTripAlarm() {
  try {
    const raw = await AsyncStorage.getItem(TRIP_ALARM_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_error) {
    return null;
  }
}

async function writeTripAlarm(state) {
  await AsyncStorage.setItem(TRIP_ALARM_KEY, JSON.stringify(state));
}

// ------- notifications -------

let channelsReady = null;
export function setupTripNotifications() {
  if (!isSupported) return Promise.resolve();
  channelsReady ||= (async () => {
    await Notifications.setNotificationChannelAsync(ALARM_CHANNEL, {
      name: 'Trip alarm',
      description: 'Rings when you are near your destination',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'trip_alarm.wav',
      vibrationPattern: [0, 900, 400, 900, 400, 900],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      // Alarm stream: plays at alarm volume, so it rings on most phones even on silent.
      audioAttributes: { usage: Notifications.AndroidAudioUsage.ALARM },
      enableVibrate: true,
    });
    await Notifications.setNotificationChannelAsync(STATUS_CHANNEL, {
      name: 'Trip alarm status',
      description: 'Distance left while a trip alarm is on',
      importance: Notifications.AndroidImportance.LOW,
      sound: null,
      vibrationPattern: null,
      enableVibrate: false,
    });
    await Notifications.setNotificationCategoryAsync(TRIP_CATEGORY, [
      { identifier: STOP_ACTION, buttonTitle: 'Stop', options: { opensAppToForeground: true } },
      { identifier: SNOOZE_ACTION, buttonTitle: 'Snooze 5 km', options: { opensAppToForeground: true } },
    ]);
  })().catch((error) => {
    channelsReady = null;
    console.error('Trip alarm notifications setup failed', error);
  });
  return channelsReady;
}

async function showStatus(state) {
  await Notifications.scheduleNotificationAsync({
    identifier: STATUS_ID,
    content: {
      title: `⏰ ${formatDistance(state.lastDistanceKm)} to ${state.name}`,
      body: `Alarm at ${formatDistance(state.radiusKm)} · updated ${timeOf(state.lastFixAt)}`,
      sticky: true,
      data: { type: 'trip-status' },
    },
    trigger: { channelId: STATUS_CHANNEL },
  });
}

async function ring(state) {
  await Notifications.scheduleNotificationAsync({
    identifier: `${RING_ID}-${(state.rings || 1) % 2}`,
    content: {
      title: `🔔 You're near ${state.name}!`,
      body: `${formatDistance(state.lastDistanceKm)} to go — time to get ready.`,
      sound: 'trip_alarm.wav',
      categoryIdentifier: TRIP_CATEGORY,
      priority: Notifications.AndroidNotificationPriority.MAX,
      sticky: true,
      data: { type: 'trip-alarm' },
    },
    trigger: { channelId: ALARM_CHANNEL },
  });
  // Only one ringing notification on screen at a time.
  await Notifications.dismissNotificationAsync(`${RING_ID}-${((state.rings || 1) + 1) % 2}`).catch(() => {});
}

async function clearNotifications() {
  await Promise.all(
    [STATUS_ID, `${RING_ID}-0`, `${RING_ID}-1`].map((id) => Notifications.dismissNotificationAsync(id).catch(() => {}))
  );
}

// ------- background task -------

if (isSupported) {
  TaskManager.defineTask(TRIP_TASK, async ({ data, error }) => {
    if (error) return;
    const locations = data?.locations || [];
    const fix = locations[locations.length - 1]?.coords;
    if (!fix) return;
    const state = await readTripAlarm();
    if (!state || (state.status !== 'active' && state.status !== 'ringing')) {
      await Location.stopLocationUpdatesAsync(TRIP_TASK).catch(() => {});
      return;
    }
    await setupTripNotifications();
    const result = onFix(state, fix);
    await writeTripAlarm(result.state);
    if (result.giveUp) {
      await finish(result.state);
      return;
    }
    await showStatus(result.state).catch(() => {});
    if (result.ring) await ring(result.state).catch(() => {});
  });
}

async function finish(state) {
  await writeTripAlarm(state);
  if (await Location.hasStartedLocationUpdatesAsync(TRIP_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(TRIP_TASK).catch(() => {});
  }
  await clearNotifications();
}

// ------- public -------

/**
 * Turn on a trip alarm for `destination` ({ name, latitude, longitude })
 * at `radiusKm`. Asks for notifications, location and "Allow all the
 * time". Returns { ok: true, state } or { ok: false, reason, settings? }.
 */
export async function startTripAlarm(destination, radiusKm) {
  if (!isSupported) return { ok: false, reason: 'The trip alarm works in the Android app.' };
  await setupTripNotifications();
  if (!(await ensureNotificationPermission())) {
    return { ok: false, reason: 'Allow notifications for DiaryByte so the alarm can ring.', settings: true };
  }
  if (!(await Location.hasServicesEnabledAsync())) {
    return { ok: false, reason: 'Turn on Location (GPS) on your phone, then try again.' };
  }
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return { ok: false, reason: 'Allow location access so the alarm knows where you are.', settings: true };
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') {
    return {
      ok: false,
      reason: 'Choose “Allow all the time” for location, so the alarm works with the screen off.',
      settings: true,
    };
  }
  const radius = clampRadius(radiusKm);
  let here = null;
  try {
    here = (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })).coords;
  } catch (_error) {
    // No fix yet: the background task will get one.
  }
  const now = new Date().toISOString();
  const state = {
    id: `${Date.now()}`,
    status: 'active',
    name: destination.name,
    destination: { latitude: destination.latitude, longitude: destination.longitude },
    radiusKm: radius,
    startedAt: now,
    startDistanceKm: here ? distanceKm(here, destination) : null,
    lastDistanceKm: here ? distanceKm(here, destination) : null,
    lastFixAt: here ? now : null,
    rings: 0,
  };
  await writeTripAlarm(state);
  await Location.startLocationUpdatesAsync(TRIP_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 20000,
    distanceInterval: 150,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: `Trip alarm on: ${destination.name}`,
      notificationBody: `Rings within ${formatDistance(radius)}. Tap to open.`,
      notificationColor: '#5E5CE6',
      killServiceOnDestroy: false,
    },
  });
  if (state.lastDistanceKm != null) await showStatus(state).catch(() => {});
  return { ok: true, state, alreadyInside: state.lastDistanceKm != null && state.lastDistanceKm <= radius };
}

/** Turn the alarm off (from the app, or the notification's Stop button). */
export async function stopTripAlarm(reason = 'stopped') {
  const state = (await readTripAlarm()) || {};
  await finish({ ...state, status: 'done', endedReason: reason, endedAt: new Date().toISOString() });
}

/** Ring again once 5 km closer (or stop, when that's past the destination). */
export async function snoozeTripAlarm() {
  const state = await readTripAlarm();
  if (!state) return null;
  const next = snooze(state);
  if (next.status === 'done') {
    await finish({ ...next, endedAt: new Date().toISOString() });
  } else {
    await writeTripAlarm(next);
    await clearNotifications();
    await showStatus(next).catch(() => {});
  }
  return next;
}

/** Look up a place by name: [{ name, detail, latitude, longitude }], best first. */
export async function searchPlaces(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const out = [];
  if (Platform.OS !== 'web') {
    try {
      const found = (await Location.geocodeAsync(q)).slice(0, 4);
      for (const f of found) {
        let detail = '';
        try {
          const [addr] = await Location.reverseGeocodeAsync({ latitude: f.latitude, longitude: f.longitude });
          detail = [addr?.city || addr?.subregion || addr?.district, addr?.region].filter(Boolean).join(', ');
        } catch (_error) {
          // label without address
        }
        out.push({ name: q, detail, latitude: f.latitude, longitude: f.longitude });
      }
    } catch (_error) {
      // fall back to OpenStreetMap below
    }
  }
  if (!out.length) {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=in&q=${encodeURIComponent(q)}`,
        { headers: { Accept: 'application/json' } }
      );
      const rows = response.ok ? await response.json() : [];
      rows.forEach((r) =>
        out.push({
          name: r.name || q,
          detail: String(r.display_name || '').split(',').slice(1, 4).join(',').trim(),
          latitude: parseFloat(r.lat),
          longitude: parseFloat(r.lon),
        })
      );
    } catch (_error) {
      // nothing found
    }
  }
  return out.filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
}
