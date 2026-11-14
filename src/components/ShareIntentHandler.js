import { useEffect, useRef } from 'react';
import { router, usePathname, useRootNavigationState } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { shareTarget } from '../utils/shareRoute';

/**
 * When something is shared into DiaryByte (Android share sheet): a share
 * from an OTT app opens Movies (Add to Watchlist), anything else opens My
 * Tickets, which turns it into a pre-filled ticket.
 */
export default function ShareIntentHandler() {
  const { hasShareIntent, shareIntent } = useShareIntentContext();
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
    if (target && pathname !== target) router.navigate(target);
  }, [hasShareIntent, shareIntent, navReady, pathname]);

  return null;
}
