// IPO Watch: Indian IPOs (open, upcoming, just listed) found by Claude with
// web search, a per-IPO review (Apply / Neutral / Avoid), and free news
// headlines from Google News' search feed.
//
// There is no free official IPO API, so Claude searches public pages and
// reports what it found through a strict "report" tool. Results are cached
// in MongoDB (ipocache) so repeat opens cost nothing: the list for 6 hours,
// a review for 3 hours while bidding is open (12 hours otherwise).

const Anthropic = require('@anthropic-ai/sdk');
const { getModel } = require('../models');

const AnthropicClient = Anthropic.default || Anthropic;
const MODEL = process.env.AI_MODEL || 'claude-opus-5-5';
const EFFORT = ['low', 'medium', 'high', 'xhigh', 'max'].includes(process.env.AI_EFFORT) ? process.env.AI_EFFORT : 'medium';
const LIST_TTL_MS = 6 * 3600 * 1000;
const REVIEW_TTL_OPEN_MS = 3 * 3600 * 1000;
const REVIEW_TTL_MS = 12 * 3600 * 1000;
const NEWS_TTL_MS = 30 * 60 * 1000;
const MAX_STEPS = 6;

let client = null;
const getClient = () => (process.env.ANTHROPIC_API_KEY ? (client ||= new AnthropicClient()) : null);

let scoreModule;
const scoring = () => (scoreModule ||= import('../../src/utils/ipoScore.js'));

const istDate = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const slug = (name) =>
  String(name || '')
    .toLowerCase()
    .replace(/\b(limited|ltd|ipo|india|private)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

// ---------------- the report tools (strict schemas) ----------------

const nullable = (type) => ({ type: [type, 'null'] });
const IPO_FIELDS = {
  name: { type: 'string', description: 'Company name as listed, without "IPO"' },
  board: { type: 'string', enum: ['mainboard', 'sme'] },
  status: { type: 'string', enum: ['upcoming', 'open', 'closed', 'listed'], description: 'closed = bidding over, not yet listed' },
  open_date: { ...nullable('string'), description: 'YYYY-MM-DD' },
  close_date: { ...nullable('string'), description: 'YYYY-MM-DD' },
  listing_date: { ...nullable('string'), description: 'YYYY-MM-DD (expected or actual)' },
  price_low: { ...nullable('number'), description: '₹ per share, lower end of the price band' },
  price_high: { ...nullable('number'), description: '₹ per share, upper end of the price band' },
  lot_size: { ...nullable('integer'), description: 'Shares per lot (minimum bid)' },
  issue_size_cr: { ...nullable('number'), description: 'Issue size in ₹ crore' },
  sub_overall: { ...nullable('number'), description: 'Times subscribed, overall' },
  sub_qib: nullable('number'),
  sub_nii: nullable('number'),
  sub_retail: nullable('number'),
  sub_as_of: { ...nullable('string'), description: 'When the subscription figures are from, e.g. "14 Nov, 5 pm"' },
  gmp: { ...nullable('number'), description: 'Grey market premium, ₹ per share, latest reported' },
  gmp_as_of: nullable('string'),
  listing_price: { ...nullable('number'), description: 'For listed IPOs: listing-day open price, ₹' },
};
const IPO_REQUIRED = Object.keys(IPO_FIELDS);

const LIST_TOOL = {
  name: 'report_ipos',
  description: 'Report the IPOs you found. Call this once, at the end, with every IPO.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['ipos'],
    properties: {
      ipos: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [...IPO_REQUIRED, 'one_line'],
          properties: { ...IPO_FIELDS, one_line: { type: 'string', description: 'What the company does, under 12 words' } },
        },
      },
    },
  },
};

const REVIEW_TOOL = {
  name: 'report_review',
  description: 'Report your review of this IPO. Call this once, at the end.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: [...IPO_REQUIRED, 'verdict', 'confidence', 'summary', 'reasons', 'risks', 'business', 'financials', 'valuation'],
    properties: {
      ...IPO_FIELDS,
      verdict: { type: 'string', enum: ['APPLY', 'NEUTRAL', 'AVOID'] },
      confidence: { type: 'integer', description: '0–100: how sure you are of the verdict, given the evidence found' },
      summary: { type: 'string', description: 'Two or three sentences: the verdict and the main reason' },
      reasons: { type: 'array', items: { type: 'string' }, description: '3–5 points for the verdict, with numbers' },
      risks: { type: 'array', items: { type: 'string' }, description: '2–4 risks, including any from recent news' },
      business: { type: 'string', description: 'What the company does, one or two sentences' },
      financials: { type: 'string', description: 'Revenue, profit and their growth, debt, in one or two sentences' },
      valuation: { type: 'string', description: 'P/E or other valuation vs listed peers, one or two sentences' },
    },
  },
};

const RULES = `Rules:
- Indian IPOs only (NSE / BSE, mainboard and SME).
- Report only numbers you found in the search results. Use null for anything you could not find; never estimate or recall figures from memory.
- Subscription and GMP change during the day: give the time they are from.
- Dates as YYYY-MM-DD. Money in ₹.
- Grey market premium (GMP) is unofficial; report it only from pages that state it.`;

const LIST_SYSTEM = `You find Indian IPOs for an investor's tracking app, using web search, and report them with the report_ipos tool.

Find: every mainboard IPO that is open for bidding now or opens in the next 14 days, ones that closed in the last 7 days, and ones that listed in the last 10 days; plus SME IPOs open now that are widely covered. Search IPO calendar and subscription pages (for example chittorgarh.com, ipocentral.in, moneycontrol.com, economictimes.indiatimes.com, nseindia.com, bseindia.com) and keep searches few and focused.
${RULES}`;

const REVIEW_SYSTEM = `You review one Indian IPO for an individual investor deciding whether to apply, using web search, and report with the report_review tool.

Look up: the price band, lot size and dates; the latest subscription by category (QIB, NII, retail) and grey market premium; the business, its financials (revenue, profit, growth, debt) and valuation against listed peers; how the money raised is used (fresh issue vs offer for sale); and recent news (anchor investors, controversies, analyst views).

The verdict is for applying in the IPO (listing gains and holding), as decision support, not an order:
- APPLY: strong institutional demand, fair valuation and sound financials.
- AVOID: weak demand, stretched valuation, mostly offer-for-sale with weak numbers, or serious red flags in the news.
- NEUTRAL: mixed signals, or not enough data yet (say what to wait for).
Confidence should be low when key data (subscription, financials) is missing.
${RULES}`;

// ---------------- one research run ----------------

function collectSources(messages) {
  const seen = new Map();
  messages.forEach((m) => {
    if (m.role !== 'assistant' || !Array.isArray(m.content)) return;
    m.content.forEach((b) => {
      if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
        b.content.forEach((r) => r?.url && !seen.has(r.url) && seen.set(r.url, { url: r.url, title: r.title || r.url }));
      }
    });
  });
  return [...seen.values()].slice(0, 10);
}

/** Search with Claude until it calls `tool`; returns { input, sources, searches, model }. */
async function research(system, prompt, tool, maxSearches) {
  const anthropic = getClient();
  if (!anthropic) {
    throw Object.assign(new Error('AI is not set up yet: add ANTHROPIC_API_KEY in your Render service settings.'), { status: 503, code: 'not_configured' });
  }
  const tools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: maxSearches }, tool];
  const messages = [{ role: 'user', content: prompt }];
  let searches = 0;
  let model = MODEL;
  for (let step = 0; step < MAX_STEPS; step += 1) {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: EFFORT },
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      tools,
      messages,
    });
    model = response.model || model;
    searches += response.usage?.server_tool_use?.web_search_requests || 0;
    if (response.stop_reason === 'refusal') throw Object.assign(new Error('The AI declined this search. Try again later.'), { status: 502 });
    messages.push({ role: 'assistant', content: response.content });
    const call = response.content.find((b) => b.type === 'tool_use' && b.name === tool.name);
    if (call) return { input: call.input, sources: collectSources(messages), searches, model };
    // Paused mid-search: send the turn back as is and it carries on.
    if (response.stop_reason === 'pause_turn') continue;
    const others = response.content.filter((b) => b.type === 'tool_use');
    if (others.length) {
      messages.push({
        role: 'user',
        content: others.map((b) => ({ type: 'tool_result', tool_use_id: b.id, content: `Unknown tool. Use ${tool.name}.`, is_error: true })),
      });
      continue;
    }
    messages.push({ role: 'user', content: `Now call ${tool.name} with what you found (null for anything missing).` });
  }
  throw Object.assign(new Error("The search didn't finish. Try again."), { status: 502 });
}

// ---------------- shaping ----------------

const n = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const s = (x) => (typeof x === 'string' && x.trim() ? x.trim() : null);

function shapeIpo(r, score) {
  const ipo = {
    id: slug(r.name),
    name: s(r.name) || 'Unknown',
    board: r.board === 'sme' ? 'sme' : 'mainboard',
    status: ['upcoming', 'open', 'closed', 'listed'].includes(r.status) ? r.status : 'upcoming',
    openDate: s(r.open_date),
    closeDate: s(r.close_date),
    listingDate: s(r.listing_date),
    priceLow: n(r.price_low),
    priceHigh: n(r.price_high),
    lotSize: n(r.lot_size),
    issueSizeCr: n(r.issue_size_cr),
    subscription:
      [r.sub_overall, r.sub_qib, r.sub_nii, r.sub_retail].some((x) => n(x) != null)
        ? { overall: n(r.sub_overall), qib: n(r.sub_qib), nii: n(r.sub_nii), retail: n(r.sub_retail), asOf: s(r.sub_as_of) }
        : null,
    gmp: n(r.gmp),
    gmpAsOf: s(r.gmp_as_of),
    listingPrice: n(r.listing_price),
    oneLine: s(r.one_line),
  };
  ipo.minAmount = ipo.priceHigh && ipo.lotSize ? Math.round(ipo.priceHigh * ipo.lotSize) : null;
  const sc = score.ipoScore(ipo);
  ipo.score = sc;
  ipo.gmpPct = score.gmpPct(ipo);
  if (ipo.status === 'listed' && ipo.listingPrice && ipo.priceHigh) {
    ipo.listingGainPct = Math.round(((ipo.listingPrice - ipo.priceHigh) / ipo.priceHigh) * 1000) / 10;
  }
  return ipo;
}

const ORDER = { open: 0, upcoming: 1, closed: 2, listed: 3 };

// ---------------- cache (MongoDB) ----------------

const cacheGet = async (id) => getModel('ipocache').findOne({ id }).lean();
const cacheSet = async (id, data) =>
  getModel('ipocache').updateOne({ id }, { $set: { id, data, fetchedAt: new Date().toISOString(), loggedAt: new Date() } }, { upsert: true });

const inflight = new Map();
const once = (key, fn) => {
  if (!inflight.has(key)) inflight.set(key, fn().finally(() => inflight.delete(key)));
  return inflight.get(key);
};

// ---------------- public functions ----------------

/** { ipos, fetchedAt, sources, cached } */
async function listIpos({ refresh = false } = {}) {
  const cached = await cacheGet('list').catch(() => null);
  if (cached && !refresh && Date.now() - Date.parse(cached.fetchedAt) < LIST_TTL_MS) {
    return { ...cached.data, fetchedAt: cached.fetchedAt, cached: true };
  }
  return once('list', async () => {
    const score = await scoring();
    const today = istDate();
    const out = await research(LIST_SYSTEM, `Today is ${today} (India). Find the IPOs and report them.`, LIST_TOOL, 6);
    const seen = new Set();
    const ipos = (out.input.ipos || [])
      .map((r) => shapeIpo(r, score))
      .filter((i) => i.id && !seen.has(i.id) && seen.add(i.id))
      .sort((a, b) => ORDER[a.status] - ORDER[b.status] || String(a.openDate || '9').localeCompare(String(b.openDate || '9')));
    const data = { ipos, sources: out.sources, searches: out.searches, model: out.model, today };
    await cacheSet('list', data).catch((e) => console.error('[ipo] cache write failed', e.message));
    return { ...data, fetchedAt: new Date().toISOString(), cached: false };
  });
}

/** { review, fetchedAt, cached } for one IPO by name. */
async function reviewIpo(name, { refresh = false } = {}) {
  const clean = String(name || '').trim().slice(0, 80);
  const id = slug(clean);
  if (!id) throw Object.assign(new Error('Which IPO?'), { status: 400 });
  const key = `review:${id}`;
  const cached = await cacheGet(key).catch(() => null);
  if (cached && !refresh) {
    const ttl = cached.data?.review?.status === 'open' ? REVIEW_TTL_OPEN_MS : REVIEW_TTL_MS;
    if (Date.now() - Date.parse(cached.fetchedAt) < ttl) return { ...cached.data, fetchedAt: cached.fetchedAt, cached: true };
  }
  return once(key, async () => {
    const score = await scoring();
    const today = istDate();
    const out = await research(REVIEW_SYSTEM, `Today is ${today} (India). Review the IPO of: ${clean}`, REVIEW_TOOL, 8);
    const r = out.input;
    const review = {
      ...shapeIpo(r, score),
      verdict: ['APPLY', 'NEUTRAL', 'AVOID'].includes(r.verdict) ? r.verdict : 'NEUTRAL',
      confidence: Math.max(0, Math.min(100, Math.round(Number(r.confidence) || 0))),
      summary: s(r.summary) || '',
      reasons: (r.reasons || []).filter(s).slice(0, 6),
      risks: (r.risks || []).filter(s).slice(0, 5),
      business: s(r.business),
      financials: s(r.financials),
      valuation: s(r.valuation),
    };
    const data = { review, sources: out.sources, searches: out.searches, model: out.model };
    await cacheSet(key, data).catch((e) => console.error('[ipo] cache write failed', e.message));
    return { ...data, fetchedAt: new Date().toISOString(), cached: false };
  });
}

// ---------------- news (Google News search feed; free) ----------------

const decode = (t) =>
  String(t || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();

/** Parse an RSS feed's items: [{ title, url, source, publishedAt }]. */
function parseRss(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml))) {
    const block = m[1];
    const tag = (name) => decode((block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)) || [])[1]);
    const source = tag('source');
    let title = tag('title');
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    const pub = Date.parse(tag('pubDate'));
    items.push({ title, url: tag('link'), source: source || null, publishedAt: Number.isFinite(pub) ? new Date(pub).toISOString() : null });
  }
  return items.filter((i) => i.title && /^https?:\/\//.test(i.url));
}

const newsCache = new Map();

/** Latest headlines about an IPO, newest first (up to 6). */
async function ipoNews(name) {
  const q = String(name || '').trim().slice(0, 80);
  if (!q) return [];
  const hit = newsCache.get(q.toLowerCase());
  if (hit && Date.now() - hit.at < NEWS_TTL_MS) return hit.items;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`"${q}" IPO`)}&hl=en-IN&gl=IN&ceid=IN:en`;
  const res = await fetch(url, { headers: { Accept: 'application/rss+xml' }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`News feed answered ${res.status}`);
  const items = parseRss(await res.text())
    .sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')))
    .slice(0, 6);
  newsCache.set(q.toLowerCase(), { at: Date.now(), items });
  return items;
}

module.exports = { listIpos, reviewIpo, ipoNews, configured: () => !!process.env.ANTHROPIC_API_KEY, _test: { parseRss, slug, shapeIpo } };
