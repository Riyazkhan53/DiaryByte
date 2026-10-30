const mongoose = require('mongoose');
const {
  TRASH_DAYS,
  getCollectionNames,
  getModel,
  getTrashModel,
  sanitize,
  toItem,
} = require('./models');
const { getQuotes, getCandles, searchSymbols, isSymbol } = require('./quotes');
const engineService = require('./engine/service');
const { kiteConfigured, kiteCreateSession, kiteLoginUrl } = require('./engine/providers');

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

const OROPOCKET_URL = 'https://api.oropocket.com/public/prices';
const GOLD_CACHE_MS = 5 * 60 * 1000;

function createApp() {
  const express = require('express');
  const cors = require('cors');
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '25mb' }));

  // Kite Connect redirects the browser here after login (no API key header
  // on a redirect, so this sits outside /api). Set it as the redirect URL
  // in the Kite developer console: https://<server>/kite/callback
  app.get('/kite/callback', async (req, res) => {
    const page = (msg) =>
      `<!doctype html><meta name="viewport" content="width=device-width"><body style="font-family:system-ui;padding:24px"><p>${msg}</p></body>`;
    if (req.query.status !== 'success' || typeof req.query.request_token !== 'string') {
      return res.status(400).send(page('Kite login was cancelled or failed.'));
    }
    try {
      await kiteCreateSession(req.query.request_token);
      res.send(page('Kite connected for today. You can close this tab and go back to DiaryByte.'));
    } catch (error) {
      console.error('[kite] session failed', error.message);
      res.status(502).send(page('Kite login failed. Try again from My Trading.'));
    }
  });

  // Public on purpose: Render's health check (render.yaml healthCheckPath)
  // sends no API key, so a protected route answers 401 and every deploy
  // times out. It reveals only whether the server and database are up.
  app.get('/api/health', (req, res) => {
    res.json({ ok: true, db: mongoose.connection.readyState === 1 ? 'up' : 'down' });
  });

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

  // Live digital gold rate (₹/gram) from OroPocket's public feed, cached for
  // a few minutes to stay well inside its 10-requests-a-minute limit. Must be
  // registered before /api/:collection.
  let goldCache = null;
  app.get('/api/gold-rate', async (req, res) => {
    if (goldCache && Date.now() - goldCache.at < GOLD_CACHE_MS) {
      return res.json(goldCache.rate);
    }
    try {
      const response = await fetch(OROPOCKET_URL, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`OroPocket responded ${response.status}`);
      const body = await response.json();
      const gold = (body.data || body).gold || {};
      const rate = {
        buy: parseFloat(gold.buy),
        sell: parseFloat(gold.sell),
        gst: parseFloat(gold.gst) || null,
        timestamp: (body.data || body).timestamp || null,
        source: 'OroPocket',
      };
      if (!(rate.buy > 0) || !(rate.sell > 0)) throw new Error('No gold rate in response');
      goldCache = { at: Date.now(), rate };
      res.json(rate);
    } catch (error) {
      console.error('[api] GET /api/gold-rate failed', error.message);
      // A slightly old rate beats none.
      if (goldCache) return res.json({ ...goldCache.rate, stale: true });
      res.status(502).json({ error: 'Gold rate unavailable' });
    }
  });

  // Stock prices (Indian and US) and today's USD→INR rate.
  // GET /api/quotes?symbols=TCS.NS,AAPL
  app.get('/api/quotes', async (req, res) => {
    const symbols = String(req.query.symbols || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      res.json(await getQuotes(symbols));
    } catch (error) {
      console.error('[api] GET /api/quotes failed', error.message);
      res.status(502).json({ error: 'Stock prices unavailable' });
    }
  });

  // ------- intraday signal engine (decision support, paper trading only) -------

  app.get('/api/engine/status', async (req, res) => {
    try {
      res.json(await engineService.status());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Live evaluation of one symbol. GET /api/engine/evaluate?symbol=DLF.NS
  app.get('/api/engine/evaluate', async (req, res) => {
    const symbol = String(req.query.symbol || '').toUpperCase();
    if (!isSymbol(symbol)) return res.status(400).json({ error: 'Bad symbol' });
    try {
      res.json(await engineService.evaluate(symbol));
    } catch (error) {
      console.error('[api] engine evaluate failed', error.message);
      res.status(502).json({ error: `Could not evaluate ${symbol}: ${error.message}` });
    }
  });

  // Run the watchlist scan now (it also runs every 5 minutes in session).
  app.post('/api/engine/scan', async (req, res) => {
    try {
      res.json(await engineService.scan());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/kite/login-url', (req, res) => {
    if (!kiteConfigured()) return res.status(400).json({ error: 'KITE_API_KEY and KITE_API_SECRET are not set on the server' });
    res.json({ url: kiteLoginUrl() });
  });

  // Daily price history for the Setup Check. GET /api/candles?symbol=TCS.NS
  app.get('/api/candles', async (req, res) => {
    try {
      res.json(await getCandles(String(req.query.symbol || '')));
    } catch (error) {
      console.error('[api] GET /api/candles failed', error.message);
      res.status(502).json({ error: 'Price history unavailable' });
    }
  });

  // Find a stock by name or symbol. GET /api/stock-search?q=infosys&market=IN|US
  app.get('/api/stock-search', async (req, res) => {
    const market = req.query.market === 'US' ? 'US' : 'IN';
    try {
      res.json({ results: await searchSymbols(req.query.q, market) });
    } catch (error) {
      console.error('[api] GET /api/stock-search failed', error.message);
      res.status(502).json({ error: 'Stock search unavailable' });
    }
  });

  app.get('/api/:collection', async (req, res) => {
    const { collection } = req.params;
    if (!getCollectionNames().includes(collection)) {
      return res.status(404).json({ error: 'Unknown collection' });
    }
    try {
      const Model = getModel(collection);
      const docs = await Model.find().sort({ _id: -1 }).lean();
      res.json({ items: docs.map(toItem) });
    } catch (error) {
      console.error(`[api] GET /api/${collection} failed`, error);
      res.status(500).json({ error: `Failed to load ${collection}` });
    }
  });

  // Save a collection: add or update every item sent, and delete only the
  // ids listed in `deleted`. Items the app didn't send are left alone, so a
  // device that is missing data (or an older app version that sends no
  // `deleted` list) can never wipe anything. Deleted items go to the trash.
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
        .filter((item) => typeof item.id === 'string' && item.id);
      const sent = new Set(cleaned.map((item) => item.id));
      const deleted = (Array.isArray(req.body.deleted) ? req.body.deleted : []).filter(
        (id) => typeof id === 'string' && !sent.has(id)
      );
      const Model = getModel(collection);

      if (cleaned.length > 0) {
        await Model.bulkWrite(
          cleaned.map((item) => ({
            replaceOne: { filter: { id: item.id }, replacement: item, upsert: true },
          })),
          { ordered: false }
        );
      }
      if (deleted.length > 0) {
        const docs = await Model.find({ id: { $in: deleted } }).lean();
        if (docs.length > 0) {
          await getTrashModel().insertMany(
            docs.map((doc) => ({ section: collection, itemId: doc.id, item: toItem(doc) }))
          );
          await Model.deleteMany({ id: { $in: docs.map((doc) => doc.id) } });
        }
      }
      res.json({ ok: true, count: await Model.countDocuments() });
    } catch (error) {
      console.error(`[api] PUT /api/${collection} failed`, error);
      res.status(500).json({ error: `Failed to save ${collection}` });
    }
  });

  // Recently deleted items for one collection, newest first.
  app.get('/api/trash/:collection', async (req, res) => {
    const { collection } = req.params;
    if (!getCollectionNames().includes(collection)) {
      return res.status(404).json({ error: 'Unknown collection' });
    }
    try {
      const docs = await getTrashModel()
        .find({ section: collection })
        .sort({ deletedAt: -1 })
        .limit(500)
        .lean();
      res.json({
        days: TRASH_DAYS,
        items: docs.map((doc) => ({
          trashId: String(doc._id),
          deletedAt: doc.deletedAt,
          item: doc.item,
        })),
      });
    } catch (error) {
      console.error(`[api] GET /api/trash/${collection} failed`, error);
      res.status(500).json({ error: 'Failed to load recently deleted items' });
    }
  });

  // Put trashed items back. An item that already exists again is left as is.
  app.post('/api/trash/:collection/restore', async (req, res) => {
    const { collection } = req.params;
    if (!getCollectionNames().includes(collection)) {
      return res.status(404).json({ error: 'Unknown collection' });
    }
    try {
      const trashIds = (Array.isArray(req.body && req.body.trashIds) ? req.body.trashIds : []).filter(
        (id) => mongoose.isValidObjectId(id)
      );
      const Trash = getTrashModel();
      const docs = await Trash.find({ _id: { $in: trashIds }, section: collection }).lean();
      if (docs.length > 0) {
        await getModel(collection).bulkWrite(
          docs.map((doc) => ({
            updateOne: {
              filter: { id: doc.itemId },
              update: { $setOnInsert: sanitize(collection, doc.item) },
              upsert: true,
            },
          })),
          { ordered: false }
        );
        await Trash.deleteMany({ _id: { $in: docs.map((doc) => doc._id) } });
      }
      res.json({ ok: true, restored: docs.length });
    } catch (error) {
      console.error(`[api] POST /api/trash/${collection}/restore failed`, error);
      res.status(500).json({ error: 'Failed to restore items' });
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

if (require.main === module) {
  connectDatabase()
    .then(() => {
      const app = createApp();
      app.listen(PORT, () => {
        console.log(`[api] DiaryByte API listening on port ${PORT}`);
      });
      engineService.startScanner();
    })
    .catch((error) => {
      console.error('[api] Failed to start', error);
      process.exit(1);
    });
}

module.exports = { createApp };
