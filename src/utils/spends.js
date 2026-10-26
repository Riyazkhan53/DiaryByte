// Total Spend: every rupee spent in a month and what it was paid from.
//
// A spend can also be counted in the month's expenses ("Add to expenses").
// That expense is linked back with `sourceId: 'spend:<id>'`, so editing the
// spend updates it and unticking or deleting the spend removes it.

export const SPEND_SOURCES = [
  { key: 'card', label: 'Credit card', icon: 'card-outline', color: '#FF9500' },
  { key: 'cred', label: 'CRED wallet', icon: 'wallet-outline', color: '#1C1C1E' },
  { key: 'icici', label: 'ICICI account', icon: 'business-outline', color: '#F37021' },
  { key: 'canara', label: 'Canara account', icon: 'business-outline', color: '#0091D5' },
  { key: 'jupiter', label: 'Jupiter account', icon: 'planet-outline', color: '#FF6F61' },
  { key: 'cash', label: 'Cash in hand', icon: 'cash-outline', color: '#34C759' },
  { key: 'other', label: 'Other', icon: 'ellipsis-horizontal-outline', color: '#8E8E93' },
];

export const spendSourceMeta = (key) =>
  SPEND_SOURCES.find((s) => s.key === key) || SPEND_SOURCES[SPEND_SOURCES.length - 1];

/** Where a spend was paid from, e.g. "HDFC Visa ••4242" or "Cash in hand". */
export function spendSourceLabel(spend) {
  if (spend.source === 'card') return spend.cardLabel || 'Credit card';
  if (spend.source === 'other') return spend.sourceNote || 'Other';
  return spendSourceMeta(spend.source).label;
}

export const spendExpenseId = (spendId) => `spend:${spendId}`;

/** True when an expense came from a Total Spend entry. */
export const isSpendExpense = (expense) => (expense.sourceId || '').startsWith('spend:');

/**
 * Bring the expenses list in line with one spend: add or update its linked
 * expense when "Add to expenses" is on, remove it when off (or `spend` is
 * null, i.e. the spend was deleted — pass its id as `spendId`).
 */
export function syncSpendExpense(expenses, spend, spendId = spend?.id) {
  const sourceId = spendExpenseId(spendId);
  const existing = expenses.find((e) => e.sourceId === sourceId);
  const rest = expenses.filter((e) => e.sourceId !== sourceId);
  if (!spend || !spend.addToExpenses) return existing ? rest : expenses;
  const expense = {
    ...existing,
    id: existing?.id || `${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`,
    title: spend.title,
    amount: spend.amount,
    category: spend.category || 'Other',
    month: spend.month,
    date: spend.date,
    createdAt: existing?.createdAt || new Date().toISOString(),
    sourceId,
  };
  return existing ? expenses.map((e) => (e.sourceId === sourceId ? expense : e)) : [expense, ...expenses];
}

/** Month total and per-source breakdown (each credit card listed on its own). */
export function spendBreakdown(spends) {
  const groups = new Map();
  spends.forEach((s) => {
    const key = s.source === 'card' ? `card:${s.cardId || s.cardLabel || ''}` : s.source;
    const group = groups.get(key) || {
      key,
      source: s.source,
      label: s.source === 'card' ? spendSourceLabel(s) : spendSourceMeta(s.source).label,
      amount: 0,
      count: 0,
    };
    group.amount += Number(s.amount) || 0;
    group.count += 1;
    groups.set(key, group);
  });
  const total = spends.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  const counted = spends
    .filter((s) => s.addToExpenses)
    .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  return { total, counted, groups: [...groups.values()].sort((a, b) => b.amount - a.amount) };
}
