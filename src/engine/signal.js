// Signal engine: score and eligibility kept apart. The score says how many
// weighted checks agree; the gates decide whether anything may be shown as
// a candidate. A 90/100 score with stale data or no workable stop is still
// NO TRADE. Weights are starting hypotheses, not a tested edge.

import { completedCandles, checkFreshness, normalizeCandles } from './candles.js';
import { atr, ema, macd, priorRange, rsi, sessionVwap, volumeStats } from './indicators.js';
import { DEFAULT_CONFIG, planTrade } from './risk.js';

// Bump when checks, weights or gates change, so past results stay traceable.
export const RULE_VERSION = 'intraday-v2';

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

// Volume: the signal candle against the 20 completed 5-minute candles
// before it in the same session.
export const VOLUME_LOOKBACK = 20;
// A range breakout only counts when the candle closes clear of the range
// (by this × ATR), in the breakout's direction, on this × average volume.
export const BREAKOUT_BUFFER_ATR = 0.1;
export const BREAKOUT_VOLUME_RATIO = 1.5;
// Overextension: high RSI or price far from VWAP doesn't block a trade,
// it costs points, so chasing a stretched move needs more agreement.
export const RSI_OVERBOUGHT = 70;
export const RSI_OVERSOLD = 30;
export const RSI_EXTREME = 10; // 80 / 20 costs more
export const RSI_PENALTY = 10;
export const RSI_EXTREME_PENALTY = 20;
export const STRETCH_ATR = 3; // price more than this × ATR from VWAP
export const STRETCH_PENALTY = 10;

// Short name and what to wait for, per gate. Shown when a signal waits.
const GATE_INFO = {
  session: { label: 'Market hours', action: () => 'Wait for the NSE session (09:15–15:30 IST)' },
  fresh: { label: 'Fresh data', action: () => 'Wait for fresh candle data' },
  closed: { label: 'Closed candle', action: () => 'Wait for the first 5-minute candle to close' },
  history: { label: 'Enough history', action: () => 'Wait for more completed candles' },
  vwap: { label: 'VWAP', action: (long) => `Wait for a 5-minute close ${long ? 'above' : 'below'} VWAP` },
  volume: { label: 'Volume', action: () => 'Wait for volume confirmation' },
  trend15: { label: '15-min trend', action: (long) => `Wait for the 15-minute trend to turn ${long ? 'up' : 'down'}` },
  risk: { label: 'Risk budget', action: () => 'Skip this one: the stop does not fit your risk budget' },
  dailyLimit: { label: 'Daily loss limit', action: () => 'Stop for today: the daily loss limit is reached' },
  positions: { label: 'Open positions', action: () => 'Manage or close the open position first' },
  duplicate: { label: 'Already signalled', action: () => 'Already signalled on this candle; wait for the next one' },
  shortAllowed: { label: 'Shorts allowed', action: () => 'Shorts are turned off in settings' },
};
const withInfo = (gate, long = true) => ({
  ...gate,
  label: GATE_INFO[gate.id].label,
  action: gate.action || GATE_INFO[gate.id].action(long),
});

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
 * Returns { ruleVersion, symbol, state, side, score: { long, short } (after
 *   penalties), rawScore, penalties, threshold, checks, gates, reasons,
 *   failedConditions, nextAction, indicators, candle, data, plan, key }.
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
    vol: volumeStats(c5, VOLUME_LOOKBACK),
    range: priorRange(c5, cfg.breakoutLookback),
    trend15: trend15(c15),
  };

  // ------- data gates (both sides) -------
  const criticalFinite = [ind.ema9, ind.ema20, ind.ema50, ind.rsi, ind.atr, ind.macd?.macd, ind.macd?.signal]
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
  ].map((g) => withInfo(g));

  // ------- weighted checks (plan section 5) -------
  const ready = (...v) => v.every((x) => x != null);
  const volRatio = ind.vol.ratio;
  const volOk = volRatio != null ? volRatio >= 1 : null;
  // Breakout confirmation: a close clear of the range, a candle in the
  // breakout's direction and above-average volume, not just a poke through.
  const breakout = (long) => {
    if (!ready(price, ind.range, ind.atr) || !candle) return null;
    const buffer = ind.atr * BREAKOUT_BUFFER_ATR;
    const beyond = long ? price > ind.range.high + buffer : price < ind.range.low - buffer;
    const body = long ? candle.close > candle.open : candle.close < candle.open;
    return beyond && body && volRatio != null && volRatio >= BREAKOUT_VOLUME_RATIO;
  };
  const rows = [
    ['ema20', 'Price vs EMA 20', 10, ready(price, ind.ema20) ? price > ind.ema20 : null, ready(price, ind.ema20) ? price < ind.ema20 : null],
    ['emaTrend', 'EMA 20 vs EMA 50', 10, ready(ind.ema20, ind.ema50) ? ind.ema20 > ind.ema50 : null, ready(ind.ema20, ind.ema50) ? ind.ema20 < ind.ema50 : null],
    ['emaFast', 'EMA 9 vs EMA 20', 10, ready(ind.ema9, ind.ema20) ? ind.ema9 > ind.ema20 : null, ready(ind.ema9, ind.ema20) ? ind.ema9 < ind.ema20 : null],
    ['vwap', 'Price vs VWAP', 15, ready(price, ind.vwap) ? price > ind.vwap : null, ready(price, ind.vwap) ? price < ind.vwap : null],
    ['rsi', 'RSI (14)', 10, ready(ind.rsi) ? ind.rsi >= 55 && ind.rsi <= 70 : null, ready(ind.rsi) ? ind.rsi >= 30 && ind.rsi <= 45 : null],
    ['macd', 'MACD vs signal', 10, ind.macd ? ind.macd.macd > ind.macd.signal : null, ind.macd ? ind.macd.macd < ind.macd.signal : null],
    ['volume', 'Volume vs same-session 20-candle avg', 15, volOk, volOk],
    ['trend15', '15-minute trend', 10, ind.trend15 ? ind.trend15.up : null, ind.trend15 ? ind.trend15.down : null],
    ['breakout', 'Range breakout (confirmed)', 10, breakout(true), breakout(false)],
  ];
  const checks = rows.map(([id, name, weight, long, short]) => ({ id, name, weight, long, short }));
  const raw = {
    long: checks.reduce((s, c) => s + (c.long ? c.weight : 0), 0),
    short: checks.reduce((s, c) => s + (c.short ? c.weight : 0), 0),
  };

  // ------- overextension penalties (points off, never a hard reject) -------
  const rsiPenalty = (long) => {
    if (!ready(ind.rsi)) return 0;
    const over = long ? ind.rsi - RSI_OVERBOUGHT : RSI_OVERSOLD - ind.rsi;
    if (over >= RSI_EXTREME) return RSI_EXTREME_PENALTY;
    return over > 0 ? RSI_PENALTY : 0;
  };
  const stretchAtr = ready(price, ind.vwap, ind.atr) && ind.atr > 0 ? (price - ind.vwap) / ind.atr : null;
  const stretchPenalty = (long) =>
    stretchAtr != null && (long ? stretchAtr : -stretchAtr) > STRETCH_ATR ? STRETCH_PENALTY : 0;
  const penalties = [
    {
      id: 'rsiExtended',
      name: `RSI beyond ${RSI_OVERBOUGHT} / ${RSI_OVERSOLD}`,
      long: rsiPenalty(true),
      short: rsiPenalty(false),
    },
    {
      id: 'stretch',
      name: `Price over ${STRETCH_ATR} × ATR from VWAP`,
      long: stretchPenalty(true),
      short: stretchPenalty(false),
    },
  ];
  const penalty = {
    long: penalties.reduce((s, p) => s + p.long, 0),
    short: penalties.reduce((s, p) => s + p.short, 0),
  };
  const score = { long: Math.max(0, raw.long - penalty.long), short: Math.max(0, raw.short - penalty.short) };

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
    const trendCheck = checks.find((c) => c.id === 'trend15')[side];
    const plan = plans[side];
    const key = candle ? `${symbol}:${candle.t}:${side}` : null;
    const vol = ind.vol;
    const shares = `${plan.quantity} share${plan.quantity > 1 ? 's' : ''}`;
    return [
      { id: 'vwap', pass: !!vwapCheck, note: `Price ${isLong ? 'above' : 'below'} VWAP is required` },
      {
        id: 'volume',
        pass: !!volOk,
        note:
          vol.avg == null
            ? `Volume needs ${vol.needed} completed 5-minute candles today before the signal candle (${vol.count} so far)`
            : `Volume ${round(vol.ratio)}× the same-session 20-candle average (needs 1×)`,
        action:
          vol.avg == null
            ? `Wait for ${vol.needed - vol.count} more completed 5-minute candle${vol.needed - vol.count > 1 ? 's' : ''} today`
            : undefined,
      },
      { id: 'trend15', pass: !!trendCheck, note: `15-minute trend must be ${isLong ? 'up' : 'down'}` },
      {
        id: 'risk',
        pass: plan.ok,
        note: plan.ok
          ? `${shares} within the ₹${plan.riskBudget} risk budget${plan.capped ? ` (capped at your max quantity of ${plan.maxQuantity})` : ''}`
          : plan.reason,
      },
      { id: 'dailyLimit', pass: !limitHit, note: limitHit ? `Daily loss limit of ₹${dailyLimit} reached` : `Daily loss so far within ₹${dailyLimit}` },
      { id: 'positions', pass: !tooMany, note: tooMany ? `Already ${context.openPositions} open position(s) (max ${cfg.maxOpenPositions})` : 'Room for a position' },
      { id: 'duplicate', pass: !key || key !== context.lastSignalKey, note: 'Not already signalled on this candle' },
      ...(isLong ? [] : [{ id: 'shortAllowed', pass: !!cfg.allowShort, note: cfg.allowShort ? 'Intraday shorts allowed in settings' : 'Shorts are turned off in settings' }]),
    ].map((g) => withInfo(g, isLong));
  };
  const gates = { data: dataGates, long: sideGates('long'), short: sideGates('short') };

  // ------- state -------
  const reasons = [];
  let state;
  let side = score.long >= score.short ? 'long' : 'short';
  // `failedConditions` and `nextAction` explain any state in one line each.
  let failedConditions = [];
  let nextAction;
  const failed = (list) => list.filter((g) => !g.pass);
  const dataFails = failed(dataGates);
  const Side = side === 'long' ? 'Long' : 'Short';
  if (penalty[side] > 0) {
    reasons.push(`${Side} score lost ${penalty[side]} points for an extended move (${penalties.filter((p) => p[side]).map((p) => p.name).join('; ')})`);
  }
  if (dataFails.length) {
    state = STATES.NO_TRADE;
    reasons.splice(0, reasons.length, ...dataFails.map((g) => g.note));
    failedConditions = dataFails.map((g) => g.label);
    nextAction = dataFails[0].action;
  } else {
    const best = score[side];
    const sideFails = failed(gates[side]);
    const safety = sideFails.filter((g) => ['risk', 'dailyLimit', 'positions', 'shortAllowed'].includes(g.id));
    const scoreShort = best < cfg.threshold;
    // The checks agree but the move is stretched: say so rather than "score".
    const chasing = scoreShort && penalty[side] > 0 && raw[side] >= cfg.threshold;
    failedConditions = [...(chasing ? ['Overextended'] : scoreShort ? ['Score'] : []), ...sideFails.map((g) => g.label)];
    if (!scoreShort && !sideFails.length) {
      state = side === 'long' ? STATES.BUY : STATES.SELL;
      reasons.push(`${Side} score ${best}/100 meets ${cfg.threshold} and every gate passes. Review it yourself; it is not an order.`);
      nextAction = 'Review the plan below; paper trade it only if you agree';
    } else if (!scoreShort && safety.length) {
      state = STATES.NO_TRADE;
      reasons.push(...safety.map((g) => g.note));
      failedConditions = safety.map((g) => g.label);
      nextAction = safety[0].action;
    } else if (best >= cfg.threshold - 15) {
      state = STATES.WAIT;
      if (scoreShort) reasons.push(`${Side} score ${best}/100 is close to ${cfg.threshold}`);
      reasons.push(...sideFails.map((g) => g.note));
      // A mandatory gate first: no score helps while one fails.
      nextAction = sideFails.length
        ? sideFails[0].action
        : chasing
          ? `Don't chase: wait for a pullback (RSI back ${side === 'long' ? `under ${RSI_OVERBOUGHT}` : `over ${RSI_OVERSOLD}`} or price nearer VWAP)`
          : `Wait for the ${side} score to reach ${cfg.threshold} (now ${best})`;
    } else {
      state = STATES.NEUTRAL;
      reasons.push(`No side reaches ${cfg.threshold}: long ${score.long}, short ${score.short}`);
      nextAction = 'No setup yet; check again after the next candle';
    }
  }

  return {
    ruleVersion: RULE_VERSION,
    symbol,
    evaluatedAt: new Date(typeof now === 'number' ? now : Date.parse(now)).toISOString(),
    state,
    side,
    score,
    rawScore: raw,
    penalties,
    threshold: cfg.threshold,
    checks,
    gates,
    reasons,
    failedConditions,
    nextAction,
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
      volume: ind.vol.volume,
      volumeAvg: ind.vol.avg == null ? null : Math.round(ind.vol.avg),
      volumeRatio: round(ind.vol.ratio),
      volumeCandles: ind.vol.count,
      stretchAtr: round(stretchAtr),
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
