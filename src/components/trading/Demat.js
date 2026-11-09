import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import SyncRow from '../SyncRow';
import DatePicker from '../DatePicker';
import { useTheme } from '../../hooks/useTheme';
import { useSyncedCollection } from '../../hooks/useSyncedCollection';
import { confirmDelete } from '../../utils/confirm';
import { formatDate, todayKey } from '../../utils/autopay';
import { monthLabel } from '../../utils/debts';
import {
  DEMAT_STORAGE_KEY,
  ENTRY_KINDS,
  accountBalance,
  accountsOf,
  byMonth,
  countsAfterBalance,
  entryEffect,
  netOf,
  pnlBetween,
  pnlStats,
  recentPnl,
} from '../../utils/demat';
import { LOSS, PROFIT } from './format';

const BROKERS = ['Zerodha', 'Groww', 'Upstox', 'Angel One', 'Dhan', 'ICICI Direct', 'HDFC Sky', 'Kotak Neo', '5paisa', 'Fyers'];
const makeId = () => `${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`;
const toNum = (t) => parseFloat(String(t ?? '').replace(/[^\d.]/g, ''));
const inr = (n) => `₹${Math.abs(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${inr(n)}`;
const colorOf = (n, fallback) => (n > 0 ? PROFIT : n < 0 ? LOSS : fallback);

/** My Trading → Demat: your broker balance, moved by day-by-day gains, losses and transfers. */
export default function Demat({ header }) {
  const { theme } = useTheme();
  const { items: docs, synced, persist, pulling, pullInfo, pullNow } = useSyncedCollection('demat', DEMAT_STORAGE_KEY);
  const accounts = accountsOf(docs);
  const [selectedId, setSelectedId] = useState(null);
  const account = accounts.find((a) => a.id === selectedId) || accounts[0] || null;

  // account form: null | { id?, name, balance }
  const [accForm, setAccForm] = useState(null);
  const [balanceDraft, setBalanceDraft] = useState(null); // string while updating the balance
  // day entry form
  const [kind, setKind] = useState('gain'); // gain | loss | deposit | withdraw
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(null); // null = today
  const [pickDate, setPickDate] = useState(false);
  const [note, setNote] = useState('');
  const [charges, setCharges] = useState('');
  const [executions, setExecutions] = useState('');
  const [saved, setSaved] = useState(null);

  const today = todayKey();
  const entryDate = date || today;
  const current = account ? accountBalance(account, docs) : 0;
  const todayPnl = account ? pnlBetween(docs, today, today, account.id) : 0;
  const monthStart = `${today.slice(0, 7)}-01`;
  const monthPnl = account ? pnlBetween(docs, monthStart, today, account.id) : 0;
  const stats = account ? pnlStats(docs, account.id) : { days: 0 };
  const bars = account ? recentPnl(docs, account.id, 20) : [];
  const months = account ? byMonth(docs, account.id) : [];
  const existingDay =
    account && (kind === 'gain' || kind === 'loss')
      ? docs.find((d) => d.type === 'entry' && d.accountId === account.id && d.kind === 'pnl' && d.date === entryDate)
      : null;

  const saveAccount = () => {
    const name = accForm.name.trim();
    const balance = toNum(accForm.balance);
    if (!name || !(balance >= 0)) return;
    const now = new Date().toISOString();
    if (accForm.id) {
      persist(docs.map((d) => (d.id === accForm.id ? { ...d, name, updatedAt: now } : d)));
    } else {
      const doc = { id: makeId(), type: 'account', name, balance, balanceDate: today, balanceSetAt: now, createdAt: now, updatedAt: now };
      persist([doc, ...docs]);
      setSelectedId(doc.id);
    }
    setAccForm(null);
  };

  const saveBalance = () => {
    const balance = toNum(balanceDraft);
    if (!account || !(balance >= 0)) return;
    const now = new Date().toISOString();
    persist(docs.map((d) => (d.id === account.id ? { ...d, balance, balanceDate: today, balanceSetAt: now, updatedAt: now } : d)));
    setBalanceDraft(null);
  };

  const deleteAccount = () =>
    confirmDelete('Delete demat account', `Remove ${account.name} and all its day entries?`, () => {
      persist(docs.filter((d) => d.id !== account.id && d.accountId !== account.id));
      setSelectedId(null);
    });

  const isPnl = kind === 'gain' || kind === 'loss';
  const grossNum = toNum(amount) || 0;
  const chargesNum = toNum(charges) || 0;
  const execNum = Math.round(toNum(executions)) || 0;
  const netPreview = (kind === 'loss' ? -grossNum : grossNum) - chargesNum;

  const saveEntry = () => {
    const value = toNum(amount);
    if (!account || !(value > 0)) return;
    const now = new Date().toISOString();
    const entry = {
      id: existingDay?.id || makeId(),
      type: 'entry',
      accountId: account.id,
      kind: isPnl ? 'pnl' : kind,
      amount: kind === 'loss' ? -value : value,
      charges: isPnl && chargesNum > 0 ? chargesNum : undefined,
      executions: isPnl && execNum > 0 ? execNum : undefined,
      date: entryDate,
      note: note.trim(),
      createdAt: existingDay?.createdAt || now,
      updatedAt: now,
    };
    persist(existingDay ? docs.map((d) => (d.id === existingDay.id ? entry : d)) : [entry, ...docs]);
    setSaved(
      `${isPnl ? `Net ${signed(netOf(entry))}` : `${kind === 'deposit' ? 'Added funds' : 'Withdrawal'} of ${inr(value)}`} saved for ${formatDate(entryDate)}.${
        countsAfterBalance(account, entry) ? '' : ' (On or before the day you set the balance, so it doesn’t change it.)'
      }`
    );
    setAmount('');
    setNote('');
    setCharges('');
    setExecutions('');
    setTimeout(() => setSaved(null), 4000);
  };

  const removeEntry = (e) =>
    confirmDelete('Delete entry', `Remove the ${formatDate(e.date)} ${e.kind === 'pnl' ? 'P/L' : e.kind === 'deposit' ? 'deposit' : 'withdrawal'} of ${inr(e.amount)}?`, () =>
      persist(docs.filter((d) => d.id !== e.id))
    );

  const card = [styles.card, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }];
  const input = [styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }];
  const maxBar = Math.max(1, ...bars.map((b) => Math.abs(netOf(b))));

  const accountForm = accForm ? (
    <View style={card}>
      <Text style={[styles.title, { color: theme.text }]}>{accForm.id ? 'Rename account' : 'Add your demat account'}</Text>
      <View style={styles.chips}>
        {BROKERS.map((b) => (
          <TouchableOpacity
            key={b}
            style={[styles.chip, { backgroundColor: accForm.name === b ? theme.primary : theme.surfaceAlt, borderColor: theme.borderNeutral }]}
            onPress={() => setAccForm((f) => ({ ...f, name: b }))}
          >
            <Text style={[styles.chipText, { color: accForm.name === b ? theme.onPrimary : theme.text }]}>{b}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput style={input} placeholder="Broker / account name" placeholderTextColor={theme.textMuted} value={accForm.name} onChangeText={(name) => setAccForm((f) => ({ ...f, name }))} />
      {!accForm.id ? (
        <TextInput
          style={input}
          placeholder="Current balance (₹) — from your broker app"
          placeholderTextColor={theme.textMuted}
          keyboardType="decimal-pad"
          value={accForm.balance}
          onChangeText={(balance) => setAccForm((f) => ({ ...f, balance }))}
        />
      ) : null}
      <Text style={[styles.hint, { color: theme.textMuted }]}>
        Funds plus holdings value, as your broker app shows it. It&apos;s added to your net worth on the Dashboard.
      </Text>
      <View style={styles.row}>
        {accounts.length ? (
          <TouchableOpacity style={[styles.btn, { backgroundColor: theme.surfaceAlt }]} onPress={() => setAccForm(null)}>
            <Text style={[styles.btnText, { color: theme.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: theme.primary }, !(accForm.name.trim() && (accForm.id || toNum(accForm.balance) >= 0)) && styles.disabled]}
          onPress={saveAccount}
          accessibilityLabel="Save demat account"
        >
          <Text style={[styles.btnText, { color: theme.onPrimary }]}>Save</Text>
        </TouchableOpacity>
      </View>
    </View>
  ) : null;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      {header}
      <SyncRow synced={synced} pulling={pulling} pullInfo={pullInfo} onPull={pullNow} />

      {!account && !accForm ? (
        <View style={card}>
          <Ionicons name="wallet-outline" size={32} color={theme.primary} />
          <Text style={[styles.title, { color: theme.text }]}>Track your demat account</Text>
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            Add your broker balance once, then log each day&apos;s gain or loss. The balance updates itself and counts in your net worth.
          </Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: theme.primary }]} onPress={() => setAccForm({ name: '', balance: '' })} accessibilityLabel="Add demat account">
            <Text style={[styles.btnText, { color: theme.onPrimary }]}>Add demat account</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {accountForm}

      {account && !accForm ? (
        <>
          {accounts.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.accRow}>
              {accounts.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  style={[styles.chip, { backgroundColor: a.id === account.id ? theme.primary : theme.surface, borderColor: theme.borderNeutral }]}
                  onPress={() => setSelectedId(a.id)}
                >
                  <Text style={[styles.chipText, { color: a.id === account.id ? theme.onPrimary : theme.text }]}>{a.name}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={[styles.chip, { backgroundColor: theme.surface, borderColor: theme.borderNeutral }]} onPress={() => setAccForm({ name: '', balance: '' })} accessibilityLabel="Add another account">
                <Text style={[styles.chipText, { color: theme.primary }]}>+ Add</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : null}

          <LinearGradient colors={['#0F766E', '#14B8A6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <View style={styles.heroTop}>
              <Text style={styles.heroLabel}>{account.name.toUpperCase()} · BALANCE</Text>
              <View style={styles.heroIcons}>
                <TouchableOpacity onPress={() => setAccForm({ id: account.id, name: account.name, balance: '' })} accessibilityLabel="Rename account">
                  <Ionicons name="create-outline" size={18} color="#FFF" />
                </TouchableOpacity>
                <TouchableOpacity onPress={deleteAccount} accessibilityLabel="Delete account">
                  <Ionicons name="trash-outline" size={18} color="#FFF" />
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.heroValue}>{inr(current)}</Text>
            <Text style={styles.heroSub}>
              Set to {inr(account.balance)} on {formatDate(account.balanceDate)}
              {current !== Number(account.balance) ? ` · ${signed(current - account.balance)} since` : ''}
            </Text>
            <View style={styles.heroTiles}>
              <View style={styles.heroTile}>
                <Text style={styles.heroTileLabel}>Today</Text>
                <Text style={styles.heroTileValue}>{signed(todayPnl)}</Text>
              </View>
              <View style={styles.heroTile}>
                <Text style={styles.heroTileLabel}>{monthLabel(today.slice(0, 7))}</Text>
                <Text style={styles.heroTileValue}>{signed(monthPnl)}</Text>
              </View>
              <View style={styles.heroTile}>
                <Text style={styles.heroTileLabel}>All logged</Text>
                <Text style={styles.heroTileValue}>{signed(stats.net || 0)}</Text>
              </View>
            </View>
            {balanceDraft == null ? (
              <TouchableOpacity style={styles.heroBtn} onPress={() => setBalanceDraft(String(current))} accessibilityLabel="Update balance">
                <Ionicons name="sync-outline" size={16} color="#FFF" />
                <Text style={styles.heroBtnText}>Update balance from broker app</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.balanceRow}>
                <TextInput style={styles.heroInput} keyboardType="decimal-pad" value={balanceDraft} onChangeText={setBalanceDraft} autoFocus placeholder="₹" placeholderTextColor="#FFFFFFAA" />
                <TouchableOpacity style={styles.heroSave} onPress={saveBalance} accessibilityLabel="Save balance">
                  <Text style={styles.heroSaveText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setBalanceDraft(null)} accessibilityLabel="Cancel balance">
                  <Ionicons name="close" size={22} color="#FFF" />
                </TouchableOpacity>
              </View>
            )}
          </LinearGradient>

          {/* Log a day */}
          <View style={card}>
            <Text style={[styles.title, { color: theme.text }]}>Log a day</Text>
            <View style={[styles.segment, { backgroundColor: theme.surfaceAlt }]}>
              {[
                { key: 'gain', label: 'Gain', color: PROFIT },
                { key: 'loss', label: 'Loss', color: LOSS },
                { key: 'deposit', label: 'Added' },
                { key: 'withdraw', label: 'Withdrew' },
              ].map((k) => (
                <TouchableOpacity
                  key={k.key}
                  style={[styles.segItem, kind === k.key && { backgroundColor: theme.sheet }]}
                  onPress={() => setKind(k.key)}
                  accessibilityLabel={`Entry type ${k.label}`}
                >
                  <Text style={[styles.segText, { color: kind === k.key ? k.color || theme.text : theme.textSecondary }]}>{k.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.row}>
              <TextInput
                style={[...input, styles.flex]}
                placeholder={kind === 'gain' ? 'Gross profit (₹)' : kind === 'loss' ? 'Gross loss (₹)' : 'Amount (₹)'}
                placeholderTextColor={theme.textMuted}
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
              />
              <TouchableOpacity style={[styles.dateBtn, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral }]} onPress={() => setPickDate((v) => !v)} accessibilityLabel="Entry date">
                <Ionicons name="calendar-outline" size={16} color={theme.primary} />
                <Text style={[styles.dateText, { color: theme.text }]}>{entryDate === today ? 'Today' : formatDate(entryDate)}</Text>
              </TouchableOpacity>
            </View>
            {pickDate ? (
              <DatePicker
                value={entryDate}
                onChange={(d) => {
                  setDate(d > today ? today : d);
                  setPickDate(false);
                }}
              />
            ) : null}
            {isPnl ? (
              <>
                <View style={styles.row}>
                  <TextInput
                    style={[...input, styles.flex]}
                    placeholder="Brokerage + charges (₹)"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="decimal-pad"
                    value={charges}
                    onChangeText={setCharges}
                  />
                  <TextInput
                    style={[...input, styles.execInput]}
                    placeholder="Executions"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="number-pad"
                    value={executions}
                    onChangeText={setExecutions}
                  />
                </View>
                {grossNum > 0 ? (
                  <View style={[styles.netBox, { backgroundColor: theme.surfaceAlt }]}>
                    <Text style={[styles.netLabel, { color: theme.textMuted }]}>Net for the day</Text>
                    <Text style={[styles.netValue, { color: colorOf(netPreview, theme.text) }]}>{signed(netPreview)}</Text>
                    <Text style={[styles.hint, { color: theme.textSecondary }]}>
                      {signed(kind === 'loss' ? -grossNum : grossNum)} gross − {inr(chargesNum)} charges
                      {execNum ? ` · ${execNum} execution${execNum === 1 ? '' : 's'} (${inr(chargesNum / execNum)} each)` : ''}
                      {kind === 'gain' && chargesNum > 0 ? ` · charges took ${Math.round((chargesNum / grossNum) * 100)}% of the profit` : ''}
                    </Text>
                  </View>
                ) : null}
              </>
            ) : null}
            <TextInput style={input} placeholder="Note (optional, e.g. NIFTY options, stop hit)" placeholderTextColor={theme.textMuted} value={note} onChangeText={setNote} />
            {existingDay ? (
              <Text style={[styles.hint, { color: '#F59E0B' }]}>
                {formatDate(entryDate)} already has {signed(netOf(existingDay))} — saving replaces it.
              </Text>
            ) : null}
            <TouchableOpacity style={[styles.btn, { backgroundColor: theme.primary }, !(toNum(amount) > 0) && styles.disabled]} onPress={saveEntry} disabled={!(toNum(amount) > 0)} accessibilityLabel="Save day entry">
              <Text style={[styles.btnText, { color: theme.onPrimary }]}>Save</Text>
            </TouchableOpacity>
            {saved ? <Text style={[styles.hint, { color: PROFIT }]}>{saved}</Text> : null}
          </View>

          {/* Stats + chart */}
          {stats.days ? (
            <View style={card}>
              <Text style={[styles.title, { color: theme.text }]}>Your trading days</Text>
              <View style={styles.statGrid}>
                {[
                  ['Days logged', String(stats.days)],
                  ['Green / red', `${stats.green} / ${stats.red}`],
                  ['Win rate', stats.winRate != null ? `${stats.winRate}%` : '—'],
                  ['Best day', signed(stats.best), colorOf(stats.best)],
                  ['Worst day', signed(stats.worst), colorOf(stats.worst)],
                  ['Avg day', signed(stats.avg), colorOf(stats.avg)],
                  ['Gross P/L', signed(stats.gross), colorOf(stats.gross)],
                  ['Charges paid', inr(stats.charges), stats.charges ? LOSS : null],
                  ['Executions', String(stats.executions || 0)],
                ].map(([label, value, color]) => (
                  <View key={label} style={[styles.stat, { backgroundColor: theme.surfaceAlt }]}>
                    <Text style={[styles.statLabel, { color: theme.textMuted }]}>{label}</Text>
                    <Text style={[styles.statValue, { color: color || theme.text }]}>{value}</Text>
                  </View>
                ))}
              </View>
              {stats.charges > 0 ? (
                <Text style={[styles.hint, { color: theme.textSecondary }]}>
                  {stats.chargesPerExecution != null ? `About ${inr(stats.chargesPerExecution)} per execution. ` : ''}
                  {stats.chargesPctOfGains != null ? `Charges took ${stats.chargesPctOfGains}% of your gross gains.` : ''}
                  {stats.chargesPctOfGains >= 30 ? ' Fewer, bigger trades would keep more of it.' : ''}
                </Text>
              ) : null}
              {stats.streak?.length > 1 ? (
                <Text style={[styles.hint, { color: stats.streak.kind === 'green' ? PROFIT : LOSS }]}>
                  {stats.streak.length} {stats.streak.kind} days in a row
                  {stats.streak.kind === 'red' ? ' — maybe take a day off and review.' : ' 🔥'}
                </Text>
              ) : null}
              <View style={styles.chart}>
                {bars.map((b) => {
                  const v = netOf(b);
                  const h = Math.max(3, (Math.abs(v) / maxBar) * 56);
                  return (
                    <View key={b.id} style={styles.barCol}>
                      <View style={styles.barTop}>{v > 0 ? <View style={[styles.bar, { height: h, backgroundColor: PROFIT }]} /> : null}</View>
                      <View style={[styles.axis, { backgroundColor: theme.borderNeutral }]} />
                      <View style={styles.barBottom}>{v < 0 ? <View style={[styles.bar, { height: h, backgroundColor: LOSS }]} /> : null}</View>
                    </View>
                  );
                })}
              </View>
              <Text style={[styles.hint, { color: theme.textMuted }]}>Last {bars.length} logged day{bars.length === 1 ? '' : 's'}</Text>
            </View>
          ) : null}

          {/* History */}
          {months.map((g) => (
            <View key={g.month} style={card}>
              <View style={styles.monthHead}>
                <Text style={[styles.title, styles.flex, { color: theme.text }]}>{monthLabel(g.month, true)}</Text>
                <Text style={[styles.monthPnl, { color: colorOf(g.pnl, theme.textMuted) }]}>{signed(g.pnl)}</Text>
              </View>
              {g.charges > 0 || g.executions > 0 ? (
                <Text style={[styles.hint, { color: theme.textMuted }]}>
                  Net after {inr(g.charges)} charges{g.executions ? ` · ${g.executions} executions` : ''}
                </Text>
              ) : null}
              {g.entries.map((e) => {
                const eff = entryEffect(e);
                const k = ENTRY_KINDS.find((x) => x.key === e.kind);
                return (
                  <View key={e.id} style={[styles.entry, { borderTopColor: theme.borderNeutral }]}>
                    <Ionicons name={e.kind === 'pnl' ? (eff >= 0 ? 'trending-up' : 'trending-down') : k.icon} size={18} color={e.kind === 'pnl' ? colorOf(eff) : theme.textSecondary} />
                    <View style={styles.flex}>
                      <Text style={[styles.entryTitle, { color: theme.text }]}>
                        {formatDate(e.date)} · {e.kind === 'pnl' ? (eff >= 0 ? 'Gain' : 'Loss') : k.label}
                      </Text>
                      {e.kind === 'pnl' && (e.charges || e.executions) ? (
                        <Text style={[styles.hint, { color: theme.textMuted }]}>
                          Gross {signed(Number(e.amount) || 0)}
                          {e.charges ? ` · charges ${inr(e.charges)}` : ''}
                          {e.executions ? ` · ${e.executions} exec` : ''}
                        </Text>
                      ) : null}
                      {e.note ? <Text style={[styles.hint, { color: theme.textMuted }]}>{e.note}</Text> : null}
                    </View>
                    <Text style={[styles.entryAmt, { color: e.kind === 'pnl' ? colorOf(eff) : theme.text }]}>{signed(eff)}</Text>
                    <TouchableOpacity onPress={() => removeEntry(e)} accessibilityLabel={`Delete ${e.date} entry`}>
                      <Ionicons name="trash-outline" size={17} color={theme.danger} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  scroll: { padding: 16, paddingBottom: 60 },
  card: { borderRadius: 18, borderWidth: 1, padding: 14, gap: 10, marginBottom: 12, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  title: { fontSize: 15, fontWeight: '700' },
  hint: { fontSize: 12, lineHeight: 17 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 },
  row: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  btnText: { fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 13, fontWeight: '600' },
  accRow: { flexGrow: 0, marginBottom: 10 },
  hero: { borderRadius: 22, padding: 18, marginBottom: 12 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroIcons: { flexDirection: 'row', gap: 14 },
  heroLabel: { color: '#FFFFFFCC', fontSize: 12, fontWeight: '800', letterSpacing: 0.8 },
  heroValue: { color: '#FFF', fontSize: 34, fontWeight: '900', marginTop: 4 },
  heroSub: { color: '#FFFFFFCC', fontSize: 12 },
  heroTiles: { flexDirection: 'row', gap: 8, marginTop: 14 },
  heroTile: { flex: 1, backgroundColor: '#FFFFFF26', borderRadius: 12, padding: 9 },
  heroTileLabel: { color: '#FFFFFFCC', fontSize: 11, fontWeight: '600' },
  heroTileValue: { color: '#FFF', fontSize: 14, fontWeight: '800', marginTop: 2 },
  heroBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FFFFFF33', borderRadius: 12, paddingVertical: 10, marginTop: 12 },
  heroBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  heroInput: { flex: 1, backgroundColor: '#FFFFFF26', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, color: '#FFF', fontSize: 16, fontWeight: '700' },
  heroSave: { backgroundColor: '#FFF', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  heroSaveText: { color: '#0F766E', fontWeight: '800' },
  segment: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  segItem: { flex: 1, alignItems: 'center', borderRadius: 10, paddingVertical: 8 },
  segText: { fontSize: 13, fontWeight: '700' },
  execInput: { width: 120 },
  netBox: { borderRadius: 12, padding: 10, gap: 2 },
  netLabel: { fontSize: 11, fontWeight: '600' },
  netValue: { fontSize: 20, fontWeight: '900' },
  dateBtn: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  dateText: { fontSize: 14, fontWeight: '600' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stat: { width: '31.5%', borderRadius: 10, padding: 8 },
  statLabel: { fontSize: 10, fontWeight: '600' },
  statValue: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  chart: { flexDirection: 'row', alignItems: 'stretch', gap: 3, height: 116, marginTop: 4 },
  barCol: { flex: 1, maxWidth: 18 },
  barTop: { height: 56, justifyContent: 'flex-end' },
  barBottom: { height: 56, justifyContent: 'flex-start' },
  axis: { height: 1 },
  bar: { borderRadius: 3, width: '100%' },
  monthHead: { flexDirection: 'row', alignItems: 'center' },
  monthPnl: { fontSize: 15, fontWeight: '800' },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, paddingTop: 10 },
  entryTitle: { fontSize: 14, fontWeight: '600' },
  entryAmt: { fontSize: 14, fontWeight: '800' },
});
