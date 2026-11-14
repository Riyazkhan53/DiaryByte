import { useEffect } from 'react';
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

  useEffect(() => {
    if (!hasShareIntent || !navReady) return;
    const target = shareTarget(shareIntent);
    if (target && pathname !== target) router.navigate(target);
  }, [hasShareIntent, shareIntent, navReady, pathname]);

  return null;
}
