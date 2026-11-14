// Read a ticket with Claude: a shared booking message and/or a screenshot
// (BookMyShow, AbhiBus, redBus, IRCTC, airlines...) → the ticket form's
// fields. Uses structured output, so the reply is always the same JSON.

const Anthropic = require('@anthropic-ai/sdk');

const AnthropicClient = Anthropic.default || Anthropic;
const MODEL = process.env.AI_MODEL || 'claude-opus-5-5';
const MAX_TEXT = 6000;
const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024; // base64 payload cap per image

let client = null;
const getClient = () => (process.env.ANTHROPIC_API_KEY ? (client ||= new AnthropicClient()) : null);

const FIELDS = {
  type: { type: 'string', enum: ['flight', 'train', 'bus', 'movie', 'event', 'other'] },
  title: {
    type: 'string',
    description:
      'Short name for the ticket: the movie or event name; for travel the operator and service, e.g. "IndiGo 6E 2134", "Train 12635 Vaigai Express", "SRS Travels A/C Sleeper"',
  },
  from: { type: 'string', description: 'Travel: departure city or station (empty otherwise)' },
  to: { type: 'string', description: 'Travel: arrival city or station (empty otherwise)' },
  venue: { type: 'string', description: 'Movie/event: theatre or venue with screen/audi if shown (empty for travel)' },
  date: { type: 'string', description: 'Date of the show or departure, YYYY-MM-DD (empty if not shown)' },
  time: { type: 'string', description: 'Show or departure time, 24-hour HH:MM (empty if not shown)' },
  seat: { type: 'string', description: 'Seat(s)/berth(s) exactly as shown, comma-separated, e.g. "H12, H13" or "B2/32/LB"' },
  bookingRef: { type: 'string', description: 'PNR / booking ID / ticket number' },
  note: {
    type: 'string',
    description:
      'Other useful details in one or two short lines: boarding point and time, drop point, passenger names, coach/class, gate, amount paid. Empty if none.',
  },
};
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...Object.keys(FIELDS), 'found'],
  properties: { ...FIELDS, found: { type: 'boolean', description: 'false if this is not a ticket or booking at all' } },
};

const SYSTEM = `You read tickets and booking confirmations for a personal tickets app in India: bus (AbhiBus, redBus, state transport), train (IRCTC), flights, movies and events (BookMyShow, District, Paytm, PVR, INOX).
Fill every field from what the ticket shows. Rules:
- Copy values exactly as printed (PNR, seats, names). Never invent anything: use "" for anything not shown.
- date: the journey/show date (not the booking date), as YYYY-MM-DD. If the year isn't shown, use the next such date on or after today.
- time: departure or show time (not the reporting or boarding time), 24-hour HH:MM.
- For buses, put the boarding point and boarding time, and the drop point, in note.
- found=false only when the input is clearly not a ticket.`;

const DATA_URI = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/;

/**
 * Read a ticket: `text` (shared message) and/or `image` (data URI). Returns
 * { found, fields: { type, title, from, to, venue, date, time, seat,
 * bookingRef, note } } with only the fields that were found.
 */
async function readTicket({ text, image, today }) {
  const anthropic = getClient();
  if (!anthropic) {
    throw Object.assign(new Error('AI is not set up yet: add ANTHROPIC_API_KEY in your Render service settings.'), { status: 503, code: 'not_configured' });
  }
  const content = [];
  if (image) {
    const m = String(image).match(DATA_URI);
    if (!m) throw Object.assign(new Error('The image must be a JPEG, PNG or WebP picture'), { status: 400 });
    const data = m[2].replace(/\s/g, '');
    if (data.length > MAX_IMAGE_BYTES) throw Object.assign(new Error('The image is too large'), { status: 413 });
    content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data } });
  }
  const message = String(text || '').trim().slice(0, MAX_TEXT);
  if (!content.length && !message) throw Object.assign(new Error('Nothing to read'), { status: 400 });
  const day = /^\d{4}-\d{2}-\d{2}$/.test(today || '') ? today : new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  content.push({
    type: 'text',
    text: `Today is ${day}.${message ? `\n\nShared message:\n${message}` : ''}\n\nRead this ticket.`,
  });

  const response = await anthropic.beta.messages.create({
    model: MODEL,
    max_tokens: 2000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content }],
  });
  if (response.stop_reason === 'refusal') throw Object.assign(new Error("The AI couldn't read this one."), { status: 422 });
  const raw = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_error) {
    throw Object.assign(new Error("The AI's answer couldn't be read. Try again."), { status: 502 });
  }
  const fields = {};
  Object.keys(FIELDS).forEach((k) => {
    const v = typeof parsed[k] === 'string' ? parsed[k].trim() : '';
    if (v) fields[k] = v.slice(0, k === 'note' ? 400 : 120);
  });
  if (fields.date && !/^\d{4}-\d{2}-\d{2}$/.test(fields.date)) delete fields.date;
  if (fields.time && !/^\d{2}:\d{2}$/.test(fields.time)) delete fields.time;
  return { found: parsed.found !== false, fields, model: response.model };
}

module.exports = { readTicket, SCHEMA };
