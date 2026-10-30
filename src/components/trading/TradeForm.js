import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DatePicker from '../DatePicker';
import { useTheme } from '../../hooks/useTheme';
import { todayKey } from '../../utils/autopay';
import { plannedRR, riskPerShare } from '../../utils/trades';
import { MIN_REWARD_RISK, sizeForStop } from '../../engine/risk.js';
import { MARKETS, searchStocks } from '../../services/stocks';
import { fetchStockQuotes } from '../../services/api';
import { formatMoney } from './format';

const toNum = (text) => parseFloat(String(text ?? '').replace(/,/g, ''));
const str = (n) => (n != null && Number.isFinite(Number(n)) ? String(n) : '');

/**
 * Add or edit a paper trade. `initial` is an existing trade, a draft from a
 * Setup Check, or null for a blank one. Remount with a new `key` to reset.
 */
export default function TradeForm({ visible, initial, onSave, onClose, config }) {
  const { theme } = useTheme();
  const [market, setMarket] = useState(initial?.market === 'US' ? 'US' : 'IN');
  const [name, setName] = useState(initial?.name || '');
  const [symbol, setSymbol] = useState(initial?.symbol || null);
  const [side, setSide] = useState(initial?.side || 'long');
  const [entryPrice, setEntryPrice] = useState(str(initial?.entryPrice));
  const [quantity, setQuantity] = useState(str(initial?.quantity));
  const [stopLoss, setStopLoss] = useState(str(initial?.stopLoss));
  const [target, setTarget] = useState(str(initial?.target));
  const [entryDate, setEntryDate] = useState(initial?.entryDate || todayKey());
  const [plan, setPlan] = useState(initial?.plan || '');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState(null);

  const draft = {
    side,
    entryPrice: toNum(entryPrice),
    quantity: toNum(quantity),
    stopLoss: toNum(stopLoss),
    target: toNum(target),
  };
  const risk = riskPerShare(draft);
  const rr = plannedRR(draft);
  const stopWrongSide =
    draft.stopLoss > 0 && draft.entryPrice > 0 && !risk;
  const valid = name.trim() && draft.entryPrice > 0 && draft.quantity > 0 && !stopWrongSide;

  // Indian trades: quantity from the risk budget, charges and cash (settings in Signals).
  const sizing =
    market === 'IN' && draft.entryPrice > 0 && draft.stopLoss > 0
      ? sizeForStop({ side, entry: draft.entryPrice, stop: draft.stopLoss, config })
      : null;

  const runSearch = async () => {
    if (name.trim().length < 2) return;
    setSearching(true);
    setNotice(null);
    try {
      const found = await searchStocks(name, market);
      setResults(found);
      if (!found.length) setNotice('No match. Try the company name or ticker.');
    } catch (_error) {
      setNotice("Search needs your server, which isn't reachable right now. Type the name and prices in.");
    } finally {
      setSearching(false);
    }
  };

  const pickStock = async (stock) => {
    setSymbol(stock.symbol);
    setName(stock.name);
    setResults([]);
    try {
      const body = await fetchStockQuotes([stock.symbol]);
      const price = body?.quotes?.[stock.symbol]?.price;
      if (price > 0) setEntryPrice((p) => p || String(price));
    } catch (_error) {
      // Entry price can be typed in.
    }
  };

  const save = () => {
    if (!valid) return;
    onSave({
      ...initial,
      market,
      name: name.trim(),
      symbol: symbol || undefined,
      side,
      entryPrice: draft.entryPrice,
      quantity: draft.quantity,
      stopLoss: draft.stopLoss > 0 ? draft.stopLoss : undefined,
      target: draft.target > 0 ? draft.target : undefined,
      entryDate,
      plan: plan.trim() || undefined,
    });
  };

  const inputStyle = [
    styles.input,
    { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text },
  ];
  const money = (n) => formatMoney(n, market);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: theme.sheet }]}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={[styles.title, { color: theme.text }]}>
              {initial?.id ? 'Edit paper trade' : 'New paper trade'}
            </Text>
            {initial?.setupSignal ? (
              <Text style={[styles.sub, { color: theme.textSecondary }]}>
                From a signal: {initial.setupSignal} (bull {initial.setupBullPct}% / bear{' '}
                {initial.setupBearPct}%)
              </Text>
            ) : null}

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
                    {m.flag} {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.row}>
              <TextInput
                style={[inputStyle, styles.flex]}
                placeholder="Stock name or symbol"
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
            {symbol ? (
              <Text style={[styles.hint, { color: theme.textMuted }]}>
                {symbol} · live price shown in Open trades
              </Text>
            ) : null}
            {results.map((stock) => (
              <TouchableOpacity
                key={stock.symbol}
                style={[styles.result, { borderColor: theme.borderNeutral }]}
                onPress={() => pickStock(stock)}
              >
                <Text style={[styles.resultText, { color: theme.text }]}>
                  {stock.name}
                  <Text style={{ color: theme.textMuted }}> · {stock.symbol}</Text>
                </Text>
              </TouchableOpacity>
            ))}
            {notice ? <Text style={[styles.hint, { color: theme.danger }]}>{notice}</Text> : null}

            <View style={[styles.segment, styles.gap, { backgroundColor: theme.surfaceAlt }]}>
              {[
                { key: 'long', label: 'Long (buy)' },
                { key: 'short', label: 'Short (sell)' },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.segmentItem, side === opt.key && { backgroundColor: theme.sheet }]}
                  onPress={() => setSide(opt.key)}
                >
                  <Text style={[styles.segmentText, { color: theme.text }]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.grid}>
              {[
                { label: `Entry price (${market === 'US' ? '$' : '₹'})`, value: entryPrice, set: setEntryPrice },
                { label: 'Quantity', value: quantity, set: setQuantity },
                { label: 'Stop-loss', value: stopLoss, set: setStopLoss },
                { label: 'Target', value: target, set: setTarget },
              ].map((f) => (
                <View key={f.label} style={styles.field}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>{f.label}</Text>
                  <TextInput
                    style={inputStyle}
                    keyboardType="decimal-pad"
                    value={f.value}
                    onChangeText={f.set}
                    placeholder="—"
                    placeholderTextColor={theme.textMuted}
                    accessibilityLabel={f.label}
                  />
                </View>
              ))}
            </View>
            <Text style={[styles.hint, { color: stopWrongSide ? theme.danger : theme.textMuted }]}>
              {stopWrongSide
                ? `For a ${side} trade the stop-loss must be ${side === 'long' ? 'below' : 'above'} the entry.`
                : risk && draft.quantity > 0
                  ? `Risking ${money(risk * draft.quantity)} (${((risk / draft.entryPrice) * 100).toFixed(1)}%)${rr ? ` to make ${money(rr * risk * draft.quantity)} · reward:risk ${rr}:1` : ''}.${rr && rr < MIN_REWARD_RISK ? ` Below 1:${MIN_REWARD_RISK}: the engine would set the target further out.` : ''}`
                  : 'Add a stop-loss to track risk and results in R (multiples of what you risked).'}
            </Text>

            {sizing ? (
              <View style={[styles.sizeBox, { backgroundColor: theme.surfaceAlt }]}>
                <Text style={[styles.hint, styles.noTop, { color: sizing.ok ? theme.text : theme.danger }]}>
                  {sizing.ok
                    ? `Risk budget ₹${sizing.riskBudget}: up to ${sizing.quantity} share${sizing.quantity > 1 ? 's' : ''}${sizing.capped ? ` (your max per trade; the budget allows more)` : ''} (max loss ₹${sizing.maxLoss} incl. ~₹${sizing.costs} charges, ₹${sizing.cashUsed} cash).`
                    : `No trade: ${sizing.reason}.`}
                </Text>
                {sizing.ok && sizing.quantity !== draft.quantity ? (
                  <TouchableOpacity onPress={() => setQuantity(String(sizing.quantity))}>
                    <Text style={[styles.sizeLink, { color: theme.primary }]}>Use {sizing.quantity}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            <Text style={[styles.label, styles.gap, { color: theme.textSecondary }]}>Entry date</Text>
            <DatePicker value={entryDate} onChange={setEntryDate} />

            <TextInput
              style={[inputStyle, styles.note]}
              placeholder="Plan: why you're taking it, when you'd exit"
              placeholderTextColor={theme.textMuted}
              value={plan}
              onChangeText={setPlan}
              multiline
            />

            <View style={styles.actions}>
              <TouchableOpacity style={[styles.cancel, { backgroundColor: theme.surfaceAlt }]} onPress={onClose}>
                <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.save, { backgroundColor: theme.primary }, !valid && styles.disabled]}
                onPress={save}
                disabled={!valid}
              >
                <Text style={[styles.saveText, { color: theme.onPrimary }]}>
                  {initial?.id ? 'Update' : 'Open trade'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  sheet: { borderRadius: 20, padding: 20, maxHeight: '90%' },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 6 },
  sub: { fontSize: 13, marginBottom: 10 },
  segment: { flexDirection: 'row', borderRadius: 12, padding: 3, marginVertical: 8 },
  segmentItem: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  segmentText: { fontSize: 13, fontWeight: '600' },
  gap: { marginTop: 12 },
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  iconBtn: { width: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  result: { borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, marginTop: 6 },
  resultText: { fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  field: { flexGrow: 1, flexBasis: '45%', minWidth: 0 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  hint: { fontSize: 12, marginTop: 6, lineHeight: 17 },
  note: { minHeight: 64, textAlignVertical: 'top', marginTop: 12 },
  sizeBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, padding: 10, marginTop: 8 },
  sizeLink: { fontSize: 13, fontWeight: '700' },
  noTop: { marginTop: 0, flex: 1 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600' },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '700' },
});
