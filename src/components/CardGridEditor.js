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

// ICICI-style grid card (back of debit card):
//   - Rows are lettered A-J down the left side
//   - Columns are numbered 1-10 across the top
//   - Each cell holds a 2-digit number
//   - Bank challenges reference coordinates like "A5" (row A, column 5)
// Stored on the card as { grid: { A: ['15','10',...], B: [...], ... } }
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const COLS = 10;

const emptyGrid = () =>
  LETTERS.reduce((acc, l) => {
    acc[l] = Array(COLS).fill('');
    return acc;
  }, {});

const normalizeGrid = (grid) => {
  const normalized = emptyGrid();
  if (grid && typeof grid === 'object') {
    LETTERS.forEach((l) => {
      const row = grid[l];
      if (Array.isArray(row)) {
        row.slice(0, COLS).forEach((cell, i) => {
          normalized[l][i] = String(cell ?? '').replace(/\D/g, '').slice(0, 2);
        });
      } else if (typeof row === 'string') {
        // Legacy shape: plain digit string, one digit per cell.
        row
          .replace(/\D/g, '')
          .slice(0, COLS)
          .split('')
          .forEach((digit, i) => {
            normalized[l][i] = digit;
          });
      }
    });
  }
  return normalized;
};

/**
 * Full-screen editor for the debit-card verification grid.
 * Includes a coordinate lookup (e.g. "A5") for net-banking challenges.
 */
export default function CardGridEditor({ visible, onClose, card, onSave }) {
  if (!visible) return null;
  return <GridEditorModal card={card} onClose={onClose} onSave={onSave} />;
}

function GridEditorModal({ card, onClose, onSave }) {
  const { theme } = useTheme();
  const [draft, setDraft] = useState(() => normalizeGrid(card?.grid));
  const [lookup, setLookup] = useState('');
  const [copiedValue, setCopiedValue] = useState(null);

  const hasGrid = !!(card && card.grid && Object.keys(card.grid).length);

  const setCell = (letter, colIndex, value) => {
    const digits = value.replace(/\D/g, '').slice(0, 2);
    setDraft((prev) => {
      const row = [...prev[letter]];
      row[colIndex] = digits;
      return { ...prev, [letter]: row };
    });
  };

  const save = () => {
    const grid = {};
    let filled = 0;
    LETTERS.forEach((l) => {
      const cells = draft[l].map((c) => c || '');
      if (cells.some((c) => c !== '')) {
        grid[l] = cells;
        filled += cells.filter((c) => c !== '').length;
      }
    });
    onSave(filled > 0 ? grid : null);
    onClose();
  };

  // Lookup: parse "A5" / "a5" -> row A, column 5 (1-based)
  const lookupResult = useMemo(() => {
    const match = lookup.trim().toUpperCase().match(/^([A-J])\s*-?\s*(10|[1-9])$/);
    if (!match) return null;
    const letter = match[1];
    const col = parseInt(match[2], 10) - 1;
    const value = draft[letter][col];
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
          Enter the grid from the back of your card — rows A–J, columns 1–10, two digits per cell.
        </Text>

        <ScrollView style={styles.gridScroll} showsVerticalScrollIndicator={false}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.gridWrap}
          >
            <View>
              {/* Column numbers across the top */}
              <View style={styles.headerRow}>
                <View style={styles.rowHeaderSpacer} />
                {Array.from({ length: COLS }).map((_, i) => (
                  <View key={i} style={[styles.colHeader, { backgroundColor: theme.primary }]}>
                    <Text style={styles.colHeaderText}>{i + 1}</Text>
                  </View>
                ))}
              </View>
              {/* Lettered rows A-J */}
              {LETTERS.map((letter) => (
                <View key={letter} style={styles.row}>
                  <View style={[styles.rowHeader, { backgroundColor: theme.secondary }]}>
                    <Text style={styles.rowHeaderText}>{letter}</Text>
                  </View>
                  {Array.from({ length: COLS }).map((_, col) => {
                    const value = draft[letter][col];
                    return (
                      <TextInput
                        key={col}
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
                        onChangeText={(text) => setCell(letter, col, text)}
                        keyboardType="number-pad"
                        maxLength={2}
                        selectTextOnFocus
                      />
                    );
                  })}
                </View>
              ))}
            </View>
          </ScrollView>
        </ScrollView>

        {/* Quick lookup for net-banking challenges, e.g. "A5" */}
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
              placeholder="Grid lookup (e.g. A5)"
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
            When your bank asks for a grid value, type the coordinate (letter + number) to see and
            copy it.
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
  gridScroll: { flex: 1 },
  gridWrap: { paddingHorizontal: 10, paddingBottom: 10 },
  headerRow: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  rowHeaderSpacer: { width: 28 },
  colHeader: {
    width: 38,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colHeaderText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  rowHeader: {
    width: 28,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowHeaderText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  cell: {
    width: 38,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
  },
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
