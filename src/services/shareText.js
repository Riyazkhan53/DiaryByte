// The text shared along with an image (see modules/share-text). Builds
// without that module (or other platforms) just get null.
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

const ShareText = Platform.OS === 'android' ? requireOptionalNativeModule('ShareText') : null;

/** { text, title, at } for the latest share not read yet, or null. */
export function takeSharedText() {
  try {
    return ShareText?.take?.() || null;
  } catch (_error) {
    return null;
  }
}

export const hasShareTextModule = !!ShareText;
