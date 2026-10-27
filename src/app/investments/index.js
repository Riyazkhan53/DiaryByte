import { useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Header from '../../components/Header';
import SyncRow from '../../components/SyncRow';
import { useTheme } from '../../hooks/useTheme';
import { useSyncedCollection } from '../../hooks/useSyncedCollection';
import { confirmDelete } from '../../utils/confirm';
import { todayKey } from '../../utils/autopay';
import {
  applyFundPrices,
  fetchFundPrices,
  latestNav,
  searchFunds,
} from '../../services/mutualFunds';
import { applyGoldRate, fetchGoldRate } from '../../services/goldRate';
import { addMonths, dueDateFor, monthLabel } from '../../utils/debts';
import {
  SIP_CATEGORIES,
  hasSip,
  reverseInstallment,
  sipAmountFor,
  sipDueDate,
  sipHistory,
  sipSourceId,
  upcomingSipMonths,
} from '../../utils/sip';

const EXPENSES_KEY = '@diarybyte_expenditure';

// First month a new SIP runs: this month if its day is still to come, else next.
const firstSipMonth = (day) => {
  const today = todayKey();
  const month = today.slice(0, 7);
  return dueDateFor(month, day) >= today ? month : addMonths(month, 1);
};

const STORAGE_KEY = '@diarybyte_investments';

const CATEGORIES = [
  { key: 'Mutual Funds', icon: 'pie-chart-outline', color: '#AF52DE' },
  { key: 'Stocks', icon: 'trending-up-outline', color: '#32ADE6' },
  { key: 'Digital Gold', icon: 'diamond-outline', color: '#FFCC00' },
  { key: 'FD', icon: 'lock-closed-outline', color: '#34C759' },
];

const DETAIL_PLACEHOLDERS = {
  'Mutual Funds': 'Folio number (optional)',
  Stocks: 'Quantity (e.g. 10 shares)',
  'Digital Gold': 'Weight (e.g. 2.5 g)',
  FD: 'Rate & maturity (e.g. 7.1%, 2027)',
};

const CURRENT_LABELS = {
  FD: 'Maturity value (₹)',
};

const makeId = () =>
  `${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`;

const money = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const categoryMeta = (key) =>
  CATEGORIES.find((c) => c.key === key) || CATEGORIES[0];

const toNum = (text) => parseFloat(String(text ?? '').replace(/[^\d.]/g, ''));

const round2 = (n) => Math.round(n * 100) / 100;

const shortDate = (key) => {
  if (!key) return '';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

// Fund linked to a scheme: valued as units × latest NAV.
const isLinkedFund = (item) => item.category === 'Mutual Funds' && !!item.schemeCode && item.units > 0;

// Gold locker with grams: valued as grams × the gold rate you set.
const isWeighedGold = (item) => item.category === 'Digital Gold' && item.grams > 0 && item.rate > 0;

export default function InvestmentsScreen() {
  const { theme } = useTheme();
  const { items, loaded, synced, persist, pulling, pullInfo, pullNow } = useSyncedCollection(
    'investments',
    STORAGE_KEY
  );
  const { items: expenses, persist: persistExpenses } = useSyncedCollection('expenditure', EXPENSES_KEY);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [category, setCategory] = useState('Mutual Funds');
  const [name, setName] = useState('');
  const [invested, setInvested] = useState('');
  const [current, setCurrent] = useState('');
  const [detail, setDetail] = useState('');
  const [note, setNote] = useState('');
  const [filter, setFilter] = useState('all');

  // Mutual fund linked to a scheme (units × NAV)
  const [schemeCode, setSchemeCode] = useState(null);
  const [nav, setNav] = useState(null);
  const [navDate, setNavDate] = useState(null);
  const [units, setUnits] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [lookupError, setLookupError] = useState(null);

  // Digital gold (grams × rate)
  const [grams, setGrams] = useState('');
  const [rate, setRate] = useState('');
  const [rateVisible, setRateVisible] = useState(false);
  const [rateDraft, setRateDraft] = useState('');

  const [refreshing, setRefreshing] = useState(false);
  const [goldInfo, setGoldInfo] = useState(null);

  // SIP (form) and the SIP plan sheet
  const [sipOn, setSipOn] = useState(false);
  const [sipAmount, setSipAmount] = useState('');
  const [sipDay, setSipDay] = useState('5');
  const [planId, setPlanId] = useState(null);
  const [planDrafts, setPlanDrafts] = useState({});

  const goldItems = items.filter((i) => i.category === 'Digital Gold');
  const latestGold = [...goldItems]
    .filter((i) => i.rate > 0)
    .sort((a, b) => (b.rateDate || '').localeCompare(a.rateDate || ''))[0];
  const goldRate = latestGold?.rate || null;

  // ------- live fund prices -------

  // Latest items, so a price refresh that finishes later applies to them
  // rather than to whatever was on screen when it started.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const applyPrices = useCallback(
    (prices) => {
      const { items: next, updated } = applyFundPrices(itemsRef.current, prices);
      if (updated) persist(next);
    },
    [persist]
  );

  const applyGold = useCallback(
    (rate) => {
      setGoldInfo(rate);
      const { items: next, updated } = applyGoldRate(itemsRef.current, rate.sell, todayKey());
      if (updated) persist(next);
    },
    [persist]
  );

  // Re-price linked funds and gold lockers whenever the screen opens.
  useEffect(() => {
    if (!loaded) return;
    fetchFundPrices(itemsRef.current).then(applyPrices).catch(() => {});
    fetchGoldRate().then(applyGold).catch(() => {});
  }, [loaded, applyPrices, applyGold]);

  const refreshPrices = async () => {
    setRefreshing(true);
    try {
      const [prices, gold] = await Promise.all([
        fetchFundPrices(itemsRef.current),
        fetchGoldRate().catch(() => null),
      ]);
      applyPrices(prices);
      if (gold) applyGold(gold);
    } finally {
      setRefreshing(false);
    }
  };

  const linkedFunds = items.filter(isLinkedFund);
  const pricesAsOf = linkedFunds.map((i) => i.navDate).filter(Boolean).sort().pop();

  // ------- fund search (form) -------

  const runSearch = async () => {
    if (query.trim().length < 3) return;
    setSearching(true);
    setLookupError(null);
    try {
      const found = await searchFunds(query);
      setResults(found);
      if (!found.length) setLookupError('No funds found. Try a shorter name, e.g. "parag flexi".');
    } catch (_error) {
      setLookupError("Couldn't reach the fund price service. Check your connection, or enter the value yourself.");
    } finally {
      setSearching(false);
    }
  };

  const pickFund = async (fund) => {
    setSchemeCode(fund.schemeCode);
    setName(fund.schemeName);
    setResults([]);
    setQuery('');
    setNav(null);
    setNavDate(null);
    setLookupError(null);
    try {
      const price = await latestNav(fund.schemeCode);
      setNav(price.nav);
      setNavDate(price.navDate);
    } catch (_error) {
      setLookupError("Couldn't get this fund's latest NAV right now. It will update next time you open Investments.");
    }
  };

  const unlinkFund = () => {
    setSchemeCode(null);
    setNav(null);
    setNavDate(null);
  };

  // ------- gold rate -------

  const openRate = () => {
    setRateDraft(goldRate ? String(goldRate) : '');
    setRateVisible(true);
  };

  const saveRate = () => {
    const value = toNum(rateDraft);
    if (!(value > 0)) return;
    persist(
      items.map((i) =>
        i.category === 'Digital Gold' && i.grams > 0
          ? { ...i, rate: value, rateDate: todayKey(), rateSource: 'manual', current: round2(i.grams * value) }
          : i
      )
    );
    setRateVisible(false);
  };

  const openAdd = () => {
    setEditingId(null);
    setCategory('Mutual Funds');
    setName('');
    setInvested('');
    setCurrent('');
    setDetail('');
    setNote('');
    setSchemeCode(null);
    setNav(null);
    setNavDate(null);
    setUnits('');
    setQuery('');
    setResults([]);
    setLookupError(null);
    setGrams('');
    setRate(goldRate ? String(goldRate) : '');
    setSipOn(false);
    setSipAmount('');
    setSipDay('5');
    setModalVisible(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setCategory(item.category);
    setName(item.name);
    setInvested(item.invested != null ? String(item.invested) : '');
    setCurrent(item.current != null ? String(item.current) : '');
    setDetail(item.detail || '');
    setNote(item.note || '');
    setSchemeCode(item.schemeCode || null);
    setNav(item.nav || null);
    setNavDate(item.navDate || null);
    setUnits(item.units ? String(item.units) : '');
    setQuery('');
    setResults([]);
    setLookupError(null);
    setGrams(item.grams ? String(item.grams) : '');
    setRate(item.rate ? String(item.rate) : goldRate ? String(goldRate) : '');
    setSipOn(hasSip(item));
    setSipAmount(item.sip?.amount ? String(item.sip.amount) : '');
    setSipDay(item.sip?.day ? String(item.sip.day) : '5');
    setModalVisible(true);
  };

  const fundLinked = category === 'Mutual Funds' && !!schemeCode;
  const sipAllowed = SIP_CATEGORIES.includes(category);
  const unitsNum = toNum(units);
  const gramsNum = toNum(grams);
  const rateNum = toNum(rate);
  // Value worked out for the holding, or null when it's entered by hand.
  const autoCurrent =
    fundLinked && unitsNum > 0 && nav > 0
      ? round2(unitsNum * nav)
      : category === 'Digital Gold' && gramsNum > 0 && rateNum > 0
        ? round2(gramsNum * rateNum)
        : null;
  const manualCurrent = !(fundLinked || (category === 'Digital Gold' && gramsNum > 0));

  const saveItem = () => {
    const investedNum = toNum(invested);
    const currentNum = autoCurrent ?? (manualCurrent ? toNum(current) : NaN);
    if (!name.trim() || !investedNum || !(currentNum > 0)) return;
    const existing = editingId ? items.find((i) => i.id === editingId) : null;
    const gold = category === 'Digital Gold' && gramsNum > 0;
    const day = Math.min(28, Math.max(1, Math.round(toNum(sipDay)) || 1));
    const sip =
      sipAllowed && sipOn && toNum(sipAmount) > 0
        ? {
            amount: toNum(sipAmount),
            day,
            // A new SIP starts from its next date: earlier installments are
            // already in the amount invested.
            startMonth: hasSip(existing || {}) ? existing.sip.startMonth : firstSipMonth(day),
          }
        : undefined;
    const entry = {
      // Keep fields the form doesn't show (SIP history, custom amounts...).
      ...existing,
      id: editingId || makeId(),
      category,
      name: name.trim(),
      invested: investedNum,
      current: currentNum,
      detail: detail.trim(),
      note: note.trim(),
      schemeCode: fundLinked ? schemeCode : undefined,
      units: fundLinked ? unitsNum : undefined,
      nav: fundLinked ? nav : undefined,
      navDate: fundLinked ? navDate : undefined,
      grams: gold ? gramsNum : undefined,
      rate: gold ? rateNum : undefined,
      rateDate: gold ? (rateNum === existing?.rate ? existing?.rateDate : todayKey()) : undefined,
      rateSource: gold ? (rateNum === existing?.rate ? existing?.rateSource : 'manual') : undefined,
      sip,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    persist(editingId ? items.map((i) => (i.id === editingId ? entry : i)) : [entry, ...items]);
    setModalVisible(false);
  };

  // ------- SIP plan sheet -------

  const planItem = planId ? items.find((i) => i.id === planId) : null;
  const planMonths = planItem ? upcomingSipMonths(planItem, todayKey(), 6) : [];

  const openPlan = (item) => {
    setPlanId(item.id);
    setPlanDrafts(
      Object.fromEntries(
        upcomingSipMonths(item, todayKey(), 6).map((m) => [m, String(sipAmountFor(item, m))])
      )
    );
  };

  // Save custom amounts; a month left at the usual amount drops its custom entry.
  const savePlan = () => {
    const sipAmounts = { ...planItem.sipAmounts };
    planMonths.forEach((month) => {
      const value = toNum(planDrafts[month]);
      const amount = Number.isFinite(value) ? value : planItem.sip.amount;
      if (amount === planItem.sip.amount) delete sipAmounts[month];
      else sipAmounts[month] = amount;
    });
    persist(items.map((i) => (i.id === planId ? { ...i, sipAmounts, updatedAt: new Date().toISOString() } : i)));
    setPlanId(null);
  };

  // Undo a recorded installment: take it off the holding and out of expenses.
  const undoInstallment = (month) => {
    confirmDelete(
      'Undo SIP installment',
      `Remove the ${monthLabel(month)} installment? It comes off the amount invested and out of My Expenditure.`,
      () => {
        persist(items.map((i) => (i.id === planId ? reverseInstallment(i, month) : i)));
        const sourceId = sipSourceId(planId, month);
        if (expenses.some((e) => e.sourceId === sourceId)) {
          persistExpenses(expenses.filter((e) => e.sourceId !== sourceId));
        }
      }
    );
  };

  // Record a skipped month after all (at the usual amount unless one was set).
  const recordSkipped = (month) => {
    persist(
      items.map((i) => {
        if (i.id !== planId) return i;
        const sipDone = { ...i.sipDone };
        delete sipDone[month];
        const sipAmounts = { ...i.sipAmounts };
        if (!(sipAmountFor(i, month) > 0)) delete sipAmounts[month];
        return { ...i, sipDone, sipAmounts, updatedAt: new Date().toISOString() };
      })
    );
  };

  const deleteItem = (item) => {
    confirmDelete('Delete Investment', `Remove ${item.name}?`, () =>
      persist(items.filter((i) => i.id !== item.id))
    );
  };

  const totalInvested = items.reduce((s, i) => s + (i.invested || 0), 0);
  const totalCurrent = items.reduce((s, i) => s + (i.current || 0), 0);
  const pl = totalCurrent - totalInvested;
  const plPct = totalInvested > 0 ? (pl / totalInvested) * 100 : 0;
  const plColor = pl >= 0 ? '#2DA44E' : '#E5383B';

  const visible = filter === 'all' ? items : items.filter((i) => i.category === filter);
  const visibleInvested = visible.reduce((s, i) => s + (i.invested || 0), 0);
  const visibleCurrent = visible.reduce((s, i) => s + (i.current || 0), 0);

  const formValid =
    name.trim() &&
    toNum(invested) > 0 &&
    (autoCurrent > 0 || (manualCurrent && toNum(current) > 0)) &&
    (!fundLinked || unitsNum > 0) &&
    (category !== 'Digital Gold' || !(gramsNum > 0) || rateNum > 0) &&
    (!sipAllowed || !sipOn || toNum(sipAmount) > 0);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
      <Header title="My Investments" subtitle="Savings & investments, all in one place" />

      <View style={styles.content}>
        <SyncRow synced={synced} pulling={pulling} pullInfo={pullInfo} onPull={pullNow} />

        <View
          style={[
            styles.summaryCard,
            { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow },
          ]}
        >
          <View style={styles.summaryRow}>
            <View style={styles.summaryCol}>
              <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Invested</Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>{money(totalInvested)}</Text>
            </View>
            <View style={styles.summaryCol}>
              <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Current value</Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>{money(totalCurrent)}</Text>
            </View>
          </View>
          <View style={[styles.plRow, { borderTopColor: theme.borderNeutral }]}>
            <Text style={[styles.plLabel, { color: theme.textMuted }]}>
              Overall {pl >= 0 ? 'gain' : 'loss'}
            </Text>
            <Text style={[styles.plValue, { color: plColor }]}>
              {pl >= 0 ? '+' : ''}
              {money(Math.abs(pl))} ({pl >= 0 ? '+' : ''}
              {plPct.toFixed(1)}%)
            </Text>
          </View>
          {linkedFunds.length > 0 ? (
            <View style={styles.liveRow}>
              <Ionicons name="pulse-outline" size={15} color={theme.textMuted} />
              <Text style={[styles.liveText, { color: theme.textMuted }]}>
                Mutual funds at latest NAV{pricesAsOf ? ` · ${shortDate(pricesAsOf)}` : ''}
              </Text>
              <TouchableOpacity
                onPress={refreshPrices}
                disabled={refreshing}
                style={styles.liveBtn}
                accessibilityLabel="Refresh fund prices"
              >
                {refreshing ? (
                  <ActivityIndicator size="small" color={theme.primary} />
                ) : (
                  <Ionicons name="refresh" size={17} color={theme.primary} />
                )}
              </TouchableOpacity>
            </View>
          ) : null}
          {goldItems.some((i) => i.grams > 0) ? (
            <View style={styles.liveRow}>
              <Ionicons name="diamond-outline" size={15} color={theme.textMuted} />
              <Text style={[styles.liveText, { color: theme.textMuted }]}>
                Gold {goldRate ? `${money(goldRate)}/g` : 'rate not set'}
                {latestGold?.rateSource === 'live'
                  ? ` · live sell rate${goldInfo ? '' : `, ${shortDate(latestGold.rateDate)}`}`
                  : latestGold?.rateDate
                    ? ` · set by you, ${shortDate(latestGold.rateDate)}`
                    : ''}
              </Text>
              <TouchableOpacity onPress={openRate} style={styles.liveBtn} accessibilityLabel="Update gold rate">
                <Text style={[styles.liveLink, { color: theme.primary }]}>Set</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <View style={styles.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
            <TouchableOpacity
              style={[
                styles.chip,
                {
                  backgroundColor: filter === 'all' ? theme.primary : theme.surface,
                  borderColor: filter === 'all' ? theme.primaryDark : theme.borderNeutral,
                },
              ]}
              onPress={() => setFilter('all')}
            >
              <Text style={[styles.chipText, { color: theme.text }]}>All</Text>
            </TouchableOpacity>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c.key}
                style={[
                  styles.chip,
                  {
                    backgroundColor: filter === c.key ? c.color : theme.surface,
                    borderColor: filter === c.key ? c.color : theme.borderNeutral,
                  },
                ]}
                onPress={() => setFilter(c.key)}
              >
                <Text style={[styles.chipText, { color: theme.text }]}>{c.key}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {visible.length > 0 ? (
          <Text style={[styles.visibleTotal, { color: theme.textMuted }]}>
            {filter === 'all' ? 'All holdings' : filter} · invested {money(visibleInvested)} → now{' '}
            {money(visibleCurrent)}
          </Text>
        ) : null}

        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="trending-up-outline" size={56} color={theme.textMuted} />
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                No investments yet. Tap + to add mutual funds, stocks, gold or FDs.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const meta = categoryMeta(item.category);
            const itemPl = (item.current || 0) - (item.invested || 0);
            const itemPlPct =
              item.invested > 0 ? ((item.current - item.invested) / item.invested) * 100 : 0;
            return (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    shadowColor: theme.shadow,
                  },
                ]}
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.catIcon, { backgroundColor: meta.color + '40' }]}>
                    <Ionicons name={meta.icon} size={19} color="#455A64" />
                  </View>
                  <View style={styles.cardMeta}>
                    <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[styles.cardSub, { color: theme.textSecondary }]} numberOfLines={1}>
                      {isLinkedFund(item)
                        ? `${item.units} units${item.nav ? ` · NAV ₹${item.nav}` : ''}${item.navDate ? ` (${shortDate(item.navDate)})` : ''}`
                        : isWeighedGold(item)
                          ? `${item.grams} g · ${money(item.rate)}/g`
                          : `${item.category}${item.detail ? ` · ${item.detail}` : ''}`}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.iconBtn} onPress={() => openEdit(item)}>
                    <Ionicons name="create-outline" size={19} color={theme.primaryDark} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.iconBtn} onPress={() => deleteItem(item)}>
                    <Ionicons name="trash-outline" size={19} color={theme.danger} />
                  </TouchableOpacity>
                </View>

                <View style={styles.amountsRow}>
                  <View style={styles.amountCol}>
                    <Text style={[styles.amountLabel, { color: theme.textMuted }]}>Invested</Text>
                    <Text style={[styles.amountValue, { color: theme.text }]}>
                      {money(item.invested)}
                    </Text>
                  </View>
                  <Ionicons name="arrow-forward" size={14} color={theme.textMuted} />
                  <View style={styles.amountCol}>
                    <Text style={[styles.amountLabel, { color: theme.textMuted }]}>
                      {item.category === 'FD' ? 'Maturity' : 'Current'}
                    </Text>
                    <Text style={[styles.amountValue, { color: theme.text }]}>
                      {money(item.current)}
                    </Text>
                  </View>
                  <View style={[styles.plBadge, { backgroundColor: itemPl >= 0 ? '#A5D6A740' : '#EF9A9A40' }]}>
                    <Text style={[styles.plBadgeText, { color: itemPl >= 0 ? '#2DA44E' : '#E5383B' }]}>
                      {itemPl >= 0 ? '+' : ''}
                      {itemPlPct.toFixed(1)}%
                    </Text>
                  </View>
                </View>

                {hasSip(item) ? (
                  <TouchableOpacity
                    style={[styles.sipRow, { borderTopColor: theme.borderNeutral }]}
                    onPress={() => openPlan(item)}
                    accessibilityLabel={`SIP plan for ${item.name}`}
                  >
                    <Ionicons name="repeat-outline" size={15} color={theme.primary} />
                    <Text style={[styles.sipText, { color: theme.textSecondary }]} numberOfLines={1}>
                      SIP {money(item.sip.amount)} on day {item.sip.day}
                      {(() => {
                        const next = upcomingSipMonths(item, todayKey(), 1)[0];
                        return next
                          ? ` · next ${shortDate(sipDueDate(item, next))} ${money(sipAmountFor(item, next))}`
                          : '';
                      })()}
                    </Text>
                    <Text style={[styles.liveLink, { color: theme.primary }]}>Plan</Text>
                  </TouchableOpacity>
                ) : null}

                {item.note ? (
                  <Text style={[styles.note, { color: theme.textSecondary }]} numberOfLines={2}>
                    {item.note}
                  </Text>
                ) : null}
              </View>
            );
          }}
        />
      </View>

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.secondary, shadowColor: theme.secondary }]}
        onPress={openAdd}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={32} color="#FFF" />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.sheet }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {editingId ? 'Edit Investment' : 'Add Investment'}
              </Text>

              <Text style={[styles.fieldLabelText, { color: theme.textSecondary }]}>Category</Text>
              <View style={styles.catRow}>
                {CATEGORIES.map((c) => {
                  const selected = category === c.key;
                  return (
                    <TouchableOpacity
                      key={c.key}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: selected ? c.color : theme.surfaceAlt,
                          borderColor: selected ? c.color : theme.borderNeutral,
                        },
                      ]}
                      onPress={() => setCategory(c.key)}
                    >
                      <Text style={[styles.chipText, { color: theme.text }]}>{c.key}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {category === 'Mutual Funds' && fundLinked ? (
                <View style={[styles.linkedFund, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral }]}>
                  <View style={styles.flex}>
                    <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>
                      {name}
                    </Text>
                    <Text style={[styles.cardSub, { color: theme.textSecondary }]}>
                      {nav ? `NAV ₹${nav}${navDate ? ` · ${shortDate(navDate)}` : ''}` : 'Getting latest NAV…'}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={unlinkFund} style={styles.liveBtn}>
                    <Text style={[styles.liveLink, { color: theme.primary }]}>Change</Text>
                  </TouchableOpacity>
                </View>
              ) : category === 'Mutual Funds' ? (
                <>
                  <View style={styles.searchRow}>
                    <TextInput
                      style={[styles.input, styles.flex, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                      placeholder="Search fund (e.g. parag flexi)"
                      placeholderTextColor={theme.textMuted}
                      value={query}
                      onChangeText={setQuery}
                      onSubmitEditing={runSearch}
                      returnKeyType="search"
                    />
                    <TouchableOpacity
                      style={[styles.searchBtn, { backgroundColor: theme.primary }, query.trim().length < 3 && styles.btnDisabled]}
                      onPress={runSearch}
                      disabled={query.trim().length < 3 || searching}
                      accessibilityLabel="Search funds"
                    >
                      {searching ? (
                        <ActivityIndicator size="small" color={theme.onPrimary} />
                      ) : (
                        <Ionicons name="search" size={20} color={theme.onPrimary} />
                      )}
                    </TouchableOpacity>
                  </View>
                  {results.map((fund) => (
                    <TouchableOpacity
                      key={fund.schemeCode}
                      style={[styles.result, { borderColor: theme.borderNeutral }]}
                      onPress={() => pickFund(fund)}
                    >
                      <Text style={[styles.resultText, { color: theme.text }]}>{fund.schemeName}</Text>
                    </TouchableOpacity>
                  ))}
                  <Text style={[styles.formHint, { color: theme.textMuted }]}>
                    Pick your fund to value it automatically at the latest NAV. Choose the exact plan
                    (Direct/Regular, Growth/IDCW) shown on your statement. Or type a name below and
                    enter the value yourself.
                  </Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                    placeholder="Fund name (if not linking)"
                    placeholderTextColor={theme.textMuted}
                    value={name}
                    onChangeText={setName}
                  />
                </>
              ) : (
                <TextInput
                  style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                  placeholder={
                    category === 'Stocks'
                      ? 'Stock name (e.g. TCS)'
                      : category === 'Digital Gold'
                        ? 'Locker (e.g. PhonePe Gold, GPay Gold)'
                        : 'Bank / FD name'
                  }
                  placeholderTextColor={theme.textMuted}
                  value={name}
                  onChangeText={setName}
                />
              )}
              {lookupError ? <Text style={[styles.formHint, { color: theme.danger }]}>{lookupError}</Text> : null}

              {fundLinked ? (
                <TextInput
                  style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                  placeholder="Units held (from your statement, e.g. 152.347)"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="decimal-pad"
                  value={units}
                  onChangeText={setUnits}
                />
              ) : null}

              {category === 'Digital Gold' ? (
                <View style={styles.amountRow}>
                  <TextInput
                    style={[styles.input, styles.smallInput, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                    placeholder="Grams (e.g. 2.5)"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="decimal-pad"
                    value={grams}
                    onChangeText={setGrams}
                  />
                  <TextInput
                    style={[styles.input, styles.smallInput, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                    placeholder="Gold rate (₹/g)"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="decimal-pad"
                    value={rate}
                    onChangeText={setRate}
                  />
                </View>
              ) : null}

              <View style={styles.amountRow}>
                <TextInput
                  style={[styles.input, styles.smallInput, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                  placeholder="Amount invested (₹)"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="decimal-pad"
                  value={invested}
                  onChangeText={setInvested}
                />
                {manualCurrent ? (
                  <TextInput
                    style={[styles.input, styles.smallInput, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                    placeholder={CURRENT_LABELS[category] || 'Current value (₹)'}
                    placeholderTextColor={theme.textMuted}
                    keyboardType="decimal-pad"
                    value={current}
                    onChangeText={setCurrent}
                  />
                ) : null}
              </View>
              {!manualCurrent ? (
                <View style={[styles.autoValue, { borderColor: theme.borderNeutral }]}>
                  <Text style={[styles.amountLabel, { color: theme.textMuted }]}>Current value</Text>
                  <Text style={[styles.amountValue, { color: theme.text }]}>
                    {autoCurrent ? money(autoCurrent) : '—'}
                  </Text>
                  <Text style={[styles.cardSub, { color: theme.textMuted }]}>
                    {fundLinked
                      ? unitsNum > 0 && nav
                        ? `${unitsNum} units × NAV ₹${nav}`
                        : 'Enter your units to see the value'
                      : rateNum > 0
                        ? `${gramsNum} g × ${money(rateNum)}/g`
                        : 'Enter the gold rate to see the value'}
                  </Text>
                </View>
              ) : null}
              {category !== 'Mutual Funds' && category !== 'Digital Gold' ? (
                <TextInput
                  style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                  placeholder={DETAIL_PLACEHOLDERS[category] || 'Detail (optional)'}
                  placeholderTextColor={theme.textMuted}
                  value={detail}
                  onChangeText={setDetail}
                />
              ) : category === 'Mutual Funds' ? (
                <TextInput
                  style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                  placeholder={DETAIL_PLACEHOLDERS[category]}
                  placeholderTextColor={theme.textMuted}
                  value={detail}
                  onChangeText={setDetail}
                />
              ) : null}
              {sipAllowed ? (
                <>
                  <TouchableOpacity
                    style={styles.checkRow}
                    onPress={() => setSipOn(!sipOn)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: sipOn }}
                  >
                    <Ionicons name={sipOn ? 'checkbox' : 'square-outline'} size={22} color={theme.primary} />
                    <Text style={[styles.checkText, { color: theme.text }]}>Monthly SIP</Text>
                  </TouchableOpacity>
                  {sipOn ? (
                    <>
                      <View style={styles.amountRow}>
                        <TextInput
                          style={[styles.input, styles.smallInput, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                          placeholder="SIP amount (₹/month)"
                          placeholderTextColor={theme.textMuted}
                          keyboardType="decimal-pad"
                          value={sipAmount}
                          onChangeText={setSipAmount}
                        />
                        <TextInput
                          style={[styles.input, styles.smallInput, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                          placeholder="Day (1–28)"
                          placeholderTextColor={theme.textMuted}
                          keyboardType="number-pad"
                          value={sipDay}
                          onChangeText={setSipDay}
                        />
                      </View>
                      <Text style={[styles.formHint, { color: theme.textMuted }]}>
                        {editingId && hasSip(items.find((i) => i.id === editingId) || {})
                          ? 'Each installment is added on its day: to the amount invested'
                          : `Starts ${monthLabel(firstSipMonth(Math.min(28, Math.max(1, Math.round(toNum(sipDay)) || 1))), true)} (earlier ones are already in what you invested). Each installment is added on its day: to the amount invested`}
                        {fundLinked ? ', as units at that day’s NAV' : category === 'Digital Gold' && gramsNum > 0 ? ', as grams at the live buy rate' : ''}
                        {' '}— and to My Expenditure as an Investment. Change any month’s amount from “Plan”.
                      </Text>
                    </>
                  ) : null}
                </>
              ) : null}
              <TextInput
                style={[styles.input, styles.noteInput, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                placeholder="Note (optional)"
                placeholderTextColor={theme.textMuted}
                value={note}
                onChangeText={setNote}
                multiline
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { backgroundColor: theme.surfaceAlt }]}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.saveBtn,
                    { backgroundColor: theme.primary },
                    !formValid && styles.btnDisabled,
                  ]}
                  onPress={saveItem}
                  disabled={!formValid}
                >
                  <Text style={[styles.saveText, { color: theme.onPrimary }]}>
                    {editingId ? 'Update' : 'Save'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* SIP plan: custom amounts for coming months, recorded installments */}
      <Modal visible={!!planItem} transparent animationType="fade" onRequestClose={() => setPlanId(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.sheet }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              {planItem ? (
                <>
                  <Text style={[styles.modalTitle, styles.planTitle, { color: theme.text }]} numberOfLines={2}>
                    {planItem.name}
                  </Text>
                  <Text style={[styles.cardSub, styles.planSub, { color: theme.textSecondary }]}>
                    SIP {money(planItem.sip.amount)} on day {planItem.sip.day}. Set a different amount for
                    any month, or 0 to skip it.
                  </Text>
                  <Text style={[styles.fieldLabelText, { color: theme.textSecondary }]}>Coming up</Text>
                  {planMonths.map((month) => (
                    <View key={month} style={styles.planRow}>
                      <Text style={[styles.planMonth, { color: theme.text }]}>
                        {shortDate(sipDueDate(planItem, month))} {month.slice(0, 4)}
                      </Text>
                      <TextInput
                        style={[styles.input, styles.planInput, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                        keyboardType="decimal-pad"
                        value={planDrafts[month] ?? ''}
                        onChangeText={(text) => setPlanDrafts((d) => ({ ...d, [month]: text }))}
                        placeholder={String(planItem.sip.amount)}
                        placeholderTextColor={theme.textMuted}
                        accessibilityLabel={`Amount for ${monthLabel(month)}`}
                      />
                    </View>
                  ))}
                  {sipHistory(planItem).length ? (
                    <>
                      <Text style={[styles.fieldLabelText, styles.planHistory, { color: theme.textSecondary }]}>Recorded</Text>
                      {sipHistory(planItem).slice(0, 12).map((h) => (
                        <View key={h.month} style={styles.planRow}>
                          <Text style={[styles.planMonth, { color: h.skipped ? theme.textMuted : theme.text }]}>
                            {monthLabel(h.month)}
                          </Text>
                          <Text style={[styles.planDone, { color: h.skipped ? theme.textMuted : theme.text }]} numberOfLines={1}>
                            {h.skipped
                              ? 'Skipped'
                              : `${money(h.amount)}${h.units ? ` · ${h.units} units` : h.grams ? ` · ${h.grams} g` : ''}`}
                          </Text>
                          <TouchableOpacity
                            onPress={() => (h.skipped ? recordSkipped(h.month) : undoInstallment(h.month))}
                            style={styles.liveBtn}
                          >
                            <Text style={[styles.liveLink, { color: h.skipped ? theme.primary : theme.danger }]}>
                              {h.skipped ? 'Record' : 'Undo'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </>
                  ) : null}
                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={[styles.cancelBtn, { backgroundColor: theme.surfaceAlt }]}
                      onPress={() => setPlanId(null)}
                    >
                      <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Close</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.saveBtn, { backgroundColor: theme.primary }]} onPress={savePlan}>
                      <Text style={[styles.saveText, { color: theme.onPrimary }]}>Save amounts</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Today's gold rate, applied to every gold locker */}
      <Modal visible={rateVisible} transparent animationType="fade" onRequestClose={() => setRateVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.sheet }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Gold rate</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
              placeholder="₹ per gram (e.g. 7450)"
              placeholderTextColor={theme.textMuted}
              keyboardType="decimal-pad"
              value={rateDraft}
              onChangeText={setRateDraft}
              autoFocus
            />
            <Text style={[styles.formHint, { color: theme.textMuted }]}>
              The live rate is filled in automatically when available. Set one yourself to use
              your gold app&apos;s sell rate instead; it updates every gold locker at once and is
              replaced by the live rate next time it loads.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.cancelBtn, { backgroundColor: theme.surfaceAlt }]}
                onPress={() => setRateVisible(false)}
              >
                <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: theme.primary }, !(toNum(rateDraft) > 0) && styles.btnDisabled]}
                onPress={saveRate}
                disabled={!(toNum(rateDraft) > 0)}
              >
                <Text style={[styles.saveText, { color: theme.onPrimary }]}>Update all</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  list: { paddingBottom: 90 },
  summaryCard: {
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryRow: { flexDirection: 'row' },
  summaryCol: { flex: 1 },
  summaryLabel: { fontSize: 12, fontWeight: '600' },
  summaryValue: { fontSize: 22, fontWeight: 'bold', marginTop: 4 },
  plRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    marginTop: 14,
    paddingTop: 12,
  },
  plLabel: { fontSize: 13, fontWeight: '600' },
  plValue: { fontSize: 16, fontWeight: '800' },
  filterRow: { marginBottom: 10 },
  filterChips: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '600' },
  visibleTotal: { fontSize: 11, fontWeight: '600', marginBottom: 10 },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyText: { marginTop: 12, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
  card: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  catIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardMeta: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardSub: { fontSize: 12, marginTop: 2 },
  iconBtn: { padding: 6 },
  amountsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  amountCol: { flex: 1 },
  amountLabel: { fontSize: 11, fontWeight: '600' },
  amountValue: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  plBadge: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 10 },
  plBadgeText: { fontSize: 12, fontWeight: '800' },
  note: { fontSize: 12, marginTop: 8 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 100,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modal: { borderRadius: 20, padding: 20, maxHeight: '85%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  fieldLabelText: { fontSize: 12, fontWeight: '600', marginBottom: 8, letterSpacing: 0.5 },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  amountRow: { flexDirection: 'row', gap: 12 },
  smallInput: { flex: 1, minWidth: 0 },
  noteInput: { minHeight: 70, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600' },
  saveBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '600' },
  btnDisabled: { opacity: 0.4 },
  flex: { flex: 1, minWidth: 0 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  liveText: { flex: 1, fontSize: 12, fontWeight: '600' },
  liveBtn: { paddingHorizontal: 6, paddingVertical: 2, minWidth: 28, alignItems: 'center' },
  liveLink: { fontSize: 13, fontWeight: '700' },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchBtn: { width: 50, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  result: { borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 6 },
  resultText: { fontSize: 13 },
  formHint: { fontSize: 12, marginTop: -4, marginBottom: 12, lineHeight: 17 },
  linkedFund: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  sipRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 1, marginTop: 10, paddingTop: 8 },
  sipText: { flex: 1, fontSize: 12, fontWeight: '600' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  checkText: { fontSize: 14, fontWeight: '600', flex: 1 },
  planTitle: { marginBottom: 4 },
  planSub: { marginBottom: 14, lineHeight: 17 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  planMonth: { width: 96, fontSize: 13, fontWeight: '600' },
  planInput: { flex: 1, minWidth: 0, marginBottom: 0, paddingVertical: 8 },
  planDone: { flex: 1, fontSize: 13 },
  planHistory: { marginTop: 12 },
  autoValue: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
});
