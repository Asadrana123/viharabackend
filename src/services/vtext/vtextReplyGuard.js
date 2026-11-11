// services/vtext/vtextReplyGuard.js
//
// Last check on an AI draft before it is saved (and, with auto-reply on, sent).
// A dollar amount in the reply must appear somewhere in what the AI was shown:
// the property's facts, the details looked up for the question, what the lead
// told us, or the conversation itself. An amount that appears nowhere was
// invented or worked out by the AI (for example a guess at the reserve price),
// so the draft is swapped for a plain hand-off to the team.
//
// Pure: no DB, no network. Works on text, so a wrong guess is caught however the
// model arrived at it. It checks amounts only; dates, counts and words are not
// checked here. Rounded amounts ($649K for $649,254) are accepted when a real figure is within one unit of them.

// "$40,000", "$525K", "$1.2M", "$2 million", or a bare "42k" / "1.5m".
const AMOUNT = /\$\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m|thousand|million)?(?![a-z0-9])|(?<![\w$.])(\d[\d,]*(?:\.\d+)?)\s?(k|m)(?![a-z0-9])/gi;

const SAFE_HANDOFF = "Good question, let me check with the team and get back to you.";

function toNumber(digits, unit) {
  const base = Number(String(digits).replace(/,/g, ""));
  if (!Number.isFinite(base)) return null;
  const u = String(unit || "").toLowerCase();
  const value = u === "k" || u === "thousand" ? base * 1e3 : u === "m" || u === "million" ? base * 1e6 : base;
  return Math.round(value);
}

// How coarse a written amount is: "$649K" is only exact to the nearest 1,000, "$1.2M" to the nearest 100,000,
// "$40,000" is exact. Used so a real figure rounded for a text ("$649K" for $649,254) is not mistaken for an invented one.
function precisionOf(digits, unit) {
  const u = String(unit || "").toLowerCase();
  const step = u === "k" || u === "thousand" ? 1e3 : u === "m" || u === "million" ? 1e6 : 0;
  if (!step) return 0;
  const decimals = (String(digits).split(".")[1] || "").length;
  return step / Math.pow(10, decimals);
}

/** Every dollar amount in `text`, as { raw, value, precision } (precision 0 means exact). */
function amountsIn(text) {
  const found = [];
  for (const m of String(text || "").matchAll(AMOUNT)) {
    const digits = m[1] !== undefined ? m[1] : m[3];
    const unit = m[1] !== undefined ? m[2] : m[4];
    const value = toNumber(digits, unit);
    if (value !== null) found.push({ raw: m[0].trim(), value, precision: precisionOf(digits, unit) });
  }
  return found;
}

/**
 * Plain numbers of 1,000 or more ("18000", "18,000") in a customer's own text. People often leave out the "$"
 * ("would you take 18000"), and the reply then rightly says "$18k". Read only from what the CUSTOMER wrote, never
 * from listing data, where a plain number is a zip code, a year or a square footage.
 */
function plainNumbersIn(text) {
  const found = [];
  for (const m of String(text || "").matchAll(/(?<![\w$.,])(\d{1,3}(?:,\d{3})+|\d{4,})(?![\w.,]?\d)/g)) {
    const value = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(value) && value >= 1000) found.push(value);
  }
  return found;
}

/**
 * @param {object} params
 * @param {string} params.reply - the AI's draft
 * @param {string[]} params.sourceTexts - everything the AI was shown, as plain text
 * @param {string[]} [params.customerTexts] - what the customer wrote; their plain numbers count as amounts too
 * @returns {{ ok: boolean, unsupported: string[] }} unsupported lists the amounts in the reply that no source contains
 */
function checkReplyAmounts({ reply, sourceTexts, customerTexts = [] }) {
  const known = [
    ...amountsIn((sourceTexts || []).join("\n")).map((a) => a.value),
    ...plainNumbersIn((customerTexts || []).join("\n")),
  ];
  const knownSet = new Set(known);
  // An exact amount must appear as written. An amount written with K or M ("$649K") is a rounding, so a
  // source amount within one unit of it supports it; a guessed number ("$45K" against a $40,000 fact) still does not.
  const supported = (a) => knownSet.has(a.value) || (a.precision > 0 && known.some((k) => Math.abs(k - a.value) < a.precision));
  const unsupported = amountsIn(reply)
    .filter((a) => !supported(a))
    .map((a) => a.raw);
  return { ok: unsupported.length === 0, unsupported: [...new Set(unsupported)] };
}

/** Flattens what the AI was shown (the object from vtextKnowledgeService) plus the conversation into texts to check against. */
function collectSourceTexts({ knowledge, messages, replyToBody }) {
  const texts = [];
  for (const p of knowledge?.properties || []) texts.push(...Object.values(p.facts || {}).map(String));
  texts.push(...(knowledge?.leadDetails || []));
  if (knowledge?.retrievedText) texts.push(knowledge.retrievedText);
  if (knowledge?.faqText) texts.push(knowledge.faqText);
  if (knowledge?.catalogText) texts.push(knowledge.catalogText); // the other open homes (vtextListingCatalog.js)
  for (const m of messages || []) if (m?.body) texts.push(m.body);
  if (replyToBody) texts.push(replyToBody);
  return texts;
}

/** What the customer wrote in the conversation (their texts only), for checkReplyAmounts' customerTexts. */
function customerTextsOf({ messages, replyToBody }) {
  return [...(messages || []).filter((m) => m?.direction === "in" && m.body).map((m) => m.body), ...(replyToBody ? [replyToBody] : [])];
}

module.exports = { SAFE_HANDOFF, amountsIn, plainNumbersIn, checkReplyAmounts, collectSourceTexts, customerTextsOf };
