const mongoose = require('mongoose');
const Movie = require('./models/Movie');

const MOVIE_FIELDS = [
  'id',
  'title',
  'platform',
  'type',
  'status',
  'addedAt',
  'tmdbId',
  'mediaType',
  'posterPath',
  'rating',
  'releaseDate',
];

function sanitizeMovie(raw) {
  const clean = {};
  MOVIE_FIELDS.forEach((field) => {
    if (raw[field] !== undefined) {
      clean[field] = raw[field];
    }
  });
  return clean;
}

async function connectDatabase() {
  let uri = process.env.MONGODB_URI;
  if (!uri || process.env.MONGO_MEMORY === '1') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MONGODB_URI is required in production');
    }
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const memServer = await MongoMemoryServer.create();
    uri = memServer.getUri('diarybyte');
    console.log('[db] Using in-memory MongoDB (development only)');
  }
  await mongoose.connect(uri);
  console.log('[db] Connected to MongoDB');
}

function createApp() {
  const express = require('express');
  const cors = require('cors');
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  // Simple shared-secret auth for this personal app
  const apiKey = process.env.API_KEY;
  if (apiKey) {
    app.use('/api', (req, res, next) => {
      if (req.get('x-api-key') !== apiKey) {
        return res.status(401).json({ error: 'Invalid API key' });
      }
      next();
    });
  } else {
    console.warn('[auth] API_KEY not set — endpoints are unprotected');
  }

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, db: mongoose.connection.readyState === 1 ? 'up' : 'down' });
  });

  app.get('/api/movies', async (req, res) => {
    try {
      const movies = await Movie.find().sort({ addedAt: -1 }).lean();
      res.json({ movies });
    } catch (error) {
      console.error('[api] GET /api/movies failed', error);
      res.status(500).json({ error: 'Failed to load movies' });
    }
  });

  // Replace the entire watch list — keeps sync simple and idempotent
  app.put('/api/movies', async (req, res) => {
    try {
      const incoming = Array.isArray(req.body && req.body.movies) ? req.body.movies : null;
      if (!incoming) {
        return res.status(400).json({ error: 'Body must be { movies: [...] }' });
      }
      const cleaned = incoming.map(sanitizeMovie).filter((m) => m.id && m.title);
      await Movie.deleteMany({});
      if (cleaned.length > 0) {
        await Movie.insertMany(cleaned, { ordered: false });
      }
      res.json({ ok: true, count: cleaned.length });
    } catch (error) {
      console.error('[api] PUT /api/movies failed', error);
      res.status(500).json({ error: 'Failed to save movies' });
    }
  });

  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    console.error('[api] Unhandled error', error);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

const PORT = process.env.PORT || 3000;

connectDatabase()
  .then(() => {
    const app = createApp();
    app.listen(PORT, () => {
      console.log(`[api] DiaryByte API listening on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('[api] Failed to start', error);
    process.exit(1);
  });
