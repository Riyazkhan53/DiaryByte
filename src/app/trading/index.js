import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AiChat from '../../components/ai/AiChat';
import Demat from '../../components/trading/Demat';
import Header from '../../components/Header';
import SetupCheck from '../../components/trading/SetupCheck';
import OpenTrades from '../../components/trading/OpenTrades';
import CompletedTrades from '../../components/trading/CompletedTrades';
import TradeForm from '../../components/trading/TradeForm';
import Signals from '../../components/trading/Signals';
import History from '../../components/trading/History';
import { DEFAULT_CONFIG } from '../../engine/risk.js';
import { useTheme } from '../../hooks/useTheme';
import { useSyncedCollection } from '../../hooks/useSyncedCollection';

const TRADES_KEY = '@diarybyte_trades';

const makeId = () => `${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * My Trading: Setup Check, intraday signals, signal history with paper
 * performance, open paper trades and completed ones to review, under one tab.
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
  const tabScroll = useRef(null);
  // Trade form: `initial` is a trade to edit, a draft, or null; the key resets it.
  const [form, setForm] = useState({ visible: false, initial: null, key: 0 });

  const openCount = trades.filter((t) => t.status !== 'closed').length;
  const closedCount = trades.length - openCount;
  const tabs = [
    { key: 'setup', label: 'Setup' },
    { key: 'signals', label: 'Signals' },
    { key: 'history', label: 'History' },
    { key: 'open', label: `Open${openCount ? ` (${openCount})` : ''}` },
    { key: 'completed', label: `Done${closedCount ? ` (${closedCount})` : ''}` },
    { key: 'demat', label: 'Demat', icon: 'wallet-outline' },
    { key: 'ai', label: 'StockByte AI', icon: 'sparkles' },
  ];

  const showForm = (initial) => setForm((f) => ({ visible: true, initial, key: f.key + 1 }));
  const hideForm = () => setForm((f) => ({ ...f, visible: false }));

  // "Paper trade this" on a Setup Check: long on BUY, short on SELL. With the
  // intraday engine's plan, its entry, stop, target and quantity too.
  const tradeFromCheck = (check) => {
    const plan = check.plan;
    setTab('open');
    showForm({
      symbol: check.symbol,
      name: check.name,
      market: check.market,
      side: plan ? plan.side : check.signal === 'SELL' ? 'short' : 'long',
      entryPrice: plan ? plan.entry : check.price,
      ...(plan ? { stopLoss: plan.stop, target: plan.target, quantity: plan.quantity } : {}),
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

  // Scrolls sideways: six tabs don't fit a phone's width.
  const tabBar = (
    <ScrollView
      ref={tabScroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      // Keep the last tabs (Demat, AI) in view when one is open.
      onContentSizeChange={() => (tab === 'ai' || tab === 'demat') && tabScroll.current?.scrollToEnd({ animated: false })}
      style={[styles.tabs, { backgroundColor: theme.surfaceAlt }]}
      contentContainerStyle={styles.tabsInner}
    >
      {tabs.map((t) => {
        const selected = tab === t.key;
        const ai = t.key === 'ai';
        return (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, selected && [styles.tabSelected, { backgroundColor: theme.sheet, shadowColor: theme.shadow }]]}
            onPress={() => setTab(t.key)}
          >
            {t.icon ? <Ionicons name={t.icon} size={13} color={ai ? '#7C3AED' : theme.textSecondary} /> : null}
            <Text
              style={[styles.tabText, { color: ai ? '#7C3AED' : selected ? theme.text : theme.textSecondary }]}
              numberOfLines={1}
            >
              {t.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
  const sync = { synced, pulling, pullInfo, onPull: pullNow };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
      <Header title="My Trading" subtitle="Setup checks, intraday signals and paper trades" />

      {tab === 'setup' ? (
        <SetupCheck header={tabBar} onPaperTrade={tradeFromCheck} trades={trades} />
      ) : tab === 'signals' ? (
        <Signals header={tabBar} onPaperTrade={tradeFromSignal} />
      ) : tab === 'history' ? (
        <History header={tabBar} watchlist={config.watchlist || []} />
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
      ) : tab === 'demat' ? (
        <Demat header={tabBar} />
      ) : tab === 'ai' ? (
        <AiChat
          kind="stock"
          header={tabBar}
          title="StockByte AI"
          tagline="Asks the signal engine, the daily chart and your trades, then explains buy / sell / wait."
          icon="sparkles"
          gradient={['#4F46E5', '#7C3AED']}
          thinkingText="Checking the engine and the chart…"
          suggestions={[
            `Should I buy ${(config.watchlist?.[0] || 'TATAPOWER.NS').replace(/\.NS$/, '')} now?`,
            'Review my watchlist: anything worth trading today?',
            'Why does the engine keep saying WAIT?',
            'How are my paper trades doing, and what should I change?',
          ]}
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
  tabs: { flexGrow: 0, borderRadius: 12, marginBottom: 12 },
  tabsInner: { padding: 3, gap: 2 },
  tab: { flexDirection: 'row', gap: 4, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center' },
  tabSelected: { shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3, elevation: 2 },
  tabText: { fontSize: 12, fontWeight: '600' },
});
