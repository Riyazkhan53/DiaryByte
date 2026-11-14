// Files for Personal Documents: pictures and PDFs picked from the phone's
// file picker (which lists Google Drive, Downloads, Photos…), the camera or
// the gallery. Pictures are shrunk to a readable JPEG; PDFs are kept as they
// are (up to MAX_PDF_BYTES). Everything ends up as a data URI inside the
// document, which is encrypted with the vault code before it's saved.
import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { pickVaultPhotos } from './vaultPhotos';

export const MAX_FILES = 6;
export const MAX_PDF_BYTES = 2.5 * 1024 * 1024;
const IMAGE_WIDTH = 1600; // keeps the small print on an ID readable

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function shrinkImage(uri, width) {
  const context = ImageManipulator.manipulate(uri);
  if (!width || width > IMAGE_WIDTH) context.resize({ width: IMAGE_WIDTH });
  const image = await context.renderAsync();
  const result = await image.saveAsync({ compress: 0.65, format: SaveFormat.JPEG, base64: true });
  return `data:image/jpeg;base64,${result.base64}`;
}

/** A local file (file://, blob: on the web) as a data URI. */
async function readDataUri(uri, mime) {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]*;/, `data:${mime};`));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
  const base64 = await new File(uri).base64();
  return `data:${mime};base64,${base64}`;
}

/**
 * Pick from files (Google Drive, Downloads…): pictures and PDFs, up to
 * `room`. Returns { files: [{ id, kind: 'image' | 'pdf', name, data }], error? }.
 */
export async function pickFromFiles(room = MAX_FILES) {
  if (room <= 0) return { files: [], error: `Up to ${MAX_FILES} files per document.` };
  const result = await DocumentPicker.getDocumentAsync({
    type: ['image/*', 'application/pdf'],
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.length) return { files: [] };
  const files = [];
  const skipped = [];
  for (const asset of result.assets.slice(0, room)) {
    const mime = asset.mimeType || (/\.pdf$/i.test(asset.name || '') ? 'application/pdf' : 'image/jpeg');
    try {
      if (mime === 'application/pdf') {
        if (asset.size && asset.size > MAX_PDF_BYTES) {
          skipped.push(`${asset.name} is over ${Math.round(MAX_PDF_BYTES / 1048576 * 10) / 10} MB`);
          continue;
        }
        files.push({ id: newId(), kind: 'pdf', name: asset.name || 'Document.pdf', data: await readDataUri(asset.uri, 'application/pdf') });
      } else if (mime.startsWith('image/')) {
        files.push({ id: newId(), kind: 'image', name: asset.name || 'Photo.jpg', data: await shrinkImage(asset.uri, asset.width) });
      } else {
        skipped.push(`${asset.name} isn't a picture or PDF`);
      }
    } catch (_error) {
      skipped.push(`Couldn't read ${asset.name || 'a file'}`);
    }
  }
  return { files, error: skipped.length ? skipped.join('; ') : undefined };
}

/** Camera or gallery pictures (reuses the vault's photo picker). */
export async function pickPhotos(source, room = MAX_FILES) {
  const { photos, error } = await pickVaultPhotos(source, room);
  return { files: photos.map((data, i) => ({ id: newId(), kind: 'image', name: `Photo ${i + 1}.jpg`, data })), error };
}

const safeName = (name) => String(name || 'document').replace(/[^\w.\- ]+/g, '_').slice(0, 60);

/**
 * Open or share a document's file with another app (a PDF viewer,
 * WhatsApp, email…). On the web it opens in a new tab.
 */
export async function shareDocFile(file) {
  const mime = file.kind === 'pdf' ? 'application/pdf' : 'image/jpeg';
  if (Platform.OS === 'web') {
    const win = window.open();
    if (win) win.document.write(`<iframe src="${file.data}" style="border:0;width:100%;height:100%"></iframe>`);
    return;
  }
  const ext = file.kind === 'pdf' ? '.pdf' : '.jpg';
  const name = safeName(file.name).replace(/\.(pdf|jpe?g|png)$/i, '') + ext;
  const out = new File(Paths.cache, name);
  if (out.exists) out.delete();
  out.write(file.data.replace(/^data:[^,]*,/, ''), { encoding: 'base64' });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(out.uri, { mimeType: mime, dialogTitle: file.name });
}
