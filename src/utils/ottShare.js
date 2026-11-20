// Shares from OTT apps (Netflix, Prime Video, JioHotstar, Sony LIV, ZEE5,
// aha, Sun NXT...): which platform, and a first guess at the title, before
// anything has been learned (see engine/shareLearner.js).

// [match in link host or text, platform name as the Movies list shows it]
export const OTT_PLATFORMS = [
  ['netflix', 'Netflix'],
  ['primevideo', 'Prime Video'],
  ['prime video', 'Prime Video'],
  ['amazon.com/gp/video', 'Prime Video'],
  ['app.primevideo', 'Prime Video'],
  ['hotstar', 'JioHotstar'],
  ['jiocinema', 'JioHotstar'],
  ['sonyliv', 'Sony LIV'],
  ['sony liv', 'Sony LIV'],
  ['zee5', 'ZEE5'],
  ['aha.video', 'aha'],
  ['sunnxt', 'Sun NXT'],
  ['sun nxt', 'Sun NXT'],
  ['mxplayer', 'MX Player'],
  ['tv.apple.com', 'Apple TV+'],
  ['apple tv', 'Apple TV+'],
  ['youtube.com', 'YouTube'],
  ['youtu.be', 'YouTube'],
  ['lionsgateplay', 'Lionsgate Play'],
  ['erosnow', 'Eros Now'],
  ['hoichoi', 'hoichoi'],
  ['manoramamax', 'ManoramaMAX'],
  ['tentkotta', 'Tentkotta'],
];

const URL_RE = /https?:\/\/[^\s<>"')\]]+/i;
// Platform names as people write them in messages ("Zee 5", "Disney+ Hotstar").
const SPACED_PLATFORMS = 'zee\\s*5|(?:amazon\\s+)?prime(?:\\s+video)?|(?:disney\\+?\\s*|jio\\s*)?hotstar|jio\\s*cinema|sony\\s*liv|sun\\s*nxt|mx\\s*player|apple\\s*tv\\+?|youtube';
const platformNames = [...new Set(OTT_PLATFORMS.map(([, name]) => name))];

/** The OTT platform a share comes from, or ''. Checks the link first, then the text. */
export function ottPlatform(text) {
  const s = String(text || '');
  const url = (s.match(URL_RE) || [''])[0].toLowerCase();
  const lower = s.toLowerCase();
  const inUrl = url && OTT_PLATFORMS.find(([key]) => !key.includes(' ') && url.includes(key));
  if (inUrl) return inUrl[1];
  // Only whole words in text ("on Netflix", "Prime Video"), not inside other words.
  const inText = OTT_PLATFORMS.find(([key]) => new RegExp(`(^|[^a-z])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(lower));
  return inText ? inText[1] : '';
}

/** True when a share looks like it came from an OTT app (and not a ticket). */
export function isOttShare(text) {
  const p = ottPlatform(text);
  if (!p) return false;
  // "Booking ID" / PNR / seats: a ticket that just mentions a platform.
  return !/\b(pnr|booking id|seat\(?s?\)?|boarding|ticket(s)? (booked|confirmed))\b/i.test(String(text || ''));
}

const tidy = (t) =>
  String(t || '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'“”‘’«»|:–—-]+|[\s"'“”‘’«»|:–—-]+$/g, '')
    .trim();

// Words that mark the part of a page title that is about the site, not
// the movie ("| Netflix Official Site", "- Watch Season 1 Online | JioHotstar").
const SITE_WORDS = /\b(netflix|prime\s*video|amazon|hotstar|disney|jio\s*cinema|jio|sony\s*liv|zee5|aha|sun\s*nxt|mx\s*player|youtube|apple\s*tv|watch|online|streaming|official site)\b/i;

/** "Watch Kaala Paani Season 1 Episode 1 Online | JioHotstar" → "Kaala Paani". */
export function cleanPageTitle(meta) {
  let t = String(meta || '').replace(/\s+/g, ' ').trim();
  // Cut at the first separator whose next part (up to the following
  // separator) is about the site: "Mission: Impossible - Dead Reckoning |
  // Prime Video" keeps its dash, "Kaala Paani - Watch Season 1 Online" doesn't.
  const parts = t.split(/(\s+[|–—-]\s+|\s*\|\s*)/);
  for (let i = 2; i < parts.length; i += 2) {
    if (SITE_WORDS.test(parts[i])) {
      t = parts.slice(0, i - 1).join('');
      break;
    }
  }
  return t
    .replace(/^watch\s+/i, '')
    .replace(/\s+(?:season|series|s)\s*\d+.*$/i, '')
    .replace(/\s+episode\s*\d+.*$/i, '')
    .replace(/\s+(?:full\s+movie|online|in\s+hd|hd|streaming).*$/i, '')
    .trim();
}

function fromSlug(url) {
  // primevideo.com/detail/The-Boys/0ABC, hotstar.com/in/shows/the-family-man/1260022017,
  // sonyliv.com/shows/scam-1992-1700000012, zee5.com/movies/details/kaithi/0-0-123
  let path = '';
  try {
    path = new URL(url).pathname;
  } catch (_error) {
    return '';
  }
  const parts = path.split('/').filter(Boolean);
  // Generic path parts: sections like "movie-bundle" (SonyLIV), "tv-shows".
  const skip = /^(in|en|detail|details|movies?|shows?|tv|title|watch|video|series|season-\d+|episode.*|gp|dp|play|web-series|kids|[a-z]{2}-[a-z]{2})$/i;
  const generic = /^(movies?|shows?|tv|tv-?shows?|web-?series|series|originals?|premium|kids|sports|music|live-?tv|channels?|collections?|bundles?|specials?|trailers?|clips?|episodes?)(-(bundle|bundles|details?|collection|list|page|hub))?$/i;
  const slug = parts.find((p) => !skip.test(p) && !generic.test(p) && /[a-z]/i.test(p) && /[-_]/.test(p) && !/^\d/.test(p) && !/^[0-9A-Z]{8,}$/.test(p));
  if (!slug) return '';
  return slug
    .replace(/[-_]\d{6,}$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * A first guess at what was shared: { title, platform, link }. Tries quoted
 * text, "Watch X on Netflix" style phrases, the page title shared with the
 * link, then the link's slug.
 */
export function parseOttShare(text, { metaTitle = '' } = {}) {
  const s = String(text || '');
  const platform = ottPlatform(s);
  const link = ((s.match(URL_RE) || [''])[0] || '').replace(/[.,;:!?]+$/, '');
  const platformRe = platformNames.map((n) => n.replace(/[.*+?^${}()|[\]\\+]/g, '\\$&')).join('|');
  let title = '';

  // "Title" or “Title”; single quotes only as quote marks, not apostrophes
  // ("I'm watching Mr. Bean's Holiday").
  const quoted = s.match(/["“]([^"“”\n]{2,80})["”]/) || s.match(/(?:^|[\s(])['‘]([^'‘’\n]{2,80})['’](?=[\s.,!?:;)]|$)/);
  if (quoted) title = quoted[1];
  if (!title) {
    const phrase = s.match(
      new RegExp(`(?:watch(?:ing)?|check out|stream(?:ing)?|now streaming|i(?:'|’)?m watching|have you seen)\\s*:?\\s+(.{2,80}?)\\s+(?:on|only on|streaming on|at)\\s+(?:the\\s+)?(?:${platformRe}|${SPACED_PLATFORMS}|[\\w+ ]{2,24}?\\s+app)\\b`, 'i')
    );
    if (phrase) title = phrase[1];
  }
  if (!title) {
    const before = s.match(new RegExp(`^\\s*(.{2,80}?)\\s+(?:[|–—-]|on)\\s+(?:${platformRe})\\b`, 'im'));
    if (before && !URL_RE.test(before[1])) title = before[1];
  }
  // A share whose first line is the title and the link comes later
  // (SonyLIV: "Anbil-Avan\n<synopsis>\nhttps://…").
  if (!title && link) {
    const first = s.split(/\r?\n/).map((l) => l.trim()).find(Boolean) || '';
    if (first && !URL_RE.test(first) && first.length <= 60 && first.split(/\s+/).length <= 8 && !/[.!?]$/.test(first) && s.trim() !== first) title = first;
  }
  if (!title && metaTitle) title = cleanPageTitle(metaTitle);
  if (!title && link) title = fromSlug(link);
  // "Jailer 2. Check it out now" → "Jailer 2" (the sentence ends there; a
  // dot inside a title like "Mr. Bean" is kept).
  title = title.split(/[.!?…]+\s+(?=(?:check|watch|stream|now|available|only|see|catch|it'?s|it’s|join|don'?t|start)\b)/i)[0];
  title = tidy(title).replace(/^watch\s+/i, '').replace(/[.!?…]+$/, '');
  // Drop a trailing "(2023)" into a year.
  const year = (title.match(/\((\d{4})\)\s*$/) || [])[1] || '';
  if (year) title = tidy(title.replace(/\(\d{4}\)\s*$/, ''));
  return { title, platform, link, year };
}

const ENTITIES = { amp: '&', quot: '"', apos: "'", '#39': "'", lt: '<', gt: '>', nbsp: ' ' };
const decode = (t) =>
  String(t || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z#0-9]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);

/** A page's title from its HTML: og:title, then twitter:title, then <title>. */
export function titleFromHtml(html) {
  const h = String(html || '');
  const meta = (name) => {
    const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i');
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["']`, 'i');
    return (h.match(re1) || h.match(re2) || [])[1];
  };
  const raw = meta('og:title') || meta('twitter:title') || (h.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] || '';
  return decode(raw).replace(/\s+/g, ' ').trim();
}

// An OTT app's name (from a share) as the Movies list names it.
const LIST_PLATFORM = {
  'Prime Video': 'Prime',
  JioHotstar: 'Hotstar',
  ZEE5: 'Zee5',
  'Sun NXT': 'Sun Nxt',
  aha: 'Aaha',
  YouTube: 'Youtube',
};
export const listPlatform = (name) => LIST_PLATFORM[name] || name || '';
