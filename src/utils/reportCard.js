// Report cards: is the signal engine (or your setup checks) actually
// working? Judged on closed paper trades, net of estimated charges.

import { performanceStats } from '../engine/stats.js';
import { tradeStats } from './trades';

export const MIN_TRADES = 20; // fewer than this is too small a sample to judge

/**
 * A plain-words verdict from trade count, win rate, profit factor and net:
 * { level: 'early' | 'building' | 'good' | 'mixed' | 'bad', label, text }.
 */
export function verdict({ trades, winRate, profitFactor, net, avgR }) {
  if (!trades) {
    return { level: 'early', label: 'No data yet', text: 'No closed paper trades yet. Let the scanner or demo trades run for a few days.' };
  }
  if (trades < 10) {
    return {
      level: 'early',
      label: 'Too early',
      text: `Only ${trades} closed trade${trades === 1 ? '' : 's'} — a handful of trades says little. Keep paper trading until there are at least ${MIN_TRADES}.`,
    };
  }
  const losing = net < 0 || (profitFactor != null && profitFactor < 1);
  const good = !losing && (profitFactor == null || profitFactor >= 1.3) && (winRate ?? 0) >= 45 && (avgR == null || avgR > 0);
  if (trades < MIN_TRADES) {
    return {
      level: 'building',
      label: `Building (${trades}/${MIN_TRADES})`,
      text: losing
        ? `Losing so far on ${trades} trades. Too few to be sure, but don't use real money with these settings yet.`
        : `${good ? 'Looking promising' : 'Roughly break-even'} on ${trades} trades. Keep going to ${MIN_TRADES} before trusting it.`,
    };
  }
  if (losing) {
    return { level: 'bad', label: 'Losing', text: 'Losing money on paper after charges. Don’t trade real money with these settings — change the rules or the watchlist first.' };
  }
  if (good) {
    return { level: 'good', label: 'Promising', text: 'Making money on paper after charges. Keep watching it for another few weeks before using real money, and size small.' };
  }
  return { level: 'mixed', label: 'Mixed', text: 'About break-even after charges: some wins, some losses, no clear edge yet.' };
}

export const VERDICT_COLOR = { early: '#8E8E93', building: '#5E5CE6', good: '#2DA44E', mixed: '#F59E0B', bad: '#E5383B' };

/**
 * Engine report card from its paper/demo trades (enginetrades) over the
 * last `days` days, and today's logged signals (kept one day) for why it
 * held back: { stats, verdict, counts, waitReasons: [{ label, count, pct }] }.
 */
export function engineReport(trades, signals = [], { days = 30, now = Date.now() } = {}) {
  const since = now - days * 86400000;
  const recent = trades.filter((t) => (t.exitTime || t.signalTime || 0) >= since);
  const stats = performanceStats(recent);
  const counts = { candidates: 0, wait: 0, noTrade: 0, neutral: 0 };
  const reasons = {};
  let held = 0;
  signals.forEach((s) => {
    if (s.state === 'BUY CANDIDATE' || s.state === 'SELL CANDIDATE') counts.candidates += 1;
    else if (s.state === 'WAIT') counts.wait += 1;
    else if (s.state === 'NO TRADE') counts.noTrade += 1;
    else counts.neutral += 1;
    if (s.state === 'WAIT' || s.state === 'NO TRADE') {
      held += 1;
      (s.failedConditions || []).forEach((label) => {
        reasons[label] = (reasons[label] || 0) + 1;
      });
    }
  });
  const waitReasons = Object.entries(reasons)
    .map(([label, count]) => ({ label, count, pct: held ? Math.round((count / held) * 100) : 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
  return {
    stats,
    verdict: verdict({ trades: stats.trades, winRate: stats.winRate, profitFactor: stats.profitFactor, net: stats.netPnl, avgR: stats.avgR }),
    counts,
    waitReasons,
  };
}

/**
 * Setup report card from your closed paper trades: overall numbers, how
 * trades taken on each setup signal did, and how often you followed plan.
 */
export function setupReport(paperTrades) {
  const closed = paperTrades.filter((t) => t.status === 'closed');
  const stats = tradeStats(closed);
  const net = stats.net.INR + stats.net.USD;
  const fromChecks = closed.filter((t) => t.setupSignal).length;
  return {
    stats,
    fromChecks,
    verdict: verdict({ trades: stats.count, winRate: stats.winRate, profitFactor: stats.profitFactor.INR, net, avgR: stats.avgR }),
  };
}
