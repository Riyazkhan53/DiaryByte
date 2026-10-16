import { useEffect } from 'react';
import { router, usePathname, useRootNavigationState } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';

/**
 * When something is shared into DiaryByte (Android share sheet), opens My
 * Tickets, which turns it into a pre-filled ticket.
 */
export default function ShareIntentHandler() {
  const { hasShareIntent } = useShareIntentContext();
  const pathname = usePathname();
  const navReady = !!useRootNavigationState()?.key;

  useEffect(() => {
    if (hasShareIntent && navReady && pathname !== '/tickets') router.navigate('/tickets');
  }, [hasShareIntent, navReady, pathname]);

  return null;
}
