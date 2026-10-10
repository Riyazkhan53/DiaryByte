const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
const API_KEY = process.env.EXPO_PUBLIC_API_KEY || '';

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

export function fetchMovies() {
  return request('/api/movies').then((data) => data.movies || []);
}

export function pushMovies(movies) {
  return request('/api/movies', {
    method: 'PUT',
    body: JSON.stringify({ movies }),
  });
}
