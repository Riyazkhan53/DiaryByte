// Where "Watch" on a watch-list title goes: the title's own OTT link when
// known, else that OTT's search for the title, else a JustWatch search,
// which lists every OTT showing it in India. Plain web links: Android opens
// the OTT's app when it is installed and has claimed its website links.

const q = (title) => encodeURIComponent((title || '').trim());

// Search pages with a stable, well-known format. Other OTTs (JioHotstar,
// Zee5, SonyLIV, Sun NXT, Aha, Tentkotta) change theirs, so they use JustWatch.
const OTT_SEARCH = [
  { match: /netflix/i, name: 'Netflix', url: (t) => `https://www.netflix.com/search?q=${q(t)}` },
  { match: /prime|amazon/i, name: 'Prime Video', url: (t) => `https://www.primevideo.com/search/?phrase=${q(t)}` },
  { match: /youtube/i, name: 'YouTube', url: (t) => `https://www.youtube.com/results?search_query=${q(t)}` },
];

export const justWatchUrl = (title) => `https://www.justwatch.com/in/search?q=${q(title)}`;

/** The first OTT named in a watch-list item's platform text ("Netflix, Prime Video"). */
export function primaryPlatform(item) {
  return (item.platform || '').split(',')[0].trim();
}

/**
 * Where to send a tap: { url, label, kind: 'exact' | 'search' | 'justwatch' }.
 * Uses only what is stored on the item (no network).
 */
export function watchTarget(item) {
  const platform = primaryPlatform(item);
  if (item.link) return { url: item.link, label: `Watch on ${platform || 'OTT'}`, kind: 'exact' };
  const ott = OTT_SEARCH.find((o) => o.match.test(platform));
  if (ott) return { url: ott.url(item.title), label: `Find on ${ott.name}`, kind: 'search' };
  return {
    url: justWatchUrl(item.title),
    label: platform ? `Find on ${platform} (via JustWatch)` : 'Find where to watch',
    kind: 'justwatch',
  };
}

/** The streaming option on the item's own OTT, if any, else the first one. */
export function pickLink(links, item) {
  const platform = primaryPlatform(item).toLowerCase();
  const word = platform.split(/\s+/)[0];
  return (word && links.find((l) => l.service.toLowerCase().includes(word))) || links[0] || null;
}
