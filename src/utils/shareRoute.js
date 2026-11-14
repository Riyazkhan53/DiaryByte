// Where something shared into DiaryByte goes: OTT shares to Movies (to add
// to the watchlist), everything else to Tickets.
import { isOttShare } from './ottShare';

/** The shared text and link as one string, and the page title shared with it. */
export function sharedText(shareIntent) {
  const text = String(shareIntent?.text || '');
  const url = String(shareIntent?.webUrl || '');
  return { text: url && !text.includes(url) ? `${text}\n${url}`.trim() : text, metaTitle: String(shareIntent?.meta?.title || '') };
}

export function shareTarget(shareIntent) {
  if (!shareIntent) return null;
  const hasImage = (shareIntent.files || []).some((f) => String(f.mimeType || '').startsWith('image/'));
  const { text, metaTitle } = sharedText(shareIntent);
  if (!hasImage && isOttShare(`${text}\n${metaTitle}`)) return '/movies';
  return '/tickets';
}
