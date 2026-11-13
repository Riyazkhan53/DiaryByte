import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../hooks/useTheme';

const OPTIONS = [
  { key: 'NSE', label: '🇮🇳 India · NSE' },
  { key: 'US', label: '🇺🇸 US · NASDAQ' },
];

/** Which market the engine screens show: India (NSE) or US (NASDAQ). */
export default function MarketSwitch({ market, onChange }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.row, { backgroundColor: theme.surfaceAlt }]}>
      {OPTIONS.map((o) => {
        const on = market === o.key;
        return (
          <TouchableOpacity
            key={o.key}
            style={[styles.item, on && [styles.on, { backgroundColor: theme.sheet, shadowColor: theme.shadow }]]}
            onPress={() => onChange(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`Show ${o.label}`}
          >
            <Text style={[styles.text, { color: on ? theme.text : theme.textSecondary }]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', borderRadius: 12, padding: 3, marginBottom: 12 },
  item: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  on: { shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3, elevation: 2 },
  text: { fontSize: 13, fontWeight: '700' },
});
