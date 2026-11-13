import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { fetchBacktest, startBacktest } from '../../services/api';
import { EXIT_ACTION, LOSS, PROFIT, formatMoney, formatPnl, formatR, pnlColor } from './format';
import { moneyMarket, shortSymbol } from '../../utils/engineMarket';

const POLL_MS = 3000;

const ago = (iso, now) => {
  if (!iso || !now) return '';
  const h = Math.round((now - Date.parse(iso)) / 3600000);
  if (h < 1) return 'just now';
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
};

function Row({ label, sub, value, color, theme }) {
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <Text style={[styles.rowLabel, { color: theme.text }]} numberOfLines={1}>
          {label}
        </Text>
        {sub ? <Text style={[styles.small, { color: theme.textMuted }]}>{sub}</Text> : null}
      </View>
      <Text style={[styles.rowValue, { color: color || theme.text }]}>{value}</Text>
    </View>
  );
}

/**
 * Backtest of the engine on a market's watchlist: ~60 days of 5-minute
 * candles replayed through the same rules. Its trades teach the engine
 * (learning) straight away; the server also refreshes it weekly by itself.
 */
export default function BacktestCard({ market, cardStyle }) {
  const { theme } = useTheme();
  const [data, setData] = useState(null); // { running, summary }
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(0);
  const mm = moneyMarket(market);

  const load = useCallback(() => {
    fetchBacktest(market)
      .then((d) => {
        setData(d);
        setError(null);
        setNow(Date.now());
      })
      .catch((e) => setError(e?.status === 404 ? 'The server needs updating first (redeploy it on Render).' : null));
  }, [market]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  // While a run is going, check its progress every few seconds.
  const running = data?.running;
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [running, load]);

  const run = () => {
    setError(null);
    startBacktest(market)
      .then(() => setTimeout(load, 500))
      .catch((e) => setError(e?.serverMessage || "Couldn't start the backtest. Try again in a minute."));
  };

  const s = data?.summary;
  const st = s?.stats;
  const pct = running?.total ? Math.round((running.done / running.total) * 100) : 0;

  return (
    <View style={cardStyle}>
      <TouchableOpacity style={styles.head} onPress={() => setOpen((v) => !v)} accessibilityLabel={`Backtest: ${open ? 'hide' : 'show'} details`}>
        <Ionicons name="time-outline" size={18} color="#7C3AED" />
        <View style={styles.flex}>
          <Text style={[styles.title, { color: theme.text }]}>Backtest &amp; training</Text>
          <Text style={[styles.small, { color: theme.textMuted }]} numberOfLines={1}>
            {running
              ? `Running… ${pct}%${running.symbol ? ` · ${shortSymbol(running.symbol)}` : ''}`
              : st
                ? `${s.sessions} days · ${st.trades} trades · ${st.winRate ?? 0}% win · ${formatPnl(st.netPnl, mm)} net`
                : 'Not run yet: replay the last ~60 days to train the engine'}
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textMuted} />
      </TouchableOpacity>

      {running ? (
        <View style={[styles.track, { backgroundColor: theme.surfaceAlt }]}>
          <View style={[styles.fill, { width: `${Math.max(3, pct)}%` }]} />
        </View>
      ) : null}

      {open ? (
        <View style={styles.body}>
          <Text style={[styles.text, { color: theme.textSecondary }]}>
            Replays about 60 days of 5-minute candles for the watchlist through the same rules, risk settings and exits as
            live paper trading (no peeking at later candles). Its trades count in what the engine learns, so it doesn&apos;t
            have to wait weeks for 20 live trades. The server refreshes it every week on its own.
          </Text>
          {st ? (
            <>
              <Text style={[styles.sub, { color: theme.textSecondary }]}>
                {s.from} to {s.to} · {s.symbols.length} stocks · ran {ago(s.ranAt, now)}
              </Text>
              <View style={styles.grid}>
                {[
                  ['Trades', String(st.trades)],
                  ['Win rate', st.trades ? `${st.winRate}%` : '—'],
                  ['Net after costs', formatPnl(st.netPnl, mm), pnlColor(st.netPnl)],
                  ['Profit factor', st.profitFactor != null ? `${st.profitFactor}×` : st.trades ? 'no losses' : '—'],
                  ['Avg result', st.avgR != null ? formatR(st.avgR) : '—', pnlColor(st.avgR)],
                  ['Worst drawdown', formatMoney(st.maxDrawdown, mm), st.maxDrawdown < 0 ? LOSS : undefined],
                ].map(([label, value, color]) => (
                  <View key={label} style={[styles.cell, { backgroundColor: theme.surfaceAlt }]}>
                    <Text style={[styles.cellLabel, { color: theme.textMuted }]}>{label}</Text>
                    <Text style={[styles.cellValue, { color: color || theme.text }]}>{value}</Text>
                  </View>
                ))}
              </View>

              {s.bySymbol?.length ? (
                <>
                  <Text style={[styles.sub, { color: theme.textSecondary }]}>By stock</Text>
                  {s.bySymbol.map((g) => (
                    <Row
                      key={g.key}
                      theme={theme}
                      label={shortSymbol(g.key)}
                      sub={`${g.trades} trades · ${g.winRate}% won${g.avgR != null ? ` · avg ${formatR(g.avgR)}` : ''}`}
                      value={formatPnl(g.net, mm)}
                      color={pnlColor(g.net)}
                    />
                  ))}
                </>
              ) : null}
              {s.byTime?.length ? (
                <>
                  <Text style={[styles.sub, { color: theme.textSecondary }]}>By time of day</Text>
                  {s.byTime.map((g) => (
                    <Row key={g.key} theme={theme} label={g.key} sub={`${g.trades} trades · ${g.winRate}% won`} value={formatPnl(g.net, mm)} color={pnlColor(g.net)} />
                  ))}
                </>
              ) : null}
              {s.bySide?.length ? (
                <>
                  <Text style={[styles.sub, { color: theme.textSecondary }]}>Long vs short</Text>
                  {s.bySide.map((g) => (
                    <Row key={g.key} theme={theme} label={g.key === 'short' ? 'Shorts' : 'Longs'} sub={`${g.trades} trades · ${g.winRate}% won`} value={formatPnl(g.net, mm)} color={pnlColor(g.net)} />
                  ))}
                </>
              ) : null}
              {s.byExit?.length ? (
                <Text style={[styles.small, { color: theme.textMuted, marginTop: 6 }]}>
                  Exits: {s.byExit.map((g) => `${g.trades} ${EXIT_ACTION[g.key] || g.key}`).join(' · ')}
                </Text>
              ) : null}

              <Text style={[styles.sub, { color: theme.textSecondary }]}>What the engine learned from it</Text>
              {s.lessons?.length ? (
                s.lessons.map((l) => (
                  <Text key={l.id} style={[styles.text, { color: theme.text }]}>
                    • {l.note}
                  </Text>
                ))
              ) : (
                <Text style={[styles.text, { color: theme.text }]}>
                  {st.trades >= 20 ? 'Nothing needs tightening: no side, time of day or stock was clearly losing.' : `Too few trades to learn from yet (${st.trades} of 20).`}
                </Text>
              )}
              {s.missing?.length ? (
                <Text style={[styles.small, { color: '#FF9500', marginTop: 4 }]}>
                  No data for {s.missing.map((m) => shortSymbol(m.symbol)).join(', ')}.
                </Text>
              ) : null}
              <Text style={[styles.small, { color: theme.textMuted, marginTop: 6 }]}>
                Simulated on past candles with your settings (rules {s.ruleVersion}). Past results don&apos;t promise future
                ones; a candle that touched both stop and target counts as the stop.
              </Text>
            </>
          ) : null}
          {error ? <Text style={[styles.small, { color: LOSS }]}>{error}</Text> : null}
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: '#7C3AED' }, running && styles.disabled]}
            onPress={run}
            disabled={!!running}
            accessibilityLabel="Run backtest now"
          >
            {running ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.btnText}>{st ? 'Run again with current settings' : 'Run backtest now'}</Text>
            )}
          </TouchableOpacity>
          <Text style={[styles.small, { color: theme.textMuted }]}>Takes about a minute on the server; you can leave this screen.</Text>
        </View>
      ) : null}
      {!open && st ? (
        <Text style={[styles.small, { color: st.netPnl >= 0 ? PROFIT : theme.textMuted, marginTop: 4 }]}>
          Tap to see results by stock and time of day.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 14, fontWeight: '700' },
  small: { fontSize: 11, lineHeight: 16 },
  text: { fontSize: 12, lineHeight: 18 },
  body: { marginTop: 10, gap: 6 },
  sub: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  cell: { width: '31.5%', borderRadius: 10, padding: 8 },
  cellLabel: { fontSize: 10, fontWeight: '600' },
  cellValue: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  rowLabel: { fontSize: 13, fontWeight: '600' },
  rowValue: { fontSize: 13, fontWeight: '800' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 8 },
  fill: { height: 6, borderRadius: 3, backgroundColor: '#7C3AED' },
  btn: { borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.6 },
});
