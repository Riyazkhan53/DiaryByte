import { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Header from '../components/Header';
import SyncRow from '../components/SyncRow';
import { useTheme } from '../hooks/useTheme';
import { useSyncedCollection } from '../hooks/useSyncedCollection';
import { confirmDelete } from '../utils/confirm';
import { DEFAULT_THRESHOLD, MIN_CHECKS, scoreSetup } from '../utils/setupScore';
import { setupInputsFromCandles } from '../utils/indicators';
import { MARKETS, searchStocks } from '../services/stocks';
import { fetchCandles, fetchStockQuotes } from '../services/api';

const STORAGE_KEY = '@diarybyte_setups';

// The form, in the order of the sections on screen.
const SECTIONS = [
  {
    title: 'Stock',
    fields: [
      { key: 'price', label: 'Current price' },
      { key: 'prevClose', label: 'Previous close' },
    ],
  },
  {
    title: 'Trend',
    fields: [
      { key: 'ema20', label: 'EMA 20' },
      { key: 'ema50', label: 'EMA 50' },
    ],
  },
  {
    title: 'Momentum',
    fields: [
      { key: 'rsi', label: 'RSI (14)' },
      { key: 'macd', label: 'MACD line' },
      { key: 'macdSignal', label: 'MACD signal' },
    ],
  },
  {
    title: 'Volume',
    fields: [
      { key: 'volume', label: 'Today’s volume' },
      { key: 'avgVolume', label: '20-day avg volume' },
    ],
  },
  {
    title: 'Levels',
    fields: [
      { key: 'vwap', label: 'VWAP', hint: 'Leave blank for daily or weekly charts.' },
      { key: 'swingHigh', label: 'Recent swing high' },
      { key: 'swingLow', label: 'Recent swing low' },
    ],
  },
];

const FIELD_KEYS = SECTIONS.flatMap((s) => s.fields.map((f) => f.key));
const EMPTY_FIELDS = Object.fromEntries(FIELD_KEYS.map((k) => [k, '']));

const SIGNAL_COLORS = { BUY: '#2DA44E', SELL: '#E5383B', WAIT: '#8E8E93' };

const makeId = () => `${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`;

const toNumber = (text) => parseFloat(String(text ?? '').replace(/,/g, ''));

const pctChange = (from, to) => (from > 0 && to > 0 ? ((to - from) / from) * 100 : null);

const formatWhen = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export default function SetupCheckScreen() {
  const { theme } = useTheme();
  const { items: log, synced, persist, pulling, pullInfo, pullNow } = useSyncedCollection(
    'setups',
    STORAGE_KEY
  );

  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [market, setMarket] = useState('IN');
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState(null);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [filling, setFilling] = useState(false);
  const [notice, setNotice] = useState(null);
  const [nowPrices, setNowPrices] = useState({});

  const result = scoreSetup(fields, threshold);
  const signalColor = SIGNAL_COLORS[result.signal];
  const setField = (key) => (value) => setFields((f) => ({ ...f, [key]: value }));

  // Latest prices for the stocks in the log, to compare with the price then.
  const logSymbols = [...new Set(log.map((e) => e.symbol).filter(Boolean))].sort().join(',');
  useEffect(() => {
    if (!logSymbols) return undefined;
    let cancelled = false;
    fetchStockQuotes(logSymbols.split(','))
      .then((body) => {
        if (!cancelled) setNowPrices(body?.quotes || {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [logSymbols]);

  // ------- stock search and live fill -------

  const runSearch = async () => {
    if (name.trim().length < 2) return;
    setSearching(true);
    setNotice(null);
    try {
      const found = await searchStocks(name, market);
      setResults(found);
      if (!found.length) setNotice({ error: true, text: 'No match. Try the company name or ticker.' });
    } catch (_error) {
      setNotice({ error: true, text: "Search needs your server, which isn't reachable right now. You can still type the numbers in." });
    } finally {
      setSearching(false);
    }
  };

  const pickStock = (stock) => {
    setSymbol(stock.symbol);
    setName(stock.name);
    setResults([]);
    setNotice(null);
  };

  const fillFromLiveData = async () => {
    if (!symbol) return;
    setFilling(true);
    setNotice(null);
    try {
      const data = await fetchCandles(symbol);
      const inputs = setupInputsFromCandles(data.candles);
      setFields((f) => ({
        ...f,
        ...Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, String(v)])),
        // VWAP is intraday; daily candles don't have it.
        vwap: f.vwap,
      }));
      const lastDay = data.candles[data.candles.length - 1]?.t;
      setNotice({
        error: false,
        text: `Filled from daily prices up to ${lastDay ? formatWhen(lastDay) : 'today'}. Check them against your chart before acting.`,
      });
    } catch (_error) {
      setNotice({ error: true, text: "Couldn't get price history right now. You can type the numbers in." });
    } finally {
      setFilling(false);
    }
  };

  const clearForm = () => {
    setFields(EMPTY_FIELDS);
    setName('');
    setSymbol(null);
    setResults([]);
    setNotice(null);
  };

  // ------- log -------

  const saveCheck = () => {
    const inputs = Object.fromEntries(
      FIELD_KEYS.map((k) => [k, toNumber(fields[k])]).filter(([, v]) => Number.isFinite(v))
    );
    const entry = {
      id: makeId(),
      symbol: symbol || undefined,
      name: name.trim() || symbol || 'Unnamed stock',
      market,
      price: inputs.price,
      inputs,
      threshold,
      signal: result.signal,
      bullPct: result.bullPct,
      bearPct: result.bearPct,
      createdAt: new Date().toISOString(),
    };
    persist([entry, ...log]);
    setNotice({ error: false, text: 'Saved to your log.' });
  };

  const loadCheck = (entry) => {
    setFields({
      ...EMPTY_FIELDS,
      ...Object.fromEntries(Object.entries(entry.inputs || {}).map(([k, v]) => [k, String(v)])),
    });
    setThreshold(entry.threshold || DEFAULT_THRESHOLD);
    setMarket(entry.market === 'US' ? 'US' : 'IN');
    setName(entry.name || '');
    setSymbol(entry.symbol || null);
    setResults([]);
    setNotice({ error: false, text: `Loaded the check from ${formatWhen(entry.createdAt)}.` });
  };

  const deleteCheck = (entry) =>
    confirmDelete('Delete check', `Remove the ${entry.name} check from ${formatWhen(entry.createdAt)}?`, () =>
      persist(log.filter((e) => e.id !== entry.id))
    );

  // ------- render -------

  const cardStyle = [
    styles.card,
    { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow },
  ];
  const inputStyle = [
    styles.input,
    { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text },
  ];
  const priceText = (value, mkt) =>
    `${mkt === 'US' ? '$' : '₹'}${Number(value).toLocaleString(mkt === 'US' ? 'en-US' : 'en-IN', { maximumFractionDigits: 2 })}`;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
      <Header title="Setup Check" subtitle="How many indicators agree on a stock" />

      <ScrollView style={styles.content} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <SyncRow synced={synced} pulling={pulling} pullInfo={pullInfo} onPull={pullNow} />

        {/* Signal */}
        <View style={[cardStyle, { borderColor: signalColor + '80' }]}>
          <Text style={[styles.signal, { color: signalColor }]}>{result.signal}</Text>
          <Text style={[styles.stockName, { color: theme.text }]} numberOfLines={1}>
            {name.trim() || symbol || 'No stock yet'}
            {symbol && name.trim() !== symbol ? <Text style={{ color: theme.textMuted }}> · {symbol}</Text> : null}
          </Text>
          <Text style={[styles.reason, { color: theme.textSecondary }]}>{result.reason}</Text>

          <View style={[styles.bar, { backgroundColor: theme.surfaceAlt }]}>
            <View style={[styles.barFill, { width: `${result.bearPct}%`, backgroundColor: SIGNAL_COLORS.SELL }]} />
            <View style={styles.flex} />
            <View style={[styles.barFill, { width: `${result.bullPct}%`, backgroundColor: SIGNAL_COLORS.BUY }]} />
            <View style={[styles.marker, { left: `${threshold}%`, backgroundColor: theme.text }]} />
            <View style={[styles.marker, { right: `${threshold}%`, backgroundColor: theme.text }]} />
          </View>
          <View style={styles.barLabels}>
            <Text style={[styles.barLabel, { color: SIGNAL_COLORS.SELL }]}>Bearish {result.bearPct}%</Text>
            <Text style={[styles.barLabel, { color: theme.textMuted }]}>needs {threshold}%</Text>
            <Text style={[styles.barLabel, { color: SIGNAL_COLORS.BUY }]}>Bullish {result.bullPct}%</Text>
          </View>

          {result.checks.length ? (
            <View style={[styles.checks, { borderTopColor: theme.borderNeutral }]}>
              {result.checks.map((c) => (
                <View key={c.id} style={styles.checkRow}>
                  <Ionicons
                    name={c.vote > 0 ? 'arrow-up-circle' : c.vote < 0 ? 'arrow-down-circle' : 'remove-circle-outline'}
                    size={18}
                    color={c.vote > 0 ? SIGNAL_COLORS.BUY : c.vote < 0 ? SIGNAL_COLORS.SELL : theme.textMuted}
                  />
                  <View style={styles.flex}>
                    <Text style={[styles.checkName, { color: theme.text }]}>
                      {c.name} <Text style={{ color: theme.textMuted }}>· weight {c.weight}</Text>
                    </Text>
                    <Text style={[styles.checkNote, { color: theme.textSecondary }]}>{c.note}</Text>
                  </View>
                </View>
              ))}
              <Text style={[styles.hint, { color: theme.textMuted }]}>
                {result.checksUsed} of {result.checksTotal} checks have data.
              </Text>
            </View>
          ) : (
            <Text style={[styles.hint, { color: theme.textMuted }]}>
              Fill in at least {MIN_CHECKS} indicators below to get a reading.
            </Text>
          )}
          {result.warnings.map((w) => (
            <View key={w} style={styles.warning}>
              <Ionicons name="alert-circle-outline" size={16} color="#FF9500" />
              <Text style={[styles.warningText, { color: theme.text }]}>{w}</Text>
            </View>
          ))}
        </View>

        {/* Inputs */}
        <View style={cardStyle}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Stock</Text>
          <View style={[styles.segment, { backgroundColor: theme.surfaceAlt }]}>
            {MARKETS.map((m) => (
              <TouchableOpacity
                key={m.key}
                style={[styles.segmentItem, market === m.key && { backgroundColor: theme.sheet }]}
                onPress={() => {
                  if (m.key === market) return;
                  setMarket(m.key);
                  setSymbol(null);
                  setResults([]);
                }}
              >
                <Text style={[styles.segmentText, { color: theme.text }]}>
                  {m.flag} {m.label === 'India' ? 'Indian stock' : 'US stock'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.searchRow}>
            <TextInput
              style={[inputStyle, styles.flex]}
              placeholder="Name or symbol"
              placeholderTextColor={theme.textMuted}
              value={name}
              onChangeText={(text) => {
                setName(text);
                setSymbol(null);
              }}
              onSubmitEditing={runSearch}
              returnKeyType="search"
            />
            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: theme.primary }, name.trim().length < 2 && styles.disabled]}
              onPress={runSearch}
              disabled={name.trim().length < 2 || searching}
              accessibilityLabel="Search stock"
            >
              {searching ? (
                <ActivityIndicator size="small" color={theme.onPrimary} />
              ) : (
                <Ionicons name="search" size={20} color={theme.onPrimary} />
              )}
            </TouchableOpacity>
          </View>
          {results.map((stock) => (
            <TouchableOpacity
              key={stock.symbol}
              style={[styles.result, { borderColor: theme.borderNeutral }]}
              onPress={() => pickStock(stock)}
            >
              <Text style={[styles.resultText, { color: theme.text }]}>
                {stock.name}
                <Text style={{ color: theme.textMuted }}>
                  {' '}· {stock.symbol}
                  {stock.exchange ? ` · ${stock.exchange}` : ''}
                </Text>
              </Text>
            </TouchableOpacity>
          ))}
          {symbol ? (
            <TouchableOpacity
              style={[styles.fillBtn, { borderColor: theme.primary }]}
              onPress={fillFromLiveData}
              disabled={filling}
            >
              {filling ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <Ionicons name="cloud-download-outline" size={18} color={theme.primary} />
              )}
              <Text style={[styles.fillText, { color: theme.primary }]}>Fill from live data ({symbol})</Text>
            </TouchableOpacity>
          ) : (
            <Text style={[styles.hint, styles.hintTop, { color: theme.textMuted }]}>
              Search and pick a stock to fill the indicators from its daily prices, or type them in
              from your chart.
            </Text>
          )}
          {notice ? (
            <Text style={[styles.notice, { color: notice.error ? theme.danger : theme.textSecondary }]}>
              {notice.text}
            </Text>
          ) : null}

          {SECTIONS.map((section, si) => (
            <View key={section.title}>
              {si > 0 ? <Text style={[styles.sectionTitle, styles.sectionGap, { color: theme.text }]}>{section.title}</Text> : null}
              <View style={styles.fieldGrid}>
                {section.fields.map((f) => (
                  <View key={f.key} style={styles.field}>
                    <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{f.label}</Text>
                    <TextInput
                      style={inputStyle}
                      keyboardType="decimal-pad"
                      value={fields[f.key]}
                      onChangeText={setField(f.key)}
                      placeholder="—"
                      placeholderTextColor={theme.textMuted}
                      accessibilityLabel={f.label}
                    />
                    {f.hint ? <Text style={[styles.hint, { color: theme.textMuted }]}>{f.hint}</Text> : null}
                  </View>
                ))}
              </View>
            </View>
          ))}

          <Text style={[styles.sectionTitle, styles.sectionGap, { color: theme.text }]}>Confirmation needed</Text>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={[styles.stepBtn, { backgroundColor: theme.surfaceAlt }]}
              onPress={() => setThreshold((t) => Math.max(50, t - 5))}
              accessibilityLabel="Lower confirmation needed"
            >
              <Ionicons name="remove" size={20} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.stepValue, { color: theme.text }]}>{threshold}%</Text>
            <TouchableOpacity
              style={[styles.stepBtn, { backgroundColor: theme.surfaceAlt }]}
              onPress={() => setThreshold((t) => Math.min(90, t + 5))}
              accessibilityLabel="Raise confirmation needed"
            >
              <Ionicons name="add" size={20} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.hint, styles.flex, { color: theme.textMuted }]}>
              Share of weighted checks that must agree before it says BUY or SELL.
            </Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.secondaryBtn, { backgroundColor: theme.surfaceAlt }]} onPress={clearForm}>
              <Text style={[styles.secondaryText, { color: theme.textSecondary }]}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: theme.primary }, result.checksUsed < MIN_CHECKS && styles.disabled]}
              onPress={saveCheck}
              disabled={result.checksUsed < MIN_CHECKS}
            >
              <Text style={[styles.primaryText, { color: theme.onPrimary }]}>Save to log</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Log */}
        <Text style={[styles.logTitle, { color: theme.text }]}>Your log</Text>
        <Text style={[styles.hint, styles.logHint, { color: theme.textMuted }]}>
          Saved checks show up here so you can compare them with what the stock did next.
        </Text>
        {log.map((entry) => {
          const now = entry.symbol ? nowPrices[entry.symbol]?.price : null;
          const change = pctChange(entry.price, now);
          const color = SIGNAL_COLORS[entry.signal] || theme.textMuted;
          // Did the price go the way the signal pointed?
          const agreed =
            change == null || entry.signal === 'WAIT' ? null : entry.signal === 'BUY' ? change > 0 : change < 0;
          return (
            <TouchableOpacity key={entry.id} style={[cardStyle, styles.logRow]} onPress={() => loadCheck(entry)}>
              <View style={[styles.badge, { backgroundColor: color + '26' }]}>
                <Text style={[styles.badgeText, { color }]}>{entry.signal}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={[styles.logName, { color: theme.text }]} numberOfLines={1}>
                  {entry.name}
                </Text>
                <Text style={[styles.logSub, { color: theme.textSecondary }]} numberOfLines={3}>
                  {formatWhen(entry.createdAt)} · bull {entry.bullPct}% / bear {entry.bearPct}%
                  {entry.price ? ` · at ${priceText(entry.price, entry.market)}` : ''}
                  {now ? ` → now ${priceText(now, entry.market)}` : ''}
                  {change != null ? (
                    <Text style={{ color: change >= 0 ? SIGNAL_COLORS.BUY : SIGNAL_COLORS.SELL }}>
                      {' '}({change >= 0 ? '+' : ''}
                      {change.toFixed(1)}%)
                    </Text>
                  ) : null}
                  {agreed != null ? (agreed ? ' · went the signal’s way' : ' · went against it') : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => deleteCheck(entry)} style={styles.deleteBtn} accessibilityLabel={`Delete ${entry.name} check`}>
                <Ionicons name="trash-outline" size={18} color={theme.danger} />
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}

        <Text style={[styles.disclaimer, { color: theme.textMuted }]}>
          This tool counts how many indicators agree. It doesn’t predict price and isn’t financial
          advice. Always use a stop-loss.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  scroll: { paddingBottom: 48 },
  flex: { flex: 1, minWidth: 0 },
  card: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  signal: { fontSize: 34, fontWeight: '800', letterSpacing: 1 },
  stockName: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  reason: { fontSize: 13, marginTop: 6, lineHeight: 18 },
  bar: { height: 10, borderRadius: 5, flexDirection: 'row', overflow: 'hidden', marginTop: 14 },
  barFill: { height: 10 },
  marker: { position: 'absolute', top: 0, bottom: 0, width: 2, opacity: 0.5 },
  barLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  barLabel: { fontSize: 12, fontWeight: '700' },
  checks: { borderTopWidth: 1, marginTop: 14, paddingTop: 12, gap: 10 },
  checkRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  checkName: { fontSize: 13, fontWeight: '600' },
  checkNote: { fontSize: 12, marginTop: 1 },
  warning: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', marginTop: 10 },
  warningText: { flex: 1, fontSize: 12, lineHeight: 17 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  sectionGap: { marginTop: 16 },
  segment: { flexDirection: 'row', borderRadius: 12, padding: 3, marginBottom: 10 },
  segmentItem: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  segmentText: { fontSize: 13, fontWeight: '600' },
  searchRow: { flexDirection: 'row', gap: 8 },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  iconBtn: { width: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  result: { borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, marginTop: 6 },
  resultText: { fontSize: 13 },
  fillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    marginTop: 10,
  },
  fillText: { fontSize: 14, fontWeight: '700' },
  notice: { fontSize: 12, marginTop: 8, lineHeight: 17 },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  field: { flexGrow: 1, flexBasis: '45%', minWidth: 0 },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  hint: { fontSize: 12, marginTop: 6, lineHeight: 17 },
  hintTop: { marginTop: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  stepValue: { fontSize: 20, fontWeight: '800', minWidth: 52, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 18 },
  secondaryBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  secondaryText: { fontSize: 15, fontWeight: '600' },
  primaryBtn: { flex: 2, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  primaryText: { fontSize: 15, fontWeight: '700' },
  logTitle: { fontSize: 18, fontWeight: '700', marginTop: 4 },
  logHint: { marginBottom: 10 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginBottom: 10 },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  badgeText: { fontSize: 12, fontWeight: '800' },
  logName: { fontSize: 15, fontWeight: '700' },
  logSub: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  deleteBtn: { padding: 6 },
  disclaimer: { fontSize: 12, textAlign: 'center', marginTop: 16, lineHeight: 17, paddingHorizontal: 8 },
});
