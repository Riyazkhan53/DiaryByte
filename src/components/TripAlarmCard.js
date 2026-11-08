import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { isSupported, readTripAlarm } from '../services/tripAlarm';
import { formatDistance } from '../utils/tripAlarm';

/** The trip alarm's state (kept on this device), re-read every few seconds. */
export function useTripAlarm(everyMs = 5000) {
  const [alarm, setAlarm] = useState(null);
  useEffect(() => {
    if (!isSupported) return undefined;
    const load = () => readTripAlarm().then(setAlarm);
    load();
    const timer = setInterval(load, everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return alarm && (alarm.status === 'active' || alarm.status === 'ringing') ? alarm : null;
}

const timeOf = (iso) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : null);

/**
 * A banner while a trip alarm is on: destination, km to go, a progress bar
 * and when it last updated. Nothing when there's no alarm. Taps open it.
 */
export default function TripAlarmCard({ style }) {
  const alarm = useTripAlarm();
  if (!alarm) return null;
  const ringing = alarm.status === 'ringing';
  const progress =
    alarm.startDistanceKm > alarm.radiusKm && alarm.lastDistanceKm != null
      ? Math.min(1, Math.max(0, (alarm.startDistanceKm - alarm.lastDistanceKm) / (alarm.startDistanceKm - alarm.radiusKm)))
      : null;
  const updated = timeOf(alarm.lastFixAt);
  return (
    <TouchableOpacity
      style={[styles.wrap, style]}
      onPress={() => router.push('/tickets/alarm')}
      activeOpacity={0.85}
      accessibilityLabel={`Trip alarm to ${alarm.name}`}
    >
      <LinearGradient
        colors={ringing ? ['#E5383B', '#FF6A3D'] : ['#5E5CE6', '#8C9BFF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.icon}>
          <Ionicons name={ringing ? 'notifications' : 'alarm'} size={22} color="#FFF" />
        </View>
        <View style={styles.body}>
          <Text style={styles.label}>{ringing ? '🔔 ALMOST THERE — TAP TO STOP' : 'TRIP ALARM ON'}</Text>
          <Text style={styles.title} numberOfLines={1}>
            {formatDistance(alarm.lastDistanceKm)} to {alarm.name}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            Rings at {formatDistance(alarm.radiusKm)}
            {updated ? ` · updated ${updated}` : ' · waiting for GPS'}
          </Text>
          {progress != null ? (
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={20} color="#FFF" />
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, padding: 14 },
  icon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#FFFFFF33', alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  label: { color: '#FFFFFFD9', fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  title: { color: '#FFF', fontSize: 18, fontWeight: '800', marginTop: 2 },
  sub: { color: '#FFFFFFD9', fontSize: 12, marginTop: 1 },
  track: { height: 5, borderRadius: 3, backgroundColor: '#FFFFFF40', marginTop: 8, overflow: 'hidden' },
  fill: { height: 5, borderRadius: 3, backgroundColor: '#FFF' },
});
