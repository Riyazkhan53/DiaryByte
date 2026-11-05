// Encryption for the Personal Vault, in pure JavaScript (works the same on
// Android, iOS and web, and in Expo Go).
//
// The key comes from the 6-digit vault code via PBKDF2-SHA256 with a random
// salt; each vault item is sealed with AES-256-GCM, bound to its id. The
// server only ever sees ciphertext.
import { gcm } from '@noble/ciphers/aes.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { getRandomBytes } from 'expo-crypto';

// High enough to slow down guessing, low enough to open in a second or two
// on a phone. Stored with the lock, so it can be raised later.
export const KDF_ITERATIONS = 50000;
const VERSION = 'v1';
const VERIFIER_TEXT = 'diarybyte-vault';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ------- base64 (no reliance on btoa/atob being present) -------

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Uint8Array(128);
for (let i = 0; i < ALPHABET.length; i += 1) LOOKUP[ALPHABET.charCodeAt(i)] = i;

export function toBase64(bytes) {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += ALPHABET[n >> 18] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + ALPHABET[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += `${ALPHABET[n >> 18]}${ALPHABET[(n >> 12) & 63]}==`;
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += `${ALPHABET[n >> 18]}${ALPHABET[(n >> 12) & 63]}${ALPHABET[(n >> 6) & 63]}=`;
  }
  return out;
}

export function fromBase64(text) {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let j = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (LOOKUP[clean.charCodeAt(i)] << 18) |
      (LOOKUP[clean.charCodeAt(i + 1)] << 12) |
      ((i + 2 < clean.length ? LOOKUP[clean.charCodeAt(i + 2)] : 0) << 6) |
      (i + 3 < clean.length ? LOOKUP[clean.charCodeAt(i + 3)] : 0);
    bytes[j++] = n >> 16;
    if (i + 2 < clean.length) bytes[j++] = (n >> 8) & 255;
    if (i + 3 < clean.length) bytes[j++] = n & 255;
  }
  return bytes.subarray(0, j);
}

// ------- keys -------

export const newSalt = () => toBase64(getRandomBytes(16));

/** 32-byte key from the code. Takes a moment on purpose. */
export function deriveKey(code, salt, iterations = KDF_ITERATIONS) {
  return pbkdf2Async(sha256, encoder.encode(String(code)), fromBase64(salt), {
    c: iterations,
    dkLen: 32,
    asyncTick: 20, // keep the UI responsive while it runs
  });
}

// ------- sealing -------

function seal(key, text, aad) {
  const nonce = getRandomBytes(12);
  const sealed = gcm(key, nonce, aad ? encoder.encode(aad) : undefined).encrypt(encoder.encode(text));
  return `${VERSION}.${toBase64(nonce)}.${toBase64(sealed)}`;
}

/** The plain text, or null if the key is wrong or the data was tampered with. */
function open(key, payload, aad) {
  try {
    const [version, nonce, sealed] = String(payload).split('.');
    if (version !== VERSION || !nonce || !sealed) return null;
    const plain = gcm(key, fromBase64(nonce), aad ? encoder.encode(aad) : undefined).decrypt(fromBase64(sealed));
    return decoder.decode(plain);
  } catch (_error) {
    return null;
  }
}

/** A small sealed value that proves a key is right, without storing the code. */
export const makeVerifier = (key) => seal(key, VERIFIER_TEXT, 'verifier');
export const checkVerifier = (key, verifier) => open(key, verifier, 'verifier') === VERIFIER_TEXT;

// ------- vault items -------

export const isEncryptedItem = (item) => typeof item?.enc === 'string';

/** { id, enc, createdAt }: everything else (title, details, photos) is sealed. */
export function encryptItem(key, item) {
  const { id, createdAt, enc: _enc, ...secret } = item;
  return { id, enc: seal(key, JSON.stringify(secret), id), createdAt };
}

/** The readable item, or null if this key can't open it. */
export function decryptItem(key, item) {
  if (!isEncryptedItem(item)) return item;
  const text = key ? open(key, item.enc, item.id) : null;
  if (text == null) return null;
  try {
    return { ...JSON.parse(text), id: item.id, createdAt: item.createdAt };
  } catch (_error) {
    return null;
  }
}
