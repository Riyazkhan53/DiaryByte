import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { subscribeLocal } from '../services/sync';
import { LEARNED_STORAGE_KEY, SMART_KINDS, forgetLearned, listLearned, sourceName } from '../services/smartFill';
import { confirmDelete } from '../utils/confirm';

const SLOT_NAMES = { title: 'title', from: 'from', to: 'to', venue: 'venue', date: 'date', time: 'time', seat: 'seats', bookingRef: 'booking ID' };

/**
 * Settings: what Smart fill has learned. Each row is a message layout from
 * an app (e.g. BookMyShow tickets, Netflix shares) that is now read on the
 * phone without AI. Wrong ones can be forgotten; saving a corrected item
 * also replaces them.
 */
export default function SmartFillCard() {
  const { theme } = useTheme();
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(() => {
    listLearned()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);
  useEffect(() => {
    refresh();
    return subscribeLocal(LEARNED_STORAGE_KEY, (next) => setItems(next));
  }, [refresh]);

  const list = items || [];
  const byKind = Object.keys(SMART_KINDS).map((kind) => ({ kind, rows: list.filter((l) => l.kind === kind) }));

  return (
    <View style={[styles.box, { borderColor: theme.borderNeutral, backgroundColor: theme.surfaceAlt }]}>
      <TouchableOpacity style={styles.head} onPress={() => setOpen((o) => !o)} accessibilityLabel="Smart fill learned formats">
        <Ionicons name="flash" size={20} color="#2DA44E" />
        <View style={styles.flex}>
          <Text style={[styles.title, { color: theme.text }]}>Smart fill</Text>
          <Text style={[styles.hint, { color: theme.textMuted }]}>
            {list.length
              ? `${list.length} format${list.length === 1 ? '' : 's'} learned · ${byKind.map((k) => `${SMART_KINDS[k.kind]} ${k.rows.length}`).join(' · ')}`
              : 'Learns from tickets and OTT shares you save'}
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textMuted} />
      </TouchableOpacity>
      {open ? (
        <>
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            When you save a ticket or a title you shared, DiaryByte learns how that app writes its message. The next one
            laid out the same way fills itself on your phone, without AI. If it reads something wrong, fix it and save: it
            learns the correction. AI is only used for new layouts, or when you tap “Fill with AI”.
          </Text>
          {byKind.map(({ kind, rows }) =>
            rows.length ? (
              <View key={kind} style={styles.group}>
                <Text style={[styles.groupTitle, { color: theme.textSecondary }]}>{SMART_KINDS[kind]}</Text>
                {rows.map((l) => (
                  <View key={l.id} style={[styles.row, { borderColor: theme.borderNeutral }]}>
                    <View style={styles.flex}>
                      <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
                        {sourceName(l.source) || 'Pasted messages'}
                        {l.label ? ` · e.g. ${l.label}` : ''}
                      </Text>
                      <Text style={[styles.hint, { color: theme.textMuted }]} numberOfLines={1}>
                        Reads {l.slots.map((s) => SLOT_NAMES[s] || s).join(', ')} · used {l.hits || 1}×
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => confirmDelete('Forget this format', `Smart fill will stop reading ${sourceName(l.source) || 'these'} messages until you save one again.`, () => forgetLearned(l.id).then(refresh))}
                      accessibilityLabel={`Forget ${sourceName(l.source) || 'format'}`}
                      style={styles.iconBtn}
                    >
                      <Ionicons name="trash-outline" size={18} color={theme.danger} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null
          )}
          {list.length ? (
            <TouchableOpacity
              style={styles.forgetAll}
              onPress={() => confirmDelete('Forget everything learned', 'Smart fill starts learning again from the next items you save.', () => forgetLearned(null).then(refresh))}
            >
              <Text style={[styles.forgetText, { color: theme.danger }]}>Forget everything learned</Text>
            </TouchableOpacity>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 12, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700' },
  hint: { fontSize: 12, lineHeight: 17 },
  group: { gap: 4 },
  groupTitle: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 6 },
  rowTitle: { fontSize: 14, fontWeight: '600' },
  iconBtn: { padding: 6 },
  forgetAll: { alignSelf: 'flex-start', paddingVertical: 6 },
  forgetText: { fontSize: 13, fontWeight: '700' },
});
