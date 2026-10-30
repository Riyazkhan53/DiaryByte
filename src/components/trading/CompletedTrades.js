import { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SyncRow from '../SyncRow';
import { useTheme } from '../../hooks/useTheme';
import { confirmDelete } from '../../utils/confirm';
import {
  daysHeld,
  exitReasonLabel,
  plannedRR,
  rMultiple,
  tradePct,
  tradePnl,
  tradeStats,
} from '../../utils/trades';
import { LOSS, PROFIT, formatDay, formatMoney, formatPct, formatPnl, formatR, pnlColor } from './format';

function Stat({ label, value, color }) {
  const { theme } = useTheme();
  return (
    <View style={styles.stat}>
      <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: color || theme.text }]}>{value}</Text>
    </View>
  );
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'wins', label: 'Wins' },
  { key: 'losses', label: 'Losses' },
];

/**
 * Completed paper trades to review: overall stats (win rate, P/L, R, how
 * trades from each Setup Check signal did) and each trade with its result
 * and review notes, which can still be edited.
 */
export default function CompletedTrades({ header, trades, persist, sync }) {
  const { theme } = useTheme();
  const [filter, setFilter] = useState('all');
  const [reviewing, setReviewing] = useState(null);
  const [reviewText, setReviewText] = useState('');
  const [followedPlan, setFollowedPlan] = useState(null);

  const closed = trades
    .filter((t) => t.status === 'closed')
    .sort((a, b) => (b.exitDate || '').localeCompare(a.exitDate || ''));
  const stats = tradeStats(closed);
  const shown = closed.filter((t) => {
    const pnl = tradePnl(t, t.exitPrice);
    return filter === 'all' || (filter === 'wins' ? pnl > 0 : pnl < 0);
  });
  const hasUs = closed.some((t) => t.market === 'US');
  const hasIn = closed.some((t) => t.market !== 'US');

  const openReview = (t) => {
    setReviewing(t);
    setReviewText(t.review || '');
    setFollowedPlan(t.followedPlan ?? null);
  };

  const saveReview = () => {
    persist(
      trades.map((t) =>
        t.id === reviewing.id
          ? { ...t, review: reviewText.trim() || undefined, followedPlan: followedPlan ?? undefined, updatedAt: new Date().toISOString() }
          : t
      )
    );
    setReviewing(null);
  };

  // Back to Open trades (e.g. closed by mistake).
  const reopen = () => {
    persist(
      trades.map((t) =>
        t.id === reviewing.id
          ? { ...t, status: 'open', exitPrice: undefined, exitDate: undefined, exitReason: undefined, updatedAt: new Date().toISOString() }
          : t
      )
    );
    setReviewing(null);
  };

  const remove = () =>
    confirmDelete('Delete paper trade', `Remove the ${reviewing.name} trade?`, () => {
      persist(trades.filter((t) => t.id !== reviewing.id));
      setReviewing(null);
    });

  const cardStyle = [
    styles.card,
    { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow },
  ];

  return (
    <>
      <ScrollView style={styles.content} contentContainerStyle={styles.scroll}>
        {header}
        <SyncRow {...sync} />

        {stats.count === 0 ? (
          <Text style={[styles.empty, { color: theme.textMuted }]}>
            No completed trades yet. Close a paper trade in Open trades and it shows up here for
            review.
          </Text>
        ) : (
          <>
            <View style={cardStyle}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>How your paper trades went</Text>
              <View style={styles.stats}>
                <Stat label="Trades" value={String(stats.count)} />
                <Stat
                  label="Win rate"
                  value={`${stats.winRate}%`}
                  color={stats.winRate >= 50 ? PROFIT : LOSS}
                />
                <Stat label="Won / lost" value={`${stats.wins} / ${stats.losses}`} />
                {hasIn ? <Stat label="Net P/L (₹)" value={formatPnl(stats.net.INR, 'IN')} color={pnlColor(stats.net.INR)} /> : null}
                {hasUs ? <Stat label="Net P/L ($)" value={formatPnl(stats.net.USD, 'US')} color={pnlColor(stats.net.USD)} /> : null}
                <Stat label="Avg win" value={formatPct(stats.avgWinPct)} color={PROFIT} />
                <Stat label="Avg loss" value={formatPct(stats.avgLossPct)} color={LOSS} />
                {stats.avgR != null ? <Stat label="Avg result" value={formatR(stats.avgR)} color={pnlColor(stats.avgR)} /> : null}
                {stats.profitFactor.INR != null ? <Stat label="Profit factor (₹)" value={String(stats.profitFactor.INR)} /> : null}
                {stats.profitFactor.USD != null ? <Stat label="Profit factor ($)" value={String(stats.profitFactor.USD)} /> : null}
              </View>

              <View style={[styles.divider, { backgroundColor: theme.borderNeutral }]} />
              <Text style={[styles.label, { color: theme.textSecondary }]}>By Setup Check signal at entry</Text>
              {Object.entries(stats.bySignal).map(([signal, s]) => (
                <View key={signal} style={styles.lineRow}>
                  <Text style={[styles.line, { color: theme.text }]}>
                    {signal === 'None' ? 'Without a check' : `${signal} checks`}
                  </Text>
                  <Text style={[styles.line, { color: theme.textSecondary }]}>
                    {s.wins}/{s.trades} won ({Math.round((s.wins / s.trades) * 100)}%)
                  </Text>
                </View>
              ))}
              {stats.followedPlan.yes + stats.followedPlan.no > 0 ? (
                <View style={styles.lineRow}>
                  <Text style={[styles.line, { color: theme.text }]}>Followed the plan</Text>
                  <Text style={[styles.line, { color: theme.textSecondary }]}>
                    {stats.followedPlan.yes} of {stats.followedPlan.yes + stats.followedPlan.no} trades
                  </Text>
                </View>
              ) : null}
              <Text style={[styles.hint, { color: theme.textMuted }]}>
                R is the result in multiples of what you risked (entry to stop-loss): +2R made twice
                the risk, −1R lost it. Profit factor is total won ÷ total lost.
              </Text>
            </View>

            <View style={[styles.segment, { backgroundColor: theme.surfaceAlt }]}>
              {FILTERS.map((f) => (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.segmentItem, filter === f.key && { backgroundColor: theme.sheet }]}
                  onPress={() => setFilter(f.key)}
                >
                  <Text style={[styles.segmentText, { color: theme.text }]}>
                    {f.label}
                    {f.key === 'wins' ? ` (${stats.wins})` : f.key === 'losses' ? ` (${stats.losses})` : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {shown.map((t) => {
          const pnl = tradePnl(t, t.exitPrice);
          const r = rMultiple(t, t.exitPrice);
          const rr = plannedRR(t);
          return (
            <TouchableOpacity key={t.id} style={cardStyle} onPress={() => openReview(t)} activeOpacity={0.8}>
              <View style={styles.headRow}>
                <Ionicons name={pnl > 0 ? 'trending-up' : pnl < 0 ? 'trending-down' : 'remove'} size={20} color={pnlColor(pnl, theme.textMuted)} />
                <View style={styles.flex}>
                  <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
                    {t.name}
                  </Text>
                  <Text style={[styles.sub, { color: theme.textSecondary }]} numberOfLines={2}>
                    {t.side === 'short' ? 'Short' : 'Long'} {t.quantity} · {formatMoney(t.entryPrice, t.market)} →{' '}
                    {formatMoney(t.exitPrice, t.market)} · {formatDay(t.entryDate)} to {formatDay(t.exitDate)} ({daysHeld(t)}d)
                  </Text>
                </View>
                <View style={styles.result}>
                  <Text style={[styles.pnl, { color: pnlColor(pnl, theme.text) }]}>{formatPnl(pnl, t.market)}</Text>
                  <Text style={[styles.sub, { color: pnlColor(pnl, theme.text) }]}>
                    {formatPct(tradePct(t, t.exitPrice))}
                    {formatR(r) ? ` · ${formatR(r)}` : ''}
                  </Text>
                </View>
              </View>
              <Text style={[styles.sub, { color: theme.textMuted }]}>
                {exitReasonLabel(t.exitReason)}
                {rr ? ` · planned ${rr}:1` : ''}
                {t.setupSignal ? ` · entered on a ${t.setupSignal} check (${t.setupSignal === 'SELL' ? t.setupBearPct : t.setupBullPct}%)` : ''}
                {t.followedPlan === true ? ' · followed plan' : t.followedPlan === false ? ' · broke plan' : ''}
              </Text>
              {t.plan ? <Text style={[styles.note, { color: theme.textSecondary }]}>Plan: {t.plan}</Text> : null}
              {t.review ? (
                <Text style={[styles.note, { color: theme.text }]}>Review: {t.review}</Text>
              ) : (
                <Text style={[styles.note, { color: theme.primary }]}>Tap to add a review</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Modal visible={!!reviewing} transparent animationType="fade" onRequestClose={() => setReviewing(null)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: theme.sheet }]}>
            {reviewing ? (
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={[styles.sheetTitle, { color: theme.text }]}>Review {reviewing.name}</Text>
                <Text style={[styles.sub, { color: pnlColor(tradePnl(reviewing, reviewing.exitPrice), theme.text) }]}>
                  {formatPnl(tradePnl(reviewing, reviewing.exitPrice), reviewing.market)} ·{' '}
                  {exitReasonLabel(reviewing.exitReason)} on {formatDay(reviewing.exitDate)}
                </Text>
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
                  style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                  placeholder="What went right, what you'd do differently"
                  placeholderTextColor={theme.textMuted}
                  value={reviewText}
                  onChangeText={setReviewText}
                  multiline
                />
                <View style={styles.actions}>
                  <TouchableOpacity style={[styles.cancel, { backgroundColor: theme.surfaceAlt }]} onPress={() => setReviewing(null)}>
                    <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.save, { backgroundColor: theme.primary }]} onPress={saveReview}>
                    <Text style={[styles.saveText, { color: theme.onPrimary }]}>Save review</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.links}>
                  <TouchableOpacity onPress={reopen}>
                    <Text style={[styles.link, { color: theme.primary }]}>Reopen trade</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={remove}>
                    <Text style={[styles.link, { color: theme.danger }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : null}
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
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 },
  stat: { width: '33.33%', paddingRight: 6 },
  statValue: { fontSize: 17, fontWeight: '800', marginTop: 2 },
  label: { fontSize: 12, fontWeight: '600' },
  divider: { height: 1, marginVertical: 12 },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  line: { fontSize: 13 },
  hint: { fontSize: 11, marginTop: 10, lineHeight: 16 },
  empty: { fontSize: 14, textAlign: 'center', marginVertical: 24, paddingHorizontal: 24 },
  segment: { flexDirection: 'row', borderRadius: 12, padding: 3, marginBottom: 12 },
  segmentItem: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  segmentText: { fontSize: 13, fontWeight: '600' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontSize: 15, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 3, lineHeight: 17 },
  result: { alignItems: 'flex-end' },
  pnl: { fontSize: 15, fontWeight: '800' },
  note: { fontSize: 12, marginTop: 6, lineHeight: 17 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  sheet: { borderRadius: 20, padding: 20, maxHeight: '85%' },
  sheetTitle: { fontSize: 20, fontWeight: 'bold' },
  gap: { marginTop: 14 },
  chips: { flexDirection: 'row', gap: 8, marginTop: 6 },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '600' },
  input: { borderRadius: 12, borderWidth: 1, padding: 12, fontSize: 15, minHeight: 90, textAlignVertical: 'top', marginTop: 12 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600' },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '700' },
  links: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  link: { fontSize: 14, fontWeight: '600' },
});
