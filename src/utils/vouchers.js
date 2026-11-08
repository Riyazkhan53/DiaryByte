// Vouchers & gift cards: the store list, and helpers for expiry and totals.
// Store names are only labels (shown as a coloured initial badge); no logos.

import { daysBetween, todayKey } from './autopay';

export const VOUCHERS_STORAGE_KEY = '@diarybyte_vouchers';

export const VOUCHER_KINDS = [
  { key: 'giftcard', label: 'Gift card', icon: 'gift-outline' },
  { key: 'voucher', label: 'Voucher', icon: 'pricetag-outline' },
  { key: 'coupon', label: 'Coupon code', icon: 'cut-outline' },
];
export const voucherKind = (key) => VOUCHER_KINDS.find((k) => k.key === key) || VOUCHER_KINDS[0];

export const BRAND_CATEGORIES = [
  { key: 'shopping', label: 'Shopping', icon: 'bag-handle-outline' },
  { key: 'food', label: 'Food', icon: 'fast-food-outline' },
  { key: 'grocery', label: 'Grocery', icon: 'cart-outline' },
  { key: 'travel', label: 'Travel', icon: 'airplane-outline' },
  { key: 'fashion', label: 'Fashion', icon: 'shirt-outline' },
  { key: 'beauty', label: 'Beauty', icon: 'sparkles-outline' },
  { key: 'electronics', label: 'Electronics', icon: 'phone-portrait-outline' },
  { key: 'entertainment', label: 'Movies & OTT', icon: 'film-outline' },
  { key: 'health', label: 'Health', icon: 'medkit-outline' },
  { key: 'home', label: 'Home', icon: 'home-outline' },
  { key: 'wallets', label: 'Wallets & pay', icon: 'wallet-outline' },
  { key: 'fuel', label: 'Fuel & auto', icon: 'car-outline' },
  { key: 'other', label: 'Others', icon: 'ellipsis-horizontal-outline' },
];

// [name, category, colour]
const RAW = [
  // Shopping
  ['Amazon', 'shopping', '#FF9900'],
  ['Flipkart', 'shopping', '#2874F0'],
  ['Myntra', 'shopping', '#FF3F6C'],
  ['Ajio', 'shopping', '#2C4152'],
  ['Meesho', 'shopping', '#9F2089'],
  ['Tata CLiQ', 'shopping', '#E7195A'],
  ['Snapdeal', 'shopping', '#E40046'],
  ['JioMart', 'shopping', '#0078AD'],
  ['FirstCry', 'shopping', '#F7931E'],
  ['Shoppers Stop', 'shopping', '#000000'],
  ['Lifestyle', 'shopping', '#E31837'],
  ['Pantaloons', 'shopping', '#1D1D1B'],
  ['Westside', 'shopping', '#1A1A1A'],
  ['Max Fashion', 'shopping', '#0D2E4E'],
  ['Reliance Trends', 'shopping', '#E2231A'],
  ['Central', 'shopping', '#000000'],
  ['IKEA', 'shopping', '#0058A3'],
  ['Decathlon', 'shopping', '#0082C3'],
  ['Hamleys', 'shopping', '#E2001A'],
  ['Crossword', 'shopping', '#E30613'],
  // Food
  ['Swiggy', 'food', '#FC8019'],
  ['Zomato', 'food', '#E23744'],
  ["Domino's", 'food', '#006491'],
  ['Pizza Hut', 'food', '#EE3A43'],
  ['KFC', 'food', '#E4002B'],
  ["McDonald's", 'food', '#FFC72C'],
  ['Burger King', 'food', '#D62300'],
  ['Subway', 'food', '#008C15'],
  ['Starbucks', 'food', '#00704A'],
  ['Café Coffee Day', 'food', '#B71C1C'],
  ['Barista', 'food', '#6D4C41'],
  ['Chaayos', 'food', '#2E7D32'],
  ['Third Wave Coffee', 'food', '#1B1B1B'],
  ['Haldiram’s', 'food', '#D32F2F'],
  ['Barbeque Nation', 'food', '#E65100'],
  ['Behrouz Biryani', 'food', '#5D4037'],
  ['Faasos', 'food', '#F57C00'],
  ['Wow! Momo', 'food', '#E53935'],
  ['Taco Bell', 'food', '#702082'],
  ['Baskin Robbins', 'food', '#DA1884'],
  ['Naturals Ice Cream', 'food', '#4CAF50'],
  ['Theobroma', 'food', '#4E342E'],
  ['EatSure', 'food', '#FF5722'],
  ['Magicpin', 'food', '#E91E63'],
  ['EazyDiner', 'food', '#E8452C'],
  ['Dineout', 'food', '#FF645A'],
  // Grocery
  ['BigBasket', 'grocery', '#84C225'],
  ['Blinkit', 'grocery', '#F8CB46'],
  ['Zepto', 'grocery', '#5E1D8C'],
  ['Swiggy Instamart', 'grocery', '#FC8019'],
  ['DMart', 'grocery', '#0B8A3E'],
  ['More', 'grocery', '#E30613'],
  ['Spencer’s', 'grocery', '#008C45'],
  ['Nature’s Basket', 'grocery', '#2E7D32'],
  ['Star Bazaar', 'grocery', '#E2231A'],
  ['Reliance Smart', 'grocery', '#0078AD'],
  ['Flipkart Minutes', 'grocery', '#2874F0'],
  ['Amazon Fresh', 'grocery', '#5EA03E'],
  ['Licious', 'grocery', '#D11243'],
  ['FreshToHome', 'grocery', '#0F9D58'],
  ['Country Delight', 'grocery', '#43A047'],
  // Travel
  ['MakeMyTrip', 'travel', '#E7372B'],
  ['Goibibo', 'travel', '#F26722'],
  ['Cleartrip', 'travel', '#F77728'],
  ['EaseMyTrip', 'travel', '#2196F3'],
  ['Yatra', 'travel', '#E31E24'],
  ['ixigo', 'travel', '#F05A28'],
  ['redBus', 'travel', '#D84E55'],
  ['AbhiBus', 'travel', '#E8452C'],
  ['IRCTC', 'travel', '#1D3C78'],
  ['Uber', 'travel', '#000000'],
  ['Ola', 'travel', '#1C1C1C'],
  ['Rapido', 'travel', '#F9C935'],
  ['IndiGo', 'travel', '#001B94'],
  ['Air India', 'travel', '#D81B60'],
  ['Akasa Air', 'travel', '#FF6C37'],
  ['SpiceJet', 'travel', '#D22E2E'],
  ['OYO', 'travel', '#EE2A24'],
  ['Airbnb', 'travel', '#FF5A5F'],
  ['Booking.com', 'travel', '#003580'],
  ['Agoda', 'travel', '#5542F6'],
  ['Taj Hotels', 'travel', '#8D6E63'],
  ['Zoomcar', 'travel', '#10A37F'],
  // Fashion
  ['Nykaa Fashion', 'fashion', '#E80071'],
  ['H&M', 'fashion', '#E50010'],
  ['Zara', 'fashion', '#000000'],
  ['Uniqlo', 'fashion', '#FF0000'],
  ['Levi’s', 'fashion', '#C41230'],
  ['Allen Solly', 'fashion', '#1A237E'],
  ['Van Heusen', 'fashion', '#0D1B2A'],
  ['Louis Philippe', 'fashion', '#0B1F3A'],
  ['Peter England', 'fashion', '#1E3A8A'],
  ['Raymond', 'fashion', '#1F2937'],
  ['Biba', 'fashion', '#C2185B'],
  ['W for Woman', 'fashion', '#6A1B9A'],
  ['FabIndia', 'fashion', '#8B4513'],
  ['Manyavar', 'fashion', '#A1887F'],
  ['Bata', 'fashion', '#E30613'],
  ['Puma', 'fashion', '#000000'],
  ['Adidas', 'fashion', '#000000'],
  ['Nike', 'fashion', '#111111'],
  ['Skechers', 'fashion', '#1565C0'],
  ['Titan', 'fashion', '#8C6239'],
  ['Tanishq', 'fashion', '#832729'],
  ['CaratLane', 'fashion', '#5E2C82'],
  ['Lenskart', 'fashion', '#000042'],
  ['Bewakoof', 'fashion', '#FDD835'],
  ['The Souled Store', 'fashion', '#D32F2F'],
  // Beauty
  ['Nykaa', 'beauty', '#FC2779'],
  ['Purplle', 'beauty', '#7E3AF2'],
  ['Mamaearth', 'beauty', '#00B5AD'],
  ['Sugar Cosmetics', 'beauty', '#000000'],
  ['The Body Shop', 'beauty', '#004236'],
  ['Forest Essentials', 'beauty', '#7A5C3E'],
  ['Bath & Body Works', 'beauty', '#1E3A5F'],
  ['Lakmé Salon', 'beauty', '#000000'],
  ['Naturals Salon', 'beauty', '#8E24AA'],
  ['Urban Company', 'beauty', '#111111'],
  // Electronics
  ['Croma', 'electronics', '#00A39B'],
  ['Reliance Digital', 'electronics', '#E2231A'],
  ['Vijay Sales', 'electronics', '#D32F2F'],
  ['Apple', 'electronics', '#555555'],
  ['Samsung', 'electronics', '#1428A0'],
  ['OnePlus', 'electronics', '#EB0028'],
  ['Xiaomi', 'electronics', '#FF6900'],
  ['boAt', 'electronics', '#E1251B'],
  ['Noise', 'electronics', '#111111'],
  ['Sony', 'electronics', '#000000'],
  // Movies & OTT
  ['BookMyShow', 'entertainment', '#F84464'],
  ['District', 'entertainment', '#5A2DFF'],
  ['PVR INOX', 'entertainment', '#FDB913'],
  ['Cinepolis', 'entertainment', '#00205B'],
  ['Netflix', 'entertainment', '#E50914'],
  ['Prime Video', 'entertainment', '#00A8E1'],
  ['JioHotstar', 'entertainment', '#1F80E0'],
  ['Sony LIV', 'entertainment', '#000000'],
  ['ZEE5', 'entertainment', '#8230C6'],
  ['Spotify', 'entertainment', '#1DB954'],
  ['YouTube Premium', 'entertainment', '#FF0000'],
  ['Google Play', 'entertainment', '#01875F'],
  ['App Store & iTunes', 'entertainment', '#0D96F6'],
  ['PlayStation', 'entertainment', '#003791'],
  ['Xbox', 'entertainment', '#107C10'],
  ['Steam', 'entertainment', '#171A21'],
  ['Audible', 'entertainment', '#F8991C'],
  ['Kindle', 'entertainment', '#232F3E'],
  ['Wonderla', 'entertainment', '#E91E63'],
  ['Smaaash / Timezone', 'entertainment', '#FF6F00'],
  // Health
  ['PharmEasy', 'health', '#10847E'],
  ['Tata 1mg', 'health', '#FF6F61'],
  ['Apollo Pharmacy', 'health', '#00809D'],
  ['Netmeds', 'health', '#32AEB1'],
  ['MedPlus', 'health', '#0072BC'],
  ['Cult.fit', 'health', '#1A1A1A'],
  ['HealthifyMe', 'health', '#2E7D32'],
  ['Practo', 'health', '#14BEF0'],
  // Home
  ['Pepperfry', 'home', '#F26522'],
  ['Urban Ladder', 'home', '#2E2E2E'],
  ['Home Centre', 'home', '#E31837'],
  ['Wakefit', 'home', '#5B2C83'],
  ['Sleepwell', 'home', '#0D47A1'],
  ['Bombay Dyeing', 'home', '#C62828'],
  ['Ferns N Petals', 'home', '#7CB342'],
  ['IGP', 'home', '#E91E63'],
  ['Archies', 'home', '#D32F2F'],
  // Wallets & pay
  ['Amazon Pay', 'wallets', '#FF9900'],
  ['Paytm', 'wallets', '#00BAF2'],
  ['PhonePe', 'wallets', '#5F259F'],
  ['Google Pay', 'wallets', '#4285F4'],
  ['CRED', 'wallets', '#1A1A1A'],
  ['MobiKwik', 'wallets', '#1E88E5'],
  ['Pluxee (Sodexo)', 'wallets', '#00A88E'],
  ['Zaggle', 'wallets', '#F44336'],
  ['Xoxoday', 'wallets', '#6C3CE9'],
  ['Woohoo', 'wallets', '#E91E63'],
  ['Gyftr', 'wallets', '#FF5722'],
  // Fuel & auto
  ['Indian Oil', 'fuel', '#F37022'],
  ['HP Petrol', 'fuel', '#005BAC'],
  ['Bharat Petroleum', 'fuel', '#FFD100'],
  ['Shell', 'fuel', '#FBCE07'],
  ['FASTag', 'fuel', '#2E7D32'],
  ['Park+', 'fuel', '#6C2BD9'],
];

export const BRANDS = RAW.map(([name, category, color]) => ({ name, category, color }));

/** The store entry for a name, or a neutral one for anything typed in. */
export function brandMeta(name) {
  const found = BRANDS.find((b) => b.name.toLowerCase() === String(name || '').trim().toLowerCase());
  return found || { name: name || 'Other', category: 'other', color: '#78909C' };
}

/** One or two letters for the badge, e.g. "Amazon" → "A", "Burger King" → "BK". */
export function brandInitials(name) {
  const words = String(name || '?')
    .replace(/['’]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return '?';
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
}

/** Days until expiry (negative once past), or null when it never expires. */
export const daysToExpiry = (v, today = todayKey()) => (v.expiry ? daysBetween(today, v.expiry) : null);

/** 'used' | 'expired' | 'expiring' (within `soonDays`) | 'active'. */
export function voucherStatus(v, today = todayKey(), soonDays = 7) {
  if (v.used) return 'used';
  const days = daysToExpiry(v, today);
  if (days != null && days < 0) return 'expired';
  if (days != null && days <= soonDays) return 'expiring';
  return 'active';
}

/** Usable ones first, soonest expiry first (no expiry last); then expired, then used. */
export function sortVouchers(list, today = todayKey()) {
  const rank = { expiring: 0, active: 0, expired: 1, used: 2 };
  return [...list].sort((a, b) => {
    const r = rank[voucherStatus(a, today)] - rank[voucherStatus(b, today)];
    if (r) return r;
    const ea = a.expiry || '9999-12-31';
    const eb = b.expiry || '9999-12-31';
    return ea.localeCompare(eb) || (a.brand || '').localeCompare(b.brand || '');
  });
}

/** Value still usable: unused, unexpired vouchers with an amount. */
export function usableTotal(list, today = todayKey()) {
  return list
    .filter((v) => ['active', 'expiring'].includes(voucherStatus(v, today)))
    .reduce((sum, v) => sum + (Number(v.amount) || 0), 0);
}
