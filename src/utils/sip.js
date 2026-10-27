// SIPs on investments: a fixed amount invested every month on `sip.day`.
//
// item.sip        { amount, day, startMonth, endMonth? }
// item.sipAmounts { 'YYYY-MM': amount } — custom amount for a month (0 = skip)
// item.sipDone    { 'YYYY-MM': record } — installments already processed:
//                 { amount, date, units?, nav?, grams?, rate?, shares?, sharePrice?, skipped? }
//
// Each installment adds to the amount invested (and to units or grams when
// the holding is valued that way), and is recorded in My Expenditure as an
// "Investment" expense linked back with `sourceId: 'sip:<id>:<month>'`.

import { addMonths, dueDateFor } from './debts';

export const SIP_CATEGORIES = ['Mutual Funds', 'Digital Gold', 'Stocks'];

export const EXPENSE_CATEGORY = 'Investment';

const round2 = (n) => Math.round(n * 100) / 100;
const round4 = (n) => Math.round(n * 10000) / 10000;

export const hasSip = (item) =>
  SIP_CATEGORIES.includes(item.category) && !!item.sip && item.sip.amount > 0 && !!item.sip.startMonth;

export const sipSourceId = (itemId, month) => `sip:${itemId}:${month}`;

export const isSipExpense = (expense) => (expense.sourceId || '').startsWith('sip:');

/** { itemId, month } from an expense's sourceId, or null. */
export function parseSipSourceId(sourceId) {
  const [kind, itemId, month] = String(sourceId || '').split(':');
  return kind === 'sip' && itemId && month ? { itemId, month } : null;
}

/** Amount for one month: the custom amount if set, else the usual SIP amount. */
export function sipAmountFor(item, month) {
  const custom = item.sipAmounts?.[month];
  return custom != null ? Number(custom) || 0 : Number(item.sip?.amount) || 0;
}

export const sipDueDate = (item, month) => dueDateFor(month, item.sip.day);

const runsIn = (item, month) =>
  month >= item.sip.startMonth && (!item.sip.endMonth || month <= item.sip.endMonth);

/** Months whose SIP date has come (on or before `today`) and that haven't been processed. */
export function dueSipMonths(item, today) {
  if (!hasSip(item)) return [];
  const months = [];
  const lastMonth = today.slice(0, 7);
  for (let month = item.sip.startMonth; month <= lastMonth; month = addMonths(month, 1)) {
    if (!runsIn(item, month)) break;
    if (!item.sipDone?.[month] && sipDueDate(item, month) <= today) months.push(month);
  }
  return months;
}

/** The next `count` months still to come, for planning custom amounts. */
export function upcomingSipMonths(item, today, count = 6) {
  if (!hasSip(item)) return [];
  const months = [];
  let month = item.sip.startMonth > today.slice(0, 7) ? item.sip.startMonth : today.slice(0, 7);
  for (let i = 0; i < 36 && months.length < count; i += 1, month = addMonths(month, 1)) {
    if (!runsIn(item, month)) break;
    if (!item.sipDone?.[month]) months.push(month);
  }
  return months;
}

/** Processed installments, newest first: [{ month, ...record }]. */
export function sipHistory(item) {
  return Object.entries(item.sipDone || {})
    .map(([month, record]) => ({ month, ...record }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

/**
 * Record one installment on the holding. `price` is { nav } for a mutual
 * fund valued by units, { rate } for gold valued by grams, { sharePrice }
 * (₹ per share) for a stock valued by quantity; otherwise the amount is
 * simply added to the current value. A zero amount marks the month skipped.
 */
export function applyInstallment(item, month, amount, price = {}, date = sipDueDate(item, month)) {
  if (!(amount > 0)) {
    return { ...item, sipDone: { ...item.sipDone, [month]: { amount: 0, date, skipped: true } } };
  }
  const record = { amount, date };
  const next = { ...item, invested: round2((Number(item.invested) || 0) + amount) };
  if (item.category === 'Mutual Funds' && item.schemeCode && item.units > 0 && price.nav > 0) {
    record.nav = price.nav;
    record.units = round4(amount / price.nav);
    next.units = round4(item.units + record.units);
    next.current = round2(next.units * (item.nav || price.nav));
  } else if (item.category === 'Digital Gold' && item.grams > 0 && price.rate > 0) {
    record.rate = price.rate;
    record.grams = round4(amount / price.rate);
    next.grams = round4(item.grams + record.grams);
    next.current = round2(next.grams * (item.rate || price.rate));
  } else if (item.category === 'Stocks' && item.symbol && item.quantity > 0 && price.sharePrice > 0) {
    // Fractional shares, as SIP apps for US stocks allow; for Indian
    // stocks it's an approximation of what the amount buys.
    record.sharePrice = round2(price.sharePrice);
    record.shares = round4(amount / price.sharePrice);
    next.quantity = round4(item.quantity + record.shares);
    // Value per share as last priced (in ₹), so US stocks keep their rate.
    const perShare = item.current > 0 ? item.current / item.quantity : price.sharePrice;
    next.current = round2(next.quantity * perShare);
  } else {
    next.current = round2((Number(item.current) || 0) + amount);
  }
  next.sipDone = { ...item.sipDone, [month]: record };
  next.updatedAt = new Date().toISOString();
  return next;
}

/** Undo an installment: take back what it added and mark the month skipped. */
export function reverseInstallment(item, month) {
  const record = item.sipDone?.[month];
  if (!record || record.skipped) return item;
  const next = { ...item, invested: round2(Math.max(0, (Number(item.invested) || 0) - record.amount)) };
  if (record.units) {
    next.units = round4(Math.max(0, item.units - record.units));
    next.current = round2(next.units * (item.nav || record.nav));
  } else if (record.grams) {
    next.grams = round4(Math.max(0, item.grams - record.grams));
    next.current = round2(next.grams * (item.rate || record.rate));
  } else if (record.shares) {
    const perShare = item.quantity > 0 ? (Number(item.current) || 0) / item.quantity : record.sharePrice;
    next.quantity = round4(Math.max(0, item.quantity - record.shares));
    next.current = round2(next.quantity * perShare);
  } else {
    next.current = round2(Math.max(0, (Number(item.current) || 0) - record.amount));
  }
  next.sipDone = { ...item.sipDone, [month]: { amount: 0, date: record.date, skipped: true } };
  next.updatedAt = new Date().toISOString();
  return next;
}

/** The My Expenditure entry for an installment. */
export function sipExpense(item, month, amount, date) {
  const [y, m, d] = date.split('-').map(Number);
  return {
    id: `${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`,
    title: `${item.name} SIP`,
    amount,
    category: EXPENSE_CATEGORY,
    month,
    date: new Date(y, m - 1, d, 12).toISOString(),
    createdAt: new Date().toISOString(),
    sourceId: sipSourceId(item.id, month),
  };
}
