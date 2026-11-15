import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';

const QUICK = ['09:00', '12:00', '15:00', '18:00', '21:00'];
const label12 = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
};
const pad = (n) => String(n).padStart(2, '0');

function Stepper({ text, onMinus, onPlus, what, theme }) {
  return (
    <View style={[styles.stepper, { borderColor: theme.borderNeutral, backgroundColor: theme.surfaceAlt }]}>
      <TouchableOpacity onPress={onMinus} style={styles.stepBtn} accessibilityLabel={`Earlier ${what}`}>
        <Ionicons name="remove" size={18} color={theme.text} />
      </TouchableOpacity>
      <Text style={[styles.stepValue, { color: theme.text }]}>{text}</Text>
      <TouchableOpacity onPress={onPlus} style={styles.stepBtn} accessibilityLabel={`Later ${what}`}>
        <Ionicons name="add" size={18} color={theme.text} />
      </TouchableOpacity>
    </View>
  );
}

/** Time of day as 'HH:MM' (24 h): hour and minute steppers, AM/PM, quick picks. */
export default function TimePicker({ value = '10:00', onChange }) {
  const { theme } = useTheme();
  const [h, m] = value.split(':').map(Number);
  const pm = h >= 12;
  const set = (hh, mm) => onChange(`${pad(((hh % 24) + 24) % 24)}:${pad(((mm % 60) + 60) % 60)}`);
  const stepMin = (d) => {
    const total = (h * 60 + m + d + 1440) % 1440;
    set(Math.floor(total / 60), total % 60);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Stepper theme={theme} what="hour" text={String(h % 12 || 12)} onMinus={() => set(h - 1, m)} onPlus={() => set(h + 1, m)} />
        <Text style={[styles.colon, { color: theme.text }]}>:</Text>
        <Stepper theme={theme} what="minutes" text={pad(m)} onMinus={() => stepMin(-5)} onPlus={() => stepMin(5)} />
        <View style={[styles.ampm, { borderColor: theme.borderNeutral }]}>
          {['AM', 'PM'].map((p) => {
            const on = (p === 'PM') === pm;
            return (
              <TouchableOpacity
                key={p}
                onPress={() => !on && set(h + (p === 'PM' ? 12 : -12), m)}
                style={[styles.ampmBtn, on && { backgroundColor: theme.primary }]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.ampmText, { color: on ? theme.onPrimary : theme.textSecondary }]}>{p}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <View style={styles.quick}>
        {QUICK.map((q) => (
          <TouchableOpacity
            key={q}
            onPress={() => onChange(q)}
            style={[styles.chip, { borderColor: value === q ? theme.primary : theme.borderNeutral, backgroundColor: value === q ? theme.primary + '22' : 'transparent' }]}
          >
            <Text style={[styles.chipText, { color: theme.text }]}>{label12(q)}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12 },
  stepBtn: { paddingHorizontal: 8, paddingVertical: 8 },
  stepValue: { minWidth: 26, textAlign: 'center', fontSize: 18, fontWeight: '700' },
  colon: { fontSize: 18, fontWeight: '700' },
  ampm: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, overflow: 'hidden', marginLeft: 'auto' },
  ampmBtn: { paddingHorizontal: 10, paddingVertical: 9 },
  ampmText: { fontSize: 13, fontWeight: '700' },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 12, fontWeight: '600' },
});
