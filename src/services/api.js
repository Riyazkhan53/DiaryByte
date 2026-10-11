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
