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
// checked here.

// "$40,000", "$525K", "$1.2M", "$2 million", or a bare "42k" / "1.5m".
const AMOUNT = /\$\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m|thousand|million)?(?![a-z0-9])|(?<![\w$.])(\d[\d,]*(?:\.\d+)?)\s?(k|m)(?![a-z0-9])/gi;

const SAFE_HANDOFF = "Thanks for your message. A team member will follow up with you shortly.";

function toNumber(digits, unit) {
  const base = Number(String(digits).replace(/,/g, ""));
  if (!Number.isFinite(base)) return null;
  const u = String(unit || "").toLowerCase();
  const value = u === "k" || u === "thousand" ? base * 1e3 : u === "m" || u === "million" ? base * 1e6 : base;
  return Math.round(value);
}

/** Every dollar amount in `text`, as { raw, value }. */
function amountsIn(text) {
  const found = [];
  for (const m of String(text || "").matchAll(AMOUNT)) {
    const value = m[1] !== undefined ? toNumber(m[1], m[2]) : toNumber(m[3], m[4]);
    if (value !== null) found.push({ raw: m[0].trim(), value });
  }
  return found;
}

/**
 * @param {object} params
 * @param {string} params.reply - the AI's draft
 * @param {string[]} params.sourceTexts - everything the AI was shown, as plain text
 * @returns {{ ok: boolean, unsupported: string[] }} unsupported lists the amounts in the reply that no source contains
 */
function checkReplyAmounts({ reply, sourceTexts }) {
  const known = new Set(amountsIn((sourceTexts || []).join("\n")).map((a) => a.value));
  const unsupported = amountsIn(reply)
    .filter((a) => !known.has(a.value))
    .map((a) => a.raw);
  return { ok: unsupported.length === 0, unsupported: [...new Set(unsupported)] };
}

/** Flattens what the AI was shown (the object from vtextKnowledgeService) plus the conversation into texts to check against. */
function collectSourceTexts({ knowledge, messages, replyToBody }) {
  const texts = [];
  for (const p of knowledge?.properties || []) texts.push(...Object.values(p.facts || {}).map(String));
  texts.push(...(knowledge?.leadDetails || []));
  if (knowledge?.retrievedText) texts.push(knowledge.retrievedText);
  for (const m of messages || []) if (m?.body) texts.push(m.body);
  if (replyToBody) texts.push(replyToBody);
  return texts;
}

module.exports = { SAFE_HANDOFF, amountsIn, checkReplyAmounts, collectSourceTexts };
