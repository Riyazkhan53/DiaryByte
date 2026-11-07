// Dashboard numbers: net worth and what's coming up in the next few days.
// Pure functions over the synced collections, so they're easy to test.

import { addDays, daysBetween, occurrencesFrom, todayKey } from './autopay';
import { addMonths, isRecurringBill, loanSummary, monthKeyOf, sectionOf, upcomingDues } from './debts';
import { hasSip, sipAmountFor, sipDueDate, upcomingSipMonths } from './sip';
import { daysUntil as ticketDaysUntil, sortTickets, ticketType } from './tickets';
import { daysUntil as dateDaysUntil, nextOccurrenceKey, sortDates } from './importantDates';

const round2 = (n) => Math.round(n * 100) / 100;
const sumOf = (list) => list.reduce((sum, x) => sum + (Number(x.amount) || 0), 0);

/** Current value of every holding. */
export const investmentsValue = (investments) =>
  round2(investments.reduce((sum, i) => sum + (Number(i.current) || 0), 0));

/**
 * What you still owe: each loan's outstanding principal, plus unpaid one-off
 * credit card and other bills. Monthly bills (rent, etc.) aren't debt.
 */
export function debtsOutstanding(debts) {
  let loans = 0;
  let bills = 0;
  debts.forEach((item) => {
    if (sectionOf(item) === 'emi') loans += loanSummary(item).outstanding;
    else if (!isRecurringBill(item) && !item.paid) bills += Number(item.amount) || 0;
  });
  return { loans: round2(loans), bills: round2(bills), total: round2(loans + bills) };
}

const expenseMonth = (item) => item.month || monthKeyOf(new Date(item.date || item.createdAt));

/**
 * This month's balance after expenses, as My Expenditure shows it: money
 * carried in from earlier months + this month's income − this month's spend.
 */
export function monthBalance(expenses, months, month) {
  const spent = {};
  expenses.forEach((e) => {
    const key = expenseMonth(e);
    spent[key] = (spent[key] || 0) + (Number(e.amount) || 0);
  });
  const docOf = (key) => months.find((m) => m.month === key);
  const first = months
    .filter((m) => (m.incomes || []).length)
    .map((m) => m.month)
    .sort()[0];
  let carry = 0;
  if (first && month > first) {
    for (let m = first; m < month; m = addMonths(m, 1)) {
      const doc = docOf(m);
      carry = Math.max(0, carry + sumOf(doc?.incomes || []) + sumOf(doc?.adjustments || []) - (spent[m] || 0));
    }
  }
  const income = sumOf(docOf(month)?.incomes || []);
  const out = spent[month] || 0;
  return { carried: round2(carry), income: round2(income), spent: round2(out), balance: round2(carry + income - out) };
}

/** Net worth = investments + this month's balance − debts. */
export function netWorth({ investments, debts, expenses, months }, month) {
  const invested = investmentsValue(investments);
  const owed = debtsOutstanding(debts);
  const cash = monthBalance(expenses, months, month);
  return { investments: invested, debts: owed, cash, total: round2(invested + cash.balance - owed.total) };
}

/**
 * Everything due from today to `days` days ahead, soonest first:
 * [{ key, kind, title, sub, date, daysLeft, amount?, route, params? }].
 */
export function upcomingItems({ autopays = [], investments = [], debts = [], tickets = [], dates = [] }, days = 5, today = todayKey()) {
  const until = addDays(today, days);
  const out = [];
  const within = (d) => d && d >= today && d <= until;

  autopays.forEach((a) => {
    occurrencesFrom(a, today, 3)
      .filter(within)
      .forEach((d) =>
        out.push({ key: `autopay:${a.id}:${d}`, kind: 'autopay', title: a.name, sub: 'Autopay', date: d, amount: Number(a.amount) || 0, route: '/autopays' })
      );
  });

  investments.filter(hasSip).forEach((item) => {
    upcomingSipMonths(item, today, 2).forEach((month) => {
      const d = sipDueDate(item, month);
      if (within(d)) {
        out.push({ key: `sip:${item.id}:${month}`, kind: 'sip', title: `${item.name} SIP`, sub: item.category, date: d, amount: sipAmountFor(item, month), route: '/investments' });
      }
    });
  });

  upcomingDues(debts, today, 1)
    .filter((due) => within(due.dueDate))
    .forEach((due) =>
      out.push({
        key: due.key,
        kind: due.kind === 'emi' ? 'emi' : 'bill',
        title: due.title,
        sub: due.kind === 'emi' ? 'EMI' : due.kind === 'card' ? 'Card bill' : 'Bill',
        date: due.dueDate,
        amount: due.amount,
        route: '/debts',
      })
    );

  sortTickets(tickets, today)
    .upcoming.filter((t) => ticketDaysUntil(t, today) <= days)
    .forEach((t) =>
      out.push({
        key: `ticket:${t.id}`,
        kind: 'ticket',
        title: t.title,
        sub: [ticketType(t.type).label, t.time].filter(Boolean).join(' · '),
        date: t.date,
        route: '/tickets',
        params: { open: t.id },
      })
    );

  // Yearly dates (birthdays…) and one-off occasions alike.
  sortDates(dates, today)
    .all.filter((d) => {
      const left = dateDaysUntil(d, today);
      return left >= 0 && left <= days;
    })
    .forEach((d) =>
      out.push({
        key: `date:${d.id}`,
        kind: 'date',
        title: d.title,
        sub: d.section === 'recurring' ? 'Every year' : 'Occasion',
        date: nextOccurrenceKey(d, today),
        route: '/important-dates',
        params: { open: d.id },
      })
    );

  return out
    .map((item) => ({ ...item, daysLeft: daysBetween(today, item.date) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
}

/** Tasks not done yet, oldest first. */
export const pendingTodos = (todos) =>
  todos.filter((t) => !t.done).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));

/** Movies and series you're watching now. */
export const nowWatching = (movies) => movies.filter((m) => m.status === 'watching');
