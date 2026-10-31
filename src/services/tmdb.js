const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p';

export const TMDB_KEY_STORAGE = '@diarybyte_tmdb_key';
export const WATCH_REGION = 'IN';

async function tmdbFetch(path, params) {
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  const response = await fetch(`${BASE_URL}${path}?${query}`);
  if (!response.ok) {
    const error = new Error(
      response.status === 401
        ? 'Invalid API key. Check your key from themoviedb.org.'
        : `TMDB request failed (${response.status})`
    );
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function fetchProviders(apiKey, mediaType = 'movie') {
  const data = await tmdbFetch(`/watch/providers/${mediaType}`, {
    api_key: apiKey,
    watch_region: WATCH_REGION,
  });
  return (data.results || [])
    .slice()
    .sort((a, b) => (a.display_priority ?? 99) - (b.display_priority ?? 99))
    .slice(0, 12)
    .map((p) => ({
      id: p.provider_id,
      name: p.provider_name,
      logoPath: p.logo_path,
    }));
}

// sort: 'popular' (most watched) or 'latest' (newest release first, up to today).
export async function fetchOTTTitles(apiKey, providerIds, mediaType = 'movie', language = '', sort = 'popular') {
  const dateField = mediaType === 'tv' ? 'first_air_date' : 'primary_release_date';
  const params = {
    api_key: apiKey,
    watch_region: WATCH_REGION,
    with_watch_providers: providerIds.join('|'),
    include_adult: 'false',
    page: '1',
    ...(sort === 'latest'
      ? { sort_by: `${dateField}.desc`, [`${dateField}.lte`]: new Date().toISOString().slice(0, 10) }
      : { sort_by: 'popularity.desc', 'vote_count.gte': '20' }),
  };
  if (language) {
    params.with_original_language = language;
  }
  const data = await tmdbFetch(`/discover/${mediaType}`, params);
  return (data.results || []).map((m) => ({
    tmdbId: m.id,
    mediaType,
    title: m.title || m.name,
    posterPath: m.poster_path,
    releaseDate: m.release_date || m.first_air_date,
    rating: m.vote_average,
    overview: m.overview,
  }));
}

export function posterUrl(path, size = 'w342') {
  return path ? `${IMAGE_BASE}/${size}${path}` : null;
}
