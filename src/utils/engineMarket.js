// The intraday engine runs two markets, NSE (India) and US (NASDAQ). Each
// has its own settings document in "tradingconfig": the US one has
// market: 'US' (id 'us'); the NSE one has none (id 'default').

import { defaultConfig } from '../engine/risk.js';
import { marketOf } from '../engine/time.js';

export const MARKET_KEYS = ['NSE', 'US'];
const isUs = (doc) => doc?.market === 'US';

/** { doc, config, watchlist, info } for a market from the synced config docs. */
export function marketConfig(configDocs, market = 'NSE') {
  const doc = (configDocs || []).find((d) => (market === 'US' ? isUs(d) : !isUs(d))) || null;
  const defaults = defaultConfig(market);
  const config = { ...defaults, ...(doc || {}), market, charges: { ...defaults.charges, ...doc?.charges } };
  const watchlist = Array.isArray(doc?.watchlist) ? doc.watchlist : defaults.watchlist || [];
  return { doc, config, watchlist, info: marketOf(market) };
}

/** The config docs with `changes` saved into this market's doc (created if missing). */
export function withMarketChanges(configDocs, market, changes) {
  const { doc, watchlist } = marketConfig(configDocs, market);
  const now = new Date().toISOString();
  const base = doc || (market === 'US' ? { id: 'us', market: 'US', watchlist } : { id: 'default' });
  const next = { ...base, ...changes, updatedAt: now };
  const others = (configDocs || []).filter((d) => d !== doc && (doc || d.id !== next.id));
  return [...others, next];
}

/** 'US' or 'IN', as formatMoney and the stock search expect. */
export const moneyMarket = (market) => (market === 'US' ? 'US' : 'IN');

/** "DLF.NS" → "DLF"; US symbols unchanged. */
export const shortSymbol = (s) => String(s || '').replace(/\.(NS|BO)$/, '');
