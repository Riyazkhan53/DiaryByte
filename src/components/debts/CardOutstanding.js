import { useState } from 'react';
import { FlatList, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cardBalance, cardOutstandingSummary, isCardOutstanding } from '../../utils/debts';
import { savedCardLabel } from '../../utils/cards';
import { confirmDelete } from '../../utils/confirm';

// My Debts → Card Outstanding: each credit card's outstanding and available
// limit. You type them in from the card's app now and then; in between they
// move by themselves (card spends add, paid card bills take off; see
// cardBalance in utils/debts). These outstandings are what count in net
// worth and total debts (card bills don't).

const money = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const toNum = (text) => parseFloat(String(text ?? '').replace(/[^\d.]/g, ''));
const makeId = () => `${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`;
const usedColor = (pct) => (pct < 30 ? '#2DA44E' : pct < 70 ? '#F59E0B' : '#E5383B');
const EMPTY = { name: '', limit: '', available: '', note: '', cardId: null, cardLast4: '' };

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
export function CardOutstandingList({ items, ctx, theme, cardStyle, onEdit }) {
  const full = { debts: items, ...ctx };
  const cards = items
    .filter(isCardOutstanding)
    .map((item) => ({ item, bal: cardBalance(item, full) }))
    .sort((a, b) => b.bal.outstanding - a.bal.outstanding);
  const sum = cardOutstandingSummary(items, ctx);
  const [now] = useState(() => Date.now());
  const [openId, setOpenId] = useState(null);

  const header = (
    <View>
      <View style={[styles.summary, cardStyle]}>
        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={[styles.label, { color: theme.textMuted }]}>Limit used (outstanding)</Text>
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
          Enter each card&apos;s total and available limit from its app; the limit used is worked out from them. After that they update by themselves: card
          spends (Total Spend, investments, money taken from the card) add to it, and paying the card&apos;s bill in Card
          Bills takes it off. Tap a card to correct it any time. Net worth and total debts use these; card bills
          aren&apos;t counted again.
        </Text>
      </View>
      {cards.length ? <Text style={[styles.listTitle, { color: theme.text }]}>My cards</Text> : null}
    </View>
  );

  const renderCard = ({ item: row }) => {
    const { item, bal } = row;
    const pct = bal.usedPct;
    const moved = bal.charges.length || bal.payments.length;
    const open = openId === item.id;
    return (
      <TouchableOpacity style={[styles.card, cardStyle]} activeOpacity={0.8} onPress={() => onEdit(item)} accessibilityLabel={`Update ${item.name}`}>
        <View style={styles.cardHead}>
          <View style={[styles.icon, { backgroundColor: '#FF950040' }]}>
            <Ionicons name="card-outline" size={19} color="#455A64" />
          </View>
          <View style={styles.flex}>
            <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
              {item.name}
              {item.cardLast4 ? ` ··${item.cardLast4}` : ''}
            </Text>
            <Text style={[styles.small, { color: theme.textMuted }]}>{updatedLabel(item.balanceAt || item.updatedAt || item.createdAt, now)}</Text>
          </View>
          <View style={styles.right}>
            <Text style={[styles.cardAmount, { color: bal.outstanding > 0 ? '#E5383B' : theme.text }]}>{money(bal.outstanding)}</Text>
            <Text style={[styles.small, { color: theme.textMuted }]}>limit used</Text>
          </View>
        </View>
        <UsedBar pct={pct} theme={theme} />
        <View style={styles.cardFoot}>
          <Text style={[styles.small, { color: theme.textSecondary }]}>
            Available {money(bal.available)} of {money(bal.limit)}
          </Text>
          <Text style={[styles.small, styles.bold, { color: usedColor(pct) }]}>{pct}% used</Text>
        </View>
        {moved ? (
          <TouchableOpacity onPress={() => setOpenId(open ? null : item.id)} accessibilityLabel={`${open ? 'Hide' : 'Show'} changes since the last update`}>
            <Text style={[styles.small, styles.moved, { color: theme.textSecondary }]}>
              Since you updated it:
              {bal.charged ? <Text style={{ color: '#E5383B' }}>{` +${money(bal.charged)} spent`}</Text> : null}
              {bal.charged && bal.paid ? ' ·' : ''}
              {bal.paid ? <Text style={{ color: '#2DA44E' }}>{` −${money(bal.paid)} paid`}</Text> : null}
              {open ? '  ▴' : '  ▾'}
            </Text>
          </TouchableOpacity>
        ) : null}
        {open
          ? [...bal.charges.map((c) => ({ ...c, sign: '+' })), ...bal.payments.map((p) => ({ ...p, sign: '−' }))]
              .sort((a, b) => b.at - a.at)
              .map((a) => (
                <View key={a.key} style={styles.actRow}>
                  <Text style={[styles.small, styles.flex, { color: theme.text }]} numberOfLines={1}>
                    {a.title}
                  </Text>
                  <Text style={[styles.small, styles.bold, { color: a.sign === '+' ? '#E5383B' : '#2DA44E' }]}>
                    {a.sign}
                    {money(a.amount)}
                  </Text>
                </View>
              ))
          : null}
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
      keyExtractor={(row) => row.item.id}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={header}
      renderItem={renderCard}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="card-outline" size={52} color={theme.textMuted} />
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>
            No cards yet. Tap + and enter a card&apos;s total limit and available limit.
          </Text>
        </View>
      }
    />
  );
}

/** Add / edit sheet. `editing`: {} for a new card, or the entry to edit. */
export function CardOutstandingForm({ editing, items, ctx, persist, creditCards, theme, onClose }) {
  const isNew = !editing?.id;
  // Start from the live figures, so an update only needs the numbers that changed.
  const live = editing?.id ? cardBalance(editing, { debts: items, ...ctx }) : null;
  const [form, setForm] = useState(() =>
    editing?.id
      ? {
          name: editing.name || '',
          limit: String(live.limit),
          available: String(live.available),
          note: editing.note || '',
          cardId: editing.cardId || null,
          cardLast4: editing.cardLast4 || '',
        }
      : EMPTY
  );
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  // You enter the total and available limits; limit used (the outstanding) follows.
  const limit = toNum(form.limit);
  const avail = toNum(form.available);
  const both = Number.isFinite(limit) && limit > 0 && Number.isFinite(avail) && avail >= 0;
  const tooHigh = both && avail > limit;
  const out = both && !tooHigh ? Math.round((limit - avail) * 100) / 100 : null;
  const valid = form.name.trim() && both && !tooHigh;

  const save = () => {
    if (!valid) return;
    const now = new Date().toISOString();
    const fields = {
      name: form.name.trim(),
      creditLimit: Math.round(limit * 100) / 100,
      outstanding: out,
      available: Math.round(avail * 100) / 100,
      note: form.note.trim() || undefined,
      cardId: form.cardId || undefined,
      cardLast4: form.cardLast4 || undefined,
      updatedAt: now,
      // From now on, only charges and payments after this moment move it.
      balanceAt: now,
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
            <Text style={[styles.modalTitle, { color: theme.text }]}>{isNew ? 'Add card' : 'Update card'}</Text>
            {!isNew ? (
              <Text style={[styles.small, { color: theme.textMuted, marginBottom: 10 }]}>
                These are the live figures. Change them if your card&apos;s app shows something different; saving starts the count
                again from here.
              </Text>
            ) : null}
            <TextInput
              style={input}
              placeholder="Card (e.g. HDFC Millennia)"
              placeholderTextColor={theme.textMuted}
              value={form.name}
              onChangeText={(name) => setForm((f) => ({ ...f, name, cardId: null, cardLast4: '' }))}
            />
            {creditCards.length ? (
              <>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Pick from your cards (so its spends and bills update it)</Text>
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
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Total limit (₹)</Text>
                <TextInput style={input} keyboardType="decimal-pad" placeholder="e.g. 100000" placeholderTextColor={theme.textMuted} value={form.limit} onChangeText={set('limit')} />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Available limit (₹)</Text>
                <TextInput style={input} keyboardType="decimal-pad" placeholder="e.g. 76550" placeholderTextColor={theme.textMuted} value={form.available} onChangeText={set('available')} />
              </View>
            </View>
            {tooHigh ? (
              <Text style={[styles.small, { color: '#E5383B', marginTop: 6 }]}>Available can&apos;t be more than the total limit.</Text>
            ) : out != null ? (
              <View style={[styles.usedBox, { backgroundColor: theme.surfaceAlt }]}>
                <Text style={[styles.small, { color: theme.textSecondary }]}>Limit used (outstanding)</Text>
                <Text style={[styles.usedValue, { color: out > 0 ? '#E5383B' : theme.text }]}>
                  {money(out)} <Text style={[styles.small, styles.bold, { color: usedColor(Math.round((out / limit) * 100)) }]}>· {Math.round((out / limit) * 100)}% used</Text>
                </Text>
              </View>
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
  usedBox: { borderRadius: 12, padding: 10, marginTop: 10 },
  usedValue: { fontSize: 18, fontWeight: '800', marginTop: 2 },
  moved: { marginTop: 8, fontWeight: '600' },
  actRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
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
