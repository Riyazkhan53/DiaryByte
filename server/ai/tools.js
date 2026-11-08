// Tools the AI agents can call. Each one reads real data from this server
// (the signal engine, Yahoo quotes and candles, mfapi.in NAVs, and your
// synced collections) and returns compact JSON, so the model never has to
// guess a price or a holding.

const { getModel } = require('../models');
const { getQuotes, getCandles, searchSymbols, isSymbol } = require('../quotes');
const engineService = require('../engine/service');

const r2 = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : null);
const pct = (a, b) => (b > 0 && Number.isFinite(a) ? r2(((a - b) / b) * 100) : null);
const strip = ({ _id, __v, ...rest }) => rest;
const all = async (name) => (await getModel(name).find({}).lean()).map(strip);

let setupModule = null;
const setupLib = async () =>
  (setupModule ||= Promise.all([import('../../src/utils/setupScore.js'), import('../../src/utils/indicators.js')]));

const normSymbol = (s) => {
  const up = String(s || '').trim().toUpperCase();
  return up && !up.includes('.') && /^[A-Z0-9&-]+$/.test(up) ? `${up}.NS` : up;
};

// ------- shared: price trend from daily candles -------

async function dailyTrend(symbol) {
  const sym = normSymbol(symbol);
  if (!isSymbol(sym)) throw new Error(`Not a valid symbol: ${symbol}`);
  const data = await getCandles(sym);
  const c = data.candles;
  const closes = c.map((x) => x.close);
  const last = closes[closes.length - 1];
  const back = (n) => closes[Math.max(0, closes.length - 1 - n)];
  const [{ scoreSetup }, { setupInputsFromCandles }] = await setupLib();
  const inputs = setupInputsFromCandles(c);
  const setup = scoreSetup(inputs);
  return {
    symbol: sym,
    name: data.name,
    currency: data.currency,
    lastClose: r2(last),
    livePrice: r2(data.quote?.price),
    previousClose: r2(data.quote?.previousClose),
    change1w: pct(last, back(5)),
    change1m: pct(last, back(21)),
    change3m: pct(last, back(63)),
    high6m: r2(Math.max(...c.map((x) => x.high))),
    low6m: r2(Math.min(...c.map((x) => x.low))),
    ema20: r2(inputs.ema20),
    ema50: r2(inputs.ema50),
    rsi14: r2(inputs.rsi),
    macd: r2(inputs.macd),
    macdSignal: r2(inputs.macdSignal),
    volumeVsAvg: inputs.volume && inputs.avgVolume ? r2(inputs.volume / inputs.avgVolume) : null,
    dailySetup: { signal: setup.signal, bullishPct: setup.bullPct, bearishPct: setup.bearPct, reason: setup.reason },
    fetchedAt: data.fetchedAt,
  };
}

// ------- StockByte tools -------

const stockTools = [
  {
    name: 'evaluate_intraday',
    description:
      "Run DiaryByte's intraday signal engine on an NSE stock (5-minute candles): returns the state (BUY CANDIDATE / SELL CANDIDATE / WAIT / NEUTRAL / NO TRADE), long and short scores against the threshold, failed conditions, next action, warnings (e.g. low profit after charges), key indicators (price, VWAP, EMAs, RSI, volume ratio, ATR, 15-min trend) and the entry/stop/target/quantity plan. Use this for any 'buy/sell/wait now' question about an Indian stock.",
    input_schema: {
      type: 'object',
      properties: { symbol: { type: 'string', description: 'NSE symbol, e.g. TATAPOWER or TATAPOWER.NS' } },
      required: ['symbol'],
      additionalProperties: false,
    },
    run: async ({ symbol }) => {
      const sym = normSymbol(symbol);
      if (!isSymbol(sym)) throw new Error(`Not a valid symbol: ${symbol}`);
      const r = await engineService.evaluate(sym);
      return {
        symbol: r.symbol,
        state: r.state,
        side: r.side,
        score: r.score,
        threshold: r.threshold,
        failedConditions: r.failedConditions,
        nextAction: r.nextAction,
        reasons: r.reasons,
        warnings: r.warnings || [],
        indicators: r.indicators,
        plan: r.plan?.ok
          ? {
              side: r.plan.side,
              entry: r.plan.entry,
              stop: r.plan.stop,
              target: r.plan.target,
              quantity: r.plan.quantity,
              maxLoss: r.plan.maxLoss,
              netProfitAtTarget: r.plan.netReward,
              netRewardRisk: r.plan.netRR,
            }
          : { ok: false, reason: r.plan?.reason },
        marketOpen: r.data?.marketOpen,
        dataStatus: r.data?.status,
        candleTime: r.candle ? new Date(r.candle.t).toISOString() : null,
        ruleVersion: r.ruleVersion,
      };
    },
  },
  {
    name: 'daily_trend',
    description:
      'Daily-chart picture of a stock over ~6 months: live price, 1-week/1-month/3-month change, 6-month high/low, EMA 20/50, RSI, MACD, volume vs average, and the Setup Check verdict (BUY/SELL/WAIT with bullish/bearish %). Works for NSE (.NS), BSE (.BO) and US tickers. Use it for the bigger trend and for swing or long-term questions.',
    input_schema: {
      type: 'object',
      properties: { symbol: { type: 'string', description: 'e.g. INFY, INFY.NS, AAPL' } },
      required: ['symbol'],
      additionalProperties: false,
    },
    run: async ({ symbol }) => dailyTrend(symbol),
  },
  {
    name: 'find_stock',
    description: 'Look up stock symbols by company name. Use when the user names a company and you need its symbol.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Company name or ticker' },
        market: { type: 'string', enum: ['IN', 'US'], description: 'IN for NSE/BSE (default), US for US stocks' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    run: async ({ query, market }) => ({ results: (await searchSymbols(query, market === 'US' ? 'US' : 'IN')).slice(0, 6) }),
  },
  {
    name: 'my_trading',
    description:
      "The user's trading setup and record: watchlist, engine settings (capital, risk %, threshold, charges), the engine's open and recent closed paper/demo trades with stats, and the user's own paper trades (open positions and closed results). Use for 'how am I doing', 'review my watchlist' or 'what should I do with my open trades'.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => {
      const [cfg, engineTrades, paper] = await Promise.all([engineService.getConfig(), all('enginetrades'), all('trades')]);
      const { performanceStats } = await import('../../src/engine/stats.js');
      const monthAgo = Date.now() - 30 * 86400000;
      const pick = (t) => ({
        symbol: t.symbol,
        side: t.side,
        status: t.status,
        source: t.source,
        entry: t.entryPrice ?? t.plan?.entry,
        stop: t.stop ?? t.plan?.stop,
        target: t.target ?? t.plan?.target,
        exit: t.exitPrice,
        exitReason: t.exitReason,
        netPnl: t.netPnl,
        r: t.r,
        liveAction: t.liveAction,
        when: t.exitTime ? new Date(t.exitTime).toISOString() : t.signalTime ? new Date(t.signalTime).toISOString() : null,
      });
      const recentEngine = engineTrades.filter((t) => (t.exitTime || t.signalTime || 0) >= monthAgo);
      return {
        watchlist: cfg.watchlist,
        settings: { capital: cfg.capital, riskPct: cfg.riskPct, threshold: cfg.threshold, maxQuantity: cfg.maxQuantity, allowShort: cfg.allowShort, charges: cfg.charges },
        engine: {
          last30Days: performanceStats(recentEngine),
          open: engineTrades.filter((t) => t.status !== 'closed').map(pick),
          recentClosed: recentEngine.filter((t) => t.status === 'closed').slice(-10).map(pick),
        },
        myPaperTrades: {
          open: paper.filter((t) => t.status !== 'closed').map((t) => ({ symbol: t.symbol, side: t.side, entry: t.entryPrice, quantity: t.quantity, stop: t.stopLoss, target: t.target, since: t.entryDate })),
          closed: paper
            .filter((t) => t.status === 'closed')
            .slice(0, 15)
            .map((t) => ({ symbol: t.symbol, side: t.side, entry: t.entryPrice, exit: t.exitPrice, quantity: t.quantity, setupSignal: t.setupSignal, followedPlan: t.followedPlan, review: t.review })),
        },
      };
    },
  },
  {
    name: 'todays_signals',
    description: "Today's logged engine decisions (one per scanned 5-minute candle), newest first, optionally for one symbol: state, scores, failed conditions. Use to explain a pattern like 'why does it keep saying WAIT'.",
    input_schema: {
      type: 'object',
      properties: { symbol: { type: 'string', description: 'Optional NSE symbol' } },
      additionalProperties: false,
    },
    run: async ({ symbol } = {}) => {
      const { signals } = await engineService.history({ symbol: symbol ? normSymbol(symbol) : undefined, days: 1, timeframe: '5m', limit: 60 });
      return {
        signals: signals.map((s) => ({
          symbol: s.symbol,
          time: new Date(s.candleTime).toISOString(),
          state: s.state,
          score: s.score,
          failed: s.failedConditions,
        })),
      };
    },
  },
];

// ------- InvestByte tools -------

async function portfolio() {
  const items = await all('investments');
  const holdings = items.map((i) => ({
    name: i.name,
    category: i.category,
    invested: r2(i.invested),
    current: r2(i.current),
    gainPct: pct(i.current, i.invested),
    symbol: i.symbol || undefined,
    market: i.market || undefined,
    quantity: i.quantity || undefined,
    schemeCode: i.schemeCode || undefined,
    units: i.units || undefined,
    grams: i.grams || undefined,
    coin: i.coinSymbol || undefined,
    fdRatePct: i.fdRate || undefined,
    fdMaturity: i.fdMaturity || undefined,
    sip: i.sip ? { amount: i.sip.amount, day: i.sip.day } : undefined,
    since: (i.createdAt || '').slice(0, 10) || undefined,
  }));
  const totalInvested = holdings.reduce((s, h) => s + (h.invested || 0), 0);
  const totalCurrent = holdings.reduce((s, h) => s + (h.current || 0), 0);
  const byCategory = {};
  holdings.forEach((h) => {
    const c = (byCategory[h.category] ||= { invested: 0, current: 0, count: 0 });
    c.invested += h.invested || 0;
    c.current += h.current || 0;
    c.count += 1;
  });
  Object.values(byCategory).forEach((c) => {
    c.invested = r2(c.invested);
    c.current = r2(c.current);
    c.gainPct = pct(c.current, c.invested);
    c.allocationPct = totalCurrent > 0 ? r2((c.current / totalCurrent) * 100) : null;
  });
  const monthlySip = holdings.reduce((s, h) => s + (h.sip?.amount || 0), 0);
  return {
    totals: { invested: r2(totalInvested), current: r2(totalCurrent), gainPct: pct(totalCurrent, totalInvested), holdings: holdings.length, monthlySip },
    byCategory,
    holdings,
  };
}

async function fundPerformance(schemeCode) {
  const code = String(schemeCode || '').trim();
  if (!/^\d{3,7}$/.test(code)) throw new Error('schemeCode must be the AMFI scheme number');
  const response = await fetch(`https://api.mfapi.in/mf/${code}`, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`mfapi.in responded ${response.status}`);
  const body = await response.json();
  const rows = (body.data || []).map((d) => ({ date: d.date, nav: parseFloat(d.nav) })).filter((d) => d.nav > 0); // newest first
  if (!rows.length) throw new Error('No NAV history');
  const latest = rows[0].nav;
  const at = (days) => rows[Math.min(rows.length - 1, Math.round((days / 365) * 250))]?.nav;
  const cagr = (years) => {
    const past = at(years * 365);
    return past && rows.length > years * 240 ? r2((Math.pow(latest / past, 1 / years) - 1) * 100) : null;
  };
  return {
    schemeCode: code,
    name: body.meta?.scheme_name,
    category: body.meta?.scheme_category,
    fundHouse: body.meta?.fund_house,
    latestNav: latest,
    navDate: rows[0].date,
    return3mPct: pct(latest, at(91)),
    return1yPct: pct(latest, at(365)),
    cagr3yPct: cagr(3),
    cagr5yPct: cagr(5),
  };
}

async function finances() {
  const [debts, months, expenses] = await Promise.all([all('debts'), all('months'), all('expenditure')]);
  const now = new Date(Date.now() + 330 * 60000); // IST
  const month = now.toISOString().slice(0, 7);
  const sum = (list) => list.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const doc = months.find((m) => m.month === month);
  const spent = sum(expenses.filter((e) => (e.month || (e.date || e.createdAt || '').slice(0, 7)) === month));
  const loans = debts.filter((d) => (d.section || 'emi') === 'emi');
  const cards = debts.filter((d) => d.section === 'card' && !d.paid);
  return {
    month,
    incomeThisMonth: r2(sum(doc?.incomes || [])),
    spentThisMonth: r2(spent),
    loans: loans.map((l) => ({ name: l.name, principal: l.principal, outstanding: l.outstanding, ratePct: l.rate ?? l.interestRate, emi: l.emi })),
    unpaidCardBills: r2(sum(cards)),
  };
}

const investTools = [
  {
    name: 'get_portfolio',
    description:
      "The user's whole portfolio from My Investments: totals, allocation by category (mutual funds, stocks, digital gold/silver/platinum, crypto, FDs) and every holding with invested, current value, gain %, SIP, and the identifiers (stock symbol, fund scheme code, coin) to look up more. Call this first.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    run: portfolio,
  },
  {
    name: 'fund_performance',
    description: "A mutual fund's track record from AMFI NAVs (mfapi.in): latest NAV, 3-month and 1-year return, 3- and 5-year CAGR, category and fund house. Use the holding's schemeCode.",
    input_schema: {
      type: 'object',
      properties: { schemeCode: { type: 'string', description: 'AMFI scheme code from get_portfolio' } },
      required: ['schemeCode'],
      additionalProperties: false,
    },
    run: async ({ schemeCode }) => fundPerformance(schemeCode),
  },
  {
    name: 'stock_trend',
    description: "Daily trend of a stock the user holds (or is considering): price, 1w/1m/3m change, 6-month high/low, EMA 20/50, RSI, MACD and the Setup Check verdict. Use the holding's symbol.",
    input_schema: {
      type: 'object',
      properties: { symbol: { type: 'string', description: 'e.g. TCS.NS or AAPL' } },
      required: ['symbol'],
      additionalProperties: false,
    },
    run: async ({ symbol }) => dailyTrend(symbol),
  },
  {
    name: 'stock_quotes',
    description: 'Live prices for up to 10 stock symbols, plus today’s USD→INR rate.',
    input_schema: {
      type: 'object',
      properties: { symbols: { type: 'array', items: { type: 'string' }, maxItems: 10 } },
      required: ['symbols'],
      additionalProperties: false,
    },
    run: async ({ symbols }) => getQuotes((symbols || []).map(normSymbol)),
  },
  {
    name: 'my_finances',
    description: "This month's income and spending, loans (outstanding, EMI) and unpaid credit card bills — for advice that depends on cash flow or debt (e.g. pay off a loan vs invest more).",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    run: finances,
  },
];

module.exports = { stockTools, investTools, dailyTrend, portfolio, fundPerformance, normSymbol };
