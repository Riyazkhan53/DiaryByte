// Signal engine: score and eligibility kept apart. The score says how many
// weighted checks agree; the gates decide whether anything may be shown as
// a candidate. A 90/100 score with stale data or no workable stop is still
// NO TRADE. Weights are starting hypotheses, not a tested edge.

import { completedCandles, checkFreshness, normalizeCandles } from './candles.js';
import { atr, ema, macd, priorRange, rsi, sessionVwap, volumeAverage } from './indicators.js';
import { DEFAULT_CONFIG, planTrade } from './risk.js';

// Bump when checks, weights or gates change, so past results stay traceable.
export const RULE_VERSION = 'intraday-v1';

export const STATES = {
  BUY: 'BUY CANDIDATE',
  SELL: 'SELL CANDIDATE',
  WAIT: 'WAIT',
  NEUTRAL: 'NEUTRAL',
  NO_TRADE: 'NO TRADE',
};

// Completed 5-minute candles needed before signals: EMA 50 is the longest.
export const MIN_5M = 50;
export const MIN_15M = 20;

const round = (n, dp = 2) => (n == null ? null : Math.round(n * 10 ** dp) / 10 ** dp);

function trend15(candles15) {
  if (candles15.length < MIN_15M) return null;
  const closes = candles15.map((c) => c.close);
  const price = closes[closes.length - 1];
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const up = price > e20 && (e50 == null || e20 > e50);
  const down = price < e20 && (e50 == null || e20 < e50);
  return { up, down, ema20: e20, ema50: e50 };
}

/**
 * Evaluate a symbol at `now` from raw 5- and 15-minute candles.
 * `context`: { cash, openPositions, dayPnl, lastSignalKey } from the ledger.
 * Returns { ruleVersion, symbol, state, side, score: { long, short },
 *   threshold, checks, gates, reasons, indicators, candle, data, plan, key }.
 */
export function evaluateSignal({ symbol, candles5, candles15, now = Date.now(), config, context = {} }) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const c5 = completedCandles(normalizeCandles(candles5), 5, now);
  const c15 = completedCandles(normalizeCandles(candles15), 15, now);
  const data = checkFreshness(c5, { intervalMin: 5, now, maxDelayMin: cfg.maxDelayMin });
  const candle = data.lastCandle;
  const closes = c5.map((c) => c.close);
  const price = candle?.close ?? null;

  const ind = {
    price,
    ema9: ema(closes, 9),
    ema20: ema(closes, 20),
    ema50: ema(closes, 50),
    vwap: sessionVwap(c5),
    rsi: rsi(closes, 14),
    macd: macd(closes),
    atr: atr(c5, 14),
    volume: candle?.volume ?? null,
    volumeAvg: volumeAverage(c5, 20),
    range: priorRange(c5, cfg.breakoutLookback),
    trend15: trend15(c15),
  };

  // ------- data gates (both sides) -------
  const criticalFinite = [ind.ema9, ind.ema20, ind.ema50, ind.rsi, ind.atr, ind.volumeAvg, ind.macd?.macd, ind.macd?.signal]
    .every((v) => typeof v === 'number' && Number.isFinite(v));
  const dataGates = [
    { id: 'session', pass: data.marketOpen, note: data.marketOpen ? 'NSE session is open' : 'NSE is closed (09:15–15:30 IST, Mon–Fri)' },
    {
      id: 'fresh',
      pass: data.status === 'fresh' || data.status === 'delayed',
      note:
        data.status === 'empty'
          ? 'No completed candles'
          : data.status === 'stale'
            ? `Data is stale${data.ageMin != null ? ` (last candle ended ${data.ageMin} min ago)` : ''}`
            : `Last completed candle ended ${data.ageMin} min ago${data.status === 'delayed' ? ' (delayed feed)' : ''}`,
    },
    { id: 'closed', pass: !!candle, note: 'Signal uses the last completed 5-minute candle only' },
    {
      id: 'history',
      pass: c5.length >= MIN_5M && c15.length >= MIN_15M && criticalFinite && ind.vwap != null,
      note: `${c5.length}/${MIN_5M} completed 5-min and ${c15.length}/${MIN_15M} 15-min candles${criticalFinite ? '' : '; some indicators not ready'}`,
    },
  ];

  // ------- weighted checks (plan section 5) -------
  const ready = (...v) => v.every((x) => x != null);
  const volOk = ready(ind.volume, ind.volumeAvg) ? ind.volume >= ind.volumeAvg : null;
  const rows = [
    ['ema20', 'Price vs EMA 20', 10, ready(price, ind.ema20) ? price > ind.ema20 : null, ready(price, ind.ema20) ? price < ind.ema20 : null],
    ['emaTrend', 'EMA 20 vs EMA 50', 10, ready(ind.ema20, ind.ema50) ? ind.ema20 > ind.ema50 : null, ready(ind.ema20, ind.ema50) ? ind.ema20 < ind.ema50 : null],
    ['emaFast', 'EMA 9 vs EMA 20', 10, ready(ind.ema9, ind.ema20) ? ind.ema9 > ind.ema20 : null, ready(ind.ema9, ind.ema20) ? ind.ema9 < ind.ema20 : null],
    ['vwap', 'Price vs VWAP', 15, ready(price, ind.vwap) ? price > ind.vwap : null, ready(price, ind.vwap) ? price < ind.vwap : null],
    ['rsi', 'RSI (14)', 10, ready(ind.rsi) ? ind.rsi >= 55 && ind.rsi <= 70 : null, ready(ind.rsi) ? ind.rsi >= 30 && ind.rsi <= 45 : null],
    ['macd', 'MACD vs signal', 10, ind.macd ? ind.macd.macd > ind.macd.signal : null, ind.macd ? ind.macd.macd < ind.macd.signal : null],
    ['volume', 'Volume vs 20-candle avg', 15, volOk, volOk],
    ['trend15', '15-minute trend', 10, ind.trend15 ? ind.trend15.up : null, ind.trend15 ? ind.trend15.down : null],
    ['breakout', 'Range breakout', 10, ready(price, ind.range) ? price > ind.range.high : null, ready(price, ind.range) ? price < ind.range.low : null],
  ];
  const checks = rows.map(([id, name, weight, long, short]) => ({ id, name, weight, long, short }));
  const score = {
    long: checks.reduce((s, c) => s + (c.long ? c.weight : 0), 0),
    short: checks.reduce((s, c) => s + (c.short ? c.weight : 0), 0),
  };

  // ------- side gates -------
  const plans = {
    long: planTrade({ side: 'long', entry: price, atr: ind.atr, cash: context.cash, config: cfg }),
    short: planTrade({ side: 'short', entry: price, atr: ind.atr, cash: context.cash, config: cfg }),
  };
  const dailyLimit = round((cfg.capital * cfg.dailyLossPct) / 100);
  const limitHit = (context.dayPnl ?? 0) <= -dailyLimit;
  const tooMany = (context.openPositions ?? 0) >= cfg.maxOpenPositions;
  const sideGates = (side) => {
    const isLong = side === 'long';
    const vwapCheck = checks.find((c) => c.id === 'vwap')[side];
    const plan = plans[side];
    const key = candle ? `${symbol}:${candle.t}:${side}` : null;
    return [
      { id: 'vwap', pass: !!vwapCheck, note: `Price ${isLong ? 'above' : 'below'} VWAP is required` },
      { id: 'volume', pass: !!volOk, note: 'Completed-candle volume must be at least the 20-candle average' },
      { id: 'risk', pass: plan.ok, note: plan.ok ? `${plan.quantity} share${plan.quantity > 1 ? 's' : ''} fit the ₹${plan.riskBudget} risk budget and cash` : plan.reason },
      { id: 'dailyLimit', pass: !limitHit, note: limitHit ? `Daily loss limit of ₹${dailyLimit} reached` : `Daily loss so far within ₹${dailyLimit}` },
      { id: 'positions', pass: !tooMany, note: tooMany ? `Already ${context.openPositions} open position(s) (max ${cfg.maxOpenPositions})` : 'Room for a position' },
      { id: 'duplicate', pass: !key || key !== context.lastSignalKey, note: 'Not already signalled on this candle' },
      ...(isLong ? [] : [{ id: 'shortAllowed', pass: !!cfg.allowShort, note: cfg.allowShort ? 'Intraday shorts allowed in settings' : 'Shorts are turned off in settings' }]),
    ];
  };
  const gates = { data: dataGates, long: sideGates('long'), short: sideGates('short') };

  // ------- state -------
  const reasons = [];
  let state;
  let side = score.long >= score.short ? 'long' : 'short';
  const failed = (list) => list.filter((g) => !g.pass);
  const dataFails = failed(dataGates);
  if (dataFails.length) {
    state = STATES.NO_TRADE;
    reasons.push(...dataFails.map((g) => g.note));
  } else {
    const best = score[side];
    const sideFails = failed(gates[side]);
    const safety = sideFails.filter((g) => ['risk', 'dailyLimit', 'positions', 'shortAllowed'].includes(g.id));
    if (best >= cfg.threshold && !sideFails.length) {
      state = side === 'long' ? STATES.BUY : STATES.SELL;
      reasons.push(`${side === 'long' ? 'Long' : 'Short'} score ${best}/100 meets ${cfg.threshold} and every gate passes. Review it yourself; it is not an order.`);
    } else if (best >= cfg.threshold && safety.length) {
      state = STATES.NO_TRADE;
      reasons.push(...safety.map((g) => g.note));
    } else if (best >= cfg.threshold - 15) {
      state = STATES.WAIT;
      if (best < cfg.threshold) reasons.push(`${side === 'long' ? 'Long' : 'Short'} score ${best}/100 is close to ${cfg.threshold}`);
      reasons.push(...sideFails.map((g) => g.note));
    } else {
      state = STATES.NEUTRAL;
      reasons.push(`No side reaches ${cfg.threshold}: long ${score.long}, short ${score.short}`);
    }
  }

  return {
    ruleVersion: RULE_VERSION,
    symbol,
    evaluatedAt: new Date(typeof now === 'number' ? now : Date.parse(now)).toISOString(),
    state,
    side,
    score,
    threshold: cfg.threshold,
    checks,
    gates,
    reasons,
    indicators: {
      price: round(price),
      ema9: round(ind.ema9),
      ema20: round(ind.ema20),
      ema50: round(ind.ema50),
      vwap: round(ind.vwap),
      rsi: round(ind.rsi, 1),
      macd: round(ind.macd?.macd, 3),
      macdSignal: round(ind.macd?.signal, 3),
      atr: round(ind.atr),
      volume: ind.volume,
      volumeAvg: ind.volumeAvg == null ? null : Math.round(ind.volumeAvg),
      rangeHigh: round(ind.range?.high),
      rangeLow: round(ind.range?.low),
      trend15: ind.trend15 ? (ind.trend15.up ? 'up' : ind.trend15.down ? 'down' : 'mixed') : null,
    },
    candle: candle ? { t: candle.t, close: candle.close } : null,
    data: { status: data.status, ageMin: data.ageMin, marketOpen: data.marketOpen, gaps: data.gaps, issues: data.issues },
    plan: plans[side],
    key: candle ? `${symbol}:${candle.t}:${side}` : null,
  };
}
