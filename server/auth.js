// Sign-in for the one owner of this app.
//
// - One account only. The first registration creates it; after that,
//   registration is closed.
// - The password is stored as a salted scrypt hash, never as text.
// - Signing in returns a token (HMAC-signed with a secret kept in the
//   account's record). The app sends it as "Authorization: Bearer …".
// - Once an account exists, every private route needs a valid token. Routes
//   that only serve public market data stay open, so guests can still see
//   prices. Before an account exists, the server behaves as it used to.

const crypto = require('crypto');
const models = require('./models');

const OWNER_ID = 'owner';
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,30}$/;
const MIN_PASSWORD = 8;
const NEGATIVE_CACHE_MS = 10000;
const MAX_ATTEMPTS = 8; // failed logins per IP per window
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

// Market data anyone may read (no personal data behind these).
const PUBLIC_PREFIXES = ['/health', '/auth/', '/gold-rate', '/quotes', '/usdinr', '/crypto/', '/candles', '/stock-search'];
const isPublicPath = (path) => PUBLIC_PREFIXES.some((p) => path === p || path === p.replace(/\/$/, '') || path.startsWith(p));

let cached = null; // { user, at }
const attempts = new Map(); // ip → { count, since }

async function getOwner() {
  if (cached && (cached.user || Date.now() - cached.at < NEGATIVE_CACHE_MS)) return cached.user;
  const user = await models.getUserModel().findOne({ id: OWNER_ID }).lean();
  cached = { user: user || null, at: Date.now() };
  return cached.user;
}

const hashPassword = (password, salt) => crypto.scryptSync(String(password), salt, 64).toString('hex');
const b64 = (s) => Buffer.from(s).toString('base64url');

function signToken(user) {
  const payload = b64(JSON.stringify({ u: user.username, iat: Date.now() }));
  const sig = crypto.createHmac('sha256', user.tokenSecret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function tokenValid(user, token) {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig) return false;
  const expected = crypto.createHmac('sha256', user.tokenSecret).update(payload).digest();
  let given;
  try {
    given = Buffer.from(sig, 'base64url');
  } catch (_error) {
    return false;
  }
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

const bearer = (req) => {
  const header = req.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
};

function tooManyAttempts(ip) {
  const a = attempts.get(ip);
  if (!a) return false;
  if (Date.now() - a.since > ATTEMPT_WINDOW_MS) {
    attempts.delete(ip);
    return false;
  }
  return a.count >= MAX_ATTEMPTS;
}
function noteFailure(ip) {
  const a = attempts.get(ip);
  if (!a || Date.now() - a.since > ATTEMPT_WINDOW_MS) attempts.set(ip, { count: 1, since: Date.now() });
  else a.count += 1;
}

/** Mount /api/auth/* and the gate for private routes. Call before the other /api routes. */
function mountAuth(app) {
  // Is there an account yet? (The app shows "create account" until there is.)
  app.get('/api/auth/status', async (req, res) => {
    try {
      res.json({ registered: !!(await getOwner()) });
    } catch (error) {
      res.status(503).json({ error: 'Database unavailable' });
    }
  });

  app.post('/api/auth/register', async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    try {
      if (await getOwner()) {
        return res.status(403).json({ error: 'Registration is currently unavailable.', code: 'closed' });
      }
      if (!USERNAME_RE.test(username)) {
        return res.status(400).json({ error: 'Username: 3–30 letters, numbers, dot, dash or underscore.' });
      }
      if (password.length < MIN_PASSWORD) {
        return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters.` });
      }
      const salt = crypto.randomBytes(16).toString('hex');
      const user = {
        id: OWNER_ID,
        username,
        salt,
        hash: hashPassword(password, salt),
        tokenSecret: crypto.randomBytes(32).toString('hex'),
        createdAt: new Date().toISOString(),
      };
      try {
        await models.getUserModel().create(user);
      } catch (error) {
        // Unique id: someone registered a moment earlier.
        cached = null;
        return res.status(403).json({ error: 'Registration is currently unavailable.', code: 'closed' });
      }
      cached = { user, at: Date.now() };
      res.json({ username, token: signToken(user) });
    } catch (error) {
      console.error('[auth] register failed', error.message);
      res.status(503).json({ error: 'Could not create the account. Try again.' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    const ip = req.ip || 'unknown';
    if (tooManyAttempts(ip)) {
      return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
    }
    try {
      const user = await getOwner();
      const username = String(req.body?.username || '').trim();
      const password = String(req.body?.password || '');
      const ok =
        !!user &&
        username.toLowerCase() === user.username.toLowerCase() &&
        crypto.timingSafeEqual(Buffer.from(hashPassword(password, user.salt), 'hex'), Buffer.from(user.hash, 'hex'));
      if (!ok) {
        noteFailure(ip);
        return res.status(401).json({ error: 'Wrong username or password.' });
      }
      attempts.delete(ip);
      res.json({ username: user.username, token: signToken(user) });
    } catch (error) {
      console.error('[auth] login failed', error.message);
      res.status(503).json({ error: 'Could not sign in. Try again.' });
    }
  });

  // Is this token still good?
  app.get('/api/auth/me', async (req, res) => {
    const user = await getOwner().catch(() => null);
    if (!user || !tokenValid(user, bearer(req))) return res.status(401).json({ error: 'Sign in again.', code: 'auth' });
    res.json({ username: user.username });
  });

  // Everything private needs the owner's token once an account exists.
  app.use('/api', async (req, res, next) => {
    if (req.method === 'OPTIONS' || isPublicPath(req.path)) return next();
    let user;
    try {
      user = await getOwner();
    } catch (error) {
      return res.status(503).json({ error: 'Database unavailable' });
    }
    if (!user) return next(); // no account yet: as before
    if (!tokenValid(user, bearer(req))) return res.status(401).json({ error: 'Sign in to use this.', code: 'auth' });
    next();
  });
}

/** A fresh sign-in token for the owner (watch pairing), or null before an account exists. */
async function issueToken() {
  const user = await getOwner();
  return user ? { username: user.username, token: signToken(user) } : null;
}

module.exports = { mountAuth, isPublicPath, issueToken };
