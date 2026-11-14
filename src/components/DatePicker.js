import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { fromKey, toKey, todayKey } from '../utils/autopay';
import { formatTyped, parseTyped, keyToTyped } from '../utils/dateInput';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FIRST_YEAR = 1920;
const YEAR_COLS = 4;
const YEAR_ROW_H = 44;

/**
 * Inline calendar. `value` and `onChange` use 'YYYY-MM-DD' local dates;
 * `marked` highlights extra dates (e.g. already-added ones).
 *
 * Three ways to get to a date: type it (DD/MM/YYYY), tap the month or the
 * year in the header to jump straight to one, or tap a day.
 */
export default function DatePicker({ value, onChange, marked = [] }) {
  const { theme } = useTheme();
  const initial = fromKey(value || todayKey());
  const [view, setView] = useState({ year: initial.getFullYear(), month: initial.getMonth() });
  const [mode, setMode] = useState('days'); // 'days' | 'months' | 'years'
  const yearList = useRef(null);
  const [typed, setTyped] = useState(keyToTyped(value));
  const [typedError, setTypedError] = useState(null);

  // When the date is changed from outside (or by tapping a day), show it.
  const [shownValue, setShownValue] = useState(value);
  if (value !== shownValue) {
    setShownValue(value);
    setTyped(keyToTyped(value));
    setTypedError(null);
    if (value) {
      const d = fromKey(value);
      setView({ year: d.getFullYear(), month: d.getMonth() });
    }
  }

  const first = new Date(view.year, view.month, 1).getDay();
  const count = new Date(view.year, view.month + 1, 0).getDate();
  const cells = [
    ...Array(first).fill(null),
    ...Array.from({ length: count }, (_, i) => toKey(new Date(view.year, view.month, i + 1))),
  ];
  const today = todayKey();
  const markedSet = new Set(marked);
  const lastYear = new Date().getFullYear() + 30;
  const years = Array.from({ length: lastYear - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);
  const yearRow = Math.floor((view.year - FIRST_YEAR) / YEAR_COLS);

  const shift = (delta) => {
    const d = new Date(view.year, view.month + delta, 1);
    setView({ year: d.getFullYear(), month: d.getMonth() });
  };

  const onType = (text) => {
    const shown = formatTyped(text);
    setTyped(shown);
    const digits = shown.replace(/\D/g, '');
    if (digits.length < 8) {
      setTypedError(null);
      return;
    }
    const key = parseTyped(shown);
    if (!key) {
      setTypedError('Not a valid date');
      return;
    }
    setTypedError(null);
    setShownValue(key);
    const d = fromKey(key);
    setView({ year: d.getFullYear(), month: d.getMonth() });
    setMode('days');
    onChange(key);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral }]}>
      <View style={styles.typeRow}>
        <Ionicons name="create-outline" size={16} color={theme.textMuted} />
        <TextInput
          style={[styles.typeInput, { color: theme.text, borderColor: typedError ? '#E5383B' : theme.borderNeutral, backgroundColor: theme.surface }]}
          value={typed}
          onChangeText={onType}
          placeholder="Type DD/MM/YYYY"
          placeholderTextColor={theme.textMuted}
          keyboardType="number-pad"
          maxLength={10}
          accessibilityLabel="Type a date, day month year"
        />
      </View>
      {typedError ? <Text style={styles.typeError}>{typedError}</Text> : null}

      <View style={styles.header}>
        <TouchableOpacity onPress={() => shift(-1)} style={styles.nav} accessibilityLabel="Previous month">
          <Ionicons name="chevron-back" size={20} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.titleRow}>
          <TouchableOpacity
            onPress={() => setMode((m) => (m === 'months' ? 'days' : 'months'))}
            style={[styles.titleBtn, mode === 'months' && { backgroundColor: theme.secondary + '33' }]}
            accessibilityLabel="Choose month"
          >
            <Text style={[styles.month, { color: theme.text }]}>{MONTHS[view.month]}</Text>
            <Ionicons name={mode === 'months' ? 'chevron-up' : 'chevron-down'} size={14} color={theme.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setMode((m) => (m === 'years' ? 'days' : 'years'))}
            style={[styles.titleBtn, mode === 'years' && { backgroundColor: theme.secondary + '33' }]}
            accessibilityLabel="Choose year"
          >
            <Text style={[styles.month, { color: theme.text }]}>{view.year}</Text>
            <Ionicons name={mode === 'years' ? 'chevron-up' : 'chevron-down'} size={14} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => shift(1)} style={styles.nav} accessibilityLabel="Next month">
          <Ionicons name="chevron-forward" size={20} color={theme.text} />
        </TouchableOpacity>
      </View>

      {mode === 'months' ? (
        <View style={styles.pickGrid}>
          {MONTHS.map((m, i) => {
            const on = i === view.month;
            return (
              <TouchableOpacity
                key={m}
                style={styles.monthCell}
                onPress={() => {
                  setView((v) => ({ ...v, month: i }));
                  setMode('days');
                }}
                accessibilityLabel={`Month ${m}`}
              >
                <View style={[styles.pill, on && { backgroundColor: theme.secondary }]}>
                  <Text style={[styles.pillText, { color: on ? '#FFFFFF' : theme.text }]}>{m}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : mode === 'years' ? (
        <ScrollView
          style={styles.yearScroll}
          ref={yearList}
          nestedScrollEnabled
          // Open on the chosen year, not 1920.
          onLayout={() => yearList.current?.scrollTo({ x: 0, y: Math.max(0, (yearRow - 2) * YEAR_ROW_H), animated: false })}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.pickGrid}>
            {years.map((y) => {
              const on = y === view.year;
              return (
                <TouchableOpacity
                  key={y}
                  style={styles.yearCell}
                  onPress={() => {
                    setView((v) => ({ ...v, year: y }));
                    setMode('months');
                  }}
                  accessibilityLabel={`Year ${y}`}
                >
                  <View style={[styles.pill, on && { backgroundColor: theme.secondary }, y === new Date().getFullYear() && !on && { borderWidth: 1, borderColor: theme.secondary }]}>
                    <Text style={[styles.pillText, { color: on ? '#FFFFFF' : theme.text }]}>{y}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      ) : (
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
                  <Text style={[styles.dayText, { color: key === value ? '#FFFFFF' : theme.text }]}>{Number(key.slice(8))}</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <View key={`e${i}`} style={styles.cell} />
            )
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 12, borderWidth: 1, padding: 8, marginBottom: 12 },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  typeInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, letterSpacing: 1 },
  typeError: { color: '#E5383B', fontSize: 12, marginLeft: 24, marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  nav: { padding: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  titleBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  month: { fontSize: 15, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 2 },
  weekday: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  day: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 13, fontWeight: '600' },
  pickGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  monthCell: { width: '25%', alignItems: 'center', paddingVertical: 6 },
  yearScroll: { maxHeight: YEAR_ROW_H * 5 },
  yearCell: { width: `${100 / YEAR_COLS}%`, height: YEAR_ROW_H, alignItems: 'center', justifyContent: 'center' },
  pill: { minWidth: 58, paddingHorizontal: 8, paddingVertical: 7, borderRadius: 16, alignItems: 'center' },
  pillText: { fontSize: 14, fontWeight: '600' },
});
