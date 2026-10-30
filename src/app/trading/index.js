import { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView } from 'react-native';
import Header from '../../components/Header';
import SetupCheck from '../../components/trading/SetupCheck';
import OpenTrades from '../../components/trading/OpenTrades';
import CompletedTrades from '../../components/trading/CompletedTrades';
import TradeForm from '../../components/trading/TradeForm';
import Signals from '../../components/trading/Signals';
import { DEFAULT_CONFIG } from '../../engine/risk.js';
import { useTheme } from '../../hooks/useTheme';
import { useSyncedCollection } from '../../hooks/useSyncedCollection';

const TRADES_KEY = '@diarybyte_trades';

const makeId = () => `${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * My Trading: Setup Check, open paper trades and completed ones to review,
 * under one tab.
 */
export default function TradingScreen() {
  const { theme } = useTheme();
  const { items: trades, synced, persist, pulling, pullInfo, pullNow } = useSyncedCollection(
    'trades',
    TRADES_KEY
  );
  const { items: configDocs } = useSyncedCollection('tradingconfig', '@diarybyte_tradingconfig');
  const config = { ...DEFAULT_CONFIG, ...(configDocs[0] || {}) };
  const [tab, setTab] = useState('setup');
  // Trade form: `initial` is a trade to edit, a draft, or null; the key resets it.
  const [form, setForm] = useState({ visible: false, initial: null, key: 0 });

  const openCount = trades.filter((t) => t.status !== 'closed').length;
  const closedCount = trades.length - openCount;
  const tabs = [
    { key: 'setup', label: 'Setup' },
    { key: 'signals', label: 'Signals' },
    { key: 'open', label: `Open${openCount ? ` (${openCount})` : ''}` },
    { key: 'completed', label: `Done${closedCount ? ` (${closedCount})` : ''}` },
  ];

  const showForm = (initial) => setForm((f) => ({ visible: true, initial, key: f.key + 1 }));
  const hideForm = () => setForm((f) => ({ ...f, visible: false }));

  // "Paper trade this" on a Setup Check: long on BUY, short on SELL.
  const tradeFromCheck = (check) => {
    setTab('open');
    showForm({
      symbol: check.symbol,
      name: check.name,
      market: check.market,
      side: check.signal === 'SELL' ? 'short' : 'long',
      entryPrice: check.price,
      setupId: check.id,
      setupSignal: check.signal,
      setupBullPct: check.bullPct,
      setupBearPct: check.bearPct,
    });
  };

  // "Paper trade this plan myself" from Signals: the engine's plan, prefilled.
  const tradeFromSignal = (draft) => {
    setTab('open');
    showForm(draft);
  };

  const saveTrade = (trade) => {
    const now = new Date().toISOString();
    if (trade.id) {
      persist(trades.map((t) => (t.id === trade.id ? { ...trade, updatedAt: now } : t)));
    } else {
      persist([{ ...trade, id: makeId(), status: 'open', createdAt: now, updatedAt: now }, ...trades]);
    }
    hideForm();
  };

  const tabBar = (
    <View style={[styles.tabs, { backgroundColor: theme.surfaceAlt }]}>
      {tabs.map((t) => {
        const selected = tab === t.key;
        return (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, selected && [styles.tabSelected, { backgroundColor: theme.sheet, shadowColor: theme.shadow }]]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabText, { color: selected ? theme.text : theme.textSecondary }]} numberOfLines={1}>
              {t.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
  const sync = { synced, pulling, pullInfo, onPull: pullNow };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
      <Header title="My Trading" subtitle="Setup checks, intraday signals and paper trades" />

      {tab === 'setup' ? (
        <SetupCheck header={tabBar} onPaperTrade={tradeFromCheck} />
      ) : tab === 'signals' ? (
        <Signals header={tabBar} onPaperTrade={tradeFromSignal} />
      ) : tab === 'open' ? (
        <OpenTrades
          header={tabBar}
          trades={trades}
          persist={persist}
          sync={sync}
          onNew={() => showForm(null)}
          onEdit={showForm}
          config={config}
        />
      ) : (
        <CompletedTrades header={tabBar} trades={trades} persist={persist} sync={sync} />
      )}

      <TradeForm
        key={form.key}
        visible={form.visible}
        initial={form.initial}
        onSave={saveTrade}
        onClose={hideForm}
        config={config}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabs: { flexDirection: 'row', borderRadius: 12, padding: 3, marginBottom: 12 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  tabSelected: { shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3, elevation: 2 },
  tabText: { fontSize: 13, fontWeight: '600' },
});
