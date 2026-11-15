// Two-factor codes (TOTP / HOTP, RFC 6238 / 4226), otpauth:// links, and
// Google Authenticator's "Transfer accounts" QR format
// (otpauth-migration://offline?data=...), both ways. Pure JS.
import { hmac } from '@noble/hashes/hmac.js';
import { sha1 } from '@noble/hashes/legacy.js';
import { sha256, sha512 } from '@noble/hashes/sha2.js';

const HASHES = { SHA1: sha1, SHA256: sha256, SHA512: sha512 };

// ------- base32 (RFC 4648) -------

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(text) {
  const clean = String(text || '')
    .toUpperCase()
    .replace(/[\s=-]/g, '');
  if (!clean || /[^A-Z2-7]/.test(clean)) return null;
  const out = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export function base32Encode(bytes) {
  let out = '';
  let bits = 0;
  let value = 0;
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

// ------- codes -------

/** The HOTP code for `counter` (a number) from secret bytes. */
export function hotp(secret, counter, { digits = 6, algorithm = 'SHA1' } = {}) {
  const msg = new Uint8Array(8);
  let c = Math.floor(counter);
  for (let i = 7; i >= 0; i -= 1) {
    msg[i] = c & 255;
    c = Math.floor(c / 256);
  }
  const mac = hmac(HASHES[algorithm] || sha1, secret, msg);
  const offset = mac[mac.length - 1] & 15;
  const bin = ((mac[offset] & 127) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

/** { code, remaining (s), progress (0..1 left) } for an account at `now` (ms). */
export function codeFor(account, now = Date.now()) {
  const secret = base32Decode(account.secret);
  if (!secret || !secret.length) return { code: '------', remaining: 0, progress: 0 };
  if (account.type === 'hotp') {
    return { code: hotp(secret, account.counter || 0, account), remaining: null, progress: 1 };
  }
  const period = account.period || 30;
  const t = now / 1000;
  const remaining = period - (Math.floor(t) % period);
  return { code: hotp(secret, Math.floor(t / period), account), remaining, progress: remaining / period };
}

/** "123456" → "123 456" (8 digits → "1234 5678"). */
export const spaced = (code) => (code.length === 8 ? `${code.slice(0, 4)} ${code.slice(4)}` : `${code.slice(0, 3)} ${code.slice(3)}`);

// ------- otpauth:// -------

const clean = (s) => String(s || '').trim();

/** An account from an otpauth:// link, or null. */
export function parseOtpauth(uri) {
  const m = String(uri || '').trim().match(/^otpauth:\/\/(totp|hotp)\/([^?]*)\??(.*)$/i);
  if (!m) return null;
  const params = {};
  m[3].split('&').forEach((pair) => {
    const [k, ...v] = pair.split('=');
    if (k) params[decodeURIComponent(k).toLowerCase()] = decodeURIComponent(v.join('=').replace(/\+/g, ' '));
  });
  const label = decodeURIComponent(m[2]);
  const [labelIssuer, ...rest] = label.split(':');
  const name = clean(rest.length ? rest.join(':') : labelIssuer);
  const issuer = clean(params.issuer || (rest.length ? labelIssuer : ''));
  const secret = clean(params.secret).toUpperCase().replace(/[\s=]/g, '');
  if (!base32Decode(secret)) return null;
  const algorithm = (params.algorithm || 'SHA1').toUpperCase();
  return {
    type: m[1].toLowerCase(),
    name,
    issuer,
    secret,
    algorithm: HASHES[algorithm] ? algorithm : 'SHA1',
    digits: Number(params.digits) === 8 ? 8 : 6,
    period: Number(params.period) > 0 ? Number(params.period) : 30,
    counter: Number(params.counter) || 0,
  };
}

/** An otpauth:// link for an account (what other authenticator apps import). */
export function buildOtpauth(a) {
  const label = encodeURIComponent(a.issuer ? `${a.issuer}:${a.name}` : a.name);
  const q = [`secret=${a.secret}`];
  if (a.issuer) q.push(`issuer=${encodeURIComponent(a.issuer)}`);
  if (a.algorithm && a.algorithm !== 'SHA1') q.push(`algorithm=${a.algorithm}`);
  if (a.digits === 8) q.push('digits=8');
  if (a.type === 'hotp') q.push(`counter=${a.counter || 0}`);
  else if (a.period && a.period !== 30) q.push(`period=${a.period}`);
  return `otpauth://${a.type === 'hotp' ? 'hotp' : 'totp'}/${label}?${q.join('&')}`;
}

// ------- Google Authenticator export (protobuf) -------
// MigrationPayload { repeated OtpParameters otp_parameters = 1; int32 version = 2;
//   int32 batch_size = 3; int32 batch_index = 4; int32 batch_id = 5; }
// OtpParameters { bytes secret = 1; string name = 2; string issuer = 3;
//   Algorithm algorithm = 4; DigitCount digits = 5; OtpType type = 6; int64 counter = 7; }

const ALGOS = ['SHA1', 'SHA1', 'SHA256', 'SHA512']; // 0 unspecified → SHA1 (4 = MD5: unsupported)
const utf8 = new TextDecoder();
const toUtf8 = new TextEncoder();

function readVarint(buf, pos) {
  let result = 0;
  let shift = 0;
  let b;
  do {
    if (pos.i >= buf.length) throw new Error('truncated');
    b = buf[pos.i++];
    result += (b & 127) * 2 ** shift;
    shift += 7;
  } while (b & 128);
  return result;
}

function readFields(buf) {
  const pos = { i: 0 };
  const fields = [];
  while (pos.i < buf.length) {
    const key = readVarint(buf, pos);
    const field = Math.floor(key / 8);
    const wire = key & 7;
    if (wire === 0) fields.push([field, readVarint(buf, pos)]);
    else if (wire === 2) {
      const len = readVarint(buf, pos);
      fields.push([field, buf.subarray(pos.i, pos.i + len)]);
      pos.i += len;
    } else if (wire === 5) pos.i += 4;
    else if (wire === 1) pos.i += 8;
    else throw new Error('bad wire type');
  }
  return fields;
}

const b64decode = (s) => {
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const b64encode = (bytes) => btoa(String.fromCharCode(...bytes));

/**
 * Accounts from a Google Authenticator export QR
 * ({ accounts, batchIndex, batchSize, batchId }), or null if it isn't one.
 */
export function decodeMigration(uri) {
  const m = String(uri || '').trim().match(/^otpauth-migration:\/\/offline\?(?:.*&)?data=([^&]+)/i);
  if (!m) return null;
  let bytes;
  try {
    bytes = b64decode(decodeURIComponent(m[1]).replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '+'));
  } catch (_error) {
    return null;
  }
  const out = { accounts: [], batchIndex: 0, batchSize: 1, batchId: 0, skipped: 0 };
  try {
    readFields(bytes).forEach(([f, v]) => {
      if (f === 1) {
        const a = { type: 'totp', name: '', issuer: '', secret: '', algorithm: 'SHA1', digits: 6, period: 30, counter: 0 };
        let algo = 1;
        readFields(v).forEach(([g, w]) => {
          if (g === 1) a.secret = base32Encode(w);
          else if (g === 2) a.name = utf8.decode(w);
          else if (g === 3) a.issuer = utf8.decode(w);
          else if (g === 4) algo = w;
          else if (g === 5) a.digits = w === 2 ? 8 : 6;
          else if (g === 6) a.type = w === 1 ? 'hotp' : 'totp';
          else if (g === 7) a.counter = w;
        });
        if (algo === 4 || !a.secret) {
          out.skipped += 1;
          return;
        }
        a.algorithm = ALGOS[algo] || 'SHA1';
        // "Issuer:name" labels: keep the name part.
        if (a.issuer && a.name.startsWith(`${a.issuer}:`)) a.name = a.name.slice(a.issuer.length + 1);
        out.accounts.push(a);
      } else if (f === 3) out.batchSize = v;
      else if (f === 4) out.batchIndex = v;
      else if (f === 5) out.batchId = v;
    });
  } catch (_error) {
    return null;
  }
  return out;
}

function varint(n) {
  const out = [];
  let v = n;
  while (v >= 128) {
    out.push((v % 128) | 128);
    v = Math.floor(v / 128);
  }
  out.push(v);
  return out;
}
const field = (num, wire) => varint(num * 8 + wire);
const bytesField = (num, bytes) => [...field(num, 2), ...varint(bytes.length), ...bytes];
const intField = (num, n) => [...field(num, 0), ...varint(n)];

/** One Google Authenticator export QR (otpauth-migration://...) for these accounts. */
export function encodeMigration(accounts, { batchIndex = 0, batchSize = 1, batchId = 0 } = {}) {
  const payload = [];
  accounts.forEach((a) => {
    const p = [
      ...bytesField(1, base32Decode(a.secret) || []),
      ...bytesField(2, toUtf8.encode(a.name || '')),
      ...bytesField(3, toUtf8.encode(a.issuer || '')),
      ...intField(4, { SHA1: 1, SHA256: 2, SHA512: 3 }[a.algorithm] || 1),
      ...intField(5, a.digits === 8 ? 2 : 1),
      ...intField(6, a.type === 'hotp' ? 1 : 2),
      ...(a.type === 'hotp' ? intField(7, a.counter || 0) : []),
    ];
    payload.push(...bytesField(1, p));
  });
  payload.push(...intField(2, 1), ...intField(3, batchSize), ...intField(4, batchIndex), ...intField(5, batchId));
  return `otpauth-migration://offline?data=${encodeURIComponent(b64encode(Uint8Array.from(payload)))}`;
}

/** Export QRs for all accounts, `perQr` accounts each (Google Authenticator's own exports hold about 10). */
export function exportQrs(accounts, perQr = 8) {
  const batches = [];
  for (let i = 0; i < accounts.length; i += perQr) batches.push(accounts.slice(i, i + perQr));
  const batchId = Math.floor(Math.random() * 2 ** 31);
  return batches.map((b, i) => encodeMigration(b, { batchIndex: i, batchSize: batches.length, batchId }));
}

/**
 * Whatever was scanned or pasted: a Google Authenticator export, an
 * otpauth:// link, or a bare setup key. { accounts, batch?, error? }.
 */
export function readScanned(text, { name = '', issuer = '' } = {}) {
  const s = String(text || '').trim();
  if (/^otpauth-migration:/i.test(s)) {
    const m = decodeMigration(s);
    if (!m) return { accounts: [], error: "That export code couldn't be read." };
    return { accounts: m.accounts, batch: { index: m.batchIndex, size: m.batchSize, id: m.batchId }, skipped: m.skipped };
  }
  if (/^otpauth:/i.test(s)) {
    const a = parseOtpauth(s);
    return a ? { accounts: [a] } : { accounts: [], error: "That 2FA link couldn't be read." };
  }
  const key = s.toUpperCase().replace(/[\s=-]/g, '');
  if (key.length >= 16 && base32Decode(key)) {
    return { accounts: [{ type: 'totp', name: name || 'Account', issuer, secret: key, algorithm: 'SHA1', digits: 6, period: 30, counter: 0 }] };
  }
  return { accounts: [], error: "That isn't a 2FA QR code, link or setup key." };
}

/** Same account (to skip duplicates when importing). */
export const sameAccount = (a, b) => a.secret === b.secret && (a.type || 'totp') === (b.type || 'totp');
