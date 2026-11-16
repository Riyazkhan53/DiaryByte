// Keeps a free Render instance awake. Render's free plan stops a web service
// after 15 minutes without incoming requests, and the trading scanner (and
// its phone alerts) stops with it. A request to the service's own public
// address counts as incoming traffic, so the server calls its health check
// every 10 minutes. (It can't wake itself once asleep: an outside pinger such
// as cron-job.org covers that.)
//
// On only on Render (RENDER_EXTERNAL_URL is set there). KEEP_AWAKE=off turns
// it off, e.g. on a paid instance that never sleeps.

const EVERY_MS = 10 * 60 * 1000;

function startKeepAwake({ url = process.env.RENDER_EXTERNAL_URL, every = EVERY_MS, fetchImpl = globalThis.fetch } = {}) {
  if (!url || String(process.env.KEEP_AWAKE || '').toLowerCase() === 'off') return null;
  const target = `${String(url).replace(/\/+$/, '')}/api/health`;
  const ping = () =>
    fetchImpl(target, { headers: { 'User-Agent': 'diarybyte-keep-awake' }, signal: AbortSignal.timeout(20000) })
      .then((r) => r.ok || console.warn(`[keep-awake] health answered ${r.status}`))
      .catch((e) => console.warn('[keep-awake] ping failed', e.message));
  const timer = setInterval(ping, every);
  timer.unref();
  console.log(`[keep-awake] pinging ${target} every ${Math.round(every / 60000)} min`);
  return timer;
}

module.exports = { startKeepAwake };
