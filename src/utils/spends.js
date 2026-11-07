// Total Spend: every rupee spent in a month and what it was paid from.
//
// A spend can be marked `avoidable` (could have skipped it); those add up
// to what the month could have saved.
//
// A spend can also be counted in the month's expenses ("Add to expenses").
// That expense is linked back with `sourceId: 'spend:<id>'`, so editing the
// spend updates it and unticking or deleting the spend removes it.
//
// A spend paid by credit card is added to that card's bill for the next
// month in Debts (created if there isn't one yet). The bill remembers what
// each spend added in `spendAmounts`, so editing or deleting the spend
// changes the bill to match.

import { addMonths, billMonth, dueDateFor, isRecurringBill, sectionOf } from './debts';

export const SPEND_SOURCES = [
  { key: 'card', label: 'Credit card', icon: 'card-outline', color: '#FF9500' },
  { key: 'cred', label: 'CRED wallet', icon: 'wallet-outline', color: '#8E8E93' },
  { key: 'icici', label: 'ICICI account', icon: 'business-outline', color: '#F37021' },
  { key: 'canara', label: 'Canara account', icon: 'business-outline', color: '#0091D5' },
  { key: 'jupiter', label: 'Jupiter account', icon: 'planet-outline', color: '#FF6F61' },
  { key: 'cash', label: 'Cash in hand', icon: 'cash-outline', color: '#34C759' },
  { key: 'other', label: 'Other', icon: 'ellipsis-horizontal-outline', color: '#A2845E' },
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

/**
 * Month total, how much was avoidable, how much is counted in expenses and
 * the per-source breakdown (each credit card listed on its own).
 */
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
  const sumOf = (list) => list.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  const counted = sumOf(spends.filter((s) => s.addToExpenses));
  const avoidableSpends = spends.filter((s) => s.avoidable);
  return {
    total,
    counted,
    avoidable: sumOf(avoidableSpends),
    avoidableCount: avoidableSpends.length,
    groups: [...groups.values()].sort((a, b) => b.amount - a.amount),
  };
}

// ------- credit card spends → next month's card bill -------

const round2 = (n) => Math.round(n * 100) / 100;
const makeId = () => `${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`;
const norm = (text) => (text || '').trim().toLowerCase();

/** The month whose card bill a spend made in `month` goes on. */
export const cardBillMonth = (month) => addMonths(month, 1);

const isCardBill = (item) => sectionOf(item) === 'card' && !isRecurringBill(item);

// Same card: by the saved card's id, or by name for a card typed in by hand.
function sameCard(bill, spend) {
  if (spend.cardId) return bill.cardId === spend.cardId;
  return !bill.cardId && norm(bill.name) === norm(spend.cardLabel);
}

/**
 * Bring the Debts list in line with one spend: take back whatever it added
 * to a card bill before, then (if it was paid by card) add its amount to that
 * card's bill for the next month, creating the bill if needed. Pass
 * `spend` null when it was deleted (with its id as `spendId`).
 * Returns `debts` itself when nothing changed.
 */
export function syncSpendCardBill(debts, spend, spendId = spend?.id, newBillNote = 'From Total Spend') {
  const now = new Date().toISOString();
  let changed = false;

  // 1. Undo this spend's earlier share.
  let next = debts.map((bill) => {
    const share = bill.spendAmounts?.[spendId];
    if (share == null) return bill;
    changed = true;
    const { [spendId]: _gone, ...rest } = bill.spendAmounts;
    return {
      ...bill,
      amount: round2(Math.max(0, (Number(bill.amount) || 0) - share)),
      spendAmounts: rest,
      updatedAt: now,
    };
  });
  // A bill made only from spends goes away once none are left on it.
  next = next.filter(
    (bill) =>
      !(bill.fromSpends && !bill.paid && !Object.keys(bill.spendAmounts || {}).length && !(Number(bill.amount) > 0))
  );

  // 2. Add it to next month's bill for that card.
  const amount = Number(spend?.amount) || 0;
  if (!spend || spend.source !== 'card' || amount <= 0 || !spend.month) return changed ? next : debts;
  const month = cardBillMonth(spend.month);
  const bills = next.filter((bill) => isCardBill(bill) && sameCard(bill, spend));
  const target = bills.find((bill) => billMonth(bill) === month);
  if (target) {
    return next.map((bill) =>
      bill.id === target.id
        ? {
            ...bill,
            amount: round2((Number(bill.amount) || 0) + amount),
            spendAmounts: { ...(bill.spendAmounts || {}), [spend.id]: amount },
            updatedAt: now,
          }
        : bill
    );
  }
  // No bill yet: due on the same day as this card's latest bill, else the 1st.
  const latest = bills
    .filter((bill) => bill.dueDate)
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0];
  const dueDate = dueDateFor(month, latest ? Number(latest.dueDate.slice(8, 10)) : 1);
  const last4 = /(\d{4})\s*$/.exec(spend.cardLabel || '')?.[1];
  const bill = {
    id: makeId(),
    section: 'card',
    name: spend.cardLabel || 'Credit card',
    amount: round2(amount),
    minDue: 0,
    cardId: spend.cardId || undefined,
    cardLast4: last4 || undefined,
    dueDate,
    month,
    paid: false,
    note: newBillNote,
    fromSpends: true,
    spendAmounts: { [spend.id]: amount },
    createdAt: now,
    updatedAt: now,
  };
  return [bill, ...next];
}

// Shares keyed 'invest:…' came from My Investments, not Total Spend.
export const isInvestShare = (key) => key.startsWith('invest:');

/** Total a card bill got from Total Spend entries, and how many. */
export function spendShare(bill) {
  const shares = Object.entries(bill.spendAmounts || {})
    .filter(([key]) => !isInvestShare(key))
    .map(([, n]) => n);
  return { amount: round2(shares.reduce((sum, n) => sum + (Number(n) || 0), 0)), count: shares.length };
}

/** Total a card bill got from investments bought on the card, and how many. */
export function investShare(bill) {
  const shares = Object.entries(bill.spendAmounts || {})
    .filter(([key]) => isInvestShare(key))
    .map(([, n]) => n);
  return { amount: round2(shares.reduce((sum, n) => sum + (Number(n) || 0), 0)), count: shares.length };
}
