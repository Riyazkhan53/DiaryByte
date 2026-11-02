// One verdict for the Setup Check from both readings:
// - the intraday engine (5-minute candles, the same as the Signals tab), which
//   decides: its gates (VWAP, volume, 15-minute trend, risk) must pass;
// - the daily setup (setupScore on daily candles), used as a trend filter:
//   an intraday trade against the daily signal is held back.
// Not financial advice: both are counts of agreeing indicators.

const STATE_SIDE = { 'BUY CANDIDATE': 'long', 'SELL CANDIDATE': 'short' };

/**
 * `daily`: scoreSetup result ({ signal, bullPct, bearPct }).
 * `ev`: engine evaluation from /api/engine/evaluate, or null when there is
 * none (US stocks, server unreachable).
 * Returns { verdict: 'BUY' | 'SELL' | 'WAIT' | 'NO TRADE', source:
 * 'combined' | 'daily', reason, failed: [labels], nextAction, plan }.
 */
export function combineSetup(daily, ev) {
  if (!ev) {
    return {
      verdict: daily.signal,
      source: 'daily',
      reason: `Daily setup only: ${daily.reason}`,
      failed: [],
      nextAction: null,
      plan: null,
    };
  }
  const side = STATE_SIDE[ev.state];
  const dailyWord = daily.signal === 'WAIT' ? 'neutral' : daily.signal === 'BUY' ? 'bullish' : 'bearish';
  const failed = ev.failedConditions || [];

  if (side) {
    const against = (side === 'long' && daily.signal === 'SELL') || (side === 'short' && daily.signal === 'BUY');
    if (against) {
      return {
        verdict: 'WAIT',
        source: 'combined',
        reason: `Intraday says ${side === 'long' ? 'buy' : 'sell'}, but the daily setup is ${dailyWord}: trading against the bigger trend.`,
        failed: ['Daily trend'],
        nextAction: 'Skip it, or wait until the daily setup stops pointing the other way',
        plan: null,
      };
    }
    const verdict = side === 'long' ? 'BUY' : 'SELL';
    return {
      verdict,
      source: 'combined',
      reason:
        daily.signal === verdict
          ? `Intraday ${verdict.toLowerCase()} candidate and the daily setup agrees.`
          : `Intraday ${verdict.toLowerCase()} candidate; the daily setup is neutral, so size small.`,
      failed: [],
      nextAction: ev.nextAction || 'Review the plan; paper trade it only if you agree',
      plan: ev.plan?.ok ? ev.plan : null,
    };
  }

  const closed = failed.includes('Market hours');
  if (closed) {
    return {
      verdict: 'WAIT',
      source: 'combined',
      reason: `NSE is closed, so there is no intraday signal. Daily setup: ${daily.signal} (${dailyWord}).`,
      failed,
      nextAction: 'Check again after 09:15 IST, once a few 5-minute candles have closed',
      plan: null,
    };
  }
  if (ev.state === 'NO TRADE') {
    return {
      verdict: 'NO TRADE',
      source: 'combined',
      reason: (ev.reasons || [])[0] || 'A safety check failed.',
      failed,
      nextAction: ev.nextAction,
      plan: null,
    };
  }
  return {
    verdict: 'WAIT',
    source: 'combined',
    reason:
      ev.state === 'WAIT'
        ? `Intraday setup not confirmed yet. Daily setup: ${daily.signal} (${dailyWord}).`
        : `No intraday setup right now. Daily setup: ${daily.signal} (${dailyWord}).`,
    failed,
    nextAction: ev.nextAction,
    plan: null,
  };
}
