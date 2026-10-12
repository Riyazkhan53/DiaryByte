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
//   - 16 cells lettered A-P, arranged 8 per row on the card
//   - Each cell holds one 2-digit number
//   - Bank challenges ask for letters, e.g. "F" -> enter/copy the 2-digit value
// Stored on the card as { grid: { A: '15', B: '10', ..., P: '73' } }
const LETTERS = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
  'P',
];
const PER_ROW = 8;

const emptyGrid = () =>
  LETTERS.reduce((acc, l) => {
    acc[l] = '';
    return acc;
  }, {});

const normalizeGrid = (grid) => {
  const normalized = emptyGrid();
  if (grid && typeof grid === 'object') {
    LETTERS.forEach((l) => {
      const value = grid[l];
      if (typeof value === 'string') {
        normalized[l] = value.replace(/\D/g, '').slice(0, 2);
      } else if (Array.isArray(value) && value.length) {
        // Legacy shape: array of cells — keep the first entry.
        normalized[l] = String(value[0] ?? '')
          .replace(/\D/g, '')
          .slice(0, 2);
      }
    });
  }
  return normalized;
};

/**
 * Full-screen editor for the debit-card verification grid (A-P cells).
 * Includes a letter lookup for net-banking challenges.
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

  const setCell = (letter, value) => {
    const digits = value.replace(/\D/g, '').slice(0, 2);
    setDraft((prev) => ({ ...prev, [letter]: digits }));
  };

  const save = () => {
    const grid = {};
    LETTERS.forEach((l) => {
      if (draft[l]) grid[l] = draft[l];
    });
    onSave(Object.keys(grid).length ? grid : null);
    onClose();
  };

  // Lookup: a single letter A-P -> its 2-digit value
  const lookupResult = useMemo(() => {
    const match = lookup.trim().toUpperCase().match(/^([A-P])$/);
    if (!match) return null;
    const letter = match[1];
    const value = draft[letter];
    return { key: letter, value: value || '—' };
  }, [lookup, draft]);

  const copyLookup = async () => {
    if (!lookupResult || lookupResult.value === '—') return;
    await Clipboard.setStringAsync(lookupResult.value);
    setCopiedValue(lookupResult.value);
    setTimeout(() => setCopiedValue(null), 1500);
  };

  const renderRow = (rowIndex) => (
    <View key={rowIndex} style={styles.row}>
      {LETTERS.slice(rowIndex * PER_ROW, rowIndex * PER_ROW + PER_ROW).map((letter) => {
        const value = draft[letter];
        return (
          <View key={letter} style={styles.cellWrap}>
            <View style={[styles.cellLabel, { backgroundColor: theme.primary }]}>
              <Text style={styles.cellLabelText}>{letter}</Text>
            </View>
            <TextInput
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
              onChangeText={(text) => setCell(letter, text)}
              keyboardType="number-pad"
              maxLength={2}
              selectTextOnFocus
            />
          </View>
        );
      })}
    </View>
  );

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
          Enter the 2-digit number printed under each letter (A–P) on the back of your card.
        </Text>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.gridWrap}>
          {renderRow(0)}
          {renderRow(1)}
        </ScrollView>

        {/* Quick lookup for net-banking challenges, e.g. "F" */}
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
              placeholder="Grid lookup (e.g. F)"
              placeholderTextColor={theme.textMuted}
              value={lookup}
              onChangeText={setLookup}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={1}
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
            When your bank asks for a grid letter, type it here to see and copy the value.
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
  gridWrap: { paddingHorizontal: 12, paddingBottom: 10, alignItems: 'center' },
  row: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  cellWrap: { alignItems: 'center', gap: 4 },
  cellLabel: {
    width: 40,
    height: 22,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellLabelText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  cell: {
    width: 40,
    height: 40,
    borderRadius: 9,
    borderWidth: 1,
    textAlign: 'center',
    fontSize: 15,
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
