// My Wishlist: things to buy, wealth goals with levels, and life experiences.
// Pure functions, shared by the app and tests.
//
// One synced collection "wishlist"; every item has a `section`:
// - 'assets' (Dream Buys): { title, category, price, saved, targetDate, status: 'wish'|'saving'|'bought', doneAt, note }
// - 'wealth' (Wealth Goals): { title, category, source: 'auto'|'manual', current, levels: [amounts], note }
// - 'life'   (Life Experiences): { title, category, targetDate, status: 'todo'|'doing'|'done', doneAt, note }

export const WISHLIST_STORAGE_KEY = '@diarybyte_wishlist';

export const SECTIONS = [
  { key: 'assets', title: 'Dream Buys', sub: 'Things you aim to own', icon: 'home', gradient: ['#FF9F43', '#FF6B6B'] },
  { key: 'wealth', title: 'Wealth Goals', sub: 'Grow your money level by level', icon: 'trending-up', gradient: ['#20BF6B', '#0FB9B1'] },
  { key: 'life', title: 'Life Experiences', sub: 'Trips, food, adventures & new skills', icon: 'compass', gradient: ['#8854D0', '#4B7BEC'] },
];

export const ASSET_CATEGORIES = [
  { key: 'Home', emoji: '🏠' },
  { key: 'Vehicle', emoji: '🚗' },
  { key: 'Gadget', emoji: '📱' },
  { key: 'Jewellery', emoji: '💍' },
  { key: 'Furniture', emoji: '🛋️' },
  { key: 'Fashion', emoji: '👗' },
  { key: 'Other', emoji: '✨' },
];

// `track`: the My Investments category whose current value counts towards it.
export const WEALTH_CATEGORIES = [
  { key: 'Mutual Funds', emoji: '📊', track: 'Mutual Funds' },
  { key: 'Stocks', emoji: '📈', track: 'Stocks' },
  { key: 'Digital Gold', emoji: '🪙', track: 'Digital Gold' },
  { key: 'Digital Silver', emoji: '🥈', track: 'Digital Silver' },
  { key: 'Crypto', emoji: '₿', track: 'Crypto' },
  { key: 'FD', emoji: '🏦', track: 'FD' },
  { key: 'All investments', emoji: '💼', track: '*' },
  { key: 'PPF / EPF', emoji: '🛡️' },
  { key: 'NPS', emoji: '👴' },
  { key: 'Emergency fund', emoji: '🧯' },
  { key: 'Other', emoji: '💰' },
];

export const LIFE_CATEGORIES = [
  { key: 'Travel', emoji: '✈️', group: 'experience' },
  { key: 'Food', emoji: '🍜', group: 'experience' },
  { key: 'Explore', emoji: '🧭', group: 'experience' },
  { key: 'Adventure', emoji: '🪂', group: 'experience' },
  { key: 'Events', emoji: '🎟️', group: 'experience' },
  { key: 'Skill', emoji: '🎯', group: 'growth' },
  { key: 'Fitness', emoji: '💪', group: 'growth' },
  { key: 'Learning', emoji: '📚', group: 'growth' },
  { key: 'Other', emoji: '🌟', group: 'experience' },
];

export const LIFE_STATUS = {
  experience: { todo: 'Someday', doing: 'Planned', done: 'Done' },
  growth: { todo: 'Not started', doing: 'Learning', done: 'Achieved' },
};

export const DEFAULT_LEVELS = [100000, 500000, 1000000, 2500000, 5000000, 10000000];

const catIn = (list, key) => list.find((c) => c.key === key) || list[list.length - 1];
export const assetCategory = (key) => catIn(ASSET_CATEGORIES, key);
export const wealthCategory = (key) => catIn(WEALTH_CATEGORIES, key);
export const lifeCategory = (key) => catIn(LIFE_CATEGORIES, key);
export const lifeGroup = (item) => lifeCategory(item?.category).group;

const num = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

/** "₹4.5L", "₹1.2Cr", "₹50K", "₹950". */
export function shortInr(n) {
  const a = Math.abs(num(n));
  const sign = num(n) < 0 ? '−' : '';
  const trim = (x) => x.toFixed(2).replace(/\.?0+$/, '');
  if (a >= 1e7) return `${sign}₹${trim(a / 1e7)}Cr`;
  if (a >= 1e5) return `${sign}₹${trim(a / 1e5)}L`;
  if (a >= 1e3) return `${sign}₹${trim(a / 1e3)}K`;
  return `${sign}₹${Math.round(a)}`;
}

/** "5L", "1.5 lakh", "2cr", "50k", "₹75,000" → number, or null. */
export function parseAmount(text) {
  const s = String(text ?? '').toLowerCase().replace(/[₹,\s]/g, '');
  const m = s.match(/^(\d+(?:\.\d+)?)(k|thousand|l|lac|lakh|lakhs|cr|crore|crores)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2] || '';
  const mult = unit.startsWith('k') || unit === 'thousand' ? 1e3 : unit.startsWith('l') ? 1e5 : unit.startsWith('c') ? 1e7 : 1;
  const v = Math.round(n * mult);
  return v > 0 ? v : null;
}

/** "1L, 5L, 10L" → [100000, 500000, 1000000] (sorted, unique); null if any part is bad. */
export function parseLevels(text) {
  const parts = String(text || '').split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const values = parts.map(parseAmount);
  if (values.some((v) => v == null)) return null;
  return [...new Set(values)].sort((a, b) => a - b);
}

export const levelsText = (levels) => (levels || []).map((v) => shortInr(v).replace('₹', '')).join(', ');

/** Current value of the My Investments holdings a wealth goal tracks. */
export function trackedValue(goal, investments = []) {
  const track = wealthCategory(goal?.category).track;
  if (goal?.source !== 'auto' || !track) return num(goal?.current);
  return Math.round(investments.filter((i) => track === '*' || i.category === track).reduce((s, i) => s + num(i.current), 0));
}

/**
 * Where a wealth goal stands: { value, levels, done (levels reached), total,
 * next (amount) | null, pct (0–1 towards the next level, from the last one) }.
 */
export function wealthProgress(goal, investments = []) {
  const value = trackedValue(goal, investments);
  const levels = [...(goal?.levels || [])].map(num).filter((v) => v > 0).sort((a, b) => a - b);
  const done = levels.filter((l) => value >= l).length;
  const next = levels[done] ?? null;
  const prev = done > 0 ? levels[done - 1] : 0;
  const pct = next == null ? 1 : Math.max(0, Math.min(1, (value - prev) / (next - prev)));
  return { value, levels, done, total: levels.length, next, pct };
}

/** Saved / price for a dream buy, 0–1. */
export const assetPct = (item) => (num(item?.price) > 0 ? Math.max(0, Math.min(1, num(item.saved) / num(item.price))) : 0);

/** Header numbers for each section. */
export function sectionSummary(items, section, investments = []) {
  const list = (items || []).filter((i) => i.section === section);
  if (section === 'assets') {
    const open = list.filter((i) => i.status !== 'bought');
    return {
      count: list.length,
      bought: list.length - open.length,
      open: open.length,
      target: open.reduce((s, i) => s + num(i.price), 0),
      saved: open.reduce((s, i) => s + num(i.saved), 0),
    };
  }
  if (section === 'wealth') {
    const p = list.map((g) => wealthProgress(g, investments));
    return { count: list.length, levelsDone: p.reduce((s, x) => s + x.done, 0), levelsTotal: p.reduce((s, x) => s + x.total, 0) };
  }
  const done = list.filter((i) => i.status === 'done').length;
  return { count: list.length, done, open: list.length - done };
}

/** Open items first (soonest target date, then newest), done ones last (latest first). */
export function sortItems(list) {
  const isDone = (i) => i.status === 'bought' || i.status === 'done';
  return [...list].sort((a, b) => {
    if (isDone(a) !== isDone(b)) return isDone(a) ? 1 : -1;
    if (isDone(a)) return String(b.doneAt || '').localeCompare(String(a.doneAt || ''));
    const ta = a.targetDate || '9999';
    const tb = b.targetDate || '9999';
    return ta.localeCompare(tb) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
}
