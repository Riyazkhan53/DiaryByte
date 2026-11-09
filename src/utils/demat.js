// Demat accounts: a balance you set, moved by the day-by-day entries after
// it (gain / loss from trading, money added, money withdrawn).
//
// One synced collection ('demat') holds both:
// - accounts: { id, type: 'account', name, balance, balanceDate,
//               balanceSetAt (ISO time it was set), note }
// - entries:  { id, type: 'entry', accountId, kind: 'pnl' | 'deposit' |
//               'withdraw', date: 'YYYY-MM-DD', amount, charges?,
//               executions?, note }
//   pnl: `amount` is the day's gross P/L, signed (+ gain, − loss), before
//   `charges` (brokerage + taxes, positive); net = amount − charges.
//   `executions` is how many orders were executed. deposit/withdraw
//   amounts are positive.
//
// Current balance = the balance you set + every entry after it: dated after
// balanceDate, or on that day but logged after the balance was set (so a
// balance set in the morning plus that evening's P/L both count).

export const DEMAT_STORAGE_KEY = '@diarybyte_demat';

export const ENTRY_KINDS = [
  { key: 'pnl', label: 'Day P/L', icon: 'trending-up' },
  { key: 'deposit', label: 'Added funds', icon: 'arrow-down-circle-outline' },
  { key: 'withdraw', label: 'Withdrew', icon: 'arrow-up-circle-outline' },
];

const round2 = (n) => Math.round(n * 100) / 100;

export const accountsOf = (docs) => docs.filter((d) => d.type === 'account');
export const entriesOf = (docs, accountId) =>
  docs.filter((d) => d.type === 'entry' && (!accountId || d.accountId === accountId));

/** A day's P/L after charges. */
export const netOf = (e) => round2((Number(e.amount) || 0) - (Number(e.charges) || 0));

/** Signed effect of an entry on the balance. */
export function entryEffect(e) {
  const a = Math.abs(Number(e.amount) || 0);
  if (e.kind === 'deposit') return a;
  if (e.kind === 'withdraw') return -a;
  return netOf(e); // pnl: gross − charges
}

/** True when an entry moves the balance (it came after the balance was set). */
export function countsAfterBalance(account, e) {
  if (!account.balanceDate || e.date > account.balanceDate) return true;
  if (e.date < account.balanceDate) return false;
  return !!account.balanceSetAt && (e.createdAt || '') > account.balanceSetAt;
}

/** Current balance of one account from all the docs. */
export function accountBalance(account, docs) {
  const base = Number(account.balance) || 0;
  const after = entriesOf(docs, account.id).filter((e) => countsAfterBalance(account, e));
  return round2(base + after.reduce((s, e) => s + entryEffect(e), 0));
}

/** Total across accounts: { total, accounts: [{ ...account, current }] }. */
export function dematSummary(docs) {
  const accounts = accountsOf(docs).map((a) => ({ ...a, current: accountBalance(a, docs) }));
  return { total: round2(accounts.reduce((s, a) => s + a.current, 0)), accounts };
}

/** Net trading P/L (after charges) between two date keys, inclusive. */
export function pnlBetween(docs, from, to, accountId) {
  return round2(
    entriesOf(docs, accountId)
      .filter((e) => e.kind === 'pnl' && e.date >= from && e.date <= to)
      .reduce((s, e) => s + netOf(e), 0)
  );
}

/**
 * Stats on day P/L entries (green/red, best/worst judged after charges):
 * { days, green, red, winRate, best, worst, net, avg, gross, charges,
 * executions, chargesPerExecution, chargesPctOfGains, streak }.
 */
export function pnlStats(docs, accountId) {
  const days = entriesOf(docs, accountId)
    .filter((e) => e.kind === 'pnl')
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!days.length) return { days: 0 };
  const vals = days.map(netOf);
  const green = vals.filter((v) => v > 0).length;
  const red = vals.filter((v) => v < 0).length;
  let streak = { kind: null, length: 0 };
  for (let i = days.length - 1; i >= 0; i -= 1) {
    const kind = vals[i] > 0 ? 'green' : vals[i] < 0 ? 'red' : null;
    if (!kind) break;
    if (!streak.kind) streak = { kind, length: 1 };
    else if (streak.kind === kind) streak.length += 1;
    else break;
  }
  const net = round2(vals.reduce((s, v) => s + v, 0));
  const charges = round2(days.reduce((s, e) => s + (Number(e.charges) || 0), 0));
  const executions = days.reduce((s, e) => s + (Number(e.executions) || 0), 0);
  const grossGains = days.reduce((s, e) => s + Math.max(0, Number(e.amount) || 0), 0);
  return {
    days: days.length,
    gross: round2(days.reduce((s, e) => s + (Number(e.amount) || 0), 0)),
    charges,
    executions,
    chargesPerExecution: executions ? round2(charges / executions) : null,
    chargesPctOfGains: grossGains > 0 ? Math.round((charges / grossGains) * 100) : null,
    green,
    red,
    winRate: green + red ? Math.round((green / (green + red)) * 100) : null,
    best: Math.max(...vals),
    worst: Math.min(...vals),
    net,
    avg: round2(net / days.length),
    streak,
  };
}

/** The last `n` day P/L entries, oldest first (for the bar chart). */
export const recentPnl = (docs, accountId, n = 20) =>
  entriesOf(docs, accountId)
    .filter((e) => e.kind === 'pnl')
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-n);

/** Entries newest first, grouped by month: [{ month, net, entries }]. */
export function byMonth(docs, accountId) {
  const groups = new Map();
  entriesOf(docs, accountId)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''))
    .forEach((e) => {
      const m = e.date.slice(0, 7);
      if (!groups.has(m)) groups.set(m, { month: m, pnl: 0, charges: 0, executions: 0, entries: [] });
      const g = groups.get(m);
      g.entries.push(e);
      if (e.kind === 'pnl') {
        g.pnl = round2(g.pnl + netOf(e));
        g.charges = round2(g.charges + (Number(e.charges) || 0));
        g.executions += Number(e.executions) || 0;
      }
    });
  return [...groups.values()];
}
