const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
const API_KEY = process.env.EXPO_PUBLIC_API_KEY || '';

const COLLECTIONS = [
  'movies',
  'passwords',
  'banking',
  'diary',
  'vault',
  'todo',
  'expenditure',
  'cards',
  'investments',
  'debts',
];

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(`API request failed (${response.status})`);
  }
  return response.json();
}

// Resolves true once the API answers. The per-attempt timeout keeps a
// sleeping free-tier server from hanging a single request for minutes.
export async function checkHealth(timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_URL}/api/health`, {
      signal: controller.signal,
      headers: API_KEY ? { 'x-api-key': API_KEY } : {},
    });
    return response.ok;
  } catch (_error) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function fetchCollection(collection) {
  if (!COLLECTIONS.includes(collection)) {
    throw new Error(`Unknown collection: ${collection}`);
  }
  return request(`/api/${collection}`).then((data) => data.items || []);
}

export function pushCollection(collection, items) {
  if (!COLLECTIONS.includes(collection)) {
    throw new Error(`Unknown collection: ${collection}`);
  }
  return request(`/api/${collection}`, {
    method: 'PUT',
    body: JSON.stringify({ items }),
  });
}
