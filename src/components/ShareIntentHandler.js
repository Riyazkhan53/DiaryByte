import { useEffect, useRef } from 'react';
import { router, usePathname, useRootNavigationState } from 'expo-router';
import { useAppShare } from './AppShareProvider';
import { sharedText, shareTarget } from '../utils/shareRoute';
import { ottPlatform } from '../utils/ottShare';
import { recordShare, recordStep } from '../utils/shareLog';

/**
 * When something is shared into DiaryByte (Android share sheet): a share
 * from an OTT app opens Movies (Add to Watchlist), anything else opens My
 * Tickets, which turns it into a pre-filled ticket.
 */
export default function ShareIntentHandler() {
  const { hasShareIntent, shareIntent, error } = useAppShare();
  const pathname = usePathname();
  const navReady = !!useRootNavigationState()?.key;

  // Go to the right screen once per share. (Re-checking on every screen
  // change would pull you back there whenever you open another tab, if
  // that screen hadn't finished with the share.)
  const handled = useRef(null);
  useEffect(() => {
    if (!hasShareIntent) {
      handled.current = null;
      return;
    }
    if (!navReady || handled.current === shareIntent) return;
    handled.current = shareIntent;
    const target = shareTarget(shareIntent);
    const { text } = sharedText(shareIntent);
    recordShare({
      text: text.slice(0, 300),
      files: (shareIntent?.files || []).map((f) => f.mimeType).join(', '),
      app: ottPlatform(text),
      target,
      from: pathname,
    });
    // OTT shares open "Add to Watchlist" where you are (OttShareHost).
    if (target === '/tickets' && pathname !== target) {
      recordStep(`navigating to ${target}`);
      router.navigate(target);
      setTimeout(() => recordStep(`opened ${target}`), 400);
    }
  }, [hasShareIntent, shareIntent, navReady, pathname]);

  // The share library couldn't read what was shared.
  useEffect(() => {
    if (error) recordShare({ error: String(error).slice(0, 300) });
  }, [error]);

  return null;
}
