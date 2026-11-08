// Phone alerts through ntfy (https://ntfy.sh): free, no account or key. The
// app gives each install a long random topic; you subscribe to it in the
// ntfy app and the server posts a message there. Anyone who knows the topic
// can read it, so it's random and kept in your trading settings only.

const NTFY = process.env.NTFY_URL || 'https://ntfy.sh';
const isTopic = (t) => typeof t === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(t);

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const signed = (n) => `${n >= 0 ? '+' : '−'}${money(Math.abs(n))}`;
const sideWord = (side) => (side === 'short' ? 'SHORT' : 'LONG');
const bare = (symbol) => String(symbol || '').replace(/\.(NS|BO)$/i, '');

/** Post one notification. Never throws; resolves to true when ntfy took it. */
async function sendAlert(topic, { title, body, tags = [], priority = 3, click = 'diarybyte://trading' }) {
  if (!isTopic(topic)) return false;
  try {
    // JSON publishing keeps emoji and ₹ intact (header fields must be ASCII).
    const response = await fetch(NTFY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, title, message: body, tags, priority, click }),
      signal: AbortSignal.timeout(8000),
    });
    return response.ok;
  } catch (_error) {
    return false;
  }
}

/** A new BUY/SELL candidate from the scanner. */
function candidateAlert(r) {
  const p = r.plan || {};
  const s = r.score?.[r.side] ?? '';
  return {
    title: `${r.side === 'short' ? '📉' : '📈'} ${sideWord(r.side)} ENTRY · ${bare(r.symbol)}`,
    body: [
      `Entry ~${money(p.entry)} · stop ${money(p.stop)} · target ${money(p.target)}`,
      `Score ${s}/${r.threshold}${p.quantity ? ` · ${p.quantity} share${p.quantity > 1 ? 's' : ''}` : ''}${p.netReward != null ? ` · net ${signed(p.netReward)} at target` : ''}`,
      (r.warnings || [])[0] ? `⚠ ${r.warnings[0]}` : null,
      'Review it in DiaryByte first — it is not an order.',
    ]
      .filter(Boolean)
      .join('\n'),
    tags: [r.side === 'short' ? 'chart_with_downwards_trend' : 'chart_with_upwards_trend'],
    priority: 4,
  };
}

const EXIT_WORD = {
  target: 'hit target 🎯',
  stop: 'hit stop loss',
  trail: 'exited at the trailing stop',
  weak: 'exited: setup broke',
  eod: 'squared off at 15:20',
  time: 'exited on time',
};

/** A paper/demo trade that just closed. */
function closedAlert(t) {
  const win = (t.netPnl || 0) > 0;
  return {
    title: `${win ? '✅' : '❌'} ${bare(t.symbol)} ${t.source === 'demo' ? 'demo' : 'paper'} trade ${EXIT_WORD[t.exitReason] || 'closed'}`,
    body: `${sideWord(t.side)} · exit ${money(t.exitPrice)} · net ${signed(t.netPnl || 0)}${t.r != null ? ` (${t.r >= 0 ? '+' : '−'}${Math.abs(t.r)}R)` : ''} after charges`,
    tags: [win ? 'white_check_mark' : 'x'],
  };
}

/** Roll-call of the watchlist after the first scan of the day (`time` = 'HH:MM' IST). */
function summaryAlert(results, time) {
  const order = { 'BUY CANDIDATE': 0, 'SELL CANDIDATE': 1, WAIT: 2, NEUTRAL: 3, 'NO TRADE': 4 };
  const label = { 'BUY CANDIDATE': 'LONG', 'SELL CANDIDATE': 'SHORT', WAIT: 'WAIT', NEUTRAL: 'NEUTRAL', 'NO TRADE': 'NO TRADE' };
  const rows = results
    .filter((x) => x.state)
    .sort((a, b) => (order[a.state] ?? 9) - (order[b.state] ?? 9))
    .map((x) => `${bare(x.symbol)}: ${label[x.state] || x.state}${x.failedConditions?.length && !x.state.endsWith('CANDIDATE') ? ` (${x.failedConditions.slice(0, 2).join(', ')})` : ''}`);
  return {
    title: `☀️ Watchlist at ${time || 'the open'} IST`,
    body: rows.length ? rows.join('\n') : 'No readings yet — the feed may still be warming up.',
    tags: ['sunny'],
    priority: 2,
  };
}

module.exports = { sendAlert, candidateAlert, closedAlert, summaryAlert, isTopic };
