import { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { fromKey, toKey, todayKey } from '../utils/autopay';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Compact inline month calendar. `value` and `onChange` use 'YYYY-MM-DD'
 * local dates; `marked` highlights extra dates (e.g. already-added ones).
 */
export default function DatePicker({ value, onChange, marked = [] }) {
  const { theme } = useTheme();
  const initial = fromKey(value || todayKey());
  const [view, setView] = useState({ year: initial.getFullYear(), month: initial.getMonth() });

  const first = new Date(view.year, view.month, 1).getDay();
  const count = new Date(view.year, view.month + 1, 0).getDate();
  const cells = [
    ...Array(first).fill(null),
    ...Array.from({ length: count }, (_, i) => toKey(new Date(view.year, view.month, i + 1))),
  ];
  const today = todayKey();
  const markedSet = new Set(marked);

  const shift = (delta) => {
    const d = new Date(view.year, view.month + delta, 1);
    setView({ year: d.getFullYear(), month: d.getMonth() });
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => shift(-1)} style={styles.nav} accessibilityLabel="Previous month">
          <Ionicons name="chevron-back" size={20} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.month, { color: theme.text }]}>
          {new Date(view.year, view.month, 1).toLocaleDateString(undefined, {
            month: 'long',
            year: 'numeric',
          })}
        </Text>
        <TouchableOpacity onPress={() => shift(1)} style={styles.nav} accessibilityLabel="Next month">
          <Ionicons name="chevron-forward" size={20} color={theme.text} />
        </TouchableOpacity>
      </View>
      <View style={styles.grid}>
        {DAYS.map((d, i) => (
          <Text key={`h${i}`} style={[styles.cell, styles.weekday, { color: theme.textMuted }]}>
            {d}
          </Text>
        ))}
        {cells.map((key, i) =>
          key ? (
            <TouchableOpacity key={key} style={styles.cell} onPress={() => onChange(key)}>
              <View
                style={[
                  styles.day,
                  markedSet.has(key) && { backgroundColor: theme.secondary + '55' },
                  key === value && { backgroundColor: theme.secondary },
                  key === today && key !== value && { borderWidth: 1, borderColor: theme.secondary },
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    { color: key === value ? '#FFFFFF' : theme.text },
                  ]}
                >
                  {Number(key.slice(8))}
                </Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View key={`e${i}`} style={styles.cell} />
          )
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 12, borderWidth: 1, padding: 8, marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  nav: { padding: 6 },
  month: { fontSize: 15, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 2 },
  weekday: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  day: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 13, fontWeight: '600' },
});
