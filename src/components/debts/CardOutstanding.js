import { useState } from 'react';
import { FlatList, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cardOutstandingSummary, isCardOutstanding } from '../../utils/debts';
import { savedCardLabel } from '../../utils/cards';
import { confirmDelete } from '../../utils/confirm';

// My Debts → Card Outstanding: each credit card's current outstanding and
// available limit, typed in from the card's app. These outstandings are what
// count in net worth and total debts (card bills don't).

const money = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const toNum = (text) => parseFloat(String(text ?? '').replace(/[^\d.]/g, ''));
const makeId = () => `${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`;
const usedColor = (pct) => (pct < 30 ? '#2DA44E' : pct < 70 ? '#F59E0B' : '#E5383B');
const EMPTY = { name: '', outstanding: '', available: '', note: '', cardId: null, cardLast4: '' };

function updatedLabel(iso, now) {
  if (!iso || !now) return '';
  const days = Math.floor((now - Date.parse(iso)) / 86400000);
  if (days <= 0) return 'Updated today';
  if (days === 1) return 'Updated yesterday';
  return `Updated ${days} days ago`;
}

function UsedBar({ pct, theme }) {
  return (
    <View style={[styles.track, { backgroundColor: theme.surfaceAlt }]}>
      <View style={[styles.fill, { width: `${Math.min(100, Math.max(pct, pct > 0 ? 2 : 0))}%`, backgroundColor: usedColor(pct) }]} />
    </View>
  );
}

/** The section's list. `editing` is null (closed), {} (new) or an entry. */
export function CardOutstandingList({ items, theme, cardStyle, onEdit }) {
  const cards = items.filter(isCardOutstanding).sort((a, b) => (Number(b.outstanding) || 0) - (Number(a.outstanding) || 0));
  const sum = cardOutstandingSummary(items);
  const [now] = useState(() => Date.now());

  const header = (
    <View>
      <View style={[styles.summary, cardStyle]}>
        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={[styles.label, { color: theme.textMuted }]}>Total outstanding</Text>
            <Text style={[styles.big, { color: '#E5383B' }]}>{money(sum.outstanding)}</Text>
          </View>
          <View style={styles.col}>
            <Text style={[styles.label, { color: theme.textMuted }]}>Available limit</Text>
            <Text style={[styles.big, { color: '#2DA44E' }]}>{money(sum.available)}</Text>
          </View>
        </View>
        {sum.limit > 0 ? (
          <>
            <View style={styles.usedRow}>
              <Text style={[styles.small, { color: theme.textMuted }]}>
                {sum.usedPct}% used of {money(sum.limit)} total limit
              </Text>
            </View>
            <UsedBar pct={sum.usedPct} theme={theme} />
          </>
        ) : null}
        <Text style={[styles.hint, { color: theme.textMuted }]}>
          Copy each card&apos;s current outstanding and available limit from its app. Net worth and total debts use these
          outstandings; credit card bills are only reminders and aren&apos;t counted again. Keeping usage under 30% helps
          your credit score.
        </Text>
      </View>
      {cards.length ? <Text style={[styles.listTitle, { color: theme.text }]}>My cards</Text> : null}
    </View>
  );

  const renderCard = ({ item }) => {
    const out = Number(item.outstanding) || 0;
    const avail = Number(item.available) || 0;
    const limit = out + avail;
    const pct = limit > 0 ? Math.round((out / limit) * 100) : 0;
    return (
      <TouchableOpacity style={[styles.card, cardStyle]} activeOpacity={0.8} onPress={() => onEdit(item)} accessibilityLabel={`Edit ${item.name}`}>
        <View style={styles.cardHead}>
          <View style={[styles.icon, { backgroundColor: '#FF950040' }]}>
            <Ionicons name="card-outline" size={19} color="#455A64" />
          </View>
          <View style={styles.flex}>
            <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
              {item.name}
              {item.cardLast4 ? ` ··${item.cardLast4}` : ''}
            </Text>
            <Text style={[styles.small, { color: theme.textMuted }]}>{updatedLabel(item.updatedAt || item.createdAt, now)}</Text>
          </View>
          <View style={styles.right}>
            <Text style={[styles.cardAmount, { color: out > 0 ? '#E5383B' : theme.text }]}>{money(out)}</Text>
            <Text style={[styles.small, { color: theme.textMuted }]}>outstanding</Text>
          </View>
        </View>
        <UsedBar pct={pct} theme={theme} />
        <View style={styles.cardFoot}>
          <Text style={[styles.small, { color: theme.textSecondary }]}>
            Available {money(avail)} · Limit {money(limit)}
          </Text>
          <Text style={[styles.small, styles.bold, { color: usedColor(pct) }]}>{pct}% used</Text>
        </View>
        {item.note ? (
          <Text style={[styles.small, { color: theme.textMuted }]} numberOfLines={2}>
            {item.note}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <FlatList
      data={cards}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={header}
      renderItem={renderCard}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="card-outline" size={52} color={theme.textMuted} />
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>
            No cards yet. Tap + and enter a card&apos;s current outstanding and available limit.
          </Text>
        </View>
      }
    />
  );
}

/** Add / edit sheet. `editing`: {} for a new card, or the entry to edit. */
export function CardOutstandingForm({ editing, items, persist, creditCards, theme, onClose }) {
  const isNew = !editing?.id;
  const [form, setForm] = useState(() =>
    editing?.id
      ? {
          name: editing.name || '',
          outstanding: editing.outstanding != null ? String(editing.outstanding) : '',
          available: editing.available != null ? String(editing.available) : '',
          note: editing.note || '',
          cardId: editing.cardId || null,
          cardLast4: editing.cardLast4 || '',
        }
      : EMPTY
  );
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const out = toNum(form.outstanding);
  const avail = toNum(form.available);
  const valid = form.name.trim() && Number.isFinite(out) && out >= 0 && Number.isFinite(avail) && avail >= 0;
  const limit = (Number.isFinite(out) ? out : 0) + (Number.isFinite(avail) ? avail : 0);

  const save = () => {
    if (!valid) return;
    const now = new Date().toISOString();
    const fields = {
      name: form.name.trim(),
      outstanding: Math.round(out * 100) / 100,
      available: Math.round(avail * 100) / 100,
      note: form.note.trim() || undefined,
      cardId: form.cardId || undefined,
      cardLast4: form.cardLast4 || undefined,
      updatedAt: now,
    };
    if (isNew) persist([{ id: makeId(), section: 'cardout', createdAt: now, ...fields }, ...items]);
    else persist(items.map((i) => (i.id === editing.id ? { ...i, ...fields } : i)));
    onClose();
  };

  const remove = () =>
    confirmDelete('Delete', `Remove ${editing.name}? Its outstanding stops counting in your debts.`, () => {
      persist(items.filter((i) => i.id !== editing.id));
      onClose();
    });

  const input = [styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modal, { backgroundColor: theme.sheet }]}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={[styles.modalTitle, { color: theme.text }]}>{isNew ? 'Add card outstanding' : 'Update card'}</Text>
            <TextInput
              style={input}
              placeholder="Card (e.g. HDFC Millennia)"
              placeholderTextColor={theme.textMuted}
              value={form.name}
              onChangeText={(name) => setForm((f) => ({ ...f, name, cardId: null, cardLast4: '' }))}
            />
            {creditCards.length ? (
              <>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Pick from your cards</Text>
                <View style={styles.chips}>
                  {creditCards.map((card) => {
                    const on = form.cardId === card.id;
                    return (
                      <TouchableOpacity
                        key={card.id}
                        style={[styles.chip, { backgroundColor: on ? theme.secondary : theme.surfaceAlt, borderColor: on ? theme.secondary : theme.borderNeutral }]}
                        onPress={() =>
                          setForm((f) =>
                            on ? { ...f, cardId: null, cardLast4: '' } : { ...f, name: savedCardLabel(card), cardId: card.id, cardLast4: (card.number || '').slice(-4) }
                          )
                        }
                      >
                        <Ionicons name="card-outline" size={14} color={on ? '#FFF' : theme.text} />
                        <Text style={[styles.chipText, { color: on ? '#FFF' : theme.text }]}>{savedCardLabel(card)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : null}
            <View style={styles.row}>
              <View style={styles.flex}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Current outstanding (₹)</Text>
                <TextInput style={input} keyboardType="decimal-pad" placeholder="e.g. 23450" placeholderTextColor={theme.textMuted} value={form.outstanding} onChangeText={set('outstanding')} />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Available limit (₹)</Text>
                <TextInput style={input} keyboardType="decimal-pad" placeholder="e.g. 76550" placeholderTextColor={theme.textMuted} value={form.available} onChangeText={set('available')} />
              </View>
            </View>
            {limit > 0 ? (
              <Text style={[styles.small, { color: theme.textSecondary, marginTop: 6 }]}>
                Total limit {money(limit)} · {Math.round(((Number.isFinite(out) ? out : 0) / limit) * 100)}% used
              </Text>
            ) : null}
            <TextInput
              style={[input, styles.note]}
              placeholder="Note (optional)"
              placeholderTextColor={theme.textMuted}
              value={form.note}
              onChangeText={set('note')}
            />
            {!isNew ? (
              <TouchableOpacity style={styles.deleteRow} onPress={remove} accessibilityLabel={`Delete ${editing.name}`}>
                <Ionicons name="trash-outline" size={16} color={theme.danger} />
                <Text style={[styles.deleteText, { color: theme.danger }]}>Delete this card</Text>
              </TouchableOpacity>
            ) : null}
            <View style={styles.actions}>
              <TouchableOpacity style={[styles.btn, { backgroundColor: theme.surfaceAlt }]} onPress={onClose}>
                <Text style={[styles.btnText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { backgroundColor: theme.primary }, !valid && styles.disabled]} onPress={save} disabled={!valid}>
                <Text style={[styles.btnText, { color: theme.onPrimary }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingBottom: 110 },
  summary: { borderRadius: 18, borderWidth: 1, padding: 16, marginBottom: 14, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  row: { flexDirection: 'row', gap: 12 },
  col: { flex: 1 },
  label: { fontSize: 12, fontWeight: '600' },
  big: { fontSize: 22, fontWeight: '800', marginTop: 2 },
  usedRow: { marginTop: 12, marginBottom: 6 },
  small: { fontSize: 12, lineHeight: 17 },
  bold: { fontWeight: '800' },
  hint: { fontSize: 12, lineHeight: 17, marginTop: 10 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 8 },
  fill: { height: 8, borderRadius: 4 },
  listTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  card: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 12, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  right: { alignItems: 'flex-end' },
  cardAmount: { fontSize: 17, fontWeight: '800' },
  cardFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modal: { borderRadius: 20, padding: 20, maxHeight: '90%' },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 14 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 4 },
  note: { marginTop: 10 },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginTop: 10, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontSize: 13, fontWeight: '600' },
  deleteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  deleteText: { fontSize: 14, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 18 },
  btn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  btnText: { fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
