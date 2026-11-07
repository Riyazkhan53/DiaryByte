// Adding a stock you already hold: the purchase is added to the existing
// holding instead of becoming a second one. Each purchase is kept in `lots`.

const round2 = (n) => Math.round(n * 100) / 100;
const round4 = (n) => Math.round(n * 10000) / 10000;
const norm = (s) => String(s || '').trim().toLowerCase();

/** The holding `entry` duplicates (same symbol, or same name if not linked, same market), or null. */
export function findSameStock(items, entry, excludeId = null) {
  if (entry.category !== 'Stocks') return null;
  const market = entry.market || 'IN';
  return (
    items.find(
      (i) =>
        i.id !== excludeId &&
        i.category === 'Stocks' &&
        (i.market || 'IN') === market &&
        (entry.symbol ? i.symbol === entry.symbol : !i.symbol && norm(i.name) === norm(entry.name))
    ) || null
  );
}

const lotOf = (x) => ({
  date: x.boughtOn || (x.createdAt ? x.createdAt.slice(0, 10) : null),
  quantity: x.quantity,
  invested: x.invested,
  investedUsd: x.investedUsd,
  investRate: x.investRate,
});

/** `existing` with the purchase in `entry` added to it. */
export function mergeStock(existing, entry) {
  const lots = [...(existing.lots?.length ? existing.lots : [lotOf(existing)]), lotOf(entry)];
  const invested = round2((Number(existing.invested) || 0) + (Number(entry.invested) || 0));
  const bothUsd = existing.investedUsd > 0 && entry.investedUsd > 0;
  const investedUsd = bothUsd ? round2(existing.investedUsd + entry.investedUsd) : undefined;
  const byShares = existing.quantity > 0 && entry.quantity > 0;
  const quantity = byShares ? round4(existing.quantity + entry.quantity) : existing.quantity;
  // Linked: the new entry's per-share value is the freshest price.
  const current = byShares
    ? round2((entry.current / entry.quantity) * quantity)
    : round2((Number(existing.current) || 0) + (Number(entry.current) || 0));
  const dates = lots.map((l) => l.date).filter(Boolean).sort();
  return {
    ...existing,
    quantity,
    invested,
    current,
    investedUsd,
    // The average ₹/$ you paid across the dollar purchases.
    investRate: bothUsd ? round2(invested / investedUsd) : undefined,
    currentUsd:
      !byShares && existing.currentUsd > 0 && entry.currentUsd > 0 ? round2(existing.currentUsd + entry.currentUsd) : undefined,
    price: entry.price ?? existing.price,
    priceDate: entry.priceDate ?? existing.priceDate,
    usdInr: entry.usdInr ?? existing.usdInr,
    boughtOn: dates[0] || existing.boughtOn,
    note: existing.note || entry.note,
    sip: existing.sip || entry.sip,
    lots,
    updatedAt: entry.updatedAt,
  };
}
