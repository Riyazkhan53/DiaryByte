// Money and number formatting shared by the My Trading sections.

/** ₹ for Indian stocks, $ for US ones. */
export function formatMoney(n, market) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const us = market === 'US';
  const abs = Math.abs(n).toLocaleString(us ? 'en-US' : 'en-IN', { maximumFractionDigits: 2 });
  return `${n < 0 ? '−' : ''}${us ? '$' : '₹'}${abs}`;
}

/** Signed money, e.g. +₹1,200 or −$35. */
export const formatPnl = (n, market) => (n > 0 ? `+${formatMoney(n, market)}` : formatMoney(n, market));

export const formatPct = (n) => (n == null ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}%`);

export const formatR = (r) => (r == null ? null : `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(1)}R`);

export const PROFIT = '#2DA44E';
export const LOSS = '#E5383B';

export const pnlColor = (n, fallback) => (n > 0 ? PROFIT : n < 0 ? LOSS : fallback);

export const formatDay = (key) => {
  if (!key) return '';
  const [y, m, d] = key.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};
