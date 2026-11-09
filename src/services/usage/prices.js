// services/usage/prices.js
/**
 * List prices, US dollars per million tokens, used to work out what a call cost from the tokens it reports.
 * Anthropic's are its first-party API rates (checked 2026-11-09): a cache write (5 minutes) is 1.25x input,
 * a 1-hour cache write 2x input, a cache read 0.1x input; web search is $10 per 1,000 searches.
 *
 * A model that is not listed gets no price: its calls are recorded with their tokens and usd null, and the
 * admin page shows them as "price not on file" rather than guessing. Add a model here when it starts being used.
 */
const CLAUDE = {
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-fable-5": { input: 10, output: 50 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

// Google's Gemini API list prices (paid tier, prompts up to 200K tokens). Only models whose price is known.
const GEMINI = {
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-embedding-001": { input: 0.15, output: 0 },
};

const WEB_SEARCH_USD = 10 / 1000;

/** The longest listed id the model starts with, so "claude-haiku-4-5-20251001" finds "claude-haiku-4-5". */
function lookup(table, model) {
  const m = String(model || "").toLowerCase();
  let best = null;
  for (const id of Object.keys(table)) if (m.startsWith(id) && (!best || id.length > best.length)) best = id;
  return best ? { id: best, ...table[best] } : null;
}

const claudePrice = (model) => lookup(CLAUDE, model);
const geminiPrice = (model) => lookup(GEMINI, model);

/** "claude-opus-5-5" -> "Claude Opus 5.5"; "gemini-2.5-flash" -> "Gemini 2.5 Flash". */
function toolName(model) {
  const m = String(model || "").toLowerCase().replace(/-\d{8}$/, "");
  const claude = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(m);
  if (claude) return `Claude ${claude[1][0].toUpperCase()}${claude[1].slice(1)} ${claude[2]}${claude[3] ? `.${claude[3]}` : ""}`;
  if (m.startsWith("gemini")) return m.split("-").map((p) => (/^\d/.test(p) ? p : p[0].toUpperCase() + p.slice(1))).join(" ");
  return model || "Other";
}

const round6 = (n) => Math.round(n * 1e6) / 1e6;

/**
 * Cost of one Claude response from its usage object. Returns usd null when the model has no price on file.
 * input_tokens is the uncached part; cache writes and reads are reported separately.
 */
function claudeCost(model, usage = {}) {
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const cacheReadTokens = usage.cache_read_input_tokens || 0;
  const cacheWriteTokens = usage.cache_creation_input_tokens || 0;
  const write1h = usage.cache_creation?.ephemeral_1h_input_tokens || 0;
  const searches = usage.server_tool_use?.web_search_requests || 0;
  const tokens = { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens };
  const p = claudePrice(model);
  if (!p) return { usd: null, ...tokens };
  const cacheRead = p.cacheRead ?? p.input * 0.1;
  const usd =
    (inputTokens * p.input +
      outputTokens * p.output +
      cacheReadTokens * cacheRead +
      (cacheWriteTokens - write1h) * p.input * 1.25 +
      write1h * p.input * 2) /
      1e6 +
    searches * WEB_SEARCH_USD;
  return { usd: round6(usd), ...tokens };
}

/** Cost of one Gemini response from its usageMetadata. */
function geminiCost(model, meta = {}) {
  const inputTokens = meta.promptTokenCount || 0;
  // Thinking tokens are billed as output.
  const outputTokens = (meta.candidatesTokenCount || 0) + (meta.thoughtsTokenCount || 0);
  const p = geminiPrice(model);
  if (!p) return { usd: null, inputTokens, outputTokens };
  return { usd: round6((inputTokens * p.input + outputTokens * p.output) / 1e6), inputTokens, outputTokens };
}

module.exports = { claudePrice, geminiPrice, claudeCost, geminiCost, toolName, WEB_SEARCH_USD };
