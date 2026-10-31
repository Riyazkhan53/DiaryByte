// Streaming Availability API (Movie of the Night, via RapidAPI): what was
// just added to each OTT in India, with each stream's audio languages, so
// Tamil originals and Tamil-dubbed titles can be told apart.
// Free plan: a limited number of requests a day, so results are cached.

export const DEFAULT_BASE_URL = 'https://streaming-availability.p.rapidapi.com';
const COUNTRY = 'in';

// The host in use. Another one can be tried for this session only: it is
// never saved, so the app is back on the default after a restart.
let baseUrl = DEFAULT_BASE_URL;

/** Normalise a typed host ("example.com" or "https://example.com/v4/") to a base URL. */
export function normalizeBaseUrl(input) {
  const raw = String(input || '').trim().replace(/\/+$/, '');
  if (!raw) return null;
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(url).host ? url : null;
  } catch (_error) {
    return null;
  }
}

export const getBaseUrl = () => baseUrl;

/** Use `url` until the app restarts; null goes back to the default. */
export function setSessionBaseUrl(url) {
  baseUrl = url || DEFAULT_BASE_URL;
}

export const SA_KEY_STORAGE = '@diarybyte_sa_key';
export const SA_SIGNUP_URL =
  'https://rapidapi.com/movie-of-the-night-movie-of-the-night-default/api/streaming-availability';

// Tamil script (U+0B80–U+0BFF) in the original title marks a Tamil original.
const TAMIL_SCRIPT = /[஀-௿]/;

async function saFetch(apiKey, path, params, base = baseUrl) {
  const query = Object.entries(params)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  const response = await fetch(`${base}${path}${query ? `?${query}` : ''}`, {
    headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': new URL(base).host },
  });
  if (!response.ok) {
    const error = new Error(
      response.status === 401 || response.status === 403
        ? 'Key not accepted. Check it, and that it is subscribed to Streaming Availability on RapidAPI.'
        : response.status === 429
          ? "Today's free requests are used up. Try again tomorrow."
          : `Streaming Availability request failed (${response.status})`
    );
    error.status = response.status;
    throw error;
  }
  return response.json();
}

/**
 * A show from the API as a card: { key, title, year, mediaType, rating
 * (0–10), posterUri, services, link, tmdbId, tamilAudio, tamilOriginal,
 * dubbed, addedAt }. `service`/`addedAt` come from a change, when known.
 */
export function toItem(show, { service, addedAt } = {}) {
  const options = show.streamingOptions?.[COUNTRY] || [];
  const services = [...new Set(options.map((o) => o.service?.name).filter(Boolean))];
  const audios = new Set(options.flatMap((o) => (o.audios || []).map((a) => a.language)));
  const preferred =
    options.find((o) => o.service?.id === service?.id && o.type === 'subscription') ||
    options.find((o) => o.service?.id === service?.id) ||
    options.find((o) => o.type === 'subscription') ||
    options[0];
  const [tmdbType, tmdbNum] = String(show.tmdbId || '').split('/');
  const tamilOriginal = TAMIL_SCRIPT.test(show.originalTitle || '');
  const tamilAudio = audios.has('tam') || tamilOriginal;
  return {
    key: show.id,
    title: show.title,
    year: show.releaseYear || show.firstAirYear || null,
    mediaType: show.showType === 'series' ? 'tv' : 'movie',
    rating: show.rating ? show.rating / 10 : null,
    posterUri: show.imageSet?.verticalPoster?.w360 || show.imageSet?.verticalPoster?.w240 || null,
    services: service?.name ? [service.name, ...services.filter((s) => s !== service.name)] : services,
    link: preferred?.link || null,
    tmdbId: tmdbNum ? Number(tmdbNum) : null,
    tmdbType: tmdbType || null,
    tamilAudio,
    tamilOriginal,
    dubbed: tamilAudio && !tamilOriginal,
    addedAt: addedAt || null,
  };
}

/** Newest additions across Indian OTTs: { items, nextCursor }. */
export async function fetchJustAdded(apiKey, { showType = 'movie', cursor } = {}) {
  const data = await saFetch(apiKey, '/changes', {
    country: COUNTRY,
    change_type: 'new',
    item_type: 'show',
    show_type: showType,
    order_direction: 'desc',
    output_language: 'en',
    cursor,
  });
  const seen = new Set();
  const items = [];
  (data.changes || []).forEach((change) => {
    const show = data.shows?.[change.showId];
    if (!show || seen.has(change.showId)) return;
    seen.add(change.showId);
    items.push(toItem(show, { service: change.service, addedAt: change.timestamp }));
  });
  return { items, nextCursor: data.hasMore ? data.nextCursor : null };
}

/** Latest Tamil-language titles on Indian OTTs, newest release first. */
export async function fetchTamilLatest(apiKey, { showType = 'movie', cursor } = {}) {
  const data = await saFetch(apiKey, '/shows/search/filters', {
    country: COUNTRY,
    show_original_language: 'ta',
    show_type: showType,
    series_granularity: 'show',
    order_by: 'release_date',
    order_direction: 'desc',
    output_language: 'en',
    cursor,
  });
  return {
    items: (data.shows || []).map((show) => ({ ...toItem(show), tamilOriginal: true, dubbed: false })),
    nextCursor: data.hasMore ? data.nextCursor : null,
  };
}

/**
 * Newly added titles with a Tamil audio track that aren't Tamil originals.
 * Reads up to `pages` pages of additions (one request each) to find them.
 */
export async function fetchTamilDubbed(apiKey, { showType = 'movie', cursor, pages = 3, want = 12 } = {}) {
  const items = [];
  const seen = new Set();
  let next = cursor;
  for (let i = 0; i < pages; i += 1) {
    const page = await fetchJustAdded(apiKey, { showType, cursor: next });
    page.items.forEach((item) => {
      if (item.dubbed && !seen.has(item.key)) {
        seen.add(item.key);
        items.push(item);
      }
    });
    next = page.nextCursor;
    if (!next || items.length >= want) break;
  }
  return { items, nextCursor: next };
}

/**
 * Check a host with `apiKey` without switching to it: asks it for India's
 * services. Returns { ok: true, services: [names] } or { ok: false, message }.
 */
export async function checkHost(apiKey, url) {
  try {
    const data = await saFetch(apiKey, `/countries/${COUNTRY}`, {}, url);
    const services = (data.services || []).map((s) => s.name).filter(Boolean);
    return services.length
      ? { ok: true, services }
      : { ok: false, message: 'The host answered, but not with Streaming Availability data for India.' };
  } catch (error) {
    return { ok: false, message: error.message || "Couldn't reach that host." };
  }
}
