import { StyleSheet, Text, View } from 'react-native';
import { formatMoney, LOSS, PROFIT } from './format';

function Row({ l, color, market, theme }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.tf, { color: theme.textMuted, borderColor: theme.borderNeutral }]}>{l.tf === 'daily' ? 'D' : '5m'}</Text>
      <Text style={[styles.label, { color: theme.textSecondary }]} numberOfLines={1}>
        {l.label}
      </Text>
      <Text style={[styles.price, { color: theme.text }]}>{formatMoney(l.price, market)}</Text>
      <Text style={[styles.pct, { color }]}>
        {l.pct > 0 ? '+' : ''}
        {l.pct}%
      </Text>
    </View>
  );
}

/**
 * Support and resistance around the price: daily levels (previous day,
 * pivots, swing levels, 6-month high/low) and 5-minute ones (day high/low,
 * opening range, 5-min swings), nearest first, with the distance from price.
 */
export default function LevelsCard({ levels, price, market, theme, cardStyle }) {
  if (!levels || (!levels.above?.length && !levels.below?.length)) return null;
  return (
    <View style={cardStyle}>
      <Text style={[styles.title, { color: theme.text }]}>Support & resistance</Text>
      <Text style={[styles.hint, { color: theme.textMuted }]}>
        Around {formatMoney(price, market)} · D = daily levels (saved once a day){levels.daily ? '' : ', not loaded yet'} · 5m = today&apos;s 5-minute levels
      </Text>
      <Text style={[styles.head, { color: LOSS }]}>Resistance above</Text>
      {levels.above?.length ? levels.above.map((l) => <Row key={`a${l.label}${l.price}`} l={l} color={LOSS} market={market} theme={theme} />) : <Text style={[styles.none, { color: theme.textMuted }]}>None nearby</Text>}
      <Text style={[styles.head, { color: PROFIT }]}>Support below</Text>
      {levels.below?.length ? levels.below.map((l) => <Row key={`b${l.label}${l.price}`} l={l} color={PROFIT} market={market} theme={theme} />) : <Text style={[styles.none, { color: theme.textMuted }]}>None nearby</Text>}
      <Text style={[styles.hint, { color: theme.textMuted }]}>
        The engine waits when the next level against the trade is closer than the stop distance (Room to move), and warns when one sits before the target.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '800' },
  hint: { fontSize: 11, lineHeight: 15, marginTop: 4 },
  head: { fontSize: 12, fontWeight: '800', marginTop: 10, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  tf: { fontSize: 10, fontWeight: '800', borderWidth: 1, borderRadius: 6, paddingHorizontal: 4, minWidth: 24, textAlign: 'center' },
  label: { flex: 1, fontSize: 13 },
  price: { fontSize: 13, fontWeight: '700' },
  pct: { fontSize: 12, fontWeight: '700', minWidth: 56, textAlign: 'right' },
  none: { fontSize: 12 },
});
