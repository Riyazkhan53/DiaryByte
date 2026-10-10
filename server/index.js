const mongoose = require('mongoose');
const { getCollectionNames, getModel, sanitize } = require('./models');

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
  // Force a meaningful database name regardless of what the URI ends with
  // (Atlas defaults to "test" when no database is in the connection string).
  const dbName = process.env.MONGODB_DB || 'diarybyte';
  await mongoose.connect(uri, { dbName });
  console.log(`[db] Connected to MongoDB (db: ${dbName})`);
}

function createApp() {
  const express = require('express');
  const cors = require('cors');
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

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

  app.get('/api/:collection', async (req, res) => {
    const { collection } = req.params;
    if (!getCollectionNames().includes(collection)) {
      return res.status(404).json({ error: 'Unknown collection' });
    }
    try {
      const Model = getModel(collection);
      const docs = await Model.find().sort({ _id: -1 }).lean();
      const items = docs.map((doc) => {
        const item = {};
        Object.keys(doc).forEach((key) => {
          if (key !== '_id' && key !== '__v') {
            item[key] = doc[key];
          }
        });
        return item;
      });
      res.json({ items });
    } catch (error) {
      console.error(`[api] GET /api/${collection} failed`, error);
      res.status(500).json({ error: `Failed to load ${collection}` });
    }
  });

  // Replace an entire collection — keeps sync simple and idempotent
  app.put('/api/:collection', async (req, res) => {
    const { collection } = req.params;
    if (!getCollectionNames().includes(collection)) {
      return res.status(404).json({ error: 'Unknown collection' });
    }
    try {
      const incoming = Array.isArray(req.body && req.body.items) ? req.body.items : null;
      if (!incoming) {
        return res.status(400).json({ error: 'Body must be { items: [...] }' });
      }
      const cleaned = incoming
        .map((item) => sanitize(collection, item))
        .filter((item) => item.id);
      const Model = getModel(collection);
      await Model.deleteMany({});
      if (cleaned.length > 0) {
        await Model.insertMany(cleaned, { ordered: false });
      }
      res.json({ ok: true, count: cleaned.length });
    } catch (error) {
      console.error(`[api] PUT /api/${collection} failed`, error);
      res.status(500).json({ error: `Failed to save ${collection}` });
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
