import { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  FlatList,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Header from '../components/Header';
import { useTheme } from '../hooks/useTheme';
import { fetchTrash, restoreFromTrash } from '../services/api';
import { SYNCED_COLLECTIONS, notifyLocal, pullFromServer } from '../services/sync';

const SECTION_LABELS = {
  passwords: 'Passwords',
  diary: 'Diary',
  movies: 'Movies',
  banking: 'Banking',
  cards: 'Cards',
  vault: 'Vault',
  todo: 'To-do',
  expenditure: 'Expenditure',
  months: 'Income',
  investments: 'Investments',
  debts: 'Debts',
  autopays: 'Autopays',
  tickets: 'Tickets',
  dates: 'Important dates',
};

const SECTIONS = Object.keys(SECTION_LABELS).filter((key) =>
  SYNCED_COLLECTIONS.some((c) => c.collection === key)
);

// A readable name for any item, whatever section it came from.
function itemTitle(item) {
  return (
    item.title || item.site || item.name || item.bankName || item.month || item.category || 'Item'
  );
}

function itemDetail(item) {
  return [item.username, item.accountNumber && `A/c ••${String(item.accountNumber).slice(-4)}`, item.date]
    .filter(Boolean)
    .join(' · ');
}

function deletedLabel(when) {
  const date = new Date(when);
  return `Deleted ${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

export default function RecentlyDeletedScreen() {
  const { theme } = useTheme();
  const [section, setSection] = useState('passwords');
  const [entries, setEntries] = useState([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [restoring, setRestoring] = useState(null);

  // Bumped to reload the list after a restore.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchTrash(section)
      .then((data) => {
        if (cancelled) return;
        setEntries(data.items || []);
        setError(null);
        if (data.days) setDays(data.days);
      })
      .catch(() => {
        if (cancelled) return;
        setEntries([]);
        setError("Couldn't reach the server. Check your connection and try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [section, version]);

  const pickSection = (key) => {
    if (key === section) return;
    setLoading(true);
    setError(null);
    setSection(key);
  };

  const restore = async (trashIds) => {
    setRestoring(trashIds.length === 1 ? trashIds[0] : 'all');
    try {
      await restoreFromTrash(section, trashIds);
      // Bring the restored items onto this device and into any open screen.
      const { storageKey } = SYNCED_COLLECTIONS.find((c) => c.collection === section);
      const items = await pullFromServer(section, storageKey);
      notifyLocal(storageKey, items);
      setLoading(true);
      setVersion((v) => v + 1);
    } catch (_error) {
      setError("Couldn't restore. Check your connection and try again.");
    } finally {
      setRestoring(null);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
      <Header
        title="Recently Deleted"
        subtitle={`Deleted items are kept for ${days} days`}
        showBack
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
      />

      <View style={styles.content}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={styles.chipRow}
        >
          {SECTIONS.map((key) => {
            const selected = key === section;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => pickSection(key)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? theme.primary : theme.surfaceAlt,
                    borderColor: selected ? theme.primary : theme.borderNeutral,
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: selected ? theme.onPrimary : theme.text }]}>
                  {SECTION_LABELS[key]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {entries.length > 1 && !loading ? (
          <TouchableOpacity
            style={[styles.restoreAll, { borderColor: theme.borderNeutral, backgroundColor: theme.surface }]}
            onPress={() => restore(entries.map((e) => e.trashId))}
            disabled={!!restoring}
          >
            <Ionicons name="arrow-undo-outline" size={18} color={theme.primary} />
            <Text style={[styles.restoreText, { color: theme.primary }]}>
              Restore all {entries.length}
            </Text>
          </TouchableOpacity>
        ) : null}

        {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}

        {loading ? (
          <ActivityIndicator style={styles.loader} color={theme.primary} />
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(entry) => entry.trashId}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              error ? null : (
                <View style={styles.empty}>
                  <Ionicons name="trash-outline" size={52} color={theme.textMuted} />
                  <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                    Nothing deleted from {SECTION_LABELS[section]} in the last {days} days.
                  </Text>
                </View>
              )
            }
            renderItem={({ item: entry }) => {
              const detail = itemDetail(entry.item);
              return (
                <View
                  style={[
                    styles.card,
                    { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow },
                  ]}
                >
                  <View style={styles.cardText}>
                    <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
                      {itemTitle(entry.item)}
                    </Text>
                    {detail ? (
                      <Text style={[styles.detail, { color: theme.textSecondary }]} numberOfLines={1}>
                        {detail}
                      </Text>
                    ) : null}
                    <Text style={[styles.detail, { color: theme.textMuted }]}>
                      {deletedLabel(entry.deletedAt)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.restoreBtn, { backgroundColor: theme.primary }]}
                    onPress={() => restore([entry.trashId])}
                    disabled={!!restoring}
                  >
                    {restoring === entry.trashId ? (
                      <ActivityIndicator size="small" color={theme.onPrimary} />
                    ) : (
                      <Text style={[styles.restoreBtnText, { color: theme.onPrimary }]}>Restore</Text>
                    )}
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  chipScroll: { flexGrow: 0, marginBottom: 12 },
  chipRow: { gap: 8, paddingRight: 16 },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '600' },
  restoreAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  restoreText: { fontSize: 14, fontWeight: '600' },
  error: { fontSize: 13, marginBottom: 12 },
  loader: { marginTop: 40 },
  list: { paddingBottom: 40 },
  empty: { alignItems: 'center', marginTop: 60 },
  emptyText: { marginTop: 12, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  cardText: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '600' },
  detail: { fontSize: 12, marginTop: 2 },
  restoreBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, minWidth: 80, alignItems: 'center' },
  restoreBtnText: { fontSize: 13, fontWeight: '700' },
});
