import { useEffect, useMemo, useState } from 'react';
import { Modal, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Header from '../../components/Header';
import SyncRow from '../../components/SyncRow';
import HScroll from '../../components/HScroll';
import { useTheme } from '../../hooks/useTheme';
import { useSyncedCollection } from '../../hooks/useSyncedCollection';
import { fetchStockQuotes } from '../../services/api';
import { confirmDelete } from '../../utils/confirm';
import { todayKey } from '../../utils/autopay';
import {
  DEFAULT_FNO_SETTINGS,
  FNO_STORAGE_KEY,
  UNDERLYINGS,
  VIX_QUOTE,
  atmStrike,
  blackScholes,
  breakeven,
  capitalNeeded,
  expiries,
  fnoCharges,
  fnoStats,
  hitLevel,
  maxLoss,
  moneyness,
  pnlOf,
  priceNow,
  underlyingOf,
  yearsTo,
} from '../../utils/fno';

const GREEN = '#2DA44E';
const RED = '#E5383B';
const AMBER = '#F59E0B';
const makeId = () => `${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`;
const inr = (n) => (n == null || !Number.isFinite(Number(n)) ? '—' : `${n < 0 ? '−' : ''}₹${Math.abs(Math.round(Number(n) * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
const signed = (n) => (n == null ? '—' : `${n > 0 ? '+' : ''}${inr(n)}`);
const num = (t) => {
  const v = parseFloat(String(t ?? '').replace(/,/g, ''));
  return Number.isFinite(v) ? v : null;
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (k) => (k ? `${Number(k.slice(8))} ${MONTHS[Number(k.slice(5, 7)) - 1]}` : '');
const KIND_LABEL = { FUT: 'Futures', CE: 'Call (CE)', PE: 'Put (PE)' };

const TABS = [
  { key: 'build', label: 'New trade', icon: 'add-circle-outline' },
  { key: 'open', label: 'Open', icon: 'pulse-outline' },
  { key: 'done', label: 'Done', icon: 'checkmark-done-outline' },
  { key: 'learn', label: 'Learn', icon: 'school-outline' },
];

const LEARN = [
  ['Futures', 'An agreement to buy or sell the index at a fixed price on the expiry date. Profit and loss move point for point with the index × lot size. Needs margin (about 12% of the contract value) and the loss has no fixed limit.'],
  ['Call option (CE)', 'The right, not the obligation, to buy at the strike price. Buyers gain when the index rises above strike + premium; the most a buyer can lose is the premium paid.'],
  ['Put option (PE)', 'The right to sell at the strike price. Buyers gain when the index falls below strike − premium. Useful as a hedge against a fall.'],
  ['Premium', 'The price of an option, per unit. You pay it when buying and receive it when selling. Total = premium × lot size × lots.'],
  ['Strike, ATM / ITM / OTM', 'The strike is the price the option refers to. ATM: strike ≈ index. ITM: already has value (call strike below the index, put strike above). OTM: no value yet, cheaper, needs a bigger move.'],
  ['Lot size & expiry', 'F&O trade in lots (Nifty 75 units, Bank Nifty 35…; NSE changes these). Every contract has an expiry: Nifty weekly and monthly (Tuesdays), Bank Nifty monthly. On expiry an option is worth only its intrinsic value.'],
  ['Greeks', 'Delta: how much the premium moves for a 1-point index move. Theta: premium lost per day to time decay (bad for buyers, good for sellers). Vega: premium change for a 1% change in volatility.'],
  ['Time decay', 'Option premiums melt as expiry nears, fastest in the last week. Buying cheap far-OTM options close to expiry usually loses money.'],
  ['Buying vs selling options', 'Buying: limited loss (the premium), lower win rate. Selling: you keep the premium if the index stays away, but losses can be large; needs big margin. Learn with buying first.'],
  ['Risk rules', 'Decide the stop before entering, risk 1–2% of capital per trade, avoid averaging losers, and keep a journal. Most F&O traders lose money (SEBI study): paper-trade until you are consistently profitable.'],
];

function Chip({ label, on, onPress, color = GREEN, theme, a11y }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={a11y || label}
      style={[styles.chip, { borderColor: on ? color : theme.borderNeutral, backgroundColor: on ? color + '22' : theme.surface }]}
    >
      <Text style={[styles.chipText, { color: on ? color : theme.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Stepper({ label, value, onMinus, onPlus, theme, wide }) {
  return (
    <View style={[styles.stepper, { borderColor: theme.borderNeutral, backgroundColor: theme.surfaceAlt }, wide && styles.flex]}>
      <TouchableOpacity onPress={onMinus} style={styles.stepBtn} accessibilityLabel={`Lower ${label}`}>
        <Ionicons name="remove" size={18} color={theme.text} />
      </TouchableOpacity>
      <View style={styles.stepMid}>
        <Text style={[styles.stepLabel, { color: theme.textMuted }]}>{label}</Text>
        <Text style={[styles.stepValue, { color: theme.text }]}>{value}</Text>
      </View>
      <TouchableOpacity onPress={onPlus} style={styles.stepBtn} accessibilityLabel={`Raise ${label}`}>
        <Ionicons name="add" size={18} color={theme.text} />
      </TouchableOpacity>
    </View>
  );
}

function Row({ k, v, color, theme }) {
  return (
    <View style={styles.kv}>
      <Text style={[styles.kvKey, { color: theme.textSecondary }]}>{k}</Text>
      <Text style={[styles.kvVal, { color: color || theme.text }]}>{v}</Text>
    </View>
  );
}

export default function FnoScreen() {
  const { theme } = useTheme();
  const { items: trades, persist, synced, pulling, pullInfo, pullNow } = useSyncedCollection('fnotrades', FNO_STORAGE_KEY);
  const { items: settingDocs, persist: persistSettings } = useSyncedCollection('fnosettings', '@diarybyte_fnosettings');
  const settings = useMemo(() => ({ ...DEFAULT_FNO_SETTINGS, ...(settingDocs[0] || {}) }), [settingDocs]);
  const saveSettings = (changes) => persistSettings([{ ...settings, ...changes, id: 'default', updatedAt: new Date().toISOString() }]);

  const [tab, setTab] = useState('build');
  const [quotes, setQuotes] = useState({});
  const [quoteState, setQuoteState] = useState({ loading: true, error: null, at: 0 });
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Live index levels and India VIX, every 30 s while the screen is open.
  useEffect(() => {
    let live = true;
    const load = () =>
      fetchStockQuotes([...UNDERLYINGS.map((u) => u.quote), VIX_QUOTE])
        .then((b) => live && (setQuotes(b?.quotes || {}), setQuoteState({ loading: false, error: null, at: Date.now() })))
        .catch(() => live && setQuoteState((s) => ({ ...s, loading: false, error: "Couldn't reach your server for live prices." })));
    load();
    const timer = setInterval(load, 30000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  const spotOf = (key) => quotes[underlyingOf(key).quote]?.price ?? null;
  const vix = quotes[VIX_QUOTE]?.price ?? null;

  const open = trades.filter((t) => t.status !== 'closed');
  const closed = trades.filter((t) => t.status === 'closed').sort((a, b) => String(b.exitAt || '').localeCompare(String(a.exitAt || '')));

  // Auto-close: stop / target hit on the current price, or settled at expiry.
  useEffect(() => {
    if (!settings.autoClose || !open.length || !quoteState.at) return;
    const now = Date.now();
    const changes = [];
    open.forEach((t) => {
      if (t.autoClose === false) return;
      const { price, source } = priceNow(t, spotOf(t.underlying), { now, r: settings.riskFreePct / 100 });
      if (price == null) return;
      const hit = source === 'expiry' ? 'expiry' : hitLevel(t, price);
      if (!hit) return;
      changes.push({ id: t.id, exitPrice: hit === 'stop' ? t.stop : hit === 'target' ? t.target : price, exitReason: hit });
    });
    if (!changes.length) return;
    const at = new Date().toISOString();
    persist(trades.map((t) => {
      const c = changes.find((x) => x.id === t.id);
      return c ? { ...t, status: 'closed', exitPrice: c.exitPrice, exitReason: c.exitReason, exitAt: at, closedBy: 'auto', updatedAt: at } : t;
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-checked whenever prices refresh
  }, [quoteState.at]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
      <Header title="F&O Paper Trading" subtitle="Learn futures & options with play money" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SyncRow synced={synced} pulling={pulling} pullInfo={pullInfo} onPull={pullNow} />
        <View style={[styles.marketBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <HScroll contentContainerStyle={styles.marketRow}>
            {UNDERLYINGS.map((u) => (
              <Text key={u.key} style={[styles.marketItem, { color: theme.text }]}>
                <Text style={{ color: theme.textMuted }}>{u.name} </Text>
                {spotOf(u.key) ? Math.round(spotOf(u.key)).toLocaleString('en-IN') : '—'}
              </Text>
            ))}
            <Text style={[styles.marketItem, { color: theme.text }]}>
              <Text style={{ color: theme.textMuted }}>India VIX </Text>
              {vix ? vix.toFixed(2) : '—'}
            </Text>
          </HScroll>
          <TouchableOpacity onPress={() => setSettingsOpen(true)} style={styles.gear} accessibilityLabel="F&O settings">
            <Ionicons name="settings-outline" size={20} color={theme.primary} />
          </TouchableOpacity>
        </View>
        {quoteState.error ? <Text style={[styles.hint, { color: RED }]}>{quoteState.error}</Text> : null}

        <View style={[styles.tabs, { backgroundColor: theme.surfaceAlt }]}>
          {TABS.map((t) => (
            <TouchableOpacity key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key && { backgroundColor: theme.sheet }]} accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }}>
              <Ionicons name={t.icon} size={15} color={tab === t.key ? theme.primary : theme.textSecondary} />
              <Text style={[styles.tabText, { color: tab === t.key ? theme.text : theme.textSecondary }]}>
                {t.label}
                {t.key === 'open' && open.length ? ` (${open.length})` : t.key === 'done' && closed.length ? ` (${closed.length})` : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'build' ? (
          <Builder
            theme={theme}
            settings={settings}
            spotOf={spotOf}
            vix={vix}
            loading={quoteState.loading}
            openCount={open.length}
            onOpen={(t) => {
              persist([{ ...t, id: makeId(), status: 'open', createdAt: new Date().toISOString() }, ...trades]);
              setTab('open');
            }}
          />
        ) : null}
        {tab === 'open' ? <OpenList theme={theme} trades={open} all={trades} persist={persist} spotOf={spotOf} settings={settings} /> : null}
        {tab === 'done' ? <DoneList theme={theme} trades={closed} all={trades} persist={persist} /> : null}
        {tab === 'learn' ? (
          <View>
            {LEARN.map(([t, d]) => (
              <View key={t} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>{t}</Text>
                <Text style={[styles.body, { color: theme.textSecondary }]}>{d}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <Text style={[styles.hint, styles.disclaimer, { color: theme.textMuted }]}>
          Paper trading only: nothing here places orders. Option premiums are Black-Scholes estimates from the index level and the volatility you set (India VIX by default), so they can differ from your broker; type the real premium when you have it. Charges are estimates.
        </Text>
      </ScrollView>
      <SettingsSheet visible={settingsOpen} settings={settings} onSave={(c) => (saveSettings(c), setSettingsOpen(false))} onClose={() => setSettingsOpen(false)} theme={theme} />
    </SafeAreaView>
  );
}

function Builder({ theme, settings, spotOf, vix, loading, onOpen }) {
  const [uKey, setUKey] = useState('NIFTY');
  const u = underlyingOf(uKey, settings);
  const spot = spotOf(uKey);
  const today = todayKey();
  const exps = expiries(u, today);
  const [kind, setKind] = useState('CE');
  const [side, setSide] = useState('buy');
  const [expiry, setExpiry] = useState(null);
  const [strikeOffset, setStrikeOffset] = useState(0); // steps from ATM
  const [lots, setLots] = useState(1);
  const [ivText, setIvText] = useState('');
  const [priceText, setPriceText] = useState('');
  const [stopText, setStopText] = useState('');
  const [targetText, setTargetText] = useState('');
  const [note, setNote] = useState('');

  const exp = exps.find((e) => e.date === expiry)?.date || exps[0]?.date;
  const atm = spot ? atmStrike(spot, u.step) : null;
  const strike = atm != null ? atm + strikeOffset * u.step : null;
  const iv = num(ivText) ?? (vix ? Math.round(vix * 10) / 10 : 15);
  const est =
    kind === 'FUT'
      ? spot
        ? { price: Math.round(spot * (1 + (settings.riskFreePct / 100) * yearsTo(exp)) * 100) / 100 }
        : null
      : spot && strike
        ? blackScholes({ spot, strike, years: yearsTo(exp), vol: iv / 100, r: settings.riskFreePct / 100, kind })
        : null;
  const price = num(priceText) ?? est?.price ?? null;
  const qty = lots * u.lot;
  const stop = num(stopText);
  const target = num(targetText);
  const needed = price ? capitalNeeded({ kind, side, qty, price, spot, marginPct: settings.marginPct }) : null;
  const loss = price ? maxLoss({ kind, side, price, stop, qty }) : null;
  const reward = price && target ? Math.round((side === 'sell' ? price - target : target - price) * qty) : null;
  const charges = price ? fnoCharges({ kind, side, qty, entry: price, exit: target || price }) : null;
  const budget = Math.round((settings.capital * settings.riskPct) / 100);
  const be = price && kind !== 'FUT' ? breakeven({ kind, side, strike, price }) : null;
  const stopWrong = stop > 0 && price && (side === 'buy' ? stop >= price : stop <= price);
  const targetWrong = target > 0 && price && (side === 'buy' ? target <= price : target >= price);
  const quick = (pct, isStop) => {
    if (!price) return;
    const sign = (side === 'buy') === isStop ? -1 : 1;
    const v = Math.max(0.05, Math.round(price * (1 + (sign * pct) / 100) * 20) / 20);
    (isStop ? setStopText : setTargetText)(String(v));
  };
  const reset = () => {
    setStrikeOffset(0);
    setPriceText('');
    setStopText('');
    setTargetText('');
  };
  const warnings = [];
  if (loss == null && (side === 'sell' || kind === 'FUT')) warnings.push('No stop-loss: futures and option selling can lose far more than you planned. Set a stop.');
  if (loss != null && loss > budget) warnings.push(`Max loss ${inr(loss)} is over your ${settings.riskPct}% risk budget (${inr(budget)}). Use fewer lots or a tighter stop.`);
  if (needed != null && needed > settings.capital) warnings.push(`Needs ${inr(needed)}, more than your ${inr(settings.capital)} paper capital.`);
  if (kind !== 'FUT' && side === 'buy' && exp && yearsTo(exp) * 365 < 2) warnings.push('Expiry is very close: time decay eats option premiums fastest now.');
  if (kind !== 'FUT' && strike && spot && Math.abs(strike - spot) / spot > 0.03) warnings.push('Far from the money: cheap, but needs a big move to pay off.');

  const valid = price > 0 && exp && (kind === 'FUT' || strike) && !stopWrong && !targetWrong;
  const submit = () =>
    valid &&
    onOpen({
      underlying: uKey,
      kind,
      side,
      strike: kind === 'FUT' ? null : strike,
      expiry: exp,
      lots,
      lotSize: u.lot,
      entryPrice: price,
      entrySpot: spot,
      iv,
      stop: stop > 0 ? stop : null,
      target: target > 0 ? target : null,
      autoClose: settings.autoClose,
      priceSource: num(priceText) != null ? 'typed' : 'estimate',
      note: note.trim() || null,
    });

  return (
    <View>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Underlying</Text>
        <View style={styles.wrap}>
          {UNDERLYINGS.map((x) => (
            <Chip key={x.key} theme={theme} label={x.name} on={uKey === x.key} onPress={() => (setUKey(x.key), setExpiry(null), reset())} />
          ))}
        </View>
        <Text style={[styles.hint, { color: theme.textMuted }]}>
          {spot ? `Now ${spot.toLocaleString('en-IN')} · lot ${u.lot} · strikes every ${u.step}` : loading ? 'Getting the live level…' : 'No live level: try again in a minute'}
        </Text>

        <Text style={[styles.label, { color: theme.textSecondary }]}>Instrument</Text>
        <View style={styles.wrap}>
          {['CE', 'PE', 'FUT'].map((k) => (
            <Chip key={k} theme={theme} label={KIND_LABEL[k]} on={kind === k} color={k === 'PE' ? RED : k === 'CE' ? GREEN : '#5C6BC0'} onPress={() => (setKind(k), reset())} />
          ))}
        </View>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Buy or sell</Text>
        <View style={styles.wrap}>
          <Chip theme={theme} label={kind === 'FUT' ? 'Buy (long)' : 'Buy'} on={side === 'buy'} onPress={() => (setSide('buy'), setStopText(''), setTargetText(''))} />
          <Chip theme={theme} label={kind === 'FUT' ? 'Sell (short)' : 'Sell (write)'} on={side === 'sell'} color={RED} onPress={() => (setSide('sell'), setStopText(''), setTargetText(''))} />
        </View>
        {kind !== 'FUT' && side === 'sell' ? <Text style={[styles.hint, { color: AMBER }]}>Option selling: limited profit, large possible loss and big margin. Learn with buying first.</Text> : null}

        <Text style={[styles.label, { color: theme.textSecondary }]}>Expiry</Text>
        <View style={styles.wrap}>
          {exps.map((e) => (
            <Chip key={e.date} theme={theme} label={`${shortDate(e.date)}${e.monthly ? ' · M' : ''}`} on={exp === e.date} onPress={() => (setExpiry(e.date), setPriceText(''))} a11y={`Expiry ${e.date}${e.monthly ? ' monthly' : ' weekly'}`} />
          ))}
        </View>

        <View style={styles.rowGap}>
          {kind !== 'FUT' ? (
            <Stepper
              theme={theme}
              wide
              label={`Strike ${strike != null ? moneyness(kind, strike, spot, u.step) : ''}`}
              value={strike != null ? strike.toLocaleString('en-IN') : '—'}
              onMinus={() => (setStrikeOffset((x) => x - 1), setPriceText(''))}
              onPlus={() => (setStrikeOffset((x) => x + 1), setPriceText(''))}
            />
          ) : null}
          <Stepper theme={theme} wide label={`Lots (${qty} qty)`} value={String(lots)} onMinus={() => setLots((x) => Math.max(1, x - 1))} onPlus={() => setLots((x) => Math.min(50, x + 1))} />
        </View>

        <View style={styles.rowGap}>
          <View style={styles.flex}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>{kind === 'FUT' ? 'Futures price' : 'Premium'} (₹)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
              value={priceText}
              onChangeText={setPriceText}
              keyboardType="decimal-pad"
              placeholder={est?.price ? `${est.price} (est.)` : '—'}
              placeholderTextColor={theme.textMuted}
            />
          </View>
          {kind !== 'FUT' ? (
            <View style={styles.flex}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>Volatility % {vix && !ivText ? '(VIX)' : ''}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                value={ivText}
                onChangeText={setIvText}
                keyboardType="decimal-pad"
                placeholder={String(iv)}
                placeholderTextColor={theme.textMuted}
              />
            </View>
          ) : null}
        </View>
        <Text style={[styles.hint, { color: theme.textMuted }]}>Leave the price empty to use the estimate, or type the live premium from your broker app.</Text>

        <View style={styles.rowGap}>
          <View style={styles.flex}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Stop-loss (₹)</Text>
            <TextInput style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: stopWrong ? RED : theme.borderNeutral, color: theme.text }]} value={stopText} onChangeText={setStopText} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={theme.textMuted} />
            <View style={styles.wrapTight}>
              {[20, 30, 50].map((p) => (
                <Chip key={p} theme={theme} label={`${p}%`} on={false} color={RED} onPress={() => quick(p, true)} a11y={`Stop ${p}% away`} />
              ))}
            </View>
          </View>
          <View style={styles.flex}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Target (₹)</Text>
            <TextInput style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: targetWrong ? RED : theme.borderNeutral, color: theme.text }]} value={targetText} onChangeText={setTargetText} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={theme.textMuted} />
            <View style={styles.wrapTight}>
              {[30, 50, 100].map((p) => (
                <Chip key={p} theme={theme} label={`${p}%`} on={false} onPress={() => quick(p, false)} a11y={`Target ${p}% away`} />
              ))}
            </View>
          </View>
        </View>
        {stopWrong || targetWrong ? <Text style={[styles.hint, { color: RED }]}>{side === 'buy' ? 'For a buy, the stop goes below the price and the target above.' : 'For a sell, the stop goes above the price and the target below.'}</Text> : null}
        <TextInput style={[styles.input, styles.gap, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]} value={note} onChangeText={setNote} placeholder="Why this trade? (your plan, for the journal)" placeholderTextColor={theme.textMuted} />
      </View>

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Trade summary</Text>
        <Row theme={theme} k="Contract" v={`${u.name} ${kind === 'FUT' ? 'FUT' : `${strike ?? '—'} ${kind}`} · ${shortDate(exp)}`} />
        <Row theme={theme} k={side === 'buy' ? (kind === 'FUT' ? 'Buy at' : 'Premium paid') : kind === 'FUT' ? 'Sell at' : 'Premium received'} v={price ? `${inr(price)} × ${qty} = ${inr(price * qty)}` : '—'} />
        {kind === 'FUT' ? <Row theme={theme} k="Contract value" v={price ? inr(price * qty) : '—'} /> : null}
        <Row theme={theme} k={kind !== 'FUT' && side === 'buy' ? 'Capital needed' : `Margin (~${settings.marginPct}%)`} v={inr(needed)} />
        <Row theme={theme} k="Max loss" v={loss != null ? inr(loss) : side === 'sell' || kind === 'FUT' ? 'Unlimited without a stop' : '—'} color={loss != null && loss > budget ? RED : undefined} />
        <Row theme={theme} k="Reward at target" v={reward != null ? inr(reward) : '—'} color={GREEN} />
        <Row theme={theme} k="Risk : reward" v={loss && reward ? `1 : ${(reward / loss).toFixed(1)}` : '—'} />
        {be ? <Row theme={theme} k="Breakeven at expiry" v={`${u.name} ${be.toLocaleString('en-IN')}`} /> : null}
        <Row theme={theme} k="Est. charges (round trip)" v={inr(charges)} />
        {kind !== 'FUT' && est ? (
          <Text style={[styles.hint, { color: theme.textMuted }]}>
            Greeks (est.): Δ {est.delta} · Θ {inr(est.theta * qty)}/day · Vega {inr(est.vega * qty)} per 1% vol
          </Text>
        ) : null}
        <Text style={[styles.hint, { color: theme.textMuted }]}>Risk budget: {settings.riskPct}% of {inr(settings.capital)} = {inr(budget)} per trade.</Text>
        {warnings.map((w) => (
          <Text key={w} style={[styles.warn, { color: AMBER }]}>
            ⚠ {w}
          </Text>
        ))}
        <TouchableOpacity onPress={submit} disabled={!valid} style={[styles.primary, { backgroundColor: valid ? theme.primary : theme.surfaceAlt }]} accessibilityLabel="Open paper trade">
          <Text style={[styles.primaryText, { color: valid ? theme.onPrimary : theme.textMuted }]}>Open paper trade</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function OpenList({ theme, trades, all, persist, spotOf, settings }) {
  const [closing, setClosing] = useState(null);
  const [exitText, setExitText] = useState('');
  const [priceEdit, setPriceEdit] = useState(null);
  const [priceText, setPriceText] = useState('');
  if (!trades.length) return <Text style={[styles.empty, { color: theme.textMuted }]}>No open F&O paper trades. Build one in New trade.</Text>;
  const r = settings.riskFreePct / 100;
  const update = (id, change) => persist(all.map((t) => (t.id === id ? { ...t, ...change, updatedAt: new Date().toISOString() } : t)));
  const rows = trades.map((t) => {
    const u = underlyingOf(t.underlying);
    const spot = spotOf(t.underlying);
    const now = priceNow(t, spot, { r });
    const pnl = pnlOf(t, now.price);
    return { t, u, spot, now, pnl };
  });
  const total = rows.reduce((sum, x) => sum + (x.pnl || 0), 0);
  return (
    <View>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Row theme={theme} k="Open P/L (before charges)" v={signed(Math.round(total * 100) / 100)} color={total >= 0 ? GREEN : RED} />
        <Text style={[styles.hint, { color: theme.textMuted }]}>Live from the index level; option prices are estimates unless you type the premium. {settings.autoClose ? 'Auto-close is on: stop, target and expiry close trades by themselves while this screen is open.' : 'Auto-close is off (settings).'}</Text>
      </View>
      {rows.map(({ t, u, spot, now, pnl }) => (
        <View key={t.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.headRow}>
            <View style={[styles.badge, { backgroundColor: (t.side === 'sell' ? RED : GREEN) + '22' }]}>
              <Text style={[styles.badgeText, { color: t.side === 'sell' ? RED : GREEN }]}>{t.side === 'sell' ? 'SELL' : 'BUY'}</Text>
            </View>
            <Text style={[styles.cardTitle, styles.flex, { color: theme.text }]} numberOfLines={1}>
              {u.name} {t.kind === 'FUT' ? 'FUT' : `${t.strike} ${t.kind}`} · {shortDate(t.expiry)}
            </Text>
            <TouchableOpacity onPress={() => confirmDelete('Delete paper trade', 'Remove this F&O paper trade?', () => persist(all.filter((x) => x.id !== t.id)))} accessibilityLabel="Delete trade">
              <Ionicons name="trash-outline" size={18} color={theme.danger || RED} />
            </TouchableOpacity>
          </View>
          <Row theme={theme} k="Entry" v={`${inr(t.entryPrice)} × ${t.lots * t.lotSize} (${t.lots} lot${t.lots > 1 ? 's' : ''})`} />
          <Row theme={theme} k={`Now ${now.source === 'typed' ? '(typed)' : now.source === 'expiry' ? '(expiry value)' : now.source ? '(est.)' : ''}`} v={inr(now.price)} />
          <Row theme={theme} k="P/L" v={signed(pnl)} color={pnl == null ? undefined : pnl >= 0 ? GREEN : RED} />
          <Text style={[styles.hint, { color: theme.textMuted }]}>
            {u.name} {spot ? spot.toLocaleString('en-IN') : '—'} (entry {t.entrySpot ? t.entrySpot.toLocaleString('en-IN') : '—'}) · stop {t.stop ? inr(t.stop) : '—'} · target {t.target ? inr(t.target) : '—'}
          </Text>
          <TouchableOpacity style={styles.autoRow} onPress={() => update(t.id, { autoClose: t.autoClose === false })} accessibilityRole="checkbox" accessibilityState={{ checked: t.autoClose !== false }}>
            <Ionicons name={t.autoClose !== false ? 'checkbox' : 'square-outline'} size={18} color={t.autoClose !== false ? theme.primary : theme.textMuted} />
            <Text style={[styles.hint, styles.noTop, { color: theme.text }]}>Auto-close at stop / target / expiry</Text>
          </TouchableOpacity>
          {priceEdit === t.id ? (
            <View style={styles.rowGap}>
              <TextInput style={[styles.input, styles.flex, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]} value={priceText} onChangeText={setPriceText} keyboardType="decimal-pad" placeholder="Live price from your broker" placeholderTextColor={theme.textMuted} autoFocus />
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: theme.primary }]}
                onPress={() => {
                  const v = num(priceText);
                  if (v > 0) update(t.id, { lastPrice: v, lastPriceAt: new Date().toISOString() });
                  setPriceEdit(null);
                }}
              >
                <Text style={[styles.smallBtnText, { color: theme.onPrimary }]}>Use</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <View style={styles.rowGap}>
            <TouchableOpacity style={[styles.outline, styles.flex, { borderColor: theme.primary }]} onPress={() => (setPriceEdit(t.id), setPriceText(''))}>
              <Text style={[styles.outlineText, { color: theme.primary }]}>Type live price</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.outline, styles.flex, { borderColor: theme.primary }]} onPress={() => (setClosing(t), setExitText(now.price ? String(now.price) : ''))}>
              <Text style={[styles.outlineText, { color: theme.primary }]}>Close trade</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
      <Modal visible={!!closing} transparent animationType="fade" onRequestClose={() => setClosing(null)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: theme.sheet }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Close trade</Text>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Exit price (₹)</Text>
            <TextInput style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]} value={exitText} onChangeText={setExitText} keyboardType="decimal-pad" />
            {closing && num(exitText) > 0 ? (
              <Text style={[styles.hint, { color: theme.text }]}>
                P/L {signed(pnlOf(closing, num(exitText)))} before ~{inr(fnoCharges({ kind: closing.kind, side: closing.side, qty: closing.lots * closing.lotSize, entry: closing.entryPrice, exit: num(exitText) }))} charges
              </Text>
            ) : null}
            <View style={styles.rowGap}>
              <TouchableOpacity style={[styles.outline, styles.flex, { borderColor: theme.borderNeutral }]} onPress={() => setClosing(null)}>
                <Text style={[styles.outlineText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primary, styles.flex, { backgroundColor: theme.primary, marginTop: 0 }]}
                onPress={() => {
                  const v = num(exitText);
                  if (!(v >= 0)) return;
                  update(closing.id, { status: 'closed', exitPrice: v, exitReason: 'manual', exitAt: new Date().toISOString(), closedBy: 'you' });
                  setClosing(null);
                }}
              >
                <Text style={[styles.primaryText, { color: theme.onPrimary }]}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const REASON = { stop: 'Stop-loss hit', target: 'Target hit', expiry: 'Settled at expiry', manual: 'Closed by you' };

function DoneList({ theme, trades, all, persist }) {
  if (!trades.length) return <Text style={[styles.empty, { color: theme.textMuted }]}>No closed F&O trades yet.</Text>;
  const s = fnoStats(trades);
  return (
    <View>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>How your F&O paper trades went</Text>
        <Row theme={theme} k="Trades · win rate" v={`${s.count} · ${s.winRate}%`} />
        <Row theme={theme} k="Gross P/L" v={signed(s.gross)} color={s.gross >= 0 ? GREEN : RED} />
        <Row theme={theme} k="Est. charges" v={inr(s.charges)} />
        <Row theme={theme} k="Net P/L" v={signed(s.net)} color={s.net >= 0 ? GREEN : RED} />
      </View>
      {trades.map((t) => {
        const u = underlyingOf(t.underlying);
        const pnl = pnlOf(t, t.exitPrice);
        return (
          <View key={t.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.headRow}>
              <Text style={[styles.cardTitle, styles.flex, { color: theme.text }]} numberOfLines={1}>
                {t.side === 'sell' ? 'SELL' : 'BUY'} {u.name} {t.kind === 'FUT' ? 'FUT' : `${t.strike} ${t.kind}`} · {shortDate(t.expiry)}
              </Text>
              <TouchableOpacity onPress={() => confirmDelete('Delete trade', 'Remove this closed trade?', () => persist(all.filter((x) => x.id !== t.id)))} accessibilityLabel="Delete trade">
                <Ionicons name="trash-outline" size={18} color={theme.danger || RED} />
              </TouchableOpacity>
            </View>
            <Row theme={theme} k={`${inr(t.entryPrice)} → ${inr(t.exitPrice)}`} v={signed(pnl)} color={pnl >= 0 ? GREEN : RED} />
            <Text style={[styles.hint, { color: theme.textMuted }]}>
              {REASON[t.exitReason] || 'Closed'}
              {t.closedBy === 'auto' ? ' · auto' : ''} · {t.lots} lot{t.lots > 1 ? 's' : ''} × {t.lotSize}
              {t.note ? ` · ${t.note}` : ''}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function SettingsSheet({ visible, settings, onSave, onClose, theme }) {
  const [draft, setDraft] = useState(null);
  const d = draft || { capital: String(settings.capital), riskPct: String(settings.riskPct), marginPct: String(settings.marginPct), autoClose: settings.autoClose, lots: Object.fromEntries(UNDERLYINGS.map((u) => [u.key, String(underlyingOf(u.key, settings).lot)])) };
  const set = (k, v) => setDraft({ ...d, [k]: v });
  const save = () => {
    const lots = Object.fromEntries(Object.entries(d.lots).map(([k, v]) => [k, num(v)]).filter(([, v]) => v > 0));
    onSave({ capital: num(d.capital) || settings.capital, riskPct: num(d.riskPct) || settings.riskPct, marginPct: num(d.marginPct) || settings.marginPct, autoClose: d.autoClose, lots });
    setDraft(null);
  };
  const field = (label, k) => (
    <View style={styles.field} key={k}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
      <TextInput style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]} value={d[k]} onChangeText={(v) => set(k, v)} keyboardType="decimal-pad" />
    </View>
  );
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => (setDraft(null), onClose())}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: theme.sheet }]}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={[styles.cardTitle, { color: theme.text }]}>F&O settings</Text>
            {field('Paper capital (₹)', 'capital')}
            {field('Max risk per trade (% of capital)', 'riskPct')}
            {field('Margin for futures / option selling (% of contract value)', 'marginPct')}
            <View style={styles.switchRow}>
              <Text style={[styles.body, styles.flex, { color: theme.text }]}>Auto-close at stop / target / expiry</Text>
              <Switch value={!!d.autoClose} onValueChange={(v) => set('autoClose', v)} />
            </View>
            <Text style={[styles.label, styles.gap, { color: theme.textSecondary }]}>Lot sizes (NSE / BSE change these; check before trading)</Text>
            {UNDERLYINGS.map((u) => (
              <View key={u.key} style={styles.lotRow}>
                <Text style={[styles.body, styles.flex, { color: theme.text }]}>{u.name}</Text>
                <TextInput style={[styles.input, styles.lotInput, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]} value={d.lots[u.key]} onChangeText={(v) => set('lots', { ...d.lots, [u.key]: v })} keyboardType="number-pad" />
              </View>
            ))}
            <View style={styles.rowGap}>
              <TouchableOpacity style={[styles.outline, styles.flex, { borderColor: theme.borderNeutral }]} onPress={() => (setDraft(null), onClose())}>
                <Text style={[styles.outlineText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primary, styles.flex, { backgroundColor: theme.primary, marginTop: 0 }]} onPress={save} accessibilityLabel="Save F&O settings">
                <Text style={[styles.primaryText, { color: theme.onPrimary }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 40, width: '100%', maxWidth: 820, alignSelf: 'center' },
  flex: { flex: 1 },
  marketBar: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingLeft: 12, marginBottom: 10 },
  marketRow: { gap: 16, paddingVertical: 10 },
  marketItem: { fontSize: 13, fontWeight: '700' },
  gear: { padding: 10 },
  tabs: { flexDirection: 'row', borderRadius: 14, padding: 3, marginBottom: 10 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 11 },
  tabText: { fontSize: 12, fontWeight: '700' },
  card: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 10, gap: 4 },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  body: { fontSize: 13, lineHeight: 19 },
  label: { fontSize: 12, fontWeight: '700', marginTop: 8, marginBottom: 4 },
  hint: { fontSize: 11, lineHeight: 16, marginTop: 4 },
  noTop: { marginTop: 0 },
  warn: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  wrapTight: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  chip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontSize: 12, fontWeight: '700' },
  rowGap: { flexDirection: 'row', gap: 8, marginTop: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12 },
  stepBtn: { padding: 10 },
  stepMid: { flex: 1, alignItems: 'center' },
  stepLabel: { fontSize: 10, fontWeight: '700' },
  stepValue: { fontSize: 16, fontWeight: '800' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15 },
  gap: { marginTop: 10 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 2 },
  kvKey: { fontSize: 13, flexShrink: 1 },
  kvVal: { fontSize: 13, fontWeight: '700', textAlign: 'right', flexShrink: 1 },
  primary: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 10 },
  primaryText: { fontSize: 15, fontWeight: '800' },
  empty: { textAlign: 'center', marginTop: 30, fontSize: 14 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  badge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  outline: { borderWidth: 1, borderRadius: 12, paddingVertical: 9, alignItems: 'center' },
  outlineText: { fontSize: 13, fontWeight: '700' },
  smallBtn: { borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center' },
  smallBtnText: { fontSize: 13, fontWeight: '800' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  sheet: { borderRadius: 20, padding: 18, maxHeight: '90%', width: '100%', maxWidth: 520, alignSelf: 'center', gap: 6 },
  field: { marginBottom: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  lotRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  lotInput: { width: 90, textAlign: 'right' },
  disclaimer: { marginTop: 10 },
});
