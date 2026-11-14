// The title of a shared link's page (e.g. a Netflix "Copy link" share, which
// is only a link with a number in it). Phones can open the page directly;
// on the web the browser blocks it, so this returns '' there.
import { Platform } from 'react-native';
import { titleFromHtml } from '../utils/ottShare';

export async function fetchPageTitle(url, timeoutMs = 7000) {
  if (Platform.OS === 'web' || !/^https?:\/\//i.test(String(url || ''))) return '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'text/html', 'Accept-Language': 'en-IN,en;q=0.9' },
    });
    if (!res.ok) return '';
    // The title is near the top: don't hold on to a huge page.
    return titleFromHtml((await res.text()).slice(0, 300000));
  } catch (_error) {
    return '';
  } finally {
    clearTimeout(timer);
  }
}
