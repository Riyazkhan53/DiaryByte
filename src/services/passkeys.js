// Passkeys in the browser (sign in to the DiaryByte web app with the
// device's screen lock). Web only.
import { Platform } from 'react-native';
import { passkeyLoginOptions, passkeyLoginVerify, passkeyRegisterOptions, passkeyRegisterVerify } from './api';

export const passkeysSupported = () =>
  Platform.OS === 'web' && typeof window !== 'undefined' && !!window.PublicKeyCredential && window.isSecureContext !== false;

const browser = () => require('@simplewebauthn/browser');

/** Sign in with a passkey saved for this site: { username, token }. */
export async function signInWithPasskey() {
  const optionsJSON = await passkeyLoginOptions();
  const response = await browser().startAuthentication({ optionsJSON });
  return passkeyLoginVerify(response);
}

/** Save a passkey for this site and this account (signed in). */
export async function addPasskey(name) {
  const optionsJSON = await passkeyRegisterOptions();
  const response = await browser().startRegistration({ optionsJSON });
  return passkeyRegisterVerify(response, name);
}

/** A friendly reason for a browser's passkey error. */
export function passkeyError(e) {
  const name = e?.name || '';
  if (name === 'NotAllowedError') return 'Cancelled, or no passkey for DiaryByte on this device.';
  if (name === 'InvalidStateError') return 'This device already has a passkey for DiaryByte.';
  if (e?.status === 404) return 'The server needs an update for passkeys (redeploy it on Render).';
  return e?.serverMessage || e?.message || "Passkey didn't work. Try again.";
}
