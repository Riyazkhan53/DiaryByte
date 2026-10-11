import { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../hooks/useTheme';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const ROWS = 10;

// ICICI-style grid card: columns A-J, 10 rows each.
// Stored on the card as { grid: { A: '1234567890', B: '...', ... } }
const emptyGrid = () =>
  LETTERS.reduce((acc, l) => {
    acc[l] = '';
    return acc;
  }, {});

const normalizeGrid = (grid) => {
  const normalized = emptyGrid();
  if (grid && typeof grid === 'object') {
    LETTERS.forEach((l) => {
      if (typeof grid[l] === 'string') {
        normalized[l] = grid[l].replace(/\D/g, '').slice(0, ROWS);
      }
    });
  }
  return normalized;
};

/**
 * Full-screen editor for the debit-card verification grid.
 * Includes a coordinate lookup (e.g. "F3") for net-banking challenges.
 */
export default function CardGridEditor({ visible, onClose, card, onSave }) {
  if (!visible) return null;
  return (
    <GridEditorModal
      card={card}
      onClose={onClose}
      onSave={onSave}
    />
  );
}

function GridEditorModal({ card, onClose, onSave }) {
  const { theme } = useTheme();
  const [draft, setDraft] = useState(() => normalizeGrid(card?.grid));
  const [lookup, setLookup] = useState('');
  const [copiedValue, setCopiedValue] = useState(null);

  const hasGrid = !!(card && card.grid && Object.keys(card.grid).length);

  const setCell = (letter, rowIndex, value) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    setDraft((prev) => {
      const col = (prev[letter] || '').padEnd(ROWS, ' ').split('');
      col[rowIndex] = digit === '' ? ' ' : digit;
      const joined = col.join('');
      return { ...prev, [letter]: joined.trim() === '' ? '' : joined };
    });
  };

  const save = () => {
    const grid = {};
    let filled = 0;
    LETTERS.forEach((l) => {
      const value = (draft[l] || '').replace(/ /g, '');
      if (value) {
        grid[l] = value;
        filled += value.length;
      }
    });
    onSave(filled > 0 ? grid : null);
    onClose();
  };

  // Lookup: parse "F3" / "f3" -> column F, row 3 (1-based)
  const lookupResult = useMemo(() => {
    const match = lookup.trim().toUpperCase().match(/^([A-J])\s*-?\s*(10|[1-9])$/);
    if (!match) return null;
    const letter = match[1];
    const row = parseInt(match[2], 10) - 1;
    const value = (draft[letter] || '').replace(/ /g, '')[row];
    return { key: `${letter}${match[2]}`, value: value || '—' };
  }, [lookup, draft]);

  const copyLookup = async () => {
    if (!lookupResult || lookupResult.value === '—') return;
    await Clipboard.setStringAsync(lookupResult.value);
    setCopiedValue(lookupResult.value);
    setTimeout(() => setCopiedValue(null), 1500);
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { borderBottomColor: theme.borderNeutral }]}>
          <View style={styles.headerTextWrap}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Card Grid</Text>
            <Text style={[styles.headerSub, { color: theme.textSecondary }]} numberOfLines={1}>
              {card ? `${card.bankName || card.brand || 'Card'} · ${card.cardType || 'Debit'}` : ''}
            </Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={24} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.hint, { color: theme.textMuted }]}>
          Enter the A–J grid numbers from the back of your card, one digit per row.
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.gridWrap}
        >
          <View>
            <View style={styles.headerRow}>
              {LETTERS.map((l) => (
                <View key={l} style={[styles.colHeader, { backgroundColor: theme.primary }]}>
                  <Text style={styles.colHeaderText}>{l}</Text>
                </View>
              ))}
            </View>
            {Array.from({ length: ROWS }).map((_, row) => (
              <View key={row} style={styles.row}>
                {LETTERS.map((l) => {
                  const value = (draft[l] || '').replace(/ /g, '')[row] || '';
                  return (
                    <TextInput
                      key={l}
                      style={[
                        styles.cell,
                        {
                          backgroundColor: theme.surface,
                          borderColor: theme.borderNeutral,
                          color: theme.text,
                        },
                        value !== '' && { borderColor: theme.primary, borderWidth: 1.5 },
                      ]}
                      value={value}
                      onChangeText={(text) => setCell(l, row, text)}
                      keyboardType="number-pad"
                      maxLength={1}
                      selectTextOnFocus
                    />
                  );
                })}
              </View>
            ))}
            <View style={styles.rowNumbers}>
              <Text style={[styles.rowNumberText, { color: theme.textMuted }]}>rows 1–10</Text>
            </View>
          </View>
        </ScrollView>

        {/* Quick lookup for net-banking challenges, e.g. "F3" */}
        <View
          style={[
            styles.lookupCard,
            { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow },
          ]}
        >
          <View style={styles.lookupRow}>
            <Ionicons name="search-outline" size={17} color={theme.textMuted} />
            <TextInput
              style={[styles.lookupInput, { color: theme.text }]}
              placeholder="Grid lookup (e.g. F3)"
              placeholderTextColor={theme.textMuted}
              value={lookup}
              onChangeText={setLookup}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {lookupResult ? (
              <TouchableOpacity
                style={[styles.lookupValueBtn, { backgroundColor: theme.secondary }]}
                onPress={copyLookup}
              >
                <Text style={styles.lookupValueText}>
                  {copiedValue ? 'Copied!' : `${lookupResult.key} = ${lookupResult.value}`}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <Text style={[styles.lookupHint, { color: theme.textMuted }]}>
            When your bank asks for a grid value, type the coordinate to see and copy it.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: theme.primary }]}
          onPress={save}
          activeOpacity={0.8}
        >
          <Text style={[styles.saveText, { color: theme.text }]}>
            {hasGrid ? 'Update Grid' : 'Save Grid'}
          </Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 54 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTextWrap: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  headerSub: { fontSize: 12, marginTop: 2 },
  closeBtn: { padding: 6 },
  hint: { fontSize: 12, paddingHorizontal: 16, paddingVertical: 10 },
  gridWrap: { paddingHorizontal: 10, paddingBottom: 6 },
  headerRow: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  colHeader: {
    width: 31,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colHeaderText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  cell: {
    width: 31,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
  },
  rowNumbers: { flexDirection: 'row', justifyContent: 'flex-end', paddingRight: 2, paddingTop: 2 },
  rowNumberText: { fontSize: 10, fontWeight: '600' },
  lookupCard: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  lookupRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lookupInput: { flex: 1, fontSize: 15, fontWeight: '600' },
  lookupValueBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  lookupValueText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  lookupHint: { fontSize: 11, marginTop: 8 },
  saveBtn: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 20,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
  },
  saveText: { fontSize: 16, fontWeight: '700' },
});
