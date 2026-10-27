import { useEffect } from 'react';
import { AppState } from 'react-native';
import { subscribeLocal } from '../services/sync';
import { INVESTMENTS_KEY, processDueSips } from '../services/sipProcessor';

/**
 * Renders nothing. Records SIP installments as their dates come: on launch,
 * when the app is reopened and whenever investments change (e.g. a SIP is
 * set up or a month's amount is edited).
 */
export default function SipService() {
  useEffect(() => {
    const run = () => {
      processDueSips().catch((error) => console.error('SIP processing failed', error));
    };
    run();
    const unsubscribe = subscribeLocal(INVESTMENTS_KEY, run);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    // Tabs and apps can stay open past midnight; check hourly.
    const timer = setInterval(run, 3600000);
    return () => {
      unsubscribe();
      appState.remove();
      clearInterval(timer);
    };
  }, []);

  return null;
}
