// Debts maths: EMI schedules, bills and their link to expenditure.
//
// A debt lives in one of three sections:
//   'emi'  — loans. With a loan amount, rate, tenure and first EMI month the
//            whole repayment schedule is generated, and the outstanding
//            principal is worked out from the EMIs marked paid. Loans with no
//            schedule (e.g. money borrowed from a friend) are "manual": the
//            remaining amount is entered by hand.
//   'card' — credit card bills, added by hand each month.
//   'bill' — other bills (electricity, rent, mobile...). Either one-off, or
//            monthly (`recurring`): due on `dueDay` every month from
//            `startMonth` (until `endMonth`, if set), paid month by month
//            like an EMI via `paidMonths`. For bills whose amount changes
//            (`variable`), each month's actual amount goes in `amounts`.
//
// Marking an EMI or a bill paid adds an expense to My Expenditure (in the
// month the EMI/bill is due), linked back with `sourceId` so un-marking it
// removes that expense again.

const pad = (n) => String(n).padStart(2, '0');

const makeId = () => `${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`;

const round2 = (n) => Math.round(n * 100) / 100;

// ------- months ('YYYY-MM', local time; they sort correctly as text) -------

export const monthKeyOf = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;

export const currentMonthKey = () => monthKeyOf(new Date());

export function addMonths(monthKey, k) {
  const [y, m] = monthKey.split('-').map(Number);
  return monthKeyOf(new Date(y, m - 1 + k, 1));
}

export function monthsBetween(fromKey, toKey) {
  const [y1, m1] = fromKey.split('-').map(Number);
  const [y2, m2] = toKey.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

export function monthLabel(key, long = false) {
  if (!key) return '';
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: long ? 'long' : 'short',
    year: 'numeric',
  });
}

// 'YYYY-MM' + day → 'YYYY-MM-DD', clamped to the month's last day.
export function dueDateFor(monthKey, day) {
  const [y, m] = monthKey.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${monthKey}-${pad(Math.min(Math.max(1, day || 1), last))}`;
}

export function shortDate(dateKey) {
  if (!dateKey) return '';
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// ------- loan maths -------

/** Standard reducing-balance EMI, rounded up to the rupee like banks do. */
export function calcEmi(principal, annualRate, months) {
  const P = Number(principal) || 0;
  const n = Math.round(Number(months) || 0);
  if (P <= 0 || n <= 0) return 0;
  const r = (Number(annualRate) || 0) / 12 / 100;
  if (r === 0) return Math.ceil(P / n);
  const f = Math.pow(1 + r, n);
  return Math.ceil((P * r * f) / (f - 1));
}

/** Months needed to repay `principal` at `emi` a month (for when tenure is unknown). */
export function calcTenure(principal, annualRate, emi) {
  const P = Number(principal) || 0;
  const E = Number(emi) || 0;
  if (P <= 0 || E <= 0) return 0;
  const r = (Number(annualRate) || 0) / 12 / 100;
  if (r === 0) return Math.ceil(P / E);
  if (E <= P * r) return 0; // EMI doesn't even cover the interest
  return Math.ceil(-Math.log(1 - (P * r) / E) / Math.log(1 + r));
}

// Section of an item. Older debts have no section: credit-card-type ones
// were really loans too, so everything old is treated as a loan.
export const sectionOf = (item) => item.section || 'emi';

/** A loan with enough details to generate its EMI schedule. */
export const hasSchedule = (item) =>
  sectionOf(item) === 'emi' &&
  !item.manual &&
  item.principal > 0 &&
  item.tenure > 0 &&
  !!item.startMonth;

/**
 * Full repayment schedule. Each row is one month's EMI split into interest
 * and principal, with the balance left after paying it. The last EMI is
 * adjusted so the loan closes at exactly zero.
 */
export function buildSchedule(loan) {
  if (!hasSchedule(loan)) return [];
  const P = Number(loan.principal);
  const n = Math.round(loan.tenure);
  const r = (Number(loan.interestRate) || 0) / 12 / 100;
  const emi = Number(loan.emi) > 0 ? Number(loan.emi) : calcEmi(P, loan.interestRate, n);
  const rows = [];
  let balance = P;
  for (let i = 0; i < n && balance > 0.005; i += 1) {
    const interest = round2(balance * r);
    let principalPart = round2(emi - interest);
    const isLast = i === n - 1 || principalPart >= balance;
    if (isLast) principalPart = round2(balance);
    const month = addMonths(loan.startMonth, i);
    balance = round2(balance - principalPart);
    rows.push({
      index: i + 1,
      month,
      dueDate: dueDateFor(month, loan.emiDay),
      payment: round2(principalPart + interest),
      interest,
      principal: principalPart,
      balance: Math.max(0, balance),
    });
  }
  return rows;
}

/** Outstanding, progress and next EMI for any loan (scheduled or manual). */
export function loanSummary(loan) {
  const principal = Number(loan.principal) || 0;
  if (!hasSchedule(loan)) {
    const outstanding = Math.max(0, Number(loan.outstanding) || 0);
    const paidOff = Math.max(0, principal - outstanding);
    return {
      scheduled: false,
      outstanding,
      paidOff,
      paidPct: principal > 0 ? Math.min((paidOff / principal) * 100, 100) : 0,
      emi: Number(loan.emi) || 0,
      rows: [],
    };
  }
  const rows = buildSchedule(loan);
  const paid = new Set(loan.paidMonths || []);
  let paidPrincipal = 0;
  let paidCount = 0;
  let interestLeft = 0;
  let payableLeft = 0;
  rows.forEach((row) => {
    if (paid.has(row.month)) {
      paidPrincipal += row.principal;
      paidCount += 1;
    } else {
      interestLeft += row.interest;
      payableLeft += row.payment;
    }
  });
  const outstanding = Math.max(0, round2(principal - paidPrincipal));
  const next = rows.find((row) => !paid.has(row.month)) || null;
  const thisMonth = currentMonthKey();
  const overdue = rows.filter((row) => !paid.has(row.month) && row.month < thisMonth);
  return {
    scheduled: true,
    outstanding,
    paidOff: round2(paidPrincipal),
    paidPct: principal > 0 ? Math.min((paidPrincipal / principal) * 100, 100) : 0,
    emi: rows[0]?.payment || 0,
    paidCount,
    totalCount: rows.length,
    remainingCount: rows.length - paidCount,
    interestLeft: round2(interestLeft),
    payableLeft: round2(payableLeft),
    totalInterest: round2(rows.reduce((s, row) => s + row.interest, 0)),
    next,
    overdue,
    endsMonth: rows.length ? rows[rows.length - 1].month : null,
    rows,
  };
}

// ------- dues for a month (EMIs + bills) -------

export const emiSourceId = (loanId, month) => `emi:${loanId}:${month}`;
export const billSourceId = (billId) => `bill:${billId}`;

export const billMonth = (bill) => (bill.dueDate ? bill.dueDate.slice(0, 7) : bill.month);

// ------- monthly (recurring) bills -------

export const isRecurringBill = (item) =>
  sectionOf(item) === 'bill' && !!item.recurring && !!item.startMonth;

export const recurringSourceId = (billId, month) => `rbill:${billId}:${month}`;

/** A month's amount for a recurring bill: what was entered for it, else the usual amount. */
export function recurringAmount(bill, month) {
  const entered = bill.amounts?.[month];
  return entered != null ? Number(entered) || 0 : Number(bill.amount) || 0;
}

/** The recurring bill's due for `month`, or null if it doesn't run that month. */
export function recurringDue(bill, month) {
  if (month < bill.startMonth || (bill.endMonth && month > bill.endMonth)) return null;
  return {
    key: recurringSourceId(bill.id, month),
    kind: 'bill',
    recurring: true,
    debtId: bill.id,
    month,
    title: bill.name,
    subtitle: `${bill.billType || 'Bill'} · monthly`,
    amount: recurringAmount(bill, month),
    dueDate: dueDateFor(month, bill.dueDay),
    paid: (bill.paidMonths || []).includes(month),
    category: 'Bills',
  };
}

/**
 * What to list for a recurring bill: every unpaid month up to `thisMonth`
 * (or, when those are all paid, the next month it's due) and the paid months
 * from the last `paidLimit` months, newest first.
 */
export function recurringBillDues(bill, thisMonth, paidLimit = 6) {
  const pending = [];
  const paid = [];
  for (let month = bill.startMonth; month <= thisMonth; month = addMonths(month, 1)) {
    const due = recurringDue(bill, month);
    if (!due) break;
    if (!due.paid) pending.push(due);
    else if (monthsBetween(month, thisMonth) < paidLimit) paid.unshift(due);
  }
  if (!pending.length) {
    // Next unpaid month ahead (a few months may already be paid in advance).
    let month = bill.startMonth > thisMonth ? bill.startMonth : addMonths(thisMonth, 1);
    for (let i = 0; i < 24; i += 1, month = addMonths(month, 1)) {
      const due = recurringDue(bill, month);
      if (!due) break;
      if (!due.paid) {
        pending.push(due);
        break;
      }
      paid.unshift(due);
    }
  }
  return { pending, paid };
}

/**
 * Everything due in `month`: each scheduled loan's EMI for that month and
 * every credit card / other bill due that month.
 */
export function duesForMonth(debts, month) {
  const dues = [];
  debts.forEach((item) => {
    const section = sectionOf(item);
    if (section === 'emi') {
      const row = buildSchedule(item).find((r) => r.month === month);
      if (!row) return;
      dues.push({
        key: emiSourceId(item.id, month),
        kind: 'emi',
        debtId: item.id,
        month,
        title: `${item.name} EMI`,
        subtitle: `EMI ${row.index} of ${item.tenure}`,
        amount: row.payment,
        dueDate: row.dueDate,
        paid: (item.paidMonths || []).includes(month),
        category: 'EMI',
      });
    } else if (isRecurringBill(item)) {
      const due = recurringDue(item, month);
      if (due) dues.push(due);
    } else if (billMonth(item) === month) {
      dues.push({
        key: billSourceId(item.id),
        kind: section,
        debtId: item.id,
        month,
        title: item.name,
        subtitle: section === 'card' ? 'Credit card bill' : item.billType || 'Bill',
        amount: Number(item.amount) || 0,
        dueDate: item.dueDate,
        paid: !!item.paid,
        category: section === 'card' ? 'Credit Card' : 'Bills',
      });
    }
  });
  return dues.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
}

// Expenses for a past/future month are dated on the due date; this month's
// on today.
function expenseDate(month, dueDate) {
  const now = new Date();
  if (month === monthKeyOf(now)) return now.toISOString();
  const [y, m, d] = (dueDate || `${month}-01`).split('-').map(Number);
  return new Date(y, m - 1, d || 1, 12).toISOString();
}

/**
 * Mark a due paid: flag it on the debt and add the matching expense.
 * Returns the new { debts, expenses } arrays to persist.
 */
export function markDuePaid(due, debts, expenses) {
  const nextDebts = debts.map((item) => {
    if (item.id !== due.debtId) return item;
    if (due.kind === 'emi' || due.recurring) {
      const paidMonths = Array.from(new Set([...(item.paidMonths || []), due.month])).sort();
      const updated = { ...item, paidMonths, updatedAt: new Date().toISOString() };
      if (due.recurring) {
        // Remember what was actually paid when it differs from the usual amount.
        const amounts = { ...(item.amounts || {}) };
        if (Number(due.amount) !== Number(item.amount)) amounts[due.month] = Number(due.amount) || 0;
        else delete amounts[due.month];
        return { ...updated, amounts };
      }
      return { ...updated, outstanding: loanSummary(updated).outstanding };
    }
    return { ...item, paid: true, paidAt: new Date().toISOString() };
  });
  const withoutOld = expenses.filter((e) => e.sourceId !== due.key);
  const expense = {
    id: makeId(),
    title: due.title,
    amount: due.amount,
    category: due.category,
    month: due.month,
    date: expenseDate(due.month, due.dueDate),
    createdAt: new Date().toISOString(),
    sourceId: due.key,
  };
  return { debts: nextDebts, expenses: [expense, ...withoutOld] };
}

/** Undo markDuePaid: un-flag the debt and remove its linked expense. */
export function markDueUnpaid(due, debts, expenses) {
  const nextDebts = debts.map((item) => {
    if (item.id !== due.debtId) return item;
    if (due.kind === 'emi' || due.recurring) {
      const updated = {
        ...item,
        paidMonths: (item.paidMonths || []).filter((m) => m !== due.month),
        updatedAt: new Date().toISOString(),
      };
      if (due.recurring) return updated;
      return { ...updated, outstanding: loanSummary(updated).outstanding };
    }
    return { ...item, paid: false, paidAt: null };
  });
  return { debts: nextDebts, expenses: expenses.filter((e) => e.sourceId !== due.key) };
}

/** Rebuild the due an expense came from, so deleting the expense can unmark it. */
export function dueFromSourceId(sourceId, debts) {
  if (!sourceId) return null;
  const [kind, id, month] = sourceId.split(':');
  const item = debts.find((d) => d.id === id);
  if (!item) return null;
  if (kind === 'emi') return { key: sourceId, kind: 'emi', debtId: id, month };
  if (kind === 'rbill') return { key: sourceId, kind: 'bill', recurring: true, debtId: id, month };
  return { key: sourceId, kind: sectionOf(item), debtId: id, month: billMonth(item) };
}

// ------- reminders -------

const dateKeyOf = (date) => `${monthKeyOf(date)}-${pad(date.getDate())}`;

/**
 * Unpaid EMIs and bills due today or later, soonest first: the next
 * `emisPerLoan` unpaid EMIs of each scheduled loan (and months of each
 * monthly bill) and every unpaid one-off credit card / other bill. Manual loans have no reliable due date, so they're left out.
 */
export function upcomingDues(debts, today = dateKeyOf(new Date()), emisPerLoan = 2) {
  const dues = [];
  debts.forEach((item) => {
    const section = sectionOf(item);
    if (section === 'emi') {
      const paid = new Set(item.paidMonths || []);
      buildSchedule(item)
        .filter((row) => !paid.has(row.month) && row.dueDate >= today)
        .slice(0, emisPerLoan)
        .forEach((row) =>
          dues.push({
            key: emiSourceId(item.id, row.month),
            kind: 'emi',
            title: `${item.name} EMI`,
            amount: row.payment,
            dueDate: row.dueDate,
          })
        );
    } else if (isRecurringBill(item)) {
      let found = 0;
      let month = today.slice(0, 7);
      if (month < item.startMonth) month = item.startMonth;
      for (let i = 0; i < 24 && found < emisPerLoan; i += 1, month = addMonths(month, 1)) {
        const due = recurringDue(item, month);
        if (!due) break;
        if (due.paid || due.dueDate < today) continue;
        dues.push({ key: due.key, kind: 'bill', title: item.name, amount: due.amount, dueDate: due.dueDate });
        found += 1;
      }
    } else if (!item.paid && item.dueDate && item.dueDate >= today) {
      dues.push({
        key: billSourceId(item.id),
        kind: section,
        title: section === 'card' ? `${item.name} card bill` : item.name,
        amount: Number(item.amount) || 0,
        dueDate: item.dueDate,
      });
    }
  });
  return dues.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
