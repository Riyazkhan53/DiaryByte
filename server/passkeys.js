// Passkeys: sign in to DiaryByte in a browser with the phone's or the
// computer's screen lock (fingerprint, face, PIN) instead of the password.
//
// - A passkey is added while signed in, from the browser it's for
//   (Settings → Passkeys). A passkey saved on a phone (e.g. Google Password
//   Manager) also signs in on a computer: the browser shows a QR code to
//   scan with the phone.
// - The site's own address is the passkey's "relying party": passkeys made
//   on one web address only work there.
// - Only the public key is stored here; signing in returns the same token
//   as the password does.

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const models = require('./models');

const CHALLENGE_MS = 5 * 60 * 1000;
const challenges = new Map(); // challenge → { kind, rpID, origin, at }

function rememberChallenge(challenge, data) {
  const now = Date.now();
  for (const [c, v] of challenges) if (now - v.at > CHALLENGE_MS) challenges.delete(c);
  challenges.set(challenge, { ...data, at: now });
}

function takeChallenge(challenge, kind) {
  const c = challenges.get(challenge);
  challenges.delete(challenge);
  return c && c.kind === kind && Date.now() - c.at <= CHALLENGE_MS ? c : null;
}

// The page's address (sent by the browser) is where the passkey belongs.
function site(req) {
  const origin = String(req.get('origin') || '');
  let url;
  try {
    url = new URL(origin);
  } catch (_error) {
    return null;
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !local) return null;
  return { origin: url.origin, rpID: url.hostname };
}

// The challenge the browser signed (from clientDataJSON).
function signedChallenge(response) {
  try {
    return JSON.parse(Buffer.from(response.response.clientDataJSON, 'base64url').toString('utf8')).challenge;
  } catch (_error) {
    return null;
  }
}

const deviceName = (ua) => {
  const s = String(ua || '');
  const os = /Android/i.test(s) ? 'Android' : /iPhone|iPad/i.test(s) ? 'iPhone/iPad' : /Mac OS X/i.test(s) ? 'Mac' : /Windows/i.test(s) ? 'Windows' : /Linux/i.test(s) ? 'Linux' : 'Device';
  const browser = /Edg\//.test(s) ? 'Edge' : /Chrome\//.test(s) ? 'Chrome' : /Firefox\//.test(s) ? 'Firefox' : /Safari\//.test(s) ? 'Safari' : 'browser';
  return `${browser} on ${os}`;
};

/**
 * Mount /api/auth/passkeys* (under /api/auth, so the sign-in gate lets the
 * login ones through; the others check the token themselves).
 */
function mountPasskeys(app, { getOwner, tokenValid, signToken, bearer, tooManyAttempts, noteFailure }) {
  const Passkeys = () => models.getPasskeyModel();
  const signedIn = async (req) => {
    const user = await getOwner();
    return user && tokenValid(user, bearer(req)) ? user : null;
  };

  // Passkeys saved for this account (for Settings).
  app.get('/api/auth/passkeys', async (req, res) => {
    try {
      if (!(await signedIn(req))) return res.status(401).json({ error: 'Sign in again.', code: 'auth' });
      const items = await Passkeys().find().lean();
      res.json({ items: items.map((p) => ({ id: p.id, name: p.name, rpID: p.rpID, createdAt: p.createdAt, lastUsedAt: p.lastUsedAt || null })) });
    } catch (error) {
      res.status(503).json({ error: 'Could not load passkeys.' });
    }
  });

  app.delete('/api/auth/passkeys/:id', async (req, res) => {
    try {
      if (!(await signedIn(req))) return res.status(401).json({ error: 'Sign in again.', code: 'auth' });
      await Passkeys().deleteOne({ id: req.params.id });
      res.json({ ok: true });
    } catch (error) {
      res.status(503).json({ error: 'Could not remove it.' });
    }
  });

  // 1. Adding a passkey (signed in): the options for the browser.
  app.post('/api/auth/passkeys/register/options', async (req, res) => {
    try {
      const user = await signedIn(req);
      if (!user) return res.status(401).json({ error: 'Sign in again.', code: 'auth' });
      const where = site(req);
      if (!where) return res.status(400).json({ error: 'Passkeys need the secure (https) web app.' });
      const existing = await Passkeys().find({ rpID: where.rpID }).lean();
      const options = await generateRegistrationOptions({
        rpName: 'DiaryByte',
        rpID: where.rpID,
        userName: user.username,
        userDisplayName: user.username,
        userID: Buffer.from('diarybyte-owner'),
        attestationType: 'none',
        excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports })),
        authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
      });
      rememberChallenge(options.challenge, { kind: 'register', ...where });
      res.json(options);
    } catch (error) {
      console.error('[passkeys] register options failed', error.message);
      res.status(503).json({ error: 'Could not start adding a passkey.' });
    }
  });

  // 2. Adding a passkey: check the browser's answer and keep the public key.
  app.post('/api/auth/passkeys/register/verify', async (req, res) => {
    try {
      if (!(await signedIn(req))) return res.status(401).json({ error: 'Sign in again.', code: 'auth' });
      const response = req.body?.response;
      const challenge = response && signedChallenge(response);
      const c = challenge && takeChallenge(challenge, 'register');
      if (!c) return res.status(400).json({ error: 'That took too long. Try again.' });
      const result = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin: c.origin, expectedRPID: c.rpID });
      if (!result.verified || !result.registrationInfo) return res.status(400).json({ error: "The passkey couldn't be checked." });
      const cred = result.registrationInfo.credential;
      await Passkeys().create({
        id: cred.id,
        publicKey: Buffer.from(cred.publicKey).toString('base64url'),
        counter: cred.counter || 0,
        transports: cred.transports || response.response?.transports || [],
        rpID: c.rpID,
        name: String(req.body?.name || '').trim().slice(0, 60) || deviceName(req.get('user-agent')),
        createdAt: new Date().toISOString(),
      });
      res.json({ ok: true });
    } catch (error) {
      console.error('[passkeys] register verify failed', error.message);
      res.status(400).json({ error: "The passkey couldn't be added." });
    }
  });

  // 3. Signing in: options (any passkey saved for this site).
  app.post('/api/auth/passkeys/login/options', async (req, res) => {
    try {
      const where = site(req);
      if (!where) return res.status(400).json({ error: 'Passkeys need the secure (https) web app.' });
      if (!(await getOwner())) return res.status(400).json({ error: 'Create the account first.' });
      const options = await generateAuthenticationOptions({ rpID: where.rpID, userVerification: 'preferred', allowCredentials: [] });
      rememberChallenge(options.challenge, { kind: 'login', ...where });
      res.json(options);
    } catch (error) {
      console.error('[passkeys] login options failed', error.message);
      res.status(503).json({ error: 'Could not start passkey sign-in.' });
    }
  });

  // 4. Signing in: check the passkey's signature, then hand out the token.
  app.post('/api/auth/passkeys/login/verify', async (req, res) => {
    const ip = req.ip || 'unknown';
    if (tooManyAttempts(ip)) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
    try {
      const user = await getOwner();
      const response = req.body?.response;
      const challenge = response && signedChallenge(response);
      const c = challenge && takeChallenge(challenge, 'login');
      if (!user || !c) {
        noteFailure(ip);
        return res.status(400).json({ error: 'That took too long. Try again.' });
      }
      const saved = await Passkeys().findOne({ id: response.id, rpID: c.rpID }).lean();
      if (!saved) {
        noteFailure(ip);
        return res.status(401).json({ error: "This passkey isn't saved for DiaryByte here. Sign in with your password and add it in Settings." });
      }
      const result = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: c.origin,
        expectedRPID: c.rpID,
        credential: { id: saved.id, publicKey: new Uint8Array(Buffer.from(saved.publicKey, 'base64url')), counter: saved.counter || 0, transports: saved.transports },
      });
      if (!result.verified) {
        noteFailure(ip);
        return res.status(401).json({ error: "The passkey didn't match." });
      }
      await Passkeys().updateOne({ id: saved.id }, { $set: { counter: result.authenticationInfo.newCounter, lastUsedAt: new Date().toISOString() } });
      res.json({ username: user.username, token: signToken(user) });
    } catch (error) {
      console.error('[passkeys] login verify failed', error.message);
      noteFailure(ip);
      res.status(401).json({ error: "The passkey couldn't be checked." });
    }
  });
}

module.exports = { mountPasskeys };
