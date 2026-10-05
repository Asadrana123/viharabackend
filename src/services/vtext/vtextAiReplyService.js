// services/vtext/vtextAiReplyService.js
//
// Pure generation — no DB writes, no queue calls. Drafts a reply to a real
// inbound Vtext message using Google Gemini, matching the project's
// existing Gemini setup (@google/generative-ai, model gemini-2.5-flash, key
// GEMINI_API_KEY — same convention as propertyDescriptionService.js /
// copyGenerationService.js).
//
// Deliberate deviation from that convention: those services fall back to a
// template string on failure. This one falls back to NOTHING (null) — an
// AI reply that might be sent with no human review (vtextSettingsModel's
// aiAutoReplyEnabled) must never fall back to a generic canned message;
// "no draft, a human replies manually" is the only safe failure mode.
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { resolvePropertyVariables, TEMPLATE_VARIABLES } = require("./vtextTemplateService");

// e.g. "property_price" -> "Starting bid" — reusing the Send tab's own
// variable labels (not raw snake_case keys) so the model actually
// recognizes "property_price" as the starting bid rather than treating an
// unfamiliar key name as information it isn't sure how to use.
const VARIABLE_LABELS = Object.fromEntries(TEMPLATE_VARIABLES.map((v) => [v.key, v.label]));

const MODEL_NAME = "gemini-2.5-flash";

let _client = null;
function getClient() {
  if (_client) return _client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  _client = new GoogleGenerativeAI(apiKey);
  return _client;
}

function isAiReplyAvailable() {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * Best-effort property context for the prompt — resolves the contact's
 * "property"-type leadRef (if any) to that property's own
 * resolvePropertyVariables() output (the same facts a template send uses).
 * No property leadRef, or the lead/property can't be found -> null, and the
 * draft is written from conversation history alone.
 * @param {object} contact - a vtextContactModel document (leadRefs populated)
 * @returns {Promise<object|null>}
 */
async function buildPropertyContext(contact) {
  const propertyRef = (contact?.leadRefs || []).find((r) => r.leadType === "property");
  if (!propertyRef) return null;

  try {
    const PropertyLead = require("../../model/leads/propertyLeadModel");
    const Product = require("../../model/property/productModel");

    const lead = await PropertyLead.findById(propertyRef.leadId).select("propertySlug").lean();
    if (!lead?.propertySlug) return null;

    const product = await Product.findOne({ slug: lead.propertySlug })
      .select("productName street city state zipCode beds baths assetType propertyType startBid slug investmentData.valuation investmentData.rental")
      .lean();
    if (!product) return null;

    return resolvePropertyVariables(product);
  } catch (err) {
    console.error("[vtext ai-reply] buildPropertyContext failed:", err.message);
    return null;
  }
}

function formatHistory(messages) {
  return messages
    .map((m) => `${m.direction === "in" ? "Contact" : "You"}: ${m.body}`)
    .join("\n");
}

function buildPrompt({ contact, messages, replyToBody, propertyContext }) {
  const facts = propertyContext
    ? Object.entries(propertyContext)
        .filter(([, v]) => v)
        .map(([k, v]) => `${VARIABLE_LABELS[k] || k}: ${v}`)
        .join("\n")
    : "(no property on file for this conversation)";

  // Earlier messages are CONTEXT, not something to re-answer — each inbound
  // message gets its own draft (draftReplyWorker.js), so a reply must focus
  // on the specific message it's answering, not restate answers to earlier
  // messages that already have (or will have) their own separate draft.
  const earlierHistory = messages.slice(0, -1);

  return `You are replying on behalf of Vihara, a real-estate auction company, to a text conversation with a prospect named ${contact?.name || "this contact"}.

Rules:
- Keep it short — this is a text message, 1 to 3 sentences.
- Friendly and direct, no corporate or salesy language.
- If a fact below answers the question (e.g. a price, address, bed/bath count), state it directly and confidently — don't defer to "a team member" for something you were already given.
- Do NOT invent property details, prices, dates, or availability that are NOT given below.
- Do NOT make legal, contractual, or financial commitments.
- Only if the answer genuinely isn't in the facts below, say a team member will follow up — never guess, but never withhold a fact you do have either.
- Plain text only — no markdown, no emojis, no signature.
- Reply ONLY to the contact's message below — do not re-answer earlier messages, those already have their own reply.

Property on file for this conversation:
${facts}

${earlierHistory.length ? `Earlier conversation, for context only (oldest first):\n${formatHistory(earlierHistory)}\n\n` : ""}The contact's message you are replying to right now:
${replyToBody}

Respond with a JSON object and nothing else, with exactly these fields:
- "reply": the text message to send, as plain text.
- "needsHuman": true only when the answer is NOT in the facts above and your reply tells them a team member will follow up. Otherwise false.
- "topic": when needsHuman is true, two to five words naming what they asked about (for example "starting bid" or "auction date"). Otherwise an empty string.`;
}

// If the model ignores the JSON format and just writes the sentence, a deferral is still
// recognised by its wording, because the prompt above tells it exactly what to say.
const DEFERRAL_PATTERN = /team member (will |can |is going to )?(follow up|reach out|get back)/i;

function looksLikeDeferral(text) {
  return DEFERRAL_PATTERN.test(String(text || ""));
}

/** Turns the model's raw output into { reply, needsHuman, topic }. Never throws. */
function parseModelOutput(raw) {
  const cleaned = String(raw || "").replace(/```(?:json)?/g, "").trim();
  let reply = cleaned;
  let needsHuman = false;
  let topic = "";
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed.reply === "string" && parsed.reply.trim()) {
      reply = parsed.reply.trim();
      needsHuman = parsed.needsHuman === true;
      topic = typeof parsed.topic === "string" ? parsed.topic.trim().slice(0, 80) : "";
    }
  } catch {
    // not JSON: the whole text is the reply
  }
  return { reply, needsHuman: needsHuman || looksLikeDeferral(reply), topic };
}

/**
 * @param {object} params
 * @param {object} params.contact - vtextContactModel document
 * @param {object[]} params.messages - recent VtextMessage docs for this conversation, chronological, {direction, body} — includes the message being replied to, as the last entry
 * @param {string} params.replyToBody - the specific inbound message's text to draft a reply to
 * @param {object|null} params.propertyContext - from buildPropertyContext()
 * @returns {Promise<{ reply: string, needsHuman: boolean, topic: string }|null>} the draft, or null if generation isn't possible/failed. needsHuman is true when the AI said a team member will follow up.
 */
async function generateDraftReply({ contact, messages, replyToBody, propertyContext }) {
  const client = getClient();
  if (!client) return null;
  if (!replyToBody) return null;

  try {
    const model = client.getGenerativeModel({ model: MODEL_NAME });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: buildPrompt({ contact, messages: messages || [], replyToBody, propertyContext }) }] }],
      generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
    });
    const draft = parseModelOutput(result?.response?.text());
    return draft.reply ? draft : null;
  } catch (error) {
    console.error("[vtext ai-reply] Gemini failed, no draft:", error?.message || error);
    return null;
  }
}

module.exports = { MODEL_NAME, isAiReplyAvailable, buildPropertyContext, generateDraftReply, parseModelOutput, looksLikeDeferral };
