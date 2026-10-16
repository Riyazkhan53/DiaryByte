// Turns something shared into DiaryByte from another app (a booking message,
// a link, a ticket screenshot) into fields for the ticket form.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { parseBookingText } from '../utils/ticketShare';

// Ticket images sync to the server inside the collection, so keep them small.
const MAX_IMAGE_WIDTH = 1080;
const MAX_NOTE = 400;

async function imageToDataUri(file) {
  const context = ImageManipulator.manipulate(file.path);
  if (!file.width || file.width > MAX_IMAGE_WIDTH) context.resize({ width: MAX_IMAGE_WIDTH });
  const image = await context.renderAsync();
  const result = await image.saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true });
  return `data:image/jpeg;base64,${result.base64}`;
}

export async function ticketFromShare(shareIntent) {
  const text = shareIntent.text || shareIntent.webUrl || '';
  const fields = parseBookingText(text, { metaTitle: shareIntent.meta?.title || '' });
  if (!fields.link && shareIntent.webUrl) fields.link = shareIntent.webUrl;

  // Keep the original message as the note, in case anything was missed.
  const note = text.replace(/https?:\/\/\S+/gi, '').replace(/[ \t]+/g, ' ').trim();
  if (note) fields.note = note.slice(0, MAX_NOTE);

  const file = shareIntent.files?.find((f) => f.mimeType?.startsWith('image/'));
  if (file) {
    try {
      fields.image = await imageToDataUri(file);
    } catch {
      // Unreadable image: keep the rest of the ticket.
    }
  }
  return fields;
}
