import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSyncedCollection } from '../hooks/useSyncedCollection';
import { fetchIpos } from '../services/api';
import { todayKey } from '../utils/autopay';
import {
  IPOAPPS_STORAGE_KEY,
  IPO_LIST_KEY,
  allottedListings,
  awaitingAllotment,
  gmpPctOf,
  hotIpos,
  listingLabel,
  newApp,
  withLatestDates,
} from '../utils/ipoApps';

// The saved IPO list is refreshed from the server when older than this. The
// server re-reads NSE and the GMP pages (free) at most every 30 minutes.
const LIST_MAX_AGE_MS = 30 * 60000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (key) => (key && /^\d{4}-\d{2}-\d{2}$/.test(key) ? `${Number(key.slice(8))} ${MONTHS[Number(key.slice(5, 7)) - 1]}` : null);

async function readList() {
  try {
    return JSON.parse((await AsyncStorage.getItem(IPO_LIST_KEY)) || 'null');
  } catch {
    return null;
  }
}

/**
 * Home screen IPO cards:
 * - IPOs with GMP above 20% to apply for, until they close or you tap Applied
 * - "Did you get an allotment?" for applied IPOs once bidding has closed
 * - listing-day reminders for IPOs you were allotted
 */
export default function IpoHomeCards({ theme }) {
  const { items: apps, persist } = useSyncedCollection('ipoapps', IPOAPPS_STORAGE_KEY);
  const [ipos, setIpos] = useState([]);
  const today = todayKey();

  useEffect(() => {
    let live = true;
    readList().then((saved) => {
      if (!live) return;
      if (saved?.ipos) setIpos(saved.ipos);
      const age = saved?.savedAt ? Date.now() - Date.parse(saved.savedAt) : Infinity;
      if (age < LIST_MAX_AGE_MS) return;
      fetchIpos(false)
        .then((data) => {
          if (!live || !data?.ipos?.length) return;
          setIpos(data.ipos);
          AsyncStorage.setItem(IPO_LIST_KEY, JSON.stringify({ ...data, savedAt: new Date().toISOString() })).catch(() => {});
        })
        .catch(() => {});
    });
    return () => {
      live = false;
    };
  }, []);

  // Listing dates often come out after you apply: copy them in.
  useEffect(() => {
    if (!ipos.length || !apps.length) return;
    const next = withLatestDates(apps, ipos);
    if (next) persist(next);
  }, [ipos, apps, persist]);

  const hot = hotIpos(ipos, apps, today);
  const asking = awaitingAllotment(apps, today);
  const listing = allottedListings(apps, today);
  if (!hot.length && !asking.length && !listing.length) return null;

  const now = () => new Date().toISOString();
  const mark = (ipo, status) => persist([...apps.filter((a) => a.id !== ipo.id), newApp(ipo, status)]);
  const answer = (app, result) => persist(apps.map((a) => (a.id === app.id ? { ...a, result, updatedAt: now() } : a)));
  const openIpos = () => router.push('/ipos');

  return (
    <>
      {hot.map((ipo) => {
        const pct = gmpPctOf(ipo);
        const close = shortDate(ipo.closeDate);
        return (
          <View key={`hot:${ipo.id}`} style={styles.wrap}>
            <LinearGradient colors={['#1F9D55', '#2DA44E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner}>
              <TouchableOpacity style={styles.main} onPress={openIpos} activeOpacity={0.8} accessibilityLabel={`${ipo.name}: open IPO Watch`}>
                <Ionicons name="flame" size={20} color="#FFF" />
                <View style={styles.text}>
                  <Text style={styles.title} numberOfLines={1}>
                    Apply: {ipo.name}
                  </Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    GMP +{pct}%{ipo.status === 'upcoming' ? ` · opens ${shortDate(ipo.openDate) || 'soon'}` : ''}
                    {close ? ` · closes ${close}` : ''}
                  </Text>
                </View>
              </TouchableOpacity>
              <View style={styles.actions}>
                <TouchableOpacity onPress={() => mark(ipo, 'applied')} style={styles.pill} accessibilityLabel={`Mark ${ipo.name} as applied`}>
                  <Text style={styles.pillText}>Applied</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => mark(ipo, 'skipped')} style={styles.iconBtn} accessibilityLabel={`Not applying for ${ipo.name}`}>
                  <Ionicons name="close" size={18} color="#FFF" />
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        );
      })}
      {asking.map((app) => (
        <View key={`ask:${app.id}`} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}>
          <TouchableOpacity style={styles.main} onPress={openIpos} activeOpacity={0.7}>
            <Ionicons name="help-circle" size={20} color="#F59E0B" />
            <View style={styles.text}>
              <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
                IPO allotted? {app.name}
              </Text>
              <Text style={[styles.cardSub, { color: theme.textSecondary }]} numberOfLines={1}>
                Bidding closed {shortDate(app.closeDate)}
                {app.listingDate ? ` · lists ${shortDate(app.listingDate)}` : ''}
              </Text>
            </View>
          </TouchableOpacity>
          <View style={styles.actions}>
            <TouchableOpacity onPress={() => answer(app, 'allotted')} style={[styles.pill, styles.yes]} accessibilityLabel={`Yes, ${app.name} was allotted`}>
              <Text style={styles.pillText}>Yes</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => answer(app, 'not_allotted')}
              style={[styles.pill, { backgroundColor: theme.surfaceAlt }]}
              accessibilityLabel={`No, ${app.name} was not allotted`}
            >
              <Text style={[styles.pillText, { color: theme.text }]}>No</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
      {listing.map((app) => (
        <TouchableOpacity key={`list:${app.id}`} style={styles.wrap} onPress={openIpos} activeOpacity={0.8}>
          <LinearGradient colors={['#6D5BD0', '#8E7CF8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.banner, styles.listing]}>
            <Ionicons name="rocket" size={20} color="#FFF" />
            <View style={styles.text}>
              <Text style={styles.title} numberOfLines={1}>
                {app.name} · allotted 🎉
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {listingLabel(app, today)}
                {app.listingDate ? ` · ${shortDate(app.listingDate)}` : ''}
              </Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  banner: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingLeft: 14, paddingRight: 8 },
  listing: { gap: 12, paddingVertical: 14, paddingRight: 14 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  text: { flex: 1 },
  title: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  sub: { color: '#FFFFFFDD', fontSize: 12, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 6 },
  pill: { backgroundColor: '#FFFFFF33', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7 },
  pillText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  yes: { backgroundColor: '#2DA44E' },
  iconBtn: { padding: 6 },
  card: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    paddingLeft: 14,
    paddingRight: 8,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 24,
  },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardSub: { fontSize: 12, marginTop: 2 },
});
