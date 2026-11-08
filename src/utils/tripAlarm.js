// Trip alarm maths: straight-line distance to the destination and what to do
// on each new location fix. Pure functions, used by the background task.

export const TRIP_ALARM_KEY = '@diarybyte_trip_alarm';
export const RADIUS_CHOICES = [2, 5, 10, 15, 20, 30, 50];
export const DEFAULT_RADIUS_KM = 10;
export const MIN_RADIUS_KM = 0.5;
export const MAX_RADIUS_KM = 100;
export const RING_EVERY_MS = 20000; // re-ring while not stopped
export const MAX_RINGS = 30; // ~10 minutes of ringing, then give up
export const SNOOZE_KM = 5;

const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance in km between two { latitude, longitude } points. */
export function distanceKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const clampRadius = (km) => Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, Number(km) || DEFAULT_RADIUS_KM));

/** "86 km", "9.4 km", "650 m". */
export function formatDistance(km) {
  if (km == null || !Number.isFinite(km)) return '—';
  if (km < 1) return `${Math.round(km * 1000 / 10) * 10} m`;
  if (km < 20) return `${Number.isInteger(km) ? km : km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/**
 * New state after a location fix, and whether to sound the alarm now.
 * `state`: { status: 'active' | 'ringing', destination: { latitude,
 * longitude }, radiusKm, lastRingAt?, rings? }. Returns { state, ring,
 * giveUp }. Accuracy worse than the radius (e.g. a 3 km cell fix for a 2 km
 * radius) can't trigger the alarm on its own.
 */
export function onFix(state, fix, now = Date.now()) {
  if (!state || (state.status !== 'active' && state.status !== 'ringing')) return { state, ring: false, giveUp: false };
  const km = distanceKm(fix, state.destination);
  const accuracyKm = Number.isFinite(fix.accuracy) ? fix.accuracy / 1000 : 0;
  const next = { ...state, lastDistanceKm: km, lastFixAt: new Date(now).toISOString(), lastAccuracyM: fix.accuracy ?? null };
  const inside = km <= state.radiusKm && accuracyKm <= Math.max(1, state.radiusKm);
  if (state.status === 'active') {
    if (!inside) return { state: next, ring: false, giveUp: false };
    return { state: { ...next, status: 'ringing', arrivedAt: next.lastFixAt, lastRingAt: now, rings: 1 }, ring: true, giveUp: false };
  }
  // Ringing: keep ringing until stopped, at most MAX_RINGS times.
  const rings = state.rings || 1;
  if (rings >= MAX_RINGS) return { state: { ...next, status: 'done', endedReason: 'unanswered' }, ring: false, giveUp: true };
  if (now - (state.lastRingAt || 0) >= RING_EVERY_MS) {
    return { state: { ...next, lastRingAt: now, rings: rings + 1 }, ring: true, giveUp: false };
  }
  return { state: next, ring: false, giveUp: false };
}

/**
 * Snooze: ring again once SNOOZE_KM closer. Returns the new state, or a
 * finished one when there's no room left to snooze.
 */
export function snooze(state) {
  const km = state?.lastDistanceKm;
  if (!Number.isFinite(km) || km - SNOOZE_KM < MIN_RADIUS_KM) return { ...state, status: 'done', endedReason: 'snoozed-at-end' };
  return { ...state, status: 'active', radiusKm: Math.round((km - SNOOZE_KM) * 10) / 10, lastRingAt: null, rings: 0 };
}
