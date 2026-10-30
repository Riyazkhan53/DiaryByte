import { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  Switch,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { useSyncedCollection } from '../../hooks/useSyncedCollection';
import { DEFAULT_CONFIG } from '../../engine/risk.js';
import { searchStocks } from '../../services/stocks';
import {
  evaluateSymbol,
  fetchCollection,
  fetchEngineStatus,
  fetchKiteLoginUrl,
  runEngineScan,
} from '../../services/api';
import { LOSS, PROFIT, formatDay, formatMoney, formatPnl, formatR, pnlColor } from './format';

const CONFIG_KEY = '@diarybyte_tradingconfig';

const STATE_COLORS = {
  'BUY CANDIDATE': PROFIT,
  'SELL CANDIDATE': LOSS,
  WAIT: '#FF9500',
  NEUTRAL: '#8E8E93',
  'NO TRADE': '#8E8E93',
};

// Settings shown in the sheet, over the engine defaults.
const SETTINGS = [
  { key: 'capital', label: 'Practice capital (₹)' },
  { key: 'riskPct', label: 'Risk per trade (%)' },
  { key: 'dailyLossPct', label: 'Daily loss stop (%)' },
  { key: 'maxOpenPositions', label: 'Open positions at once' },
  { key: 'atrMultiple', label: 'Stop distance (× ATR)' },
  { key: 'rewardRisk', label: 'Target (× risk)' },
  { key: 'slippagePct', label: 'Slippage per fill (%)' },
  { key: 'threshold', label: 'Score needed (of 100)' },
  { key: 'maxDelayMin', label: 'Stale after (minutes)' },
];

const CHECK_LABEL = {
  session: 'Market session',
  fresh: 'Data freshness',
  closed: 'Completed candle',
  history: 'Enough history',
  vwap: 'VWAP side',
  volume: 'Volume confirmation',
  risk: 'Risk plan fits',
  dailyLimit: 'Daily loss limit',
  positions: 'Position limit',
  duplicate: 'Not a repeat',
  shortAllowed: 'Shorts allowed',
};

// A 404 means the server answered but predates the signal engine.
const OUTDATED =
  'Your server is running an older version without the signal engine. Redeploy it on Render (diarybyte-api → Manual Deploy → Deploy latest commit).';

const problemText = (e) =>
  e?.status === 404
    ? OUTDATED
    : e?.status
      ? `The server could not answer (${e.status}). Try again in a minute.`
      : "Couldn't reach your server. It may be waking up; try again in a minute.";

const timeOf = (iso) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—';

/** Drawdown: the largest fall of cumulative net P/L from a previous high. */
function maxDrawdown(closed) {
  let peak = 0;
  let equity = 0;
  let worst = 0;
  [...closed]
    .sort((a, b) => (a.exitTime || 0) - (b.exitTime || 0))
    .forEach((t) => {
      equity += t.netPnl || 0;
      peak = Math.max(peak, equity);
      worst = Math.min(worst, equity - peak);
    });
  return worst;
}

/**
 * Signals section of My Trading: the intraday engine on the server. Shows
 * data status, the signal and every gate for a watchlist stock, its
 * indicators and risk plan, the engine's own paper-trade ledger, and the
 * settings it uses. Decision support only: it never places orders.
 */
export default function Signals({ header, onPaperTrade }) {
  const { theme } = useTheme();
  const {
    items: configDocs,
    loaded: configLoaded,
    persist: persistConfig,
    pullNow: pullConfig,
  } = useSyncedCollection('tradingconfig', CONFIG_KEY);
  const configDoc = configDocs[0] || null;
  const config = { ...DEFAULT_CONFIG, ...(configDoc || {}) };
  const watchlist = configDoc?.watchlist || [];

  const [status, setStatus] = useState(null);
  // 'outdated' (server too old for signals) or 'offline'
  const [statusProblem, setStatusProblem] = useState(null);
  const [selected, setSelected] = useState(null);
  const [evaluation, setEvaluation] = useState(null);
  const [ledger, setLedger] = useState({ trades: [], signals: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [scanning, setScanning] = useState(false);

  const symbol = selected || watchlist[0] || null;

  // First time on this device: fetch the settings saved from another one.
  useEffect(() => {
    if (configLoaded && !configDocs.length) pullConfig();
  }, [configLoaded, configDocs.length, pullConfig]);

  // Status, ledger and the selected symbol's evaluation; refreshed every
  // minute while the screen is open.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchEngineStatus()
        .then((s) => {
          if (cancelled) return;
          setStatus(s);
          setStatusProblem(null);
        })
        .catch((e) => {
          if (cancelled) return;
          setStatus(null);
          setStatusProblem(e?.status === 404 ? 'outdated' : 'offline');
        });
      Promise.all([fetchCollection('enginetrades'), fetchCollection('signals')])
        .then(([trades, signals]) => !cancelled && setLedger({ trades, signals }))
        .catch(() => {});
      if (!symbol) return;
      setLoading(true);
      evaluateSymbol(symbol)
        .then((r) => {
          if (cancelled) return;
          setEvaluation(r);
          setError(null);
        })
        .catch((e) => !cancelled && setError(problemText(e)))
        .finally(() => !cancelled && setLoading(false));
    };
    load();
    const timer = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [symbol, version]);

  const refresh = () => setVersion((v) => v + 1);

  const saveConfig = (changes) => {
    const doc = { ...(configDoc || { id: 'default' }), ...changes, updatedAt: new Date().toISOString() };
    persistConfig([doc]);
  };

  const addSymbol = (s) => {
    if (!watchlist.includes(s.symbol)) saveConfig({ watchlist: [...watchlist, s.symbol].slice(0, 10) });
    setSelected(s.symbol);
    setResults([]);
    setQuery('');
  };

  const removeSymbol = (s) => {
    saveConfig({ watchlist: watchlist.filter((x) => x !== s) });
    if (selected === s) setSelected(null);
  };

  const runSearch = async () => {
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      setResults(await searchStocks(query, 'IN'));
    } catch (_e) {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const scanNow = async () => {
    setScanning(true);
    try {
      await runEngineScan();
    } catch (_e) {
      // Shown through status.lastError.
    } finally {
      setScanning(false);
      refresh();
    }
  };

  const connectKite = async () => {
    try {
      const { url } = await fetchKiteLoginUrl();
      Linking.openURL(url);
    } catch (e) {
      setError(e.message);
    }
  };

  const openSettings = () => {
    setDrafts(Object.fromEntries(SETTINGS.map((s) => [s.key, String(config[s.key])])));
    setSettingsOpen(true);
  };

  const saveSettings = () => {
    const changes = {};
    SETTINGS.forEach((s) => {
      const v = parseFloat(drafts[s.key]);
      if (Number.isFinite(v) && v > 0) changes[s.key] = v;
    });
    saveConfig(changes);
    setSettingsOpen(false);
  };

  // ------- ledger stats (net of estimated charges) -------
  const closed = ledger.trades.filter((t) => t.status === 'closed');
  const openTrades = ledger.trades.filter((t) => t.status === 'pending' || t.status === 'open');
  const net = closed.reduce((s, t) => s + (t.netPnl || 0), 0);
  const wins = closed.filter((t) => t.netPnl > 0).length;
  const withR = closed.filter((t) => t.r != null);
  const avgR = withR.length ? withR.reduce((s, t) => s + t.r, 0) / withR.length : null;

  const cardStyle = [
    styles.card,
    { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow },
  ];
  const ev = evaluation && evaluation.symbol === symbol ? evaluation : null;
  const stateColor = ev ? STATE_COLORS[ev.state] : theme.textMuted;
  const sideGates = ev ? ev.gates[ev.side] : [];
  const gateRow = (g) => (
    <View key={g.id} style={styles.gateRow}>
      <Ionicons name={g.pass ? 'checkmark-circle' : 'close-circle'} size={16} color={g.pass ? PROFIT : LOSS} />
      <Text style={[styles.gateText, { color: theme.text }]}>
        <Text style={styles.bold}>{CHECK_LABEL[g.id] || g.id}</Text>
        <Text style={{ color: theme.textSecondary }}> · {g.note}</Text>
      </Text>
    </View>
  );

  return (
    <>
      <ScrollView style={styles.content} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {header}

        {/* Status strip */}
        <View style={[cardStyle, styles.strip]}>
          <View style={styles.stripRow}>
            <View style={[styles.dot, { backgroundColor: status?.marketOpen ? PROFIT : '#8E8E93' }]} />
            <Text style={[styles.stripText, { color: theme.text }]}>
              NSE {status ? (status.marketOpen ? 'open' : 'closed') : '—'}
            </Text>
            <Text style={[styles.stripText, styles.flex, { color: theme.textSecondary }]} numberOfLines={1}>
              {status
                ? status.provider.label
                : statusProblem === 'outdated'
                  ? 'Server needs an update'
                  : 'Server not reachable'}
            </Text>
            <TouchableOpacity onPress={openSettings} accessibilityLabel="Signal settings" style={styles.iconBtn}>
              <Ionicons name="settings-outline" size={19} color={theme.primary} />
            </TouchableOpacity>
          </View>
          {ev ? (
            <Text style={[styles.stripSub, { color: ev.data.status === 'stale' || ev.data.status === 'empty' ? LOSS : theme.textMuted }]}>
              {symbol}: data {ev.data.status}
              {ev.candle ? ` · last completed 5-min candle ${timeOf(new Date(ev.candle.t).toISOString())}` : ''}
              {ev.data.ageMin != null ? ` (ended ${ev.data.ageMin} min ago)` : ''} · checked {timeOf(ev.evaluatedAt)}
            </Text>
          ) : null}
          {status ? (
            <Text style={[styles.stripSub, { color: theme.textMuted }]}>
              Scanner {status.scanner.enabled ? 'on' : 'off'}
              {status.scanner.lastScanAt ? ` · last scan ${timeOf(status.scanner.lastScanAt)}` : ' · no scan yet since the server started'}
              {status.scanner.lastError ? ` · last error: ${status.scanner.lastError}` : ''}
            </Text>
          ) : null}
          {!status && statusProblem ? (
            <Text style={[styles.stripSub, { color: statusProblem === 'outdated' ? '#FF9500' : theme.textMuted }]}>
              {statusProblem === 'outdated' ? OUTDATED : problemText(null)}
            </Text>
          ) : null}
          {status?.provider.note ? (
            <Text style={[styles.stripSub, { color: '#FF9500' }]}>{status.provider.note}</Text>
          ) : null}
          {status?.kite.wanted && status.kite.configured && !status.kite.connected ? (
            <TouchableOpacity style={[styles.outlineBtn, { borderColor: theme.primary }]} onPress={connectKite}>
              <Text style={[styles.outlineText, { color: theme.primary }]}>Log in to Kite for today</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Watchlist */}
        <View style={cardStyle}>
          <Text style={[styles.title, { color: theme.text }]}>Watchlist (NSE)</Text>
          <View style={styles.chips}>
            {watchlist.map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => setSelected(s)}
                onLongPress={() => removeSymbol(s)}
                style={[styles.chip, { backgroundColor: s === symbol ? theme.primary : theme.surfaceAlt, borderColor: s === symbol ? theme.primary : theme.borderNeutral }]}
              >
                <Text style={[styles.chipText, { color: s === symbol ? theme.onPrimary : theme.text }]}>{s.replace(/\.NS$/, '')}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.searchRow}>
            <TextInput
              style={[styles.input, styles.flex, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
              placeholder="Add a stock (e.g. DLF, infosys)"
              placeholderTextColor={theme.textMuted}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={runSearch}
              returnKeyType="search"
            />
            <TouchableOpacity
              style={[styles.searchBtn, { backgroundColor: theme.primary }, query.trim().length < 2 && styles.disabled]}
              onPress={runSearch}
              disabled={query.trim().length < 2 || searching}
              accessibilityLabel="Search watchlist stock"
            >
              {searching ? <ActivityIndicator size="small" color={theme.onPrimary} /> : <Ionicons name="add" size={22} color={theme.onPrimary} />}
            </TouchableOpacity>
          </View>
          {results.map((r) => (
            <TouchableOpacity key={r.symbol} style={[styles.result, { borderColor: theme.borderNeutral }]} onPress={() => addSymbol(r)}>
              <Text style={[styles.resultText, { color: theme.text }]}>
                {r.name}
                <Text style={{ color: theme.textMuted }}> · {r.symbol}</Text>
              </Text>
            </TouchableOpacity>
          ))}
          <Text style={[styles.hint, { color: theme.textMuted }]}>
            Up to 10 stocks. Long-press one to remove it. The server scans them every 5 minutes in market hours.
          </Text>
          <TouchableOpacity style={[styles.outlineBtn, { borderColor: theme.primary }]} onPress={scanNow} disabled={scanning || !watchlist.length}>
            {scanning ? <ActivityIndicator size="small" color={theme.primary} /> : <Text style={[styles.outlineText, { color: theme.primary }]}>Scan watchlist now</Text>}
          </TouchableOpacity>
        </View>

        {/* Signal */}
        {symbol ? (
          <View style={[cardStyle, { borderColor: stateColor + '80' }]}>
            <View style={styles.stripRow}>
              <Text style={[styles.state, { color: stateColor }]}>{ev ? ev.state : '…'}</Text>
              <View style={styles.flex} />
              <TouchableOpacity onPress={refresh} accessibilityLabel="Refresh signal" style={styles.iconBtn}>
                {loading ? <ActivityIndicator size="small" color={theme.primary} /> : <Ionicons name="refresh" size={20} color={theme.primary} />}
              </TouchableOpacity>
            </View>
            <Text style={[styles.symbol, { color: theme.text }]}>{symbol}</Text>
            {error && !ev ? <Text style={[styles.hint, { color: LOSS }]}>{error}</Text> : null}
            {ev ? (
              <>
                {['long', 'short'].map((side) => (
                  <View key={side} style={styles.scoreRow}>
                    <Text style={[styles.scoreLabel, { color: theme.textSecondary }]}>{side === 'long' ? 'Long' : 'Short'}</Text>
                    <View style={[styles.track, { backgroundColor: theme.surfaceAlt }]}>
                      <View style={[styles.fill, { width: `${ev.score[side]}%`, backgroundColor: side === 'long' ? PROFIT : LOSS }]} />
                      <View style={[styles.mark, { left: `${ev.threshold}%`, backgroundColor: theme.text }]} />
                    </View>
                    <Text style={[styles.scoreValue, { color: theme.text }]}>{ev.score[side]}</Text>
                  </View>
                ))}
                <Text style={[styles.hint, { color: theme.textMuted }]}>
                  Score = weighted checks that agree (needs {ev.threshold}). It is not a probability of profit.
                </Text>
                {ev.reasons.map((r) => (
                  <Text key={r} style={[styles.reason, { color: theme.text }]}>• {r}</Text>
                ))}

                <Text style={[styles.subTitle, { color: theme.textSecondary }]}>Must pass (data)</Text>
                {ev.gates.data.map(gateRow)}
                <Text style={[styles.subTitle, { color: theme.textSecondary }]}>
                  Must pass ({ev.side === 'long' ? 'long' : 'short'} side)
                </Text>
                {sideGates.map(gateRow)}

                <Text style={[styles.subTitle, { color: theme.textSecondary }]}>Checks (long / short)</Text>
                {ev.checks.map((c) => (
                  <View key={c.id} style={styles.checkRow}>
                    <Text style={[styles.checkName, { color: theme.text }]}>
                      {c.name} <Text style={{ color: theme.textMuted }}>· {c.weight}</Text>
                    </Text>
                    <Text style={[styles.checkVote, { color: c.long ? PROFIT : theme.textMuted }]}>{c.long == null ? '—' : c.long ? '✓' : '✗'}</Text>
                    <Text style={[styles.checkVote, { color: c.short ? LOSS : theme.textMuted }]}>{c.short == null ? '—' : c.short ? '✓' : '✗'}</Text>
                  </View>
                ))}
              </>
            ) : null}
          </View>
        ) : (
          <Text style={[styles.empty, { color: theme.textMuted }]}>Add a stock to the watchlist to see its signal.</Text>
        )}

        {/* Indicators */}
        {ev ? (
          <View style={cardStyle}>
            <Text style={[styles.title, { color: theme.text }]}>Indicators (completed 5-min candles)</Text>
            <View style={styles.grid}>
              {[
                ['Price', ev.indicators.price],
                ['EMA 9', ev.indicators.ema9],
                ['EMA 20', ev.indicators.ema20],
                ['EMA 50', ev.indicators.ema50],
                ['VWAP', ev.indicators.vwap],
                ['RSI 14', ev.indicators.rsi],
                ['MACD', ev.indicators.macd],
                ['MACD signal', ev.indicators.macdSignal],
                ['ATR 14', ev.indicators.atr],
                ['Volume', ev.indicators.volume != null && ev.indicators.volumeAvg ? `${(ev.indicators.volume / ev.indicators.volumeAvg).toFixed(1)}× avg` : null],
                ['15-min trend', ev.indicators.trend15],
                ['1-hr range', ev.indicators.rangeHigh != null ? `${ev.indicators.rangeLow}–${ev.indicators.rangeHigh}` : null],
              ].map(([label, value]) => (
                <View key={label} style={styles.cell}>
                  <Text style={[styles.cellLabel, { color: theme.textMuted }]}>{label}</Text>
                  <Text style={[styles.cellValue, { color: theme.text }]}>{value ?? '—'}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Risk plan */}
        {ev?.plan ? (
          <View style={cardStyle}>
            <Text style={[styles.title, { color: theme.text }]}>
              Risk plan ({ev.plan.side}) · ₹{config.capital} capital, {config.riskPct}% risk
            </Text>
            {ev.plan.ok ? (
              <View style={styles.grid}>
                {[
                  ['Entry (approx.)', formatMoney(ev.plan.entry, 'IN')],
                  ['Stop-loss', formatMoney(ev.plan.stop, 'IN')],
                  ['Target', formatMoney(ev.plan.target, 'IN')],
                  ['Risk / share', formatMoney(ev.plan.riskPerShare, 'IN')],
                  ['Quantity', String(ev.plan.quantity)],
                  ['Cash used', formatMoney(ev.plan.cashUsed, 'IN')],
                  ['Est. charges', formatMoney(ev.plan.costs, 'IN')],
                  ['Max loss', formatMoney(ev.plan.maxLoss, 'IN')],
                  ['Reward at target', formatMoney(ev.plan.reward, 'IN')],
                ].map(([label, value]) => (
                  <View key={label} style={styles.cell}>
                    <Text style={[styles.cellLabel, { color: theme.textMuted }]}>{label}</Text>
                    <Text style={[styles.cellValue, { color: theme.text }]}>{value}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[styles.reason, { color: LOSS }]}>No trade: {ev.plan.reason}</Text>
            )}
            <Text style={[styles.hint, { color: theme.textMuted }]}>
              Stop = {config.atrMultiple} × ATR, target = {config.rewardRisk} × risk. Max loss includes slippage and estimated charges
              and never exceeds your risk budget. Charges are estimates; check your broker&apos;s contract note.
            </Text>
            {ev.plan.ok ? (
              <TouchableOpacity
                style={[styles.outlineBtn, { borderColor: theme.secondary }]}
                onPress={() =>
                  onPaperTrade({
                    symbol,
                    name: symbol.replace(/\.NS$/, ''),
                    market: 'IN',
                    side: ev.plan.side,
                    entryPrice: ev.plan.entry,
                    quantity: ev.plan.quantity,
                    stopLoss: ev.plan.stop,
                    target: ev.plan.target,
                    setupSignal: ev.state,
                    setupBullPct: ev.score.long,
                    setupBearPct: ev.score.short,
                    plan: `${ev.state} (${ev.ruleVersion}) at ${timeOf(ev.evaluatedAt)}: long ${ev.score.long}, short ${ev.score.short}.`,
                  })
                }
              >
                <Text style={[styles.outlineText, { color: theme.secondary }]}>Paper trade this plan myself</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* Engine ledger */}
        <View style={cardStyle}>
          <Text style={[styles.title, { color: theme.text }]}>Engine paper trades</Text>
          <Text style={[styles.hint, { color: theme.textMuted }]}>
            {config.autoPaper !== false
              ? 'Every BUY/SELL candidate from the scanner is paper-traded automatically: entry at the next candle’s open, conservative stop/target fills, square-off at 15:20, charges deducted.'
              : 'Automatic paper trading is off in settings.'}
          </Text>
          <View style={styles.grid}>
            {[
              ['Closed', String(closed.length)],
              ['Open', String(openTrades.length)],
              ['Win rate', closed.length ? `${Math.round((wins / closed.length) * 100)}%` : '—'],
              ['Net P/L', formatPnl(net, 'IN'), pnlColor(net)],
              ['Avg R', avgR != null ? formatR(avgR) : '—', pnlColor(avgR)],
              ['Max drawdown', formatMoney(maxDrawdown(closed), 'IN'), maxDrawdown(closed) < 0 ? LOSS : undefined],
            ].map(([label, value, color]) => (
              <View key={label} style={styles.cell}>
                <Text style={[styles.cellLabel, { color: theme.textMuted }]}>{label}</Text>
                <Text style={[styles.cellValue, { color: color || theme.text }]}>{value}</Text>
              </View>
            ))}
          </View>
          {[...ledger.trades]
            .sort((a, b) => (b.signalTime || 0) - (a.signalTime || 0))
            .slice(0, 15)
            .map((t) => (
              <View key={t.id} style={[styles.ledgerRow, { borderTopColor: theme.borderNeutral }]}>
                <Text style={[styles.ledgerSide, { color: t.side === 'short' ? LOSS : PROFIT }]}>{t.side === 'short' ? 'S' : 'L'}</Text>
                <View style={styles.flex}>
                  <Text style={[styles.ledgerName, { color: theme.text }]}>
                    {t.symbol.replace(/\.NS$/, '')} · {t.plan?.quantity} @ {formatMoney(t.entryPrice ?? t.plan?.entry, 'IN')}
                  </Text>
                  <Text style={[styles.hint, styles.noTop, { color: theme.textMuted }]}>
                    {formatDay(new Date(t.signalTime).toISOString())} {timeOf(new Date(t.signalTime).toISOString())} ·{' '}
                    {t.status === 'closed' ? `${t.exitReason} at ${formatMoney(t.exitPrice, 'IN')}` : t.status === 'pending' ? 'waiting for next candle' : 'open'} · {t.ruleVersion}
                  </Text>
                </View>
                {t.status === 'closed' ? (
                  <View style={styles.right}>
                    <Text style={[styles.ledgerPnl, { color: pnlColor(t.netPnl, theme.text) }]}>{formatPnl(t.netPnl, 'IN')}</Text>
                    <Text style={[styles.hint, styles.noTop, { color: theme.textMuted }]}>
                      {formatR(t.r)} · fees {formatMoney(t.costs, 'IN')}
                    </Text>
                  </View>
                ) : null}
              </View>
            ))}
          {ledger.signals.length ? (
            <Text style={[styles.hint, { color: theme.textMuted }]}>
              {ledger.signals.length} candidate signal{ledger.signals.length > 1 ? 's' : ''} logged with their indicators, gates and data freshness.
            </Text>
          ) : null}
        </View>

        <Text style={[styles.disclaimer, { color: theme.textMuted }]}>
          Technical signals are informational; not a guarantee or investment recommendation. Paper trading only:
          nothing here places orders. Prices from the prototype feed may be delayed.
        </Text>
      </ScrollView>

      <Modal visible={settingsOpen} transparent animationType="fade" onRequestClose={() => setSettingsOpen(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: theme.sheet }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[styles.sheetTitle, { color: theme.text }]}>Signal settings</Text>
              <View style={styles.grid}>
                {SETTINGS.map((s) => (
                  <View key={s.key} style={styles.field}>
                    <Text style={[styles.cellLabel, { color: theme.textSecondary }]}>{s.label}</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                      keyboardType="decimal-pad"
                      value={drafts[s.key] ?? ''}
                      onChangeText={(v) => setDrafts((d) => ({ ...d, [s.key]: v }))}
                      accessibilityLabel={s.label}
                    />
                  </View>
                ))}
              </View>
              {[
                { key: 'allowShort', label: 'Allow intraday shorts' },
                { key: 'scannerOn', label: 'Scan watchlist every 5 minutes' },
                { key: 'autoPaper', label: 'Paper-trade candidates automatically' },
              ].map((s) => (
                <View key={s.key} style={styles.switchRow}>
                  <Text style={[styles.flex, { color: theme.text }]}>{s.label}</Text>
                  <Switch
                    value={configDoc?.[s.key] ?? (s.key === 'allowShort' ? DEFAULT_CONFIG.allowShort : true)}
                    onValueChange={(v) => saveConfig({ [s.key]: v })}
                  />
                </View>
              ))}
              <Text style={[styles.hint, { color: theme.textMuted }]}>
                Leverage is off: sizing only uses your practice capital. The scanner runs on your server, and only while it is
                awake (a free host sleeps when idle).
              </Text>
              <View style={styles.actions}>
                <TouchableOpacity style={[styles.cancel, { backgroundColor: theme.surfaceAlt }]} onPress={() => setSettingsOpen(false)}>
                  <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Close</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.save, { backgroundColor: theme.primary }]} onPress={saveSettings}>
                  <Text style={[styles.saveText, { color: theme.onPrimary }]}>Save</Text>
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
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  scroll: { paddingBottom: 48 },
  flex: { flex: 1, minWidth: 0 },
  bold: { fontWeight: '700' },
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
  strip: { paddingVertical: 10 },
  stripRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  stripText: { fontSize: 13, fontWeight: '600' },
  stripSub: { fontSize: 12, marginTop: 6, lineHeight: 17 },
  iconBtn: { padding: 4 },
  title: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  subTitle: { fontSize: 12, fontWeight: '700', marginTop: 12, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '700' },
  searchRow: { flexDirection: 'row', gap: 8 },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15 },
  searchBtn: { width: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  result: { borderWidth: 1, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, marginTop: 6 },
  resultText: { fontSize: 13 },
  hint: { fontSize: 12, marginTop: 6, lineHeight: 17 },
  noTop: { marginTop: 1 },
  outlineBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center', marginTop: 10 },
  outlineText: { fontSize: 14, fontWeight: '700' },
  empty: { fontSize: 14, textAlign: 'center', marginVertical: 20 },
  state: { fontSize: 26, fontWeight: '800' },
  symbol: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  scoreLabel: { width: 42, fontSize: 12, fontWeight: '600' },
  track: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: 10 },
  mark: { position: 'absolute', top: 0, bottom: 0, width: 2, opacity: 0.6 },
  scoreValue: { width: 30, textAlign: 'right', fontSize: 13, fontWeight: '800' },
  reason: { fontSize: 13, marginTop: 6, lineHeight: 18 },
  gateRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', marginTop: 4 },
  gateText: { flex: 1, fontSize: 12, lineHeight: 17 },
  checkRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  checkName: { flex: 1, fontSize: 12 },
  checkVote: { width: 28, textAlign: 'center', fontSize: 13, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  cell: { width: '33.33%', paddingRight: 6 },
  cellLabel: { fontSize: 11, fontWeight: '600' },
  cellValue: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, paddingTop: 8, marginTop: 8 },
  ledgerSide: { width: 16, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  ledgerName: { fontSize: 13, fontWeight: '700' },
  right: { alignItems: 'flex-end' },
  ledgerPnl: { fontSize: 14, fontWeight: '800' },
  disclaimer: { fontSize: 12, textAlign: 'center', marginTop: 4, paddingHorizontal: 8, lineHeight: 17 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  sheet: { borderRadius: 20, padding: 20, maxHeight: '90%' },
  sheetTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  field: { width: '50%', paddingRight: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600' },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '700' },
});
