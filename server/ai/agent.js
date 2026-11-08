// StockByte AI and InvestByte AI: Claude agents that answer with tools over
// DiaryByte's own data (see ./tools.js). The API key stays on this server
// (ANTHROPIC_API_KEY); the app only sends the chat.
//
// Model and effort can be changed without code: AI_MODEL (default
// claude-opus-5-5) and AI_EFFORT (low | medium | high; default medium).

const Anthropic = require('@anthropic-ai/sdk');
const { stockTools, investTools } = require('./tools');

const AnthropicClient = Anthropic.default || Anthropic;
const MODEL = process.env.AI_MODEL || 'claude-opus-5-5';
const EFFORT = ['low', 'medium', 'high', 'xhigh', 'max'].includes(process.env.AI_EFFORT) ? process.env.AI_EFFORT : 'medium';
const MAX_STEPS = 8; // tool rounds per question
const MAX_HISTORY = 16; // earlier chat turns sent along
const MAX_CHARS = 4000; // per user message

let client = null;
const getClient = () => {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return (client ||= new AnthropicClient());
};
const configured = () => !!process.env.ANTHROPIC_API_KEY;

const COMMON = `
House rules:
- Use your tools for every number you state (prices, scores, returns, values). Never guess or recall prices from memory. If a tool fails or data is missing or stale, say so plainly.
- You give decision support for the user's own money, not orders or guarantees. Be direct and specific, but never promise profits. Keep one short line of caution at most — no boilerplate disclaimers.
- Currency is ₹ (Indian format, e.g. ₹1,25,000) unless the item is in dollars.
- Write for a phone screen: short paragraphs, "- " bullets, **bold** for the key words. No tables, no headings deeper than one "##".
- If the user writes in Tamil, Hindi or Tanglish, answer in the same style.`;

const STOCK_SYSTEM = `You are StockByte AI, the trading assistant inside DiaryByte, a personal finance app used by one Indian retail trader. You help with NSE intraday and swing decisions using DiaryByte's own signal engine and market data.

How to work:
- For "should I buy / sell / wait" on a stock: call evaluate_intraday (the engine's live verdict and plan) and daily_trend (the bigger picture) for it. Use find_stock first if you only have a company name.
- For the user's watchlist, open trades or results: call my_trading. For "why does it keep waiting": call todays_signals.
- The engine is the decision-maker; explain it, and add judgement where the daily trend agrees or disagrees. If you disagree with the engine, say why with numbers. Paper trading comes first: the engine's report card needs 20+ closed trades before trusting it with real money.
- Intraday rules the engine follows: entries only 09:15–14:45 IST, square-off by 15:20, risk per trade from the user's settings, charges included.

Answer shape for a stock decision:
**Verdict: BUY / SELL / WAIT / AVOID** — one line with the price and time of the data.
Then "Why" (3–5 bullets with the actual numbers: score vs threshold, VWAP, RSI, volume, 15-min and daily trend), "Plan" when there is one (entry, stop, target, quantity, net profit/loss after charges), and "What would change this" (the concrete trigger to watch).
For other questions answer naturally and briefly.${COMMON}`;

const INVEST_SYSTEM = `You are InvestByte AI, the portfolio assistant inside DiaryByte, a personal finance app used by one Indian investor. You review their holdings in My Investments (mutual funds, Indian and US stocks, digital gold/silver/platinum, crypto, FDs) and suggest concrete improvements.

How to work:
- Start with get_portfolio. Then look deeper where it matters: fund_performance for mutual funds (by schemeCode), stock_trend for stocks (by symbol), my_finances when cash flow or loans affect the advice.
- Judge each holding on its own numbers (gain %, 1y/3y/5y returns against its category, trend, concentration) and the portfolio as a whole (allocation across equity / debt / gold / crypto, overlap, too many small funds, idle money, high-interest debt vs investing).
- When suggesting a sale, name the holding, say sell all or part, and give the reason with numbers. Mention Indian tax effects briefly where they matter (equity LTCG over ₹1.25 lakh/yr at 12.5% after 1 year, STCG 20% under 1 year; debt funds and FD interest at slab rate; crypto 30% + 1% TDS) — as a note, not tax advice.
- Prefer a few high-impact suggestions over a long list. Say clearly when something is fine as it is.

Answer shape for a portfolio review:
**Overall:** one or two lines (value, gain, the biggest issue).
Then "Consider selling / trimming", "Keep", and "Improve" (allocation, SIP changes, consolidation, debt), each as bullets with numbers. Skip a section if there's nothing to say.${COMMON}`;

const AGENTS = {
  stock: { name: 'StockByte AI', system: STOCK_SYSTEM, tools: stockTools },
  invest: { name: 'InvestByte AI', system: INVEST_SYSTEM, tools: investTools },
};

const istNow = () => {
  const d = new Date(Date.now() + 330 * 60000);
  const day = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${day}, ${d.toISOString().slice(11, 16)} IST`;
};

/** Earlier chat turns from the app, as plain text messages (oldest first). */
function cleanHistory(history) {
  const turns = (Array.isArray(history) ? history : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  // The conversation must start with the user.
  while (turns.length && turns[0].role !== 'user') turns.shift();
  return turns;
}

async function runTool(tool, input) {
  try {
    const result = await tool.run(input || {});
    return { content: JSON.stringify(result).slice(0, 60000), is_error: false };
  } catch (error) {
    return { content: `Error: ${error.message}`, is_error: true };
  }
}

/**
 * Answer one question. `kind`: 'stock' | 'invest'. `history`: earlier
 * turns [{ role, content }]. Returns { reply, tools: [names], model, usage }.
 */
async function ask(kind, question, history = []) {
  const agent = AGENTS[kind];
  if (!agent) throw Object.assign(new Error('Unknown assistant'), { status: 404 });
  const anthropic = getClient();
  if (!anthropic) {
    throw Object.assign(new Error('AI is not set up yet: add ANTHROPIC_API_KEY in your Render service settings.'), { status: 503, code: 'not_configured' });
  }
  const text = String(question || '').trim().slice(0, MAX_CHARS);
  if (!text) throw Object.assign(new Error('Ask a question'), { status: 400 });

  const byName = Object.fromEntries(agent.tools.map((t) => [t.name, t]));
  const tools = agent.tools.map(({ name, description, input_schema }) => ({ name, description, input_schema }));
  // Stable prefix (tools + system) is cached; the time goes in the user turn.
  const system = [{ type: 'text', text: agent.system, cache_control: { type: 'ephemeral' } }];
  const messages = [...cleanHistory(history), { role: 'user', content: `[${istNow()}]\n${text}` }];
  const used = [];
  const usage = { input: 0, output: 0, cacheRead: 0 };

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default', // if the model declines, the API retries on a suitable model
      output_config: { effort: EFFORT },
      system,
      tools,
      messages,
    });
    usage.input += response.usage?.input_tokens || 0;
    usage.output += response.usage?.output_tokens || 0;
    usage.cacheRead += response.usage?.cache_read_input_tokens || 0;

    if (response.stop_reason === 'refusal') {
      return { reply: "I can't help with that one. Try asking about a stock, your trades or your portfolio.", tools: used, model: response.model, usage };
    }
    // Keep the assistant turn exactly as returned (thinking and tool calls included).
    messages.push({ role: 'assistant', content: response.content });
    const calls = response.content.filter((b) => b.type === 'tool_use');
    if (response.stop_reason !== 'tool_use' || !calls.length) {
      const reply = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      return {
        reply: reply || (response.stop_reason === 'max_tokens' ? 'That answer ran too long — try a narrower question.' : 'No answer came back — please try again.'),
        tools: used,
        model: response.model,
        usage,
      };
    }
    // Run every requested tool (in parallel) and return all results in one message.
    const results = await Promise.all(
      calls.map(async (call) => {
        used.push(call.name);
        const tool = byName[call.name];
        const out = tool ? await runTool(tool, call.input) : { content: `Error: unknown tool ${call.name}`, is_error: true };
        return { type: 'tool_result', tool_use_id: call.id, content: out.content, is_error: out.is_error };
      })
    );
    messages.push({ role: 'user', content: results });
  }
  return { reply: 'That took too many steps — try asking about one stock or one holding at a time.', tools: used, model: MODEL, usage };
}

module.exports = { ask, configured, AGENTS, MODEL, EFFORT, cleanHistory };
