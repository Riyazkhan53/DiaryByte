// Read a share from an OTT app (Netflix, Prime Video, JioHotstar...) with
// Claude: which title it is. Used only when the user asks (the app reads
// shares by itself first, with formats it has learned).

const Anthropic = require('@anthropic-ai/sdk');

const AnthropicClient = Anthropic.default || Anthropic;
const MODEL = process.env.AI_MODEL || 'claude-opus-5-5';
const MAX_TEXT = 3000;

let client = null;
const getClient = () => (process.env.ANTHROPIC_API_KEY ? (client ||= new AnthropicClient()) : null);

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['found', 'title', 'year', 'type', 'platform'],
  properties: {
    found: { type: 'boolean', description: 'false if this is not about a movie or show at all' },
    title: { type: 'string', description: 'The movie or show title exactly as it is commonly known (no platform name, no "Watch")' },
    year: { type: 'string', description: 'Release year if shown or certain, else ""' },
    type: { type: 'string', enum: ['movie', 'series', 'unknown'] },
    platform: { type: 'string', description: 'Streaming platform, e.g. Netflix, Prime Video, JioHotstar, Sony LIV, ZEE5, aha, Sun NXT; "" if unclear' },
  },
};

const SYSTEM = `You read what someone shared from a streaming app (Netflix, Prime Video, JioHotstar, Sony LIV, ZEE5, aha, Sun NXT, YouTube...) to add it to their watchlist.
Work out the movie or show from the message, the page title and the link (URL slugs often contain the title).
Never invent a title: if it can't be told, set found=false and title="".`;

async function readOttShare({ text, metaTitle }) {
  const anthropic = getClient();
  if (!anthropic) {
    throw Object.assign(new Error('AI is not set up yet: add ANTHROPIC_API_KEY in your Render service settings.'), { status: 503, code: 'not_configured' });
  }
  const message = String(text || '').trim().slice(0, MAX_TEXT);
  const page = String(metaTitle || '').trim().slice(0, 300);
  if (!message && !page) throw Object.assign(new Error('Nothing to read'), { status: 400 });
  const response = await anthropic.beta.messages.create({
    model: MODEL,
    max_tokens: 800,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: `Shared message:\n${message || '(none)'}${page ? `\n\nPage title: ${page}` : ''}` }],
  });
  if (response.stop_reason === 'refusal') throw Object.assign(new Error("The AI couldn't read this one."), { status: 422 });
  const raw = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_error) {
    throw Object.assign(new Error("The AI's answer couldn't be read. Try again."), { status: 502 });
  }
  const clean = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const year = /^\d{4}$/.test(clean(parsed.year, 4)) ? clean(parsed.year, 4) : '';
  return {
    found: parsed.found !== false && !!clean(parsed.title, 120),
    title: clean(parsed.title, 120),
    year,
    type: ['movie', 'series'].includes(parsed.type) ? parsed.type : '',
    platform: clean(parsed.platform, 40),
    model: response.model,
  };
}

module.exports = { readOttShare, SCHEMA };
