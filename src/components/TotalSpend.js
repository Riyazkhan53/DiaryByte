import { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, FlatList, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { confirmDelete } from '../utils/confirm';
import { savedCardLabel } from '../utils/cards';
import { addMonths } from '../utils/debts';
import {
  SPEND_SOURCES,
  spendBreakdown,
  spendSourceLabel,
  spendSourceMeta,
  syncSpendExpense,
} from '../utils/spends';

const makeId = () => `${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`;

// Colour for "can be saved" amounts and the avoidable mark.
const SAVE_COLOR = '#2DA44E';

const parseAmount = (text) => parseFloat(String(text).replace(/[^\d.]/g, ''));

const EMPTY_FORM = {
  title: '',
  amount: '',
  source: 'cash',
  cardId: null,
  cardLabel: '',
  sourceNote: '',
  addToExpenses: false,
  category: 'Other',
  avoidable: false,
};

/**
 * "Total Spend" tab of My Expenditure: everything spent in the selected
 * month and what it was paid from, with the option to count each spend in
 * the month's expenses too.
 *
 * Shares the parent screen's styles, categories and month helpers so both
 * tabs look and behave alike.
 */
export default function TotalSpend({
  header,
  selectedMonth,
  spends,
  persistSpends,
  expenses,
  persistExpenses,
  creditCards,
  categories,
  categoryMeta,
  formatAmount,
  monthLabel,
  dateForMonth,
  styles: shared,
}) {
  const { theme } = useTheme();
  const [visible, setVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const setField = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const monthSpends = spends
    .filter((s) => s.month === selectedMonth)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  const { total, counted, avoidable, avoidableCount, groups } = spendBreakdown(monthSpends);
  const avoidableSpends = monthSpends
    .filter((s) => s.avoidable)
    .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0));
  const previousMonth = addMonths(selectedMonth, -1);
  const previous = spendBreakdown(spends.filter((s) => s.month === previousMonth));

  // Quick toggle from the list, without opening the form.
  const toggleAvoidable = (spend) =>
    persistSpends(
      spends.map((s) =>
        s.id === spend.id ? { ...s, avoidable: !s.avoidable, updatedAt: new Date().toISOString() } : s
      )
    );

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setVisible(true);
  };

  const openEdit = (spend) => {
    setEditingId(spend.id);
    setForm({
      title: spend.title || '',
      amount: spend.amount != null ? String(spend.amount) : '',
      source: spend.source || 'other',
      cardId: spend.cardId || null,
      cardLabel: spend.cardLabel || '',
      sourceNote: spend.sourceNote || '',
      addToExpenses: !!spend.addToExpenses,
      category: spend.category || 'Other',
      avoidable: !!spend.avoidable,
    });
    setVisible(true);
  };

  const pickCard = (card) =>
    setForm((f) => ({ ...f, cardId: card.id, cardLabel: savedCardLabel(card) }));

  const amountNum = parseAmount(form.amount);
  const valid =
    form.title.trim() &&
    amountNum > 0 &&
    (form.source !== 'card' || form.cardLabel.trim()) &&
    (form.source !== 'other' || form.sourceNote.trim());

  const save = () => {
    if (!valid) return;
    const existing = editingId ? spends.find((s) => s.id === editingId) : null;
    const spend = {
      ...existing,
      id: editingId || makeId(),
      title: form.title.trim(),
      amount: amountNum,
      month: existing?.month || selectedMonth,
      date: existing?.date || dateForMonth(selectedMonth),
      source: form.source,
      cardId: form.source === 'card' ? form.cardId || undefined : undefined,
      cardLabel: form.source === 'card' ? form.cardLabel.trim() : undefined,
      sourceNote: form.source === 'other' ? form.sourceNote.trim() : undefined,
      addToExpenses: form.addToExpenses,
      category: form.category,
      avoidable: form.avoidable,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    persistSpends(existing ? spends.map((s) => (s.id === spend.id ? spend : s)) : [spend, ...spends]);
    const nextExpenses = syncSpendExpense(expenses, spend);
    if (nextExpenses !== expenses) persistExpenses(nextExpenses);
    setVisible(false);
  };

  const remove = (spend) => {
    confirmDelete(
      'Delete Spend',
      spend.addToExpenses
        ? `Remove ${spend.title}? It will be removed from this month's expenses too.`
        : `Remove ${spend.title}?`,
      () => {
        persistSpends(spends.filter((s) => s.id !== spend.id));
        const nextExpenses = syncSpendExpense(expenses, null, spend.id);
        if (nextExpenses !== expenses) persistExpenses(nextExpenses);
      }
    );
  };

  const inputStyle = [
    shared.input,
    { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text },
  ];
  const cardStyle = [
    shared.summaryCard,
    { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow },
  ];

  const listHeader = (
    <View>
      {header}
      <View style={cardStyle}>
        <Text style={[shared.cardTitle, { color: theme.text }]}>
          Total spend · {monthLabel(selectedMonth, true)}
        </Text>
        <Text style={[shared.balanceValue, { color: '#E5383B' }]}>{formatAmount(total)}</Text>
        {total > 0 ? (
          <Text style={[shared.summaryLabel, styles.countedLine, { color: theme.textMuted }]}>
            {formatAmount(counted)} of it added to this month&apos;s expenses
          </Text>
        ) : null}
        {groups.length > 0 ? (
          <View style={[styles.breakdown, { borderTopColor: theme.borderNeutral }]}>
            {groups.map((g) => {
              const meta = spendSourceMeta(g.source);
              const pct = total > 0 ? (g.amount / total) * 100 : 0;
              return (
                <View key={g.key} style={styles.groupRow}>
                  <View style={[styles.groupIcon, { backgroundColor: meta.color + '33' }]}>
                    <Ionicons name={meta.icon} size={15} color={theme.textSecondary} />
                  </View>
                  <View style={styles.groupBody}>
                    <View style={styles.groupTop}>
                      <Text style={[styles.groupLabel, { color: theme.text }]} numberOfLines={1}>
                        {g.label}
                      </Text>
                      <Text style={[styles.groupAmount, { color: theme.text }]}>{formatAmount(g.amount)}</Text>
                    </View>
                    <View style={[shared.progressTrack, { backgroundColor: theme.surfaceAlt }]}>
                      <View style={[shared.progressFill, { width: `${pct}%`, backgroundColor: meta.color }]} />
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>

      {total > 0 ? (
        <View style={cardStyle}>
          <View style={styles.saveHead}>
            <Ionicons name="leaf-outline" size={18} color={SAVE_COLOR} />
            <Text style={[shared.cardTitle, shared.noMargin, { color: theme.text }]}>Can be saved</Text>
          </View>
          <Text style={[shared.balanceValue, { color: SAVE_COLOR }]}>{formatAmount(avoidable)}</Text>
          <Text style={[shared.summaryLabel, styles.countedLine, { color: theme.textMuted }]}>
            {avoidableCount
              ? `${Math.round((avoidable / total) * 100)}% of ${monthLabel(selectedMonth)} spend · ${avoidableCount} avoidable ${avoidableCount === 1 ? 'spend' : 'spends'}`
              : 'Tap the ⊖ on a spend you could have skipped to add it here.'}
          </Text>
          {previous.total > 0 ? (
            <Text style={[shared.summaryLabel, styles.countedLine, { color: theme.textMuted }]}>
              {monthLabel(previousMonth)}: {formatAmount(previous.avoidable)} avoidable
              {previous.avoidable > 0 && avoidable !== previous.avoidable
                ? avoidable < previous.avoidable
                  ? ` · ${formatAmount(previous.avoidable - avoidable)} less this month`
                  : ` · ${formatAmount(avoidable - previous.avoidable)} more this month`
                : ''}
            </Text>
          ) : null}
          {avoidableSpends.length ? (
            <View style={[styles.breakdown, { borderTopColor: theme.borderNeutral }]}>
              {avoidableSpends.map((s) => (
                <TouchableOpacity key={s.id} style={styles.saveRow} onPress={() => openEdit(s)}>
                  <Text style={[styles.groupLabel, { color: theme.text }]} numberOfLines={1}>
                    {s.title}
                    <Text style={{ color: theme.textMuted }}> · {spendSourceLabel(s)}</Text>
                  </Text>
                  <Text style={[styles.groupAmount, { color: SAVE_COLOR }]}>{formatAmount(s.amount)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <Text style={[shared.listTitle, { color: theme.text }]}>Spends</Text>
    </View>
  );

  return (
    <>
      <FlatList
        style={shared.content}
        data={monthSpends}
        keyExtractor={(item) => item.id}
        contentContainerStyle={shared.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <View style={shared.empty}>
            <Ionicons name="receipt-outline" size={48} color={theme.textMuted} />
            <Text style={[shared.emptyText, { color: theme.textMuted }]}>
              Nothing recorded for {monthLabel(selectedMonth, true)}. Tap + to add what you spent and
              where it was paid from.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const meta = spendSourceMeta(item.source);
          return (
            <TouchableOpacity
              style={[
                shared.row,
                { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow },
              ]}
              onPress={() => openEdit(item)}
              activeOpacity={0.7}
            >
              <View style={[shared.catIcon, { backgroundColor: meta.color + '40' }]}>
                <Ionicons name={meta.icon} size={19} color="#455A64" />
              </View>
              <View style={shared.rowBody}>
                <Text style={[shared.rowTitle, { color: theme.text }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={[shared.rowSub, { color: theme.textSecondary }]} numberOfLines={1}>
                  {item.avoidable ? <Text style={{ color: SAVE_COLOR }}>Avoidable · </Text> : null}
                  {spendSourceLabel(item)}
                  {item.addToExpenses ? ` · in expenses (${item.category || 'Other'})` : ''}
                </Text>
              </View>
              <Text style={[shared.rowAmount, { color: theme.text }]}>{formatAmount(item.amount)}</Text>
              <TouchableOpacity
                style={shared.deleteBtn}
                onPress={() => toggleAvoidable(item)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: !!item.avoidable }}
                accessibilityLabel={`${item.title} could have been avoided`}
              >
                <Ionicons
                  name={item.avoidable ? 'remove-circle' : 'remove-circle-outline'}
                  size={21}
                  color={item.avoidable ? SAVE_COLOR : theme.textMuted}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={shared.deleteBtn}
                onPress={() => remove(item)}
                accessibilityLabel={`Delete ${item.title}`}
              >
                <Ionicons name="trash-outline" size={19} color={theme.danger} />
              </TouchableOpacity>
            </TouchableOpacity>
          );
        }}
      />

      <TouchableOpacity
        style={[shared.fab, { backgroundColor: theme.secondary, shadowColor: theme.secondary }]}
        onPress={openAdd}
        activeOpacity={0.8}
        accessibilityLabel="Add spend"
      >
        <Ionicons name="add" size={32} color="#FFF" />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={shared.modalOverlay}>
          <View style={[shared.modal, styles.tallModal, { backgroundColor: theme.sheet }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[shared.modalTitle, { color: theme.text }]}>
                {editingId ? 'Edit Spend' : 'Add Spend'}
              </Text>
              <Text style={[shared.modalSub, { color: theme.textSecondary }]}>
                {monthLabel(selectedMonth, true)}
              </Text>
              <TextInput
                style={inputStyle}
                placeholder="What for? (e.g. Groceries, Petrol)"
                placeholderTextColor={theme.textMuted}
                value={form.title}
                onChangeText={setField('title')}
              />
              <TextInput
                style={inputStyle}
                placeholder="Amount (₹)"
                placeholderTextColor={theme.textMuted}
                value={form.amount}
                onChangeText={setField('amount')}
                keyboardType="decimal-pad"
              />

              <Text style={[shared.fieldLabel, { color: theme.textSecondary }]}>Paid from</Text>
              <View style={shared.catRow}>
                {SPEND_SOURCES.map((s) => {
                  const selected = form.source === s.key;
                  return (
                    <TouchableOpacity
                      key={s.key}
                      style={[
                        shared.chip,
                        shared.kindChip,
                        {
                          backgroundColor: selected ? theme.primary : theme.surfaceAlt,
                          borderColor: selected ? theme.primary : theme.borderNeutral,
                        },
                      ]}
                      onPress={() => setField('source')(s.key)}
                    >
                      <Ionicons name={s.icon} size={15} color={selected ? theme.onPrimary : theme.text} />
                      <Text style={[shared.chipText, { color: selected ? theme.onPrimary : theme.text }]}>
                        {s.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {form.source === 'card' ? (
                creditCards.length ? (
                  <>
                    <Text style={[shared.fieldLabel, { color: theme.textSecondary }]}>Which card?</Text>
                    <View style={shared.catRow}>
                      {creditCards.map((card) => {
                        const selected = form.cardId === card.id;
                        return (
                          <TouchableOpacity
                            key={card.id}
                            style={[
                              shared.chip,
                              shared.kindChip,
                              {
                                backgroundColor: selected ? theme.secondary : theme.surfaceAlt,
                                borderColor: selected ? theme.secondary : theme.borderNeutral,
                              },
                            ]}
                            onPress={() => pickCard(card)}
                          >
                            <Ionicons name="card-outline" size={14} color={selected ? '#FFF' : theme.text} />
                            <Text style={[shared.chipText, { color: selected ? '#FFF' : theme.text }]}>
                              {savedCardLabel(card)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                ) : (
                  <>
                    <TextInput
                      style={inputStyle}
                      placeholder="Card name (e.g. HDFC Millennia)"
                      placeholderTextColor={theme.textMuted}
                      value={form.cardLabel}
                      onChangeText={(text) => setForm((f) => ({ ...f, cardLabel: text, cardId: null }))}
                    />
                    <Text style={[styles.hint, { color: theme.textMuted }]}>
                      Save your credit cards in Banking &amp; Cards to pick them here.
                    </Text>
                  </>
                )
              ) : null}

              {form.source === 'other' ? (
                <TextInput
                  style={inputStyle}
                  placeholder="Paid from (e.g. HDFC account, PhonePe wallet)"
                  placeholderTextColor={theme.textMuted}
                  value={form.sourceNote}
                  onChangeText={setField('sourceNote')}
                />
              ) : null}

              <TouchableOpacity
                style={[shared.checkRow, styles.addRow]}
                onPress={() => setField('avoidable')(!form.avoidable)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: form.avoidable }}
              >
                <Ionicons
                  name={form.avoidable ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={SAVE_COLOR}
                />
                <Text style={[shared.checkText, { color: theme.text }]}>Could have been avoided</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[shared.checkRow, styles.addRow]}
                onPress={() => setField('addToExpenses')(!form.addToExpenses)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: form.addToExpenses }}
              >
                <Ionicons
                  name={form.addToExpenses ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={theme.primary}
                />
                <Text style={[shared.checkText, { color: theme.text }]}>
                  Add to {monthLabel(selectedMonth, true)} expenses
                </Text>
              </TouchableOpacity>
              {form.addToExpenses ? (
                <>
                  <Text style={[shared.fieldLabel, { color: theme.textSecondary }]}>Expense category</Text>
                  <View style={shared.catRow}>
                    {categories.map((c) => {
                      const selected = form.category === c.key;
                      return (
                        <TouchableOpacity
                          key={c.key}
                          style={[
                            shared.chip,
                            {
                              backgroundColor: selected ? categoryMeta(c.key).color : theme.surfaceAlt,
                              borderColor: selected ? categoryMeta(c.key).color : theme.borderNeutral,
                            },
                          ]}
                          onPress={() => setField('category')(c.key)}
                        >
                          <Text style={[shared.chipText, { color: theme.text }]}>{c.key}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              ) : (
                <Text style={[styles.hint, { color: theme.textMuted }]}>
                  Leave this off for card spends you&apos;ll count when paying the card bill, so they
                  aren&apos;t counted twice.
                </Text>
              )}

              <View style={shared.modalActions}>
                <TouchableOpacity
                  style={[shared.cancelBtn, { backgroundColor: theme.surfaceAlt }]}
                  onPress={() => setVisible(false)}
                >
                  <Text style={[shared.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[shared.saveBtn, { backgroundColor: theme.primary }, !valid && shared.btnDisabled]}
                  onPress={save}
                  disabled={!valid}
                >
                  <Text style={[shared.saveText, { color: theme.onPrimary }]}>
                    {editingId ? 'Update' : 'Save'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  countedLine: { marginTop: 4 },
  breakdown: { borderTopWidth: 1, marginTop: 14, paddingTop: 12, gap: 12 },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  groupIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  groupBody: { flex: 1, minWidth: 0, gap: 6 },
  groupTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  groupLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  groupAmount: { fontSize: 13, fontWeight: '700' },
  tallModal: { maxHeight: '88%' },
  addRow: { marginTop: 12 },
  hint: { fontSize: 12, marginTop: 4, marginBottom: 8, lineHeight: 17 },
  saveHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  saveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
});
