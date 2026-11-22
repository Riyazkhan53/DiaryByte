import { StyleSheet, Text, View } from 'react-native';
import { LOSS, PROFIT } from './format';

const BIAS = { bull: { arrow: '▲', color: PROFIT, word: 'Bullish' }, bear: { arrow: '▼', color: LOSS, word: 'Bearish' }, neutral: { arrow: '◆', color: '#8E8E93', word: 'Neutral' } };

/**
 * Candlestick and chart patterns the engine found on the latest 5-minute
 * candles, and the points they added to (or took off) each side's score.
 */
export default function PatternsCard({ patterns, points, theme, cardStyle }) {
  const list = patterns || [];
  const pts = (n) => (n > 0 ? `+${n}` : `${n}`);
  return (
    <View style={cardStyle}>
      <Text style={[styles.title, { color: theme.text }]}>Patterns (5-min candles)</Text>
      {list.length ? (
        list.map((p) => {
          const b = BIAS[p.bias] || BIAS.neutral;
          return (
            <View key={p.id} style={styles.row}>
              <Text style={[styles.arrow, { color: b.color }]}>{b.arrow}</Text>
              <View style={styles.flex}>
                <Text style={[styles.name, { color: theme.text }]}>
                  {p.name}
                  <Text style={{ color: theme.textMuted }}> · {b.word}{p.strength === 2 ? ', strong' : ''}</Text>
                </Text>
                {p.note ? <Text style={[styles.note, { color: theme.textSecondary }]}>{p.note}</Text> : null}
              </View>
            </View>
          );
        })
      ) : (
        <Text style={[styles.note, { color: theme.textMuted }]}>No pattern on the latest candles.</Text>
      )}
      {points && (points.long || points.short) ? (
        <Text style={[styles.points, { color: theme.textSecondary }]}>
          Score effect: long {pts(points.long)}, short {pts(points.short)}
        </Text>
      ) : null}
      <Text style={[styles.hint, { color: theme.textMuted }]}>
        A pattern in the trade&apos;s direction adds 5 (weak) or 10 (strong) points; one against it takes them off (at most ±10 per side). Patterns support the other checks; they never trigger a trade alone.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  row: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  arrow: { fontSize: 14, fontWeight: '900', width: 16, textAlign: 'center', marginTop: 1 },
  flex: { flex: 1 },
  name: { fontSize: 14, fontWeight: '700' },
  note: { fontSize: 12, lineHeight: 17 },
  points: { fontSize: 12, fontWeight: '700', marginTop: 6 },
  hint: { fontSize: 11, lineHeight: 15, marginTop: 6 },
});
