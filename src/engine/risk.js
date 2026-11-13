// Risk-first trade planning: stop from volatility (ATR), target from a
// reward:risk multiple, quantity from the risk budget (₹ for NSE, $ for US)
// and the cash available, and estimated costs counted inside the risk.

// Estimated NSE intraday (MIS) equity charges, modelled on a discount
// broker. These are estimates — check your broker's contract note — and
// can be changed in the trading settings.
export const DEFAULT_CHARGES = {
  brokeragePct: 0.03, // per order, capped below
  brokerageCap: 20, // ₹ per order
  brokerageMin: 0, // ₹ per order (some brokers charge a minimum)
  sttSellPct: 0.025, // on the sell side
  exchangePct: 0.00297, // NSE transaction charge, both sides
  sebiPerCrore: 10, // ₹ per ₹1 crore turnover
  gstPct: 18, // on brokerage + exchange + SEBI
  stampBuyPct: 0.003, // on the buy side
};

// Estimated US (NASDAQ) costs: commission-free broker plus the regulatory
// fees on sells. Change them in the trading settings if your platform
// charges a commission or an FX fee per trade.
export const DEFAULT_CHARGES_US = {
  model: 'us',
  commissionPerOrder: 0, // $ per order
  secFeePerMillion: 27.8, // SEC fee: $ per $1 million sold
  tafPerShare: 0.000166, // FINRA trading activity fee, $ per share sold
  tafCap: 8.3, // $ per trade
};

export const DEFAULT_CONFIG = {
  capital: 2000, // ₹, set by you, never read from a broker
  riskPct: 1, // per trade
  dailyLossPct: 2, // stop opening new trades after this
  limitPositions: false, // when on, no new trade while maxOpenPositions are open
  maxOpenPositions: 1,
  maxQuantity: 1, // shares per trade, even when the budget and cash allow more (0 = no cap)
  atrMultiple: 1.5, // stop distance = ATR × this
  rewardRisk: 2, // target = entry ± reward:risk × stop distance (never below MIN_REWARD_RISK)
  minNetRR: 1.2, // warn when, after charges, the target pays less than this × the max loss
  slippagePct: 0.05, // per side, on fills
  threshold: 65, // score needed for a candidate
  maxDelayMin: 20, // data older than this (during the session) is stale
  breakoutLookback: 12, // 5-minute candles = 1 hour
  maxHoldMin: 0, // paper trades exit after this many minutes (0 = hold until 15:20)
  trailAtR: 1, // once a trade is this many R in profit, move the stop to entry (0 = off)
  weakExit: true, // exit when a 5-min candle closes back across VWAP with EMA 9/21 flipped
  allowShort: true, // intraday shorts (MIS) only
  learnOn: true, // ask for a higher score where past trades have been losing
  market: 'NSE',
  charges: DEFAULT_CHARGES,
};

// US (NASDAQ) defaults: the same rules, a dollar capital, commission-free
// costs and no fixed share cap (US prices are higher per share).
export const DEFAULT_CONFIG_US = {
  ...DEFAULT_CONFIG,
  capital: 1000, // $
  maxQuantity: 0,
  market: 'US',
  watchlist: ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'AMD', 'TSLA'],
  charges: DEFAULT_CHARGES_US,
};

/** Default settings for a market ('NSE' | 'US'). */
export const defaultConfig = (market = 'NSE') => (market === 'US' ? DEFAULT_CONFIG_US : DEFAULT_CONFIG);
/** Default charges for a market. */
export const defaultCharges = (market = 'NSE') => (market === 'US' ? DEFAULT_CHARGES_US : DEFAULT_CHARGES);

// Engine targets are at least 1:2. A higher setting moves the target out.
export const MIN_REWARD_RISK = 2;

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Estimated charges for one round trip (buy and sell). `quantity` is used
 * by per-share fees (US FINRA TAF); without it they're left out.
 */
export function estimateCosts(buyValue, sellValue, charges = DEFAULT_CHARGES, quantity = 0) {
  if (charges?.model === 'us') {
    const c = { ...DEFAULT_CHARGES_US, ...charges };
    const orders = (buyValue > 0 ? 1 : 0) + (sellValue > 0 ? 1 : 0);
    const commission = orders * (Number(c.commissionPerOrder) || 0);
    const sec = (sellValue * (Number(c.secFeePerMillion) || 0)) / 1e6;
    const taf = quantity > 0 ? Math.min(quantity * (Number(c.tafPerShare) || 0), Number(c.tafCap) || Infinity) : 0;
    return round2(commission + sec + taf);
  }
  const c = { ...DEFAULT_CHARGES, ...charges };
  const perOrder = (value) =>
    value > 0 ? Math.min(Math.max((value * c.brokeragePct) / 100, c.brokerageMin || 0), c.brokerageCap) : 0;
  const brokerage = perOrder(buyValue) + perOrder(sellValue);
  const turnover = buyValue + sellValue;
  const exchange = (turnover * c.exchangePct) / 100;
  const sebi = (turnover / 1e7) * c.sebiPerCrore;
  const stt = (sellValue * c.sttSellPct) / 100;
  const stamp = (buyValue * c.stampBuyPct) / 100;
  const gst = ((brokerage + exchange + sebi) * c.gstPct) / 100;
  return round2(brokerage + exchange + sebi + stt + stamp + gst);
}

// A market's charges with its defaults filled in.
const chargesFor = (cfg) => ({ ...defaultCharges(cfg.market), ...cfg.charges });

/**
 * Quantity for a given entry and stop: as many shares as fit the rupee
 * risk budget (including slippage and estimated charges) and the cash, up
 * to maxQuantity. Returns { ok, reason?, quantity, riskPerShare, costs,
 * maxLoss, cashUsed, riskBudget, maxQuantity, capped }. capped is true when
 * the budget and cash would allow more than maxQuantity. The stop is never
 * moved to make it fit.
 */
export function sizeForStop({ side = 'long', entry, stop, cash, config = DEFAULT_CONFIG }) {
  const base = { ...DEFAULT_CONFIG, ...config };
  const cfg = { ...base, charges: chargesFor(base) };
  const cur = base.market === 'US' ? '$' : '₹';
  const riskBudget = round2((cfg.capital * cfg.riskPct) / 100);
  const available = cash ?? cfg.capital;
  const d = side === 'short' ? -1 : 1;
  const distance = (entry - stop) * d;
  if (!(entry > 0) || !(stop > 0)) return { ok: false, reason: 'Entry and stop-loss are needed', quantity: 0, riskBudget };
  if (!(distance > 0)) {
    return { ok: false, reason: `Stop must be ${d > 0 ? 'below' : 'above'} the entry for a ${side}`, quantity: 0, riskBudget };
  }
  const slip = (entry * cfg.slippagePct) / 100;
  const riskPerShare = distance + 2 * slip;
  const maxByCash = Math.floor(available / entry);
  const lossAt = (qty) => qty * riskPerShare + estimateCosts(entry * qty, stop * qty, cfg.charges, qty);
  let quantity = Math.min(Math.floor(riskBudget / riskPerShare), maxByCash);
  // Costs count against the risk budget: trim quantity until it fits.
  while (quantity > 0 && lossAt(quantity) > riskBudget) quantity -= 1;
  const maxQuantity = cfg.maxQuantity > 0 ? Math.floor(cfg.maxQuantity) : 0;
  const capped = maxQuantity > 0 && quantity > maxQuantity;
  if (capped) quantity = maxQuantity;
  const result = {
    riskBudget,
    maxQuantity,
    capped,
    riskPerShare: round2(riskPerShare),
    quantity,
    costs: quantity ? estimateCosts(entry * quantity, stop * quantity, cfg.charges, quantity) : 0,
    maxLoss: quantity ? round2(lossAt(quantity)) : 0,
    cashUsed: round2(quantity * entry),
  };
  if (quantity < 1) {
    return {
      ...result,
      ok: false,
      reason:
        maxByCash < 1
          ? `One share costs more than the ${cur}${round2(available)} available`
          : riskPerShare <= riskBudget
            ? `Charges are too high for this trade: one share's stop loss ${cur}${round2(riskPerShare)} + est. charges ${cur}${round2(lossAt(1) - riskPerShare)} = ${cur}${round2(lossAt(1))}, over the ${cur}${riskBudget} budget`
            : `Stop is too wide: one share risks ${cur}${round2(lossAt(1))}, over the ${cur}${riskBudget} budget`,
    };
  }
  return { ...result, ok: true };
}

/**
 * Plan a trade before entry: stop from ATR, target from reward:risk, size
 * from sizeForStop. Returns { ok, reason?, side, entry, stop, target,
 * rewardRisk, riskPerShare, quantity, costs, maxLoss, reward, cashUsed,
 * riskBudget, costsAtTarget, netReward, netRR }. maxLoss and netReward are
 * after slippage and estimated charges. `ok` false means NO TRADE.
 */
export function planTrade({ side = 'long', entry, atr, cash, config = DEFAULT_CONFIG }) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const riskBudget = round2((cfg.capital * cfg.riskPct) / 100);
  const base = { side, entry: entry > 0 ? round2(entry) : entry, riskBudget };
  if (!(entry > 0)) return { ...base, ok: false, reason: 'No entry price' };
  if (!(atr > 0)) return { ...base, ok: false, reason: 'No ATR to set a stop from' };
  const d = side === 'short' ? -1 : 1;
  const distance = atr * cfg.atrMultiple;
  const rewardRisk = Math.max(MIN_REWARD_RISK, Number(cfg.rewardRisk) || 0);
  const stop = round2(entry - d * distance);
  const target = round2(entry + d * distance * rewardRisk);
  if (!(stop > 0)) return { ...base, ok: false, reason: 'Stop would be at or below zero' };
  const size = sizeForStop({ side, entry, stop, cash, config: cfg });
  // What the target pays after slippage on both fills and charges.
  const q = size.quantity || 0;
  const charges = chargesFor(cfg);
  const slip = (entry * cfg.slippagePct) / 100;
  const costsAtTarget = q ? estimateCosts(d > 0 ? entry * q : target * q, d > 0 ? target * q : entry * q, charges, q) : 0;
  const netReward = q ? round2(q * (Math.abs(target - entry) - 2 * slip) - costsAtTarget) : 0;
  return {
    ...base,
    ...size,
    stop,
    target,
    rewardRisk,
    reward: q ? round2(q * Math.abs(target - entry)) : 0,
    costsAtTarget,
    netReward,
    netRR: q && size.maxLoss > 0 ? round2(netReward / size.maxLoss) : null,
  };
}
