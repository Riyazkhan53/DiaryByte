import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import Header from '../../components/Header';
import { useTheme } from '../../hooks/useTheme';
import { isSupported, readTripAlarm, searchPlaces, snoozeTripAlarm, startTripAlarm, stopTripAlarm } from '../../services/tripAlarm';
import { DEFAULT_RADIUS_KM, RADIUS_CHOICES, SNOOZE_KM, clampRadius, formatDistance } from '../../utils/tripAlarm';

const timeOf = (iso) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—');
const RING_PATTERN = [0, 900, 400, 900, 400, 900, 1200];

/** Trip alarm: pick a destination and a distance; it rings when you get that close. */
export default function TripAlarmScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams();
  const [alarm, setAlarm] = useState(null);
  const [query, setQuery] = useState(typeof params.to === 'string' ? params.to : '');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [place, setPlace] = useState(null);
  const [radius, setRadius] = useState(DEFAULT_RADIUS_KM);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { text, error, settings }

  const live = alarm && (alarm.status === 'active' || alarm.status === 'ringing');
  const ringing = alarm?.status === 'ringing';

  // The background task writes the alarm's state; re-read it every few seconds.
  const reload = useCallback(() => readTripAlarm().then(setAlarm), []);
  useEffect(() => {
    reload();
    const timer = setInterval(reload, 4000);
    return () => clearInterval(timer);
  }, [reload]);

  // Vibrate on screen too while ringing.
  useEffect(() => {
    if (!ringing) return undefined;
    Vibration.vibrate(RING_PATTERN, true);
    return () => Vibration.cancel();
  }, [ringing]);

  const search = useCallback(async (text) => {
    const q = (text ?? '').trim();
    if (q.length < 2) return;
    setSearching(true);
    setMessage(null);
    try {
      const found = await searchPlaces(q);
      setResults(found);
      if (!found.length) setMessage({ text: 'No place found. Try the city or a landmark, e.g. "Madurai bus stand".', error: true });
    } finally {
      setSearching(false);
    }
  }, []);

  // Opened from a ticket: look its destination up straight away.
  useEffect(() => {
    if (typeof params.to !== 'string' || !params.to.trim()) return undefined;
    const timer = setTimeout(() => search(params.to), 0);
    return () => clearTimeout(timer);
  }, [params.to, search]);

  const start = async () => {
    if (!place || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await startTripAlarm(place, radius);
      if (!res.ok) {
        setMessage({ text: res.reason, error: true, settings: res.settings });
        return;
      }
      setAlarm(res.state);
      setMessage(
        res.alreadyInside
          ? { text: `You're already within ${formatDistance(radius)} — it will ring on the next location update.` }
          : { text: 'Trip alarm is on. You can lock the phone; it keeps running in the background.' }
      );
    } catch (error) {
      setMessage({ text: `Couldn't start the alarm: ${error?.message || 'unknown error'}`, error: true });
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    await stopTripAlarm('stopped');
    Vibration.cancel();
    setMessage(null);
    reload();
  };

  const doSnooze = async () => {
    const next = await snoozeTripAlarm();
    Vibration.cancel();
    setMessage(next?.status === 'active' ? { text: `Snoozed — rings again at ${formatDistance(next.radiusKm)}.` } : null);
    reload();
  };

  const card = [styles.card, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }];
  const input = [styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }];
  const progress =
    live && alarm.startDistanceKm > alarm.radiusKm && alarm.lastDistanceKm != null
      ? Math.min(1, Math.max(0, (alarm.startDistanceKm - alarm.lastDistanceKm) / (alarm.startDistanceKm - alarm.radiusKm)))
      : null;

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Trip alarm" subtitle="Wakes you before your stop" showBack />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!isSupported ? (
          <View style={card}>
            <Text style={[styles.text, { color: theme.text }]}>
              The trip alarm needs your phone&apos;s GPS in the background, so it works in the Android app only.
            </Text>
          </View>
        ) : null}

        {live ? (
          <LinearGradient
            colors={ringing ? ['#E5383B', '#FF6A3D'] : ['#5E5CE6', '#8C9BFF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <Text style={styles.heroLabel}>{ringing ? '🔔 YOU’RE ALMOST THERE' : '⏰ TRIP ALARM ON'}</Text>
            <Text style={styles.heroPlace} numberOfLines={2}>
              {alarm.name}
            </Text>
            <Text style={styles.heroDistance}>{formatDistance(alarm.lastDistanceKm)}</Text>
            <Text style={styles.heroSub}>
              to go · rings within {formatDistance(alarm.radiusKm)} · updated {timeOf(alarm.lastFixAt)}
              {alarm.lastAccuracyM > 500 ? ` (±${Math.round(alarm.lastAccuracyM / 100) / 10} km)` : ''}
            </Text>
            {progress != null ? (
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
              </View>
            ) : null}
            <View style={styles.heroActions}>
              {ringing ? (
                <TouchableOpacity style={styles.heroBtn} onPress={doSnooze} accessibilityLabel="Snooze trip alarm">
                  <Ionicons name="alarm-outline" size={18} color="#FFF" />
                  <Text style={styles.heroBtnText}>Snooze {SNOOZE_KM} km</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={[styles.heroBtn, styles.heroBtnSolid]} onPress={stop} accessibilityLabel="Stop trip alarm">
                <Ionicons name="stop-circle" size={18} color={ringing ? '#E5383B' : '#5E5CE6'} />
                <Text style={[styles.heroBtnText, { color: ringing ? '#E5383B' : '#5E5CE6' }]}>Stop alarm</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        ) : (
          <>
            <View style={card}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>WHERE ARE YOU GOING?</Text>
              {place ? (
                <View style={[styles.picked, { backgroundColor: theme.surfaceAlt }]}>
                  <Ionicons name="location" size={20} color="#5E5CE6" />
                  <View style={styles.flex}>
                    <Text style={[styles.pickedName, { color: theme.text }]}>{place.name}</Text>
                    {place.detail ? <Text style={[styles.small, { color: theme.textMuted }]}>{place.detail}</Text> : null}
                  </View>
                  <TouchableOpacity onPress={() => setPlace(null)} accessibilityLabel="Change destination">
                    <Text style={[styles.link, { color: theme.primary }]}>Change</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View style={styles.row}>
                    <TextInput
                      style={[...input, styles.flex]}
                      placeholder="Station, bus stand, city or landmark"
                      placeholderTextColor={theme.textMuted}
                      value={query}
                      onChangeText={setQuery}
                      onSubmitEditing={() => search(query)}
                      returnKeyType="search"
                    />
                    <TouchableOpacity
                      style={[styles.searchBtn, { backgroundColor: theme.primary }]}
                      onPress={() => search(query)}
                      disabled={searching}
                      accessibilityLabel="Search place"
                    >
                      {searching ? <ActivityIndicator size="small" color={theme.onPrimary} /> : <Ionicons name="search" size={20} color={theme.onPrimary} />}
                    </TouchableOpacity>
                  </View>
                  {results.map((r, i) => (
                    <TouchableOpacity
                      key={`${r.latitude},${r.longitude},${i}`}
                      style={[styles.result, { borderColor: theme.borderNeutral }]}
                      onPress={() => {
                        setPlace(r);
                        setResults([]);
                      }}
                      accessibilityLabel={`Destination ${r.name}`}
                    >
                      <Ionicons name="location-outline" size={18} color={theme.textSecondary} />
                      <View style={styles.flex}>
                        <Text style={[styles.text, { color: theme.text }]}>{r.name}</Text>
                        {r.detail ? <Text style={[styles.small, { color: theme.textMuted }]}>{r.detail}</Text> : null}
                      </View>
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </View>

            <View style={card}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>RING WHEN I&apos;M WITHIN</Text>
              <View style={styles.chips}>
                {RADIUS_CHOICES.map((km) => {
                  const on = radius === km && !custom;
                  return (
                    <TouchableOpacity
                      key={km}
                      style={[styles.chip, { backgroundColor: on ? '#5E5CE6' : theme.surfaceAlt, borderColor: on ? '#5E5CE6' : theme.borderNeutral }]}
                      onPress={() => {
                        setRadius(km);
                        setCustom('');
                      }}
                    >
                      <Text style={[styles.chipText, { color: on ? '#FFF' : theme.text }]}>{km} km</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TextInput
                style={input}
                placeholder="Or type a distance in km (e.g. 7.5)"
                placeholderTextColor={theme.textMuted}
                keyboardType="decimal-pad"
                value={custom}
                onChangeText={(v) => {
                  setCustom(v);
                  const n = parseFloat(v);
                  if (n > 0) setRadius(clampRadius(n));
                }}
              />
              <Text style={[styles.small, { color: theme.textMuted }]}>
                Straight-line distance. On fast trains or winding roads pick a bit more (15 km+), so you have time to get ready.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.start, (!place || busy || !isSupported) && styles.disabled]}
              onPress={start}
              disabled={!place || busy || !isSupported}
              accessibilityLabel="Start trip alarm"
            >
              <LinearGradient colors={['#5E5CE6', '#8C9BFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.startInner}>
                {busy ? <ActivityIndicator color="#FFF" /> : <Ionicons name="alarm" size={20} color="#FFF" />}
                <Text style={styles.startText}>
                  {place ? `Start · ring at ${formatDistance(radius)} from ${place.name}` : 'Pick a destination first'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </>
        )}

        {message ? (
          <View style={[card, styles.message]}>
            <Ionicons name={message.error ? 'alert-circle-outline' : 'checkmark-circle-outline'} size={18} color={message.error ? '#E5383B' : '#2DA44E'} />
            <View style={styles.flex}>
              <Text style={[styles.text, { color: theme.text }]}>{message.text}</Text>
              {message.settings ? (
                <TouchableOpacity onPress={() => Linking.openSettings()}>
                  <Text style={[styles.link, { color: theme.primary }]}>Open app settings</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}

        {isSupported ? (
          <View style={card}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>FOR A RELIABLE ALARM</Text>
            {[
              'Location: “Allow all the time” (asked when you start).',
              'Battery: set DiaryByte to “Unrestricted” / “No restrictions” — Xiaomi, Oppo, Vivo and Realme stop background apps on long trips otherwise.',
              'It rings on the alarm volume; keep that turned up. Do Not Disturb may still silence it.',
              'GPS works without mobile data, so it keeps working with no signal.',
            ].map((t) => (
              <View key={t} style={styles.tip}>
                <Text style={[styles.dot, { color: '#5E5CE6' }]}>•</Text>
                <Text style={[styles.small, styles.flex, { color: theme.text }]}>{t}</Text>
              </View>
            ))}
            <TouchableOpacity style={[styles.outline, { borderColor: theme.primary }]} onPress={() => Linking.openSettings()} accessibilityLabel="Open battery settings">
              <Ionicons name="battery-charging-outline" size={16} color={theme.primary} />
              <Text style={[styles.link, { color: theme.primary }]}>Open DiaryByte settings (battery)</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  flex: { flex: 1 },
  card: { borderRadius: 18, borderWidth: 1, padding: 14, gap: 8, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  text: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 17 },
  link: { fontSize: 14, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 },
  searchBtn: { width: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  result: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, paddingVertical: 10 },
  picked: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 12 },
  pickedName: { fontSize: 16, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 13, fontWeight: '700' },
  start: { borderRadius: 16, overflow: 'hidden' },
  startInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, paddingHorizontal: 12 },
  startText: { color: '#FFF', fontSize: 15, fontWeight: '800', flexShrink: 1 },
  disabled: { opacity: 0.5 },
  hero: { borderRadius: 24, padding: 20, gap: 4 },
  heroLabel: { color: '#FFFFFFD9', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  heroPlace: { color: '#FFF', fontSize: 22, fontWeight: '800', marginTop: 4 },
  heroDistance: { color: '#FFF', fontSize: 48, fontWeight: '900', marginTop: 6 },
  heroSub: { color: '#FFFFFFD9', fontSize: 13 },
  track: { height: 8, borderRadius: 4, backgroundColor: '#FFFFFF40', marginTop: 12, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: '#FFF' },
  heroActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  heroBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, paddingVertical: 12, backgroundColor: '#FFFFFF33' },
  heroBtnSolid: { backgroundColor: '#FFF' },
  heroBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  message: { flexDirection: 'row', alignItems: 'flex-start' },
  tip: { flexDirection: 'row', gap: 6 },
  dot: { fontSize: 14, fontWeight: '800' },
  outline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingVertical: 10, marginTop: 4 },
});
