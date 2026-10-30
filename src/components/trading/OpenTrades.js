import { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SyncRow from '../SyncRow';
import DatePicker from '../DatePicker';
import { useTheme } from '../../hooks/useTheme';
import { confirmDelete } from '../../utils/confirm';
import { todayKey } from '../../utils/autopay';
import {
  EXIT_REASONS,
  daysHeld,
  levelHit,
  plannedRR,
  rMultiple,
  tradePct,
  tradePnl,
} from '../../utils/trades';
import { fetchStockQuotes } from '../../services/api';
import { formatDay, formatMoney, formatPct, formatPnl, formatR, pnlColor } from './format';

const toNum = (text) => parseFloat(String(text ?? '').replace(/,/g, ''));

/**
 * Open paper trades with live prices and unrealised P/L. Closing one asks
 * for the exit and a short review, then it moves to Completed.
 */
export default function OpenTrades({ header, trades, persist, sync, onNew, onEdit }) {
  const { theme } = useTheme();
  const open = trades
    .filter((t) => t.status !== 'closed')
    .sort((a, b) => (b.entryDate || '').localeCompare(a.entryDate || ''));

  const [prices, setPrices] = useState({});
  const [version, setVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [closing, setClosing] = useState(null);
  const [exitPrice, setExitPrice] = useState('');
  const [exitDate, setExitDate] = useState(todayKey());
  const [exitReason, setExitReason] = useState('manual');
  const [followedPlan, setFollowedPlan] = useState(null);
  const [review, setReview] = useState('');

  const symbols = [...new Set(open.map((t) => t.symbol).filter(Boolean))].sort().join(',');
  useEffect(() => {
    if (!symbols) return undefined;
    let cancelled = false;
    fetchStockQuotes(symbols.split(','))
      .then((body) => {
        if (!cancelled) setPrices(body?.quotes || {});
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbols, version]);

  const refresh = () => {
    setRefreshing(true);
    setVersion((v) => v + 1);
  };

  const priceOf = (t) => (t.symbol ? prices[t.symbol]?.price : null);

  const openClose = (t) => {
    const price = priceOf(t);
    const hit = levelHit(t, price);
    setClosing(t);
    setExitPrice(
      String(hit === 'stop' ? t.stopLoss : hit === 'target' ? t.target : price || '')
    );
    setExitDate(todayKey());
    setExitReason(hit || 'manual');
    setFollowedPlan(null);
    setReview('');
  };

  const saveClose = () => {
    const price = toNum(exitPrice);
    if (!(price > 0)) return;
    persist(
      trades.map((t) =>
        t.id === closing.id
          ? {
              ...t,
              status: 'closed',
              exitPrice: price,
              exitDate,
              exitReason,
              followedPlan: followedPlan ?? undefined,
              review: review.trim() || undefined,
              updatedAt: new Date().toISOString(),
            }
          : t
      )
    );
    setClosing(null);
  };

  const remove = (t) =>
    confirmDelete('Delete paper trade', `Remove the ${t.name} trade?`, () =>
      persist(trades.filter((x) => x.id !== t.id))
    );

  // Unrealised P/L per currency.
  const totals = open.reduce(
    (acc, t) => {
      const pnl = tradePnl(t, priceOf(t));
      if (pnl != null) acc[t.market === 'US' ? 'US' : 'IN'] += pnl;
      return acc;
    },
    { IN: 0, US: 0 }
  );
  const hasUs = open.some((t) => t.market === 'US');
  const hasIn = open.some((t) => t.market !== 'US');

  const cardStyle = [
    styles.card,
    { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow },
  ];

  return (
    <>
      <ScrollView style={styles.content} contentContainerStyle={styles.scroll}>
        {header}
        <SyncRow {...sync} />

        <View style={cardStyle}>
          <View style={styles.summaryRow}>
            <View style={styles.flex}>
              <Text style={[styles.label, { color: theme.textMuted }]}>Open trades</Text>
              <Text style={[styles.big, { color: theme.text }]}>{open.length}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={[styles.label, { color: theme.textMuted }]}>Unrealised P/L</Text>
              {hasIn || !hasUs ? (
                <Text style={[styles.big, { color: pnlColor(totals.IN, theme.text) }]}>{formatPnl(totals.IN, 'IN')}</Text>
              ) : null}
              {hasUs ? (
                <Text style={[styles.big, { color: pnlColor(totals.US, theme.text) }]}>{formatPnl(totals.US, 'US')}</Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={refresh} disabled={refreshing || !symbols} style={styles.refresh} accessibilityLabel="Refresh prices">
              {refreshing ? <ActivityIndicator size="small" color={theme.primary} /> : <Ionicons name="refresh" size={20} color={theme.primary} />}
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={[styles.newBtn, { backgroundColor: theme.primary }]} onPress={onNew}>
            <Ionicons name="add" size={18} color={theme.onPrimary} />
            <Text style={[styles.newText, { color: theme.onPrimary }]}>New paper trade</Text>
          </TouchableOpacity>
        </View>

        {open.length === 0 ? (
          <Text style={[styles.empty, { color: theme.textMuted }]}>
            No open paper trades. Start one here, or with “Paper trade this” on a Setup Check.
          </Text>
        ) : null}

        {open.map((t) => {
          const price = priceOf(t);
          const pnl = tradePnl(t, price);
          const pct = tradePct(t, price);
          const r = rMultiple(t, price);
          const hit = levelHit(t, price);
          const rr = plannedRR(t);
          return (
            <View key={t.id} style={cardStyle}>
              <View style={styles.headRow}>
                <View style={[styles.side, { backgroundColor: (t.side === 'short' ? '#E5383B' : '#2DA44E') + '26' }]}>
                  <Text style={[styles.sideText, { color: t.side === 'short' ? '#E5383B' : '#2DA44E' }]}>
                    {t.side === 'short' ? 'SHORT' : 'LONG'}
                  </Text>
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
                    {t.name}
                  </Text>
                  <Text style={[styles.sub, { color: theme.textSecondary }]} numberOfLines={1}>
                    {t.market === 'US' ? '🇺🇸' : '🇮🇳'} {t.symbol || 'no live price'} · {t.quantity} @{' '}
                    {formatMoney(t.entryPrice, t.market)} · {formatDay(t.entryDate)} ({daysHeld(t)}d)
                  </Text>
                </View>
                <TouchableOpacity onPress={() => onEdit(t)} style={styles.icon} accessibilityLabel={`Edit ${t.name}`}>
                  <Ionicons name="create-outline" size={18} color={theme.primaryDark} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => remove(t)} style={styles.icon} accessibilityLabel={`Delete ${t.name}`}>
                  <Ionicons name="trash-outline" size={18} color={theme.danger} />
                </TouchableOpacity>
              </View>

              <View style={styles.numbers}>
                <View style={styles.flex}>
                  <Text style={[styles.label, { color: theme.textMuted }]}>Now</Text>
                  <Text style={[styles.value, { color: theme.text }]}>{price ? formatMoney(price, t.market) : '—'}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.label, { color: theme.textMuted }]}>P/L</Text>
                  <Text style={[styles.value, { color: pnlColor(pnl, theme.text) }]}>
                    {pnl != null ? formatPnl(pnl, t.market) : '—'}
                  </Text>
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.label, { color: theme.textMuted }]}>Move</Text>
                  <Text style={[styles.value, { color: pnlColor(pct, theme.text) }]}>
                    {formatPct(pct)}
                    {formatR(r) ? ` · ${formatR(r)}` : ''}
                  </Text>
                </View>
              </View>
              <Text style={[styles.sub, { color: theme.textMuted }]}>
                Stop {t.stopLoss ? formatMoney(t.stopLoss, t.market) : '—'} · Target{' '}
                {t.target ? formatMoney(t.target, t.market) : '—'}
                {rr ? ` · planned ${rr}:1` : ''}
                {t.setupSignal ? ` · from ${t.setupSignal} check` : ''}
              </Text>
              {hit ? (
                <View style={[styles.alert, { backgroundColor: (hit === 'target' ? '#2DA44E' : '#E5383B') + '1F' }]}>
                  <Ionicons name={hit === 'target' ? 'flag-outline' : 'alert-circle-outline'} size={16} color={hit === 'target' ? '#2DA44E' : '#E5383B'} />
                  <Text style={[styles.alertText, { color: theme.text }]}>
                    {hit === 'target' ? 'Target reached' : 'Stop-loss hit'}. Close the trade to stick to the plan.
                  </Text>
                </View>
              ) : null}
              {t.plan ? <Text style={[styles.plan, { color: theme.textSecondary }]}>Plan: {t.plan}</Text> : null}
              <TouchableOpacity style={[styles.closeBtn, { borderColor: theme.primary }]} onPress={() => openClose(t)}>
                <Text style={[styles.closeText, { color: theme.primary }]}>Close trade</Text>
              </TouchableOpacity>
            </View>
          );
        })}
        <Text style={[styles.disclaimer, { color: theme.textMuted }]}>
          Paper trades are practice: no real money or orders. Prices can be delayed.
        </Text>
      </ScrollView>

      <Modal visible={!!closing} transparent animationType="fade" onRequestClose={() => setClosing(null)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: theme.sheet }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              {closing ? (
                <>
                  <Text style={[styles.sheetTitle, { color: theme.text }]}>Close {closing.name}</Text>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>
                    Exit price ({closing.market === 'US' ? '$' : '₹'})
                  </Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                    keyboardType="decimal-pad"
                    value={exitPrice}
                    onChangeText={setExitPrice}
                    accessibilityLabel="Exit price"
                  />
                  {toNum(exitPrice) > 0 ? (
                    <Text style={[styles.sub, { color: pnlColor(tradePnl(closing, toNum(exitPrice)), theme.text) }]}>
                      {formatPnl(tradePnl(closing, toNum(exitPrice)), closing.market)} ({formatPct(tradePct(closing, toNum(exitPrice)))}
                      {formatR(rMultiple(closing, toNum(exitPrice))) ? `, ${formatR(rMultiple(closing, toNum(exitPrice)))}` : ''})
                    </Text>
                  ) : null}

                  <Text style={[styles.label, styles.gap, { color: theme.textSecondary }]}>Why it closed</Text>
                  <View style={styles.chips}>
                    {EXIT_REASONS.map((r) => (
                      <TouchableOpacity
                        key={r.key}
                        style={[styles.chip, { backgroundColor: exitReason === r.key ? theme.primary : theme.surfaceAlt, borderColor: exitReason === r.key ? theme.primary : theme.borderNeutral }]}
                        onPress={() => setExitReason(r.key)}
                      >
                        <Text style={[styles.chipText, { color: exitReason === r.key ? theme.onPrimary : theme.text }]}>{r.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={[styles.label, styles.gap, { color: theme.textSecondary }]}>Did you follow your plan?</Text>
                  <View style={styles.chips}>
                    {[
                      { key: true, label: 'Yes' },
                      { key: false, label: 'No' },
                    ].map((o) => (
                      <TouchableOpacity
                        key={String(o.key)}
                        style={[styles.chip, { backgroundColor: followedPlan === o.key ? theme.primary : theme.surfaceAlt, borderColor: followedPlan === o.key ? theme.primary : theme.borderNeutral }]}
                        onPress={() => setFollowedPlan(followedPlan === o.key ? null : o.key)}
                      >
                        <Text style={[styles.chipText, { color: followedPlan === o.key ? theme.onPrimary : theme.text }]}>{o.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TextInput
                    style={[styles.input, styles.note, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                    placeholder="Review: what went right, what you'd do differently"
                    placeholderTextColor={theme.textMuted}
                    value={review}
                    onChangeText={setReview}
                    multiline
                  />

                  <Text style={[styles.label, styles.gap, { color: theme.textSecondary }]}>Exit date</Text>
                  <DatePicker value={exitDate} onChange={setExitDate} />

                  <View style={styles.actions}>
                    <TouchableOpacity style={[styles.cancel, { backgroundColor: theme.surfaceAlt }]} onPress={() => setClosing(null)}>
                      <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.save, { backgroundColor: theme.primary }, !(toNum(exitPrice) > 0) && styles.disabled]}
                      onPress={saveClose}
                      disabled={!(toNum(exitPrice) > 0)}
                    >
                      <Text style={[styles.saveText, { color: theme.onPrimary }]}>Close trade</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  scroll: { paddingBottom: 48 },
  flex: { flex: 1, minWidth: 0 },
  card: {
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  label: { fontSize: 12, fontWeight: '600' },
  big: { fontSize: 20, fontWeight: '800', marginTop: 2 },
  refresh: { padding: 6 },
  newBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 11, marginTop: 12 },
  newText: { fontSize: 15, fontWeight: '700' },
  empty: { fontSize: 14, textAlign: 'center', marginVertical: 24, paddingHorizontal: 24 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  side: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 },
  sideText: { fontSize: 11, fontWeight: '800' },
  name: { fontSize: 15, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 4, lineHeight: 17 },
  icon: { padding: 4 },
  numbers: { flexDirection: 'row', gap: 8, marginTop: 12 },
  value: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  alert: { flexDirection: 'row', gap: 6, alignItems: 'center', borderRadius: 10, padding: 8, marginTop: 8 },
  alertText: { flex: 1, fontSize: 12, fontWeight: '600' },
  plan: { fontSize: 12, marginTop: 6, fontStyle: 'italic' },
  closeBtn: { borderWidth: 1, borderRadius: 10, paddingVertical: 9, alignItems: 'center', marginTop: 10 },
  closeText: { fontSize: 14, fontWeight: '700' },
  disclaimer: { fontSize: 12, textAlign: 'center', marginTop: 8, paddingHorizontal: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  sheet: { borderRadius: 20, padding: 20, maxHeight: '90%' },
  sheetTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginTop: 4 },
  note: { minHeight: 64, textAlignVertical: 'top', marginTop: 12 },
  gap: { marginTop: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600' },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.4 },
});
