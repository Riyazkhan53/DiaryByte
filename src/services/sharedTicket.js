// Turns something shared into DiaryByte from another app (a booking message,
// a link, a ticket screenshot) into fields for the ticket form, and shrinks
// ticket images so they stay light to store and sync.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { parseBookingText } from '../utils/ticketShare';

// Ticket images sync to the server inside the collection: keep each one
// around 100–300 KB. The width is enough for a QR code and the text on it.
const MAX_IMAGE_WIDTH = 1000;
const MAX_NOTE = 400;

/**
 * A small JPEG data URI of an image (file path, file:// or content:// URI,
 * or data URI), at most MAX_IMAGE_WIDTH wide.
 */
export async function shrinkTicketImage(uri, width = 0) {
  const context = ImageManipulator.manipulate(uri);
  if (!width || width > MAX_IMAGE_WIDTH) context.resize({ width: MAX_IMAGE_WIDTH });
  const image = await context.renderAsync();
  const result = await image.saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true });
  return `data:image/jpeg;base64,${result.base64}`;
}

/**
 * Fields read from the shared text at once (fast, offline), and the shared
 * image file if there is one (to shrink and read afterwards).
 */
export function quickFieldsFromShare(shareIntent) {
  const text = shareIntent?.text || shareIntent?.webUrl || '';
  const fields = parseBookingText(text, { metaTitle: shareIntent?.meta?.title || '' });
  if (!fields.link && shareIntent?.webUrl) fields.link = shareIntent.webUrl;
  // Keep the original message as the note, in case anything was missed.
  const note = text.replace(/https?:\/\/\S+/gi, '').replace(/[ \t]+/g, ' ').trim();
  if (note) fields.note = note.slice(0, MAX_NOTE);
  const file = shareIntent?.files?.find((f) => f.mimeType?.startsWith('image/')) || null;
  return { fields, text, file };
}

/** Everything from a share in one go (kept for callers that want a single step). */
export async function ticketFromShare(shareIntent) {
  const { fields, file } = quickFieldsFromShare(shareIntent);
  if (file) {
    try {
      fields.image = await shrinkTicketImage(file.path, file.width);
    } catch {
      // Unreadable image: keep the rest of the ticket.
    }
  }
  return fields;
}
