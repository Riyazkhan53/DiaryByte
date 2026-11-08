import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { fetchSignalHistory } from '../../services/api';
import { VERDICT_COLOR, engineReport, setupReport } from '../../utils/reportCard';
import { formatPnl, formatR, pnlColor } from './format';

function Shell({ title, verdict, summary, children }) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const color = VERDICT_COLOR[verdict.level];
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}>
      <TouchableOpacity style={styles.head} onPress={() => setOpen((v) => !v)} accessibilityLabel={`${title}: ${open ? 'hide' : 'show'} details`}>
        <Ionicons name="ribbon-outline" size={18} color={color} />
        <View style={styles.flex}>
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          <Text style={[styles.summary, { color: theme.textMuted }]} numberOfLines={1}>
            {summary}
          </Text>
        </View>
        <View style={[styles.pill, { backgroundColor: color + '22' }]}>
          <Text style={[styles.pillText, { color }]}>{verdict.label}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textMuted} />
      </TouchableOpacity>
      {open ? (
        <View style={styles.body}>
          <Text style={[styles.verdictText, { color: theme.text }]}>{verdict.text}</Text>
          {children}
        </View>
      ) : null}
    </View>
  );
}

function Grid({ items }) {
  const { theme } = useTheme();
  return (
    <View style={styles.grid}>
      {items
        .filter(([, v]) => v != null && v !== '')
        .map(([label, value, color]) => (
          <View key={label} style={[styles.cell, { backgroundColor: theme.surfaceAlt }]}>
            <Text style={[styles.cellLabel, { color: theme.textMuted }]}>{label}</Text>
            <Text style={[styles.cellValue, { color: color || theme.text }]}>{value}</Text>
          </View>
        ))}
    </View>
  );
}

/** Signals tab: how the engine's paper/demo trades did in the last 30 days, and why it waited today. */
export function EngineReportCard({ trades }) {
  const { theme } = useTheme();
  const [signals, setSignals] = useState([]);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchSignalHistory({ days: 1, timeframe: '5m' })
        .then((r) => !cancelled && setSignals(r?.signals || []))
        .catch(() => {});
    load();
    const timer = setInterval(load, 5 * 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  const report = engineReport(trades, signals);
  const s = report.stats;
  const summary = s.trades
    ? `${s.trades} trades · ${s.winRate}% win · ${formatPnl(s.netPnl, 'IN')} net (30 days)`
    : 'Engine paper trades, last 30 days';
  const scanned = report.counts.candidates + report.counts.wait + report.counts.noTrade + report.counts.neutral;
  return (
    <Shell title="Engine report card" verdict={report.verdict} summary={summary}>
      {s.trades ? (
        <Grid
          items={[
            ['Closed trades', String(s.trades)],
            ['Win rate', `${s.winRate}%`],
            ['Net after charges', formatPnl(s.netPnl, 'IN'), pnlColor(s.netPnl)],
            ['Avg result', s.avgR != null ? formatR(s.avgR) : null, pnlColor(s.avgR)],
            ['Profit factor', s.profitFactor != null ? `${s.profitFactor}×` : 'no losses'],
            ['Worst drawdown', formatPnl(s.maxDrawdown, 'IN'), s.maxDrawdown < 0 ? '#E5383B' : null],
          ]}
        />
      ) : null}
      {s.trades ? (
        <Text style={[styles.line, { color: theme.textSecondary }]}>
          Exits: {s.exits.target} target · {s.exits.stop} stop · {s.exits.trail} trail · {s.exits.weak} setup broke · {s.exits.eod} square-off
        </Text>
      ) : null}
      {scanned ? (
        <>
          <Text style={[styles.sub, { color: theme.textSecondary }]}>Today&apos;s scans ({scanned} candles)</Text>
          <Text style={[styles.line, { color: theme.text }]}>
            {report.counts.candidates} entr{report.counts.candidates === 1 ? 'y' : 'ies'} · {report.counts.wait} wait · {report.counts.noTrade} no trade · {report.counts.neutral} neutral
          </Text>
          {report.waitReasons.length ? (
            <>
              <Text style={[styles.sub, { color: theme.textSecondary }]}>Why it held back today</Text>
              {report.waitReasons.map((r) => (
                <View key={r.label} style={styles.reasonRow}>
                  <Text style={[styles.reasonLabel, { color: theme.text }]} numberOfLines={1}>
                    {r.label}
                  </Text>
                  <View style={[styles.bar, { backgroundColor: theme.surfaceAlt }]}>
                    <View style={[styles.barFill, { width: `${r.pct}%` }]} />
                  </View>
                  <Text style={[styles.reasonPct, { color: theme.textMuted }]}>{r.pct}%</Text>
                </View>
              ))}
            </>
          ) : null}
        </>
      ) : null}
      <Text style={[styles.hint, { color: theme.textMuted }]}>
        Judged on simulated trades with your charges. A real edge needs at least 20 closed trades and should hold for weeks.
      </Text>
    </Shell>
  );
}

/** Setup tab: how your own paper trades did, by the setup signal you took them on. */
export function SetupReportCard({ trades }) {
  const { theme } = useTheme();
  const report = setupReport(trades);
  const s = report.stats;
  const net = s.net.INR;
  const summary = s.count ? `${s.count} trades · ${s.winRate}% win · ${formatPnl(net, 'IN')} net` : 'Your paper trades';
  const followed = s.followedPlan.yes + s.followedPlan.no;
  return (
    <Shell title="Setup report card" verdict={report.verdict} summary={summary}>
      {s.count ? (
        <>
          <Grid
            items={[
              ['Closed trades', String(s.count)],
              ['Win rate', `${s.winRate}%`],
              ['Net (₹)', formatPnl(net, 'IN'), pnlColor(net)],
              ['After charges', formatPnl(s.netAfterCostsINR, 'IN'), pnlColor(s.netAfterCostsINR)],
              ['Avg result', s.avgR != null ? formatR(s.avgR) : null, pnlColor(s.avgR)],
              ['Followed plan', followed ? `${Math.round((s.followedPlan.yes / followed) * 100)}%` : null],
            ]}
          />
          <Text style={[styles.sub, { color: theme.textSecondary }]}>By the setup signal you traded on</Text>
          {Object.entries(s.bySignal).map(([signal, b]) => (
            <Text key={signal} style={[styles.line, { color: theme.text }]}>
              {signal === 'None' ? 'No setup check' : signal}: {b.trades} trade{b.trades === 1 ? '' : 's'} · {Math.round((b.wins / b.trades) * 100)}% won
            </Text>
          ))}
        </>
      ) : null}
      <Text style={[styles.hint, { color: theme.textMuted }]}>
        From the paper trades you close in Done. Mark “followed plan” when reviewing to see whether sticking to the plan pays.
      </Text>
    </Shell>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700' },
  summary: { fontSize: 12, marginTop: 1 },
  pill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 11, fontWeight: '800' },
  body: { marginTop: 10, gap: 6 },
  verdictText: { fontSize: 13, lineHeight: 19 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  cell: { width: '31.5%', borderRadius: 10, padding: 8 },
  cellLabel: { fontSize: 10, fontWeight: '600' },
  cellValue: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  sub: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 6 },
  line: { fontSize: 12, lineHeight: 18 },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reasonLabel: { width: 130, fontSize: 12 },
  bar: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: '#F59E0B' },
  reasonPct: { width: 34, fontSize: 11, textAlign: 'right' },
  hint: { fontSize: 11, lineHeight: 16, marginTop: 4 },
});
