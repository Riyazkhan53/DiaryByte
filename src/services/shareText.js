// What's shared into DiaryByte (Android share sheet), from the app's own
// native module (modules/share-text). Other platforms, or builds without
// the module, get nothing.
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

const ShareText = Platform.OS === 'android' ? requireOptionalNativeModule('ShareText') : null;

/** { text, title, type, files: [{ path, mimeType, fileName, size }], at } for the latest share not read yet, or null. */
export function takeShare() {
  try {
    return ShareText?.take?.() || null;
  } catch (_error) {
    return null;
  }
}

/** Called when a share arrives while the app is running. Returns an unsubscribe function. */
export function onShare(listener) {
  try {
    const sub = ShareText?.addListener?.('onShare', listener);
    return () => sub?.remove?.();
  } catch (_error) {
    return () => {};
  }
}

/** How many times Android has created the app's window so far (0 if unknown). */
export function activityCreates() {
  try {
    return Number(ShareText?.activityCreates?.() || 0);
  } catch (_error) {
    return 0;
  }
}

export const hasShareModule = !!ShareText;
