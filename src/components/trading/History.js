import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { performanceStats, statsByScore } from '../../engine/stats.js';
import { fetchSignalHistory, pushCollection } from '../../services/api';
import { confirmDelete } from '../../utils/confirm';
import { LOSS, PROFIT, formatMoney, formatPct, formatPnl, formatR, pnlColor } from './format';

const STATE_COLORS = {
  'BUY CANDIDATE': PROFIT,
  'SELL CANDIDATE': LOSS,
  WAIT: '#FF9500',
  NEUTRAL: '#8E8E93',
  'NO TRADE': '#8E8E93',
};
const SHORT_STATE = {
  'BUY CANDIDATE': 'BUY',
  'SELL CANDIDATE': 'SELL',
  WAIT: 'WAIT',
  NEUTRAL: 'NEUTRAL',
  'NO TRADE': 'NO TRADE',
};
const STATE_FILTERS = [['', 'All'], ...Object.entries(SHORT_STATE).map(([k, v]) => [k, v])];
// Decisions are kept for a day; the period mainly filters paper trades.
const DAY_FILTERS = [
  [1, '24 h'],
  [7, '7 days'],
  [30, '30 days'],
  [0, 'All'],
];
const PAGE = 100;

const EXIT_LABEL = { target: 'target', stop: 'stop', eod: '15:20 exit', time: 'time exit' };

// Candle start time, 24-hour like the NSE session (09:15–15:30).
const timeLabel = (ms) =>
  new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
const dayLabel = (ms) =>
  new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

const sideScore = (s) => (s.score ? s.score[s.side === 'short' ? 'short' : 'long'] : null);

/** What happened to a candidate's paper trade, for the list. */
function outcomeOf(trade) {
  if (!trade) return { text: 'not traded', color: null };
  if (trade.status === 'closed') return { text: formatPnl(trade.netPnl, 'IN'), color: pnlColor(trade.netPnl) };
  return { text: trade.status === 'pending' ? 'pending' : 'open', color: null };
}

function Chips({ options, value, onChange, theme }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {options.map(([v, label]) => {
        const on = v === value;
        return (
          <TouchableOpacity
            key={String(v)}
            style={[styles.chip, { backgroundColor: on ? theme.primary : theme.surfaceAlt }]}
            onPress={() => onChange(v)}
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.chipText, { color: on ? theme.onPrimary : theme.textSecondary }]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function Stat({ label, value, color, theme }) {
  return (
    <View style={styles.cell}>
      <Text style={[styles.cellLabel, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[styles.cellValue, { color: color || theme.text }]}>{value}</Text>
    </View>
  );
}

/**
 * History section of My Trading: every completed 5-minute candle the
 * server's scanner judged (BUY / SELL / WAIT / ...), filtered by stock,
 * period and signal, with how the engine's paper trades actually did.
 */
export default function History({ header, watchlist = [] }) {
  const { theme } = useTheme();
  const [filters, setFilters] = useState({ symbol: '', state: '', days: 7 });
  const [data, setData] = useState({ signals: [], trades: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchSignalHistory({ ...filters, timeframe: '5m' })
      .then((d) => {
        if (cancelled) return;
        setData({ signals: d.signals || [], trades: d.trades || [] });
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          e?.status === 404
            ? 'Your server is running an older version without signal history. Redeploy it on Render (diarybyte-api → Manual Deploy → Deploy latest commit).'
            : "Couldn't load the history. Your server may be waking up; try again in a minute."
        );
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filters, reload]);

  const setFilter = (key, value) => {
    setLoading(true);
    setShown(PAGE);
    setFilters((f) => ({ ...f, [key]: value }));
  };
  // Paper trades stay until deleted here (they go to Recently deleted).
  const deleteTrade = (t) =>
    confirmDelete('Delete paper trade', `Remove the ${t.symbol.replace(/\.NS$/, '')} paper trade?`, () => {
      setData((d) => ({ ...d, trades: d.trades.filter((x) => x.id !== t.id) }));
      pushCollection('enginetrades', [], [t.id]).catch(() => {
        setError("Couldn't delete it on the server. Try again when it's reachable.");
        refresh();
      });
    });
  const refresh = () => {
    setLoading(true);
    setReload((n) => n + 1);
  };

  const tradeFor = {};
  data.trades.forEach((t) => {
    tradeFor[t.id] = t;
    if (t.signalKey) tradeFor[t.signalKey] = t;
  });
  const stats = performanceStats(data.trades);
  const bands = statsByScore(data.trades);
  const counts = {};
  data.signals.forEach((s) => {
    counts[s.state] = (counts[s.state] || 0) + 1;
  });
  const symbols = [...new Set([...watchlist, ...data.signals.map((s) => s.symbol)])];

  const cardStyle = [
    styles.card,
    { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow },
  ];

  return (
    <ScrollView style={styles.content} contentContainerStyle={styles.scroll}>
      {header}

      {/* Filters */}
      <View style={cardStyle}>
        <View style={styles.row}>
          <Text style={[styles.title, styles.flex, { color: theme.text }]}>Signal history</Text>
          <TouchableOpacity onPress={refresh} accessibilityLabel="Refresh history" style={styles.iconBtn}>
            {loading ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Ionicons name="refresh" size={20} color={theme.primary} />
            )}
          </TouchableOpacity>
        </View>
        <Text style={[styles.hint, { color: theme.textMuted }]}>
          One record per completed 5-minute candle the scanner checked, so repeat scans never duplicate it.
          Decisions are kept for 24 hours; paper trades stay until you delete them.
        </Text>
        <Chips
          options={[['', 'All stocks'], ...symbols.map((s) => [s, s.replace(/\.NS$/, '')])]}
          value={filters.symbol}
          onChange={(v) => setFilter('symbol', v)}
          theme={theme}
        />
        <Chips options={DAY_FILTERS} value={filters.days} onChange={(v) => setFilter('days', v)} theme={theme} />
        <Chips options={STATE_FILTERS} value={filters.state} onChange={(v) => setFilter('state', v)} theme={theme} />
        <Text style={[styles.hint, { color: theme.textMuted }]}>Timeframe: 5-minute candles</Text>
      </View>

      {error ? <Text style={[styles.error, { color: LOSS }]}>{error}</Text> : null}

      {/* Performance */}
      <View style={cardStyle}>
        <Text style={[styles.title, { color: theme.text }]}>Performance (paper trades)</Text>
        <View style={styles.bigRow}>
          {[
            [data.signals.length, 'Signals logged', theme.text],
            [stats.wins, 'Profitable', PROFIT],
            [stats.losses, 'Losses', LOSS],
          ].map(([n, label, color]) => (
            <View key={label} style={styles.big}>
              <Text style={[styles.bigValue, { color }]}>{n}</Text>
              <Text style={[styles.cellLabel, { color: theme.textMuted }]}>{label}</Text>
            </View>
          ))}
        </View>
        <View style={styles.grid}>
          <Stat theme={theme} label="Closed trades" value={String(stats.trades)} />
          <Stat theme={theme} label="Win rate" value={stats.winRate != null ? `${stats.winRate}%` : '—'} />
          <Stat
            theme={theme}
            label="Profit factor"
            value={stats.profitFactor != null ? stats.profitFactor.toFixed(2) : stats.wins ? 'no losses' : '—'}
            color={stats.profitFactor != null ? (stats.profitFactor >= 1 ? PROFIT : LOSS) : undefined}
          />
          <Stat theme={theme} label="Net P/L" value={formatPnl(stats.netPnl, 'IN')} color={pnlColor(stats.netPnl)} />
          <Stat
            theme={theme}
            label="Avg per trade"
            value={stats.avgNet != null ? formatPnl(stats.avgNet, 'IN') : '—'}
            color={pnlColor(stats.avgNet)}
          />
          <Stat
            theme={theme}
            label="Avg return"
            value={stats.avgReturnPct != null ? formatPct(stats.avgReturnPct) : '—'}
            color={pnlColor(stats.avgReturnPct)}
          />
          <Stat theme={theme} label="Avg R" value={formatR(stats.avgR) ?? '—'} color={pnlColor(stats.avgR)} />
          <Stat
            theme={theme}
            label="Max drawdown"
            value={formatMoney(stats.maxDrawdown, 'IN')}
            color={stats.maxDrawdown < 0 ? LOSS : undefined}
          />
          <Stat
            theme={theme}
            label="Avg win / loss"
            value={stats.trades ? `${formatMoney(stats.avgWin, 'IN')} / ${formatMoney(stats.avgLoss, 'IN')}` : '—'}
          />
        </View>
        <Text style={[styles.hint, { color: theme.textMuted }]}>
          Exits: {stats.exits.target} target · {stats.exits.stop} stop · {stats.exits.eod} at 15:20 ·{' '}
          {stats.exits.time} time. Judged on simulated fills: next-candle entry, stop and target, slippage and
          estimated charges, not on whether the price moved after the signal.
        </Text>

        <Text style={[styles.subTitle, { color: theme.textSecondary }]}>By score</Text>
        {bands.map((b) => (
          <View key={b.label} style={[styles.bandRow, { borderTopColor: theme.borderNeutral }]}>
            <Text style={[styles.bandLabel, { color: theme.text }]}>{b.label}</Text>
            <Text style={[styles.bandCell, { color: theme.textSecondary }]}>
              {b.stats.trades} trade{b.stats.trades === 1 ? '' : 's'}
            </Text>
            <Text style={[styles.bandCell, { color: theme.textSecondary }]}>
              {b.stats.winRate != null ? `${b.stats.winRate}% won` : '—'}
            </Text>
            <Text style={[styles.bandCell, styles.right, { color: pnlColor(b.stats.netPnl, theme.text) }]}>
              {b.stats.trades ? formatPnl(b.stats.netPnl, 'IN') : '—'}
            </Text>
          </View>
        ))}
        {stats.trades < 30 ? (
          <Text style={[styles.hint, { color: theme.textMuted }]}>
            {stats.trades} closed trade{stats.trades === 1 ? '' : 's'} so far. Treat these numbers as noise until there
            are at least 30.
          </Text>
        ) : null}
      </View>

      {/* Signal list */}
      <View style={cardStyle}>
        <Text style={[styles.title, { color: theme.text }]}>Decisions</Text>
        <Text style={[styles.hint, { color: theme.textMuted }]}>
          {Object.entries(SHORT_STATE)
            .map(([k, v]) => `${v} ${counts[k] || 0}`)
            .join(' · ')}
        </Text>
        <View style={[styles.tableRow, styles.tableHead, { borderBottomColor: theme.borderNeutral }]}>
          {['Time', 'Stock', 'Signal', 'Score', 'Result'].map((h, i) => (
            <Text key={h} style={[styles.th, COLS[i], { color: theme.textSecondary }]}>
              {h}
            </Text>
          ))}
        </View>
        {!data.signals.length && !loading ? (
          <Text style={[styles.hint, { color: theme.textMuted }]}>
            Nothing logged for these filters yet. The scanner logs your watchlist every 5 minutes in market hours.
          </Text>
        ) : null}
        {data.signals.slice(0, shown).map((s, i, list) => {
          const newDay = i === 0 || dayLabel(list[i - 1].candleTime) !== dayLabel(s.candleTime);
          const candidate = s.state === 'BUY CANDIDATE' || s.state === 'SELL CANDIDATE';
          const trade = candidate ? tradeFor[s.tradeId] || tradeFor[s.key] : null;
          const outcome = candidate ? outcomeOf(trade) : null;
          const expanded = open === s.id;
          return (
            <View key={s.id}>
              {newDay ? (
                <Text style={[styles.dayHead, { color: theme.textSecondary }]}>{dayLabel(s.candleTime)}</Text>
              ) : null}
              <TouchableOpacity
                style={[styles.tableRow, { borderBottomColor: theme.borderNeutral }]}
                onPress={() => setOpen(expanded ? null : s.id)}
                accessibilityLabel={`${s.symbol.replace(/\.NS$/, '')} ${s.state} at ${dayLabel(s.candleTime)} ${timeLabel(s.candleTime)}`}
              >
                <Text style={[styles.td, COLS[0], { color: theme.text }]}>{timeLabel(s.candleTime)}</Text>
                <Text style={[styles.td, COLS[1], { color: theme.text }]} numberOfLines={1}>
                  {s.symbol.replace(/\.NS$/, '')}
                </Text>
                <Text style={[styles.td, styles.bold, COLS[2], { color: STATE_COLORS[s.state] || theme.text }]}>
                  {SHORT_STATE[s.state] || s.state}
                </Text>
                <Text style={[styles.td, COLS[3], { color: theme.text }]}>{sideScore(s) ?? '—'}</Text>
                <Text style={[styles.td, COLS[4], { color: outcome?.color || theme.textMuted }]} numberOfLines={1}>
                  {outcome ? outcome.text : ''}
                </Text>
              </TouchableOpacity>
              {expanded ? (
                <View style={[styles.detail, { backgroundColor: theme.surfaceAlt }]}>
                  <Text style={[styles.detailLine, { color: theme.text }]}>
                    <Text style={styles.bold}>Long / short score: </Text>
                    {s.score?.long ?? '—'} / {s.score?.short ?? '—'} (needs {s.threshold ?? '—'})
                  </Text>
                  <Text style={[styles.detailLine, { color: theme.text }]}>
                    <Text style={styles.bold}>Failed condition: </Text>
                    {s.failedConditions?.length ? s.failedConditions.join(', ') : 'None'}
                  </Text>
                  {s.nextAction ? (
                    <Text style={[styles.detailLine, { color: theme.text }]}>
                      <Text style={styles.bold}>Next action then: </Text>
                      {s.nextAction}
                    </Text>
                  ) : null}
                  <Text style={[styles.detailLine, { color: theme.textSecondary }]}>
                    Price {s.indicators?.price ?? '—'} · VWAP {s.indicators?.vwap ?? '—'} · RSI {s.indicators?.rsi ?? '—'} ·
                    volume {s.indicators?.volumeRatio != null ? `${s.indicators.volumeRatio}×` : '—'} · 15-min{' '}
                    {s.indicators?.trend15 ?? '—'}
                  </Text>
                  {s.plan?.ok ? (
                    <Text style={[styles.detailLine, { color: theme.textSecondary }]}>
                      Plan: {s.plan.quantity} @ {formatMoney(s.plan.entry, 'IN')}, stop {formatMoney(s.plan.stop, 'IN')},
                      target {formatMoney(s.plan.target, 'IN')}
                    </Text>
                  ) : null}
                  {trade?.status === 'closed' ? (
                    <Text style={[styles.detailLine, { color: theme.textSecondary }]}>
                      Filled {formatMoney(trade.entryPrice, 'IN')} → {EXIT_LABEL[trade.exitReason] || trade.exitReason} at{' '}
                      {formatMoney(trade.exitPrice, 'IN')} · {formatR(trade.r)} · charges {formatMoney(trade.costs, 'IN')}
                      {trade.bothTouched
                        ? ` · stop and target in one candle, settled ${trade.resolvedBy === '1m' ? 'on 1-minute candles' : trade.resolvedBy === 'open' ? 'by the open' : 'as the stop (no 1-minute data)'}`
                        : ''}
                    </Text>
                  ) : null}
                  <Text style={[styles.detailLine, { color: theme.textMuted }]}>
                    {s.ruleVersion} · {s.provider} · data {s.dataStatus}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })}
        {data.signals.length > shown ? (
          <TouchableOpacity style={styles.more} onPress={() => setShown((n) => n + PAGE)}>
            <Text style={[styles.moreText, { color: theme.primary }]}>
              Show more ({data.signals.length - shown} left)
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Paper trades, kept until deleted */}
      <View style={cardStyle}>
        <Text style={[styles.title, { color: theme.text }]}>Paper trades ({data.trades.length})</Text>
        <Text style={[styles.hint, { color: theme.textMuted }]}>
          The engine&apos;s paper trades for this stock and period. They stay until you delete one.
        </Text>
        {[...data.trades]
          .sort((a, b) => (b.signalTime || 0) - (a.signalTime || 0))
          .map((t) => (
            <View key={t.id} style={[styles.tradeRow, { borderTopColor: theme.borderNeutral }]}>
              <Text style={[styles.tradeSide, { color: t.side === 'short' ? LOSS : PROFIT }]}>
                {t.side === 'short' ? 'S' : 'L'}
              </Text>
              <View style={styles.flex}>
                <Text style={[styles.td, styles.bold, { color: theme.text }]} numberOfLines={1}>
                  {t.symbol.replace(/\.NS$/, '')} · {t.plan?.quantity ?? t.quantity} @{' '}
                  {formatMoney(t.entryPrice ?? t.plan?.entry, 'IN')}
                </Text>
                <Text style={[styles.detailLine, { color: theme.textMuted }]}>
                  {dayLabel(t.signalTime)} {timeLabel(t.signalTime)} ·{' '}
                  {t.status === 'closed'
                    ? `${EXIT_LABEL[t.exitReason] || t.exitReason} at ${formatMoney(t.exitPrice, 'IN')} · ${formatR(t.r)}`
                    : t.status}
                </Text>
              </View>
              {t.status === 'closed' ? (
                <Text style={[styles.td, styles.bold, { color: pnlColor(t.netPnl, theme.text) }]}>
                  {formatPnl(t.netPnl, 'IN')}
                </Text>
              ) : null}
              <TouchableOpacity
                onPress={() => deleteTrade(t)}
                accessibilityLabel={`Delete ${t.symbol} paper trade`}
                style={styles.iconBtn}
              >
                <Ionicons name="trash-outline" size={18} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
          ))}
        {!data.trades.length && !loading ? (
          <Text style={[styles.hint, { color: theme.textMuted }]}>No paper trades for these filters.</Text>
        ) : null}
      </View>

      <Text style={[styles.disclaimer, { color: theme.textMuted }]}>
        Paper results only. Past signals don&apos;t predict future ones, and charges are estimates.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  scroll: { paddingBottom: 48 },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center' },
  bold: { fontWeight: '700' },
  right: { textAlign: 'right' },
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
  title: { fontSize: 16, fontWeight: '700' },
  subTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginTop: 14, marginBottom: 2 },
  hint: { fontSize: 12, marginTop: 6, lineHeight: 17 },
  error: { fontSize: 13, marginBottom: 12, lineHeight: 18 },
  iconBtn: { padding: 4 },
  chips: { gap: 6, paddingTop: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  chipText: { fontSize: 13, fontWeight: '600' },
  bigRow: { flexDirection: 'row', marginTop: 12 },
  big: { flex: 1 },
  bigValue: { fontSize: 28, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  cell: { width: '33.33%', paddingVertical: 6, paddingRight: 6 },
  cellLabel: { fontSize: 11 },
  cellValue: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  bandRow: { flexDirection: 'row', borderTopWidth: 1, paddingVertical: 7, gap: 6 },
  bandLabel: { width: 70, fontSize: 13, fontWeight: '700' },
  bandCell: { flex: 1, fontSize: 13 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, gap: 4 },
  tableHead: { marginTop: 8, paddingVertical: 6 },
  th: { fontSize: 12, fontWeight: '700' },
  tradeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, paddingTop: 8, marginTop: 8 },
  tradeSide: { width: 14, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  dayHead: { fontSize: 12, fontWeight: '700', marginTop: 12, marginBottom: 2 },
  td: { fontSize: 13 },
  detail: { borderRadius: 10, padding: 10, marginVertical: 6, gap: 4 },
  detailLine: { fontSize: 12, lineHeight: 17 },
  more: { paddingVertical: 10, alignItems: 'center' },
  moreText: { fontSize: 14, fontWeight: '600' },
  disclaimer: { fontSize: 11, textAlign: 'center', marginTop: 4, lineHeight: 16 },
});

// Column widths: time, stock, signal, score, result.
const COLS = [{ width: 46 }, { flex: 1, minWidth: 0 }, { width: 76 }, { width: 40 }, { width: 68, textAlign: 'right' }];
