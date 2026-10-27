import { readLocal, saveAndPush, notifyLocal } from './sync';
import { navOnOrAfter } from './mutualFunds';
import { fetchGoldRate } from './goldRate';
import { todayKey } from '../utils/autopay';
import {
  applyInstallment,
  dueSipMonths,
  hasSip,
  sipAmountFor,
  sipDueDate,
  sipExpense,
  sipSourceId,
} from '../utils/sip';

export const INVESTMENTS_KEY = '@diarybyte_investments';
export const EXPENSES_KEY = '@diarybyte_expenditure';

let running = null;

/**
 * Record every SIP installment whose date has come: add it to the holding
 * (units at that day's NAV, grams at today's gold buy rate) and add an
 * Investment expense to My Expenditure. Safe to call often; only one run
 * happens at a time. Resolves to the number of installments recorded.
 */
export function processDueSips() {
  if (!running) running = run().finally(() => (running = null));
  return running;
}

async function run() {
  const today = todayKey();
  const items = await readLocal(INVESTMENTS_KEY);
  const work = items.flatMap((item) => dueSipMonths(item, today).map((month) => ({ item, month })));
  if (!work.length) return 0;

  // Prices first (network), then apply to the freshest local data.
  const needsGold = work.some(({ item }) => item.category === 'Digital Gold' && item.grams > 0);
  const goldBuy = needsGold ? (await fetchGoldRate().catch(() => null))?.buy : null;
  const navs = {};
  const priced = [];
  for (const { item, month } of work) {
    const date = sipDueDate(item, month);
    const amount = sipAmountFor(item, month);
    let price = {};
    if (amount > 0 && item.category === 'Mutual Funds' && item.schemeCode && item.units > 0) {
      const key = `${item.schemeCode}:${date}`;
      navs[key] = navs[key] || navOnOrAfter(item.schemeCode, date).catch(() => null);
      const nav = await navs[key];
      if (!nav) continue; // try again next time, so the units are right
      price = { nav: nav.nav };
    } else if (amount > 0 && item.category === 'Digital Gold' && item.grams > 0) {
      const rate = goldBuy || item.rate;
      if (!rate) continue;
      price = { rate };
    }
    priced.push({ itemId: item.id, month, date, price });
  }
  if (!priced.length) return 0;

  const expenses = await readLocal(EXPENSES_KEY);
  let nextItems = await readLocal(INVESTMENTS_KEY);
  let nextExpenses = expenses;
  let recorded = 0;
  for (const { itemId, month, date, price } of priced) {
    const item = nextItems.find((i) => i.id === itemId);
    if (!item || !hasSip(item) || item.sipDone?.[month]) continue;
    const amount = sipAmountFor(item, month);
    const updated = applyInstallment(item, month, amount, price, date);
    nextItems = nextItems.map((i) => (i.id === itemId ? updated : i));
    const sourceId = sipSourceId(itemId, month);
    if (amount > 0 && !nextExpenses.some((e) => e.sourceId === sourceId)) {
      nextExpenses = [sipExpense(item, month, amount, date), ...nextExpenses];
    }
    recorded += 1;
  }
  if (!recorded) return 0;

  notifyLocal(INVESTMENTS_KEY, nextItems);
  if (nextExpenses !== expenses) notifyLocal(EXPENSES_KEY, nextExpenses);
  await Promise.all([
    saveAndPush('investments', INVESTMENTS_KEY, nextItems),
    nextExpenses !== expenses ? saveAndPush('expenditure', EXPENSES_KEY, nextExpenses) : null,
  ]);
  return recorded;
}
