// Watchlist packages: ready-made sets of stocks for the signal engine. Picking
// one replaces the market's watchlist (the server scans the watchlist every
// 5 minutes), so a package is just a quick way to switch what is scanned.
// Your own packages are saved in the market's trading settings
// ({ packages: [{ id, name, symbols }], activePackage }).

export const MAX_WATCHLIST = 10;

const ns = (list) => list.map((s) => `${s}.NS`);

export const PRESET_PACKAGES = {
  NSE: [
    { id: 'nse-heavy', emoji: '🔥', name: 'Nifty heavyweights', symbols: ns(['RELIANCE', 'HDFCBANK', 'ICICIBANK', 'INFY', 'TCS', 'BHARTIARTL', 'ITC', 'LT', 'SBIN', 'HINDUNILVR']) },
    { id: 'nse-banks', emoji: '🏦', name: 'Banking leaders', symbols: ns(['HDFCBANK', 'ICICIBANK', 'SBIN', 'KOTAKBANK', 'AXISBANK', 'INDUSINDBK', 'BANKBARODA', 'PNB']) },
    { id: 'nse-it', emoji: '💻', name: 'IT majors', symbols: ns(['TCS', 'INFY', 'HCLTECH', 'WIPRO', 'TECHM', 'LTIM', 'PERSISTENT', 'COFORGE']) },
    { id: 'nse-auto', emoji: '🚗', name: 'Auto', symbols: ns(['MARUTI', 'M&M', 'BAJAJ-AUTO', 'HEROMOTOCO', 'EICHERMOT', 'TVSMOTOR', 'ASHOKLEY']) },
    { id: 'nse-pharma', emoji: '💊', name: 'Pharma', symbols: ns(['SUNPHARMA', 'DRREDDY', 'CIPLA', 'DIVISLAB', 'LUPIN', 'AUROPHARMA', 'ZYDUSLIFE', 'TORNTPHARM']) },
    { id: 'nse-psu', emoji: '🏛️', name: 'PSU & defence', symbols: ns(['NTPC', 'POWERGRID', 'ONGC', 'COALINDIA', 'BEL', 'HAL', 'BHEL', 'IOC']) },
    { id: 'nse-energy', emoji: '⚡', name: 'Energy & power', symbols: ns(['RELIANCE', 'TATAPOWER', 'ADANIPOWER', 'JSWENERGY', 'NHPC', 'TORNTPOWER', 'BPCL', 'GAIL']) },
    { id: 'nse-metals', emoji: '🏗️', name: 'Metals', symbols: ns(['TATASTEEL', 'JSWSTEEL', 'HINDALCO', 'VEDL', 'SAIL', 'NMDC', 'JINDALSTEL', 'NATIONALUM']) },
    { id: 'nse-realty', emoji: '🏠', name: 'Realty', symbols: ns(['DLF', 'GODREJPROP', 'OBEROIRLTY', 'PRESTIGE', 'LODHA', 'PHOENIXLTD', 'BRIGADE']) },
  ],
  US: [
    { id: 'us-mag7', emoji: '🌟', name: 'Magnificent 7', symbols: ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'TSLA'] },
    { id: 'us-chips', emoji: '🔌', name: 'Semiconductors', symbols: ['NVDA', 'AMD', 'AVGO', 'QCOM', 'INTC', 'MU', 'TSM', 'ASML', 'ARM'] },
    { id: 'us-ai', emoji: '🤖', name: 'AI & cloud', symbols: ['NVDA', 'MSFT', 'GOOGL', 'PLTR', 'ORCL', 'CRM', 'SNOW', 'AMD'] },
    { id: 'us-movers', emoji: '🚀', name: 'High movers', symbols: ['TSLA', 'PLTR', 'COIN', 'MSTR', 'SMCI', 'HOOD', 'RIVN', 'SOFI'] },
    { id: 'us-banks', emoji: '🏦', name: 'US banks', symbols: ['JPM', 'BAC', 'WFC', 'C', 'GS', 'MS'] },
    { id: 'us-consumer', emoji: '🛒', name: 'Consumer', symbols: ['AMZN', 'WMT', 'COST', 'NKE', 'MCD', 'SBUX', 'KO', 'PEP'] },
    { id: 'us-media', emoji: '📺', name: 'Streaming & media', symbols: ['NFLX', 'DIS', 'SPOT', 'ROKU', 'WBD'] },
  ],
};

const key = (market) => (market === 'US' ? 'US' : 'NSE');
const sameSet = (a, b) => a.length === b.length && a.every((s) => b.includes(s));

/**
 * Presets then your own packages for a market's settings doc. A saved package
 * with a preset's id is your edited copy of that preset (edited: true).
 */
export function packagesFor(market, doc) {
  const saved = (doc?.packages || []).filter((p) => p && p.id && p.name && Array.isArray(p.symbols));
  const byId = new Map(saved.map((p) => [p.id, p]));
  const presets = PRESET_PACKAGES[key(market)].map((p) => (byId.has(p.id) ? { ...p, ...byId.get(p.id), emoji: p.emoji, preset: true, edited: true } : { ...p, preset: true }));
  const presetIds = new Set(presets.map((p) => p.id));
  const own = saved.filter((p) => !presetIds.has(p.id)).map((p) => ({ ...p, emoji: p.emoji || '⭐', own: true }));
  return [...presets, ...own];
}

/** The package the watchlist matches right now (same stocks), or null. */
export function activePackageOf(market, doc, watchlist) {
  const list = watchlist || [];
  if (!list.length) return null;
  const all = packagesFor(market, doc);
  return all.find((p) => p.id === doc?.activePackage && sameSet(p.symbols, list)) || all.find((p) => sameSet(p.symbols, list)) || null;
}

/** Settings changes that make `pkg` the watchlist. */
export const pickPackageChanges = (pkg) => ({ watchlist: pkg.symbols.slice(0, MAX_WATCHLIST), activePackage: pkg.id });

/** Settings changes that save the current watchlist as a new package of yours. */
export function savePackageChanges(doc, name, watchlist, makeId = () => `pkg-${Date.now().toString(36)}`) {
  const clean = String(name || '').trim().slice(0, 40);
  if (!clean || !(watchlist || []).length) return null;
  const pkg = { id: makeId(), name: clean, symbols: watchlist.slice(0, MAX_WATCHLIST) };
  return { packages: [...(doc?.packages || []), pkg], activePackage: pkg.id };
}

/**
 * Settings changes that save `pkg` ({ id?, name, symbols }) as yours: a new
 * package, an edit of yours, or your copy of a preset. When it is the default
 * (the package being scanned), the watchlist follows its stocks.
 */
export function upsertPackageChanges(doc, pkg, makeId = () => `pkg-${Date.now().toString(36)}`) {
  const name = String(pkg?.name || '').trim().slice(0, 40);
  if (!name) return null;
  const id = pkg.id || makeId();
  const symbols = [...new Set(pkg.symbols || [])].slice(0, MAX_WATCHLIST);
  const rest = (doc?.packages || []).filter((p) => p.id !== id);
  const changes = { packages: [...rest, { id, name, symbols }] };
  if (doc?.activePackage === id) changes.watchlist = symbols;
  return changes;
}

/** Settings changes that put a preset back to its original stocks. */
export function resetPresetChanges(doc, id) {
  const preset = [...PRESET_PACKAGES.NSE, ...PRESET_PACKAGES.US].find((p) => p.id === id);
  if (!preset) return null;
  return {
    packages: (doc?.packages || []).filter((p) => p.id !== id),
    ...(doc?.activePackage === id ? { watchlist: preset.symbols.slice(0, MAX_WATCHLIST) } : {}),
  };
}

/** Settings changes that remove one of your packages. */
export const deletePackageChanges = (doc, id) => ({
  packages: (doc?.packages || []).filter((p) => p.id !== id),
  ...(doc?.activePackage === id ? { activePackage: null } : {}),
});
