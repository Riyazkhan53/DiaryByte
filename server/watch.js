// Wear OS watch support.
//
// Pairing: in the phone app (Settings → Wear OS watch) the signed-in owner
// asks for a 6-digit code; typing it on the watch returns what the watch
// needs to call this server (the API key and a sign-in token). A code works
// once and lapses after 10 minutes. Each IP gets a few wrong tries.
//
// Summary: one call returns everything the watch shows: net worth, today's
// demat P/L, the next 5 days, open tasks and the watchlist's latest signals.
// The numbers come from the same functions the phone dashboard uses.

const crypto = require('crypto');
const { getModel, toItem } = require('./models');

const CODE_MS = 10 * 60 * 1000;
const MAX_TRIES = 10; // wrong codes per IP per window
const TRY_WINDOW_MS = 15 * 60 * 1000;
const DAYS_AHEAD = 5;

const codes = new Map(); // code → expiresAt
const tries = new Map(); // ip → { count, since }

let dashboardModule;
let dematModule;
let ticketsModule;
let datesModule;
const dashboard = () => (dashboardModule ||= import('../src/utils/dashboard.js'));
const demat = () => (dematModule ||= import('../src/utils/demat.js'));
const ticketsLib = () => (ticketsModule ||= import('../src/utils/tickets.js'));
const datesLib = () => (datesModule ||= import('../src/utils/importantDates.js'));

const round2 = (n) => Math.round(n * 100) / 100;

// Holdings by category, largest first, as the Investments screen groups them.
function investmentBreakdown(investments) {
  const groups = {};
  investments.forEach((i) => {
    const key = i.category || 'Other';
    const g = (groups[key] ||= { category: key, current: 0, invested: 0, holdings: [] });
    const current = Number(i.current) || 0;
    const invested = Number(i.invested) || 0;
    g.current += current;
    g.invested += invested;
    g.holdings.push({ name: i.name || i.symbol || key, current: round2(current), invested: round2(invested) });
  });
  const categories = Object.values(groups)
    .map((g) => ({
      ...g,
      current: round2(g.current),
      invested: round2(g.invested),
      holdings: g.holdings.sort((a, b) => b.current - a.current).slice(0, 25),
    }))
    .sort((a, b) => b.current - a.current);
  const current = round2(categories.reduce((t, g) => t + g.current, 0));
  const invested = round2(categories.reduce((t, g) => t + g.invested, 0));
  return { current, invested, gain: round2(current - invested), count: investments.length, categories };
}

// The owner lives in India: "today" and "this month" are IST dates.
const istDate = (ms = Date.now()) => new Date(ms + 330 * 60000).toISOString().slice(0, 10);

function newCode() {
  const now = Date.now();
  codes.forEach((exp, c) => exp < now && codes.delete(c));
  let code;
  do code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  while (codes.has(code));
  codes.set(code, now + CODE_MS);
  return { code, expiresAt: new Date(now + CODE_MS).toISOString() };
}

function tooMany(ip) {
  const t = tries.get(ip);
  if (!t) return false;
  if (Date.now() - t.since > TRY_WINDOW_MS) {
    tries.delete(ip);
    return false;
  }
  return t.count >= MAX_TRIES;
}
function noteMiss(ip) {
  const t = tries.get(ip);
  if (!t || Date.now() - t.since > TRY_WINDOW_MS) tries.set(ip, { count: 1, since: Date.now() });
  else t.count += 1;
}

/** Use a code: true once, for a valid unexpired code. */
function takeCode(code) {
  const exp = codes.get(code);
  if (!exp) return false;
  codes.delete(code);
  return exp >= Date.now();
}

const load = async (name) => (await getModel(name).find().lean()).map(toItem);

async function latestSignals(engineService) {
  const cfg = await engineService.getConfig().catch(() => null);
  const watchlist = cfg?.watchlist || [];
  const status = await engineService.status().catch(() => null);
  const since = Date.parse(`${istDate()}T00:00:00+05:30`);
  const docs = watchlist.length
    ? await getModel('tradingsignals')
        .find({ symbol: { $in: watchlist }, candleTime: { $gte: since } })
        .sort({ candleTime: -1 })
        .limit(watchlist.length * 80)
        .lean()
    : [];
  const latest = {};
  docs.forEach((d) => {
    if (!latest[d.symbol]) latest[d.symbol] = d;
  });
  const openTrades = await getModel('enginetrades')
    .countDocuments({ status: { $in: ['pending', 'open'] } })
    .catch(() => 0);
  return {
    marketOpen: !!status?.marketOpen,
    lastScanAt: status?.scanner?.lastScanAt || null,
    openTrades,
    items: watchlist.map((symbol) => {
      const s = latest[symbol];
      if (!s) return { symbol, state: null };
      const side = s.side || null;
      const score = s.score || {};
      return {
        symbol,
        state: s.state,
        side,
        score: side ? score[side] ?? null : Math.max(score.long || 0, score.short || 0),
        long: score.long ?? null,
        short: score.short ?? null,
        threshold: s.threshold ?? null,
        at: s.candleTime,
        nextAction: s.nextAction || null,
        entry: s.plan?.entry ?? null,
        stop: s.plan?.stop ?? null,
        target: s.plan?.target ?? null,
      };
    }),
  };
}

async function summary(engineService) {
  const today = istDate();
  const month = today.slice(0, 7);
  const [D, M, TK, DT] = await Promise.all([dashboard(), demat(), ticketsLib(), datesLib()]);
  const [investments, debts, expenses, months, autopays, tickets, dates, todos, vouchers, dematDocs, spends] = await Promise.all(
    ['investments', 'debts', 'expenditure', 'months', 'autopays', 'tickets', 'dates', 'todo', 'vouchers', 'demat', 'spends'].map(load)
  );
  const worth = D.netWorth({ investments, debts, expenses, months, demat: dematDocs, spends }, month);
  const upcoming = D.upcomingItems({ autopays, investments, debts, tickets, dates, vouchers }, DAYS_AHEAD, today);
  const todayEntries = dematDocs.filter((d) => d.type === 'entry' && d.kind === 'pnl' && d.date === today);
  let signals = null;
  try {
    signals = await latestSignals(engineService);
  } catch (error) {
    console.error('[watch] signals failed', error.message);
  }
  return {
    generatedAt: new Date().toISOString(),
    today,
    netWorth: {
      total: worth.total,
      investments: worth.investments,
      demat: worth.demat,
      cash: worth.cash.balance,
      debts: worth.debts.total,
    },
    demat: {
      today: M.pnlBetween(dematDocs, today, today),
      todayEntered: todayEntries.length > 0,
      month: M.pnlBetween(dematDocs, `${month}-01`, `${month}-31`),
    },
    goingOut: Math.round(upcoming.reduce((s, u) => s + (u.kind === 'voucher' ? 0 : u.amount || 0), 0)),
    upcoming: upcoming.slice(0, 25).map((u) => ({
      kind: u.kind,
      title: u.title,
      sub: u.sub || '',
      date: u.date,
      daysLeft: u.daysLeft,
      amount: u.amount ?? null,
    })),
    todos: D.pendingTodos(todos)
      .slice(0, 30)
      .map((t) => ({ id: t.id, title: t.title || '' })),
    signals,
    investments: investmentBreakdown(investments),
    tickets: TK.sortTickets(tickets, today)
      .upcoming.slice(0, 20)
      .map((t) => ({
        id: t.id,
        type: TK.ticketType(t.type).key,
        title: t.title || '',
        from: t.from || '',
        to: t.to || '',
        venue: t.venue || '',
        date: t.date,
        time: t.time || '',
        seat: t.seat || '',
        bookingRef: t.bookingRef || '',
        daysLeft: TK.daysUntil(t, today),
      })),
    dates: DT.sortDates(dates, today)
      .all.filter((d) => Number.isFinite(DT.daysUntil(d, today)) && DT.daysUntil(d, today) >= 0)
      .slice(0, 30)
      .map((d) => ({
        id: d.id,
        title: d.title || '',
        recurring: d.section === 'recurring',
        date: DT.nextOccurrenceKey(d, today),
        since: d.section === 'recurring' && d.date ? d.date.slice(0, 4) : '',
        note: d.note || '',
        daysLeft: DT.daysUntil(d, today),
      })),
  };
}

/**
 * Routes that must answer before the API-key check (the watch only gets
 * the key by redeeming a code). Call before the API-key middleware.
 */
function mountWatchPublic(app, { issueToken }) {
  app.post('/api/watch/redeem', async (req, res) => {
    const ip = req.ip || 'unknown';
    if (tooMany(ip)) return res.status(429).json({ error: 'Too many tries. Wait 15 minutes.' });
    const code = String(req.body?.code || '').trim();
    if (!/^\d{6}$/.test(code) || !takeCode(code)) {
      noteMiss(ip);
      return res.status(401).json({ error: 'Wrong or expired code. Make a new one on the phone.' });
    }
    try {
      const issued = await issueToken();
      res.json({ apiKey: process.env.API_KEY || '', token: issued?.token || '', username: issued?.username || '' });
    } catch (error) {
      console.error('[watch] redeem failed', error.message);
      res.status(503).json({ error: 'Could not pair. Try again.' });
    }
  });
}

/** Private routes (behind the API key and sign-in). */
function mountWatch(app, { engineService }) {
  app.post('/api/watch/pair', (req, res) => res.json(newCode()));

  app.get('/api/watch/summary', async (req, res) => {
    try {
      res.json(await summary(engineService));
    } catch (error) {
      console.error('[watch] summary failed', error);
      res.status(500).json({ error: 'Could not build the summary' });
    }
  });

  // Saved passwords, only when the watch opens that screen (never in the
  // summary, which the watch keeps for its tile).
  app.get('/api/watch/passwords', async (req, res) => {
    try {
      const items = (await load('passwords'))
        .map((p) => ({ id: p.id, site: p.site || '', username: p.username || '', password: p.password || '' }))
        .sort((a, b) => a.site.localeCompare(b.site, 'en', { sensitivity: 'base' }));
      res.set('Cache-Control', 'no-store');
      res.json({ items });
    } catch (error) {
      console.error('[watch] passwords failed', error.message);
      res.status(500).json({ error: 'Could not load passwords' });
    }
  });

  // Tick a task done from the watch.
  app.post('/api/watch/todo/:id/done', async (req, res) => {
    try {
      const r = await getModel('todo').updateOne(
        { id: String(req.params.id) },
        { $set: { done: true, completedAt: new Date().toISOString() } }
      );
      if (!r.matchedCount) return res.status(404).json({ error: 'Task not found' });
      res.json({ ok: true });
    } catch (error) {
      console.error('[watch] todo done failed', error.message);
      res.status(500).json({ error: 'Could not update the task' });
    }
  });
}

module.exports = { mountWatchPublic, mountWatch, _test: { newCode, takeCode, istDate } };
