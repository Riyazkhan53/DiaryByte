import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { lastSyncResult, pendingSummary, subscribeSyncStatus, syncAllPending } from '../services/sync';

const timeAgo = (at) => {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

/**
 * Settings → Data: "Items waiting for sync". Lists the sections with
 * changes the server hasn't got yet (saved while offline or while the
 * server was asleep) and syncs them on demand. They also sync by themselves
 * once the server answers (SyncService).
 */
export default function SyncQueueCard() {
  const { theme } = useTheme();
  const [waiting, setWaiting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const refresh = useCallback(() => {
    pendingSummary()
      .then(setWaiting)
      .catch(() => setWaiting([]));
  }, []);

  useEffect(() => {
    refresh();
    return subscribeSyncStatus(refresh);
  }, [refresh]);

  const syncNow = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await syncAllPending();
      if (!r.reachable) {
        setMessage({ tone: 'warn', text: "The server isn't answering yet (it may be waking up, or you're offline). Your items are safe here and will sync automatically." });
      } else if (r.failed.length) {
        setMessage({ tone: 'warn', text: `Couldn't sync ${r.failed.join(', ')}. Will try again automatically.` });
      } else {
        setMessage({ tone: 'ok', text: r.synced ? 'All items synced.' : 'Nothing was waiting.' });
      }
    } catch (_error) {
      setMessage({ tone: 'warn', text: 'Sync failed. Will try again automatically.' });
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const total = (waiting || []).reduce((s, w) => s + w.count, 0);
  const last = lastSyncResult();

  return (
    <View style={[styles.box, { borderColor: total ? '#F59E0B66' : theme.borderNeutral, backgroundColor: theme.surfaceAlt }]}>
      <View style={styles.head}>
        <Ionicons name={total ? 'cloud-upload-outline' : 'cloud-done-outline'} size={20} color={total ? '#F59E0B' : '#2DA44E'} />
        <Text style={[styles.title, { color: theme.text }]}>Items waiting for sync</Text>
        <View style={[styles.count, { backgroundColor: total ? '#F59E0B' : '#2DA44E' }]}>
          <Text style={styles.countText} accessibilityLabel={`${total} items waiting for sync`}>
            {waiting == null ? '…' : total}
          </Text>
        </View>
      </View>
      {waiting && waiting.length ? (
        waiting.map((w) => (
          <View key={w.collection} style={styles.row}>
            <Text style={[styles.rowLabel, { color: theme.text }]}>{w.label}</Text>
            <Text style={[styles.rowCount, { color: theme.textSecondary }]}>
              {w.count} item{w.count === 1 ? '' : 's'}
            </Text>
          </View>
        ))
      ) : waiting ? (
        <Text style={[styles.hint, { color: theme.textMuted }]}>Everything is synced with the server.</Text>
      ) : null}
      {total ? (
        <Text style={[styles.hint, { color: theme.textMuted }]}>
          Saved on this phone. They sync by themselves as soon as the server answers.
        </Text>
      ) : null}
      <TouchableOpacity
        style={[styles.btn, { backgroundColor: total ? '#F59E0B' : theme.surface, borderColor: theme.borderNeutral }, busy && styles.disabled]}
        onPress={syncNow}
        disabled={busy}
        accessibilityLabel="Sync now"
      >
        {busy ? <ActivityIndicator size="small" color={total ? '#FFF' : theme.text} /> : <Ionicons name="sync-outline" size={18} color={total ? '#FFF' : theme.text} />}
        <Text style={[styles.btnText, { color: total ? '#FFF' : theme.text }]}>{busy ? 'Syncing…' : 'Sync now'}</Text>
      </TouchableOpacity>
      {message ? <Text style={[styles.hint, { color: message.tone === 'ok' ? '#2DA44E' : '#F59E0B' }]}>{message.text}</Text> : null}
      {!message && last ? (
        <Text style={[styles.hint, { color: theme.textMuted }]}>
          Last try {timeAgo(last.at)}: {last.ok ? 'synced' : last.reachable ? 'some sections failed' : 'server not reachable'}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 12, marginBottom: 4, gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 15, fontWeight: '700' },
  count: { minWidth: 26, height: 22, borderRadius: 11, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  countText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  rowLabel: { fontSize: 14 },
  rowCount: { fontSize: 13, fontWeight: '600' },
  hint: { fontSize: 12, lineHeight: 17 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 11, marginTop: 4, borderWidth: 1 },
  btnText: { fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.6 },
});
