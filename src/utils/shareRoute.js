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
  const { text, metaTitle } = sharedText(shareIntent);
  // A message from an OTT app goes to Movies even with an image (Netflix and
  // ZEE5 share a poster along with it); an image on its own is a ticket.
  if (isOttShare(`${text}\n${metaTitle}`)) return '/movies';
  return '/tickets';
}
