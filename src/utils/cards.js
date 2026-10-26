// Short label for a card saved in Banking & Cards, e.g. "HDFC Visa ••4242".
// Only this label and the last 4 digits are ever copied elsewhere (bills,
// spends), never the full number or CVV.
export function savedCardLabel(card) {
  const last4 = (card.number || '').slice(-4);
  const brand = card.brand && card.brand !== 'Card' ? card.brand : '';
  const base = [card.bankName, brand].filter(Boolean).join(' ') || card.name || 'Card';
  return last4 ? `${base} ••${last4}` : base;
}

export const isCreditCard = (card) => card.cardType === 'Credit';
