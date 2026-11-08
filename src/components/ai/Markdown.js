import { StyleSheet, Text, View } from 'react-native';

// The small slice of Markdown the assistants write: "## " headings,
// "- " / "* " / "1. " bullets, **bold** and blank-line paragraphs.

function Inline({ text, color, style }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <Text style={[styles.text, { color }, style]}>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? (
          <Text key={i} style={styles.bold}>
            {p.slice(2, -2)}
          </Text>
        ) : (
          p.replace(/`([^`]+)`/g, '$1')
        )
      )}
    </Text>
  );
}

export default function Markdown({ text, color, accent }) {
  const lines = String(text || '').split('\n');
  return (
    <View style={styles.wrap}>
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <View key={i} style={styles.gap} />;
        const heading = /^#{1,4}\s+(.*)$/.exec(line);
        if (heading) return <Inline key={i} text={heading[1]} color={color} style={styles.heading} />;
        const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
        if (bullet) {
          return (
            <View key={i} style={styles.bulletRow}>
              <Text style={[styles.dot, { color: accent }]}>•</Text>
              <Inline text={bullet[1]} color={color} style={styles.flex} />
            </View>
          );
        }
        const numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
        if (numbered) {
          return (
            <View key={i} style={styles.bulletRow}>
              <Text style={[styles.num, { color: accent }]}>{numbered[1]}.</Text>
              <Inline text={numbered[2]} color={color} style={styles.flex} />
            </View>
          );
        }
        return <Inline key={i} text={line} color={color} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 3 },
  flex: { flex: 1 },
  text: { fontSize: 15, lineHeight: 21 },
  bold: { fontWeight: '800' },
  heading: { fontSize: 15, fontWeight: '800', marginTop: 4 },
  gap: { height: 4 },
  bulletRow: { flexDirection: 'row', gap: 6, paddingLeft: 2 },
  dot: { fontSize: 15, lineHeight: 21, fontWeight: '800' },
  num: { fontSize: 14, lineHeight: 21, fontWeight: '700', minWidth: 16 },
});
