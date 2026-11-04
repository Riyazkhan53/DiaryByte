// Photos for the Personal Vault: taken with the camera or picked from the
// gallery, shrunk to at most MAX_WIDTH wide and stored as JPEG data URIs
// inside the vault item (so they sync with it). Photos taken here are never
// saved to the phone's gallery.
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export const MAX_PHOTOS = 8;
const MAX_WIDTH = 1600; // keeps text on documents readable
const COMPRESS = 0.6;

async function toDataUri(asset) {
  try {
    const context = ImageManipulator.manipulate(asset.uri);
    if (!asset.width || asset.width > MAX_WIDTH) context.resize({ width: MAX_WIDTH });
    const image = await context.renderAsync();
    const result = await image.saveAsync({ compress: COMPRESS, format: SaveFormat.JPEG, base64: true });
    return `data:image/jpeg;base64,${result.base64}`;
  } catch (_error) {
    // Couldn't shrink it: fall back to the picker's own (compressed) copy.
    return asset.base64 ? `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}` : null;
  }
}

/**
 * Ask for photos: `source` 'camera' or 'library'; at most `room` of them.
 * Returns { photos: [dataUri], error? }.
 */
export async function pickVaultPhotos(source, room = MAX_PHOTOS) {
  if (room <= 0) return { photos: [], error: `Up to ${MAX_PHOTOS} photos per item.` };
  const options = { mediaTypes: ['images'], quality: 0.7, base64: true, exif: false };
  let result;
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { photos: [], error: 'Allow camera access to take a photo.' };
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    result = await ImagePicker.launchImageLibraryAsync({ ...options, allowsMultipleSelection: true, selectionLimit: room });
  }
  if (result.canceled || !result.assets?.length) return { photos: [] };
  const photos = (await Promise.all(result.assets.slice(0, room).map(toDataUri))).filter(Boolean);
  return { photos };
}
