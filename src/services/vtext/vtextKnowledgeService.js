// services/vtext/vtextKnowledgeService.js
//
// Gathers everything the AI reply needs to know about a lead before it writes
// a text: the key facts of the lead's property, what the lead told us (quoted
// price, NorCal buy-box), and the property details that match THIS question,
// found by searching the knowledge base in Qdrant (services/rag/, shared with
// the Maya calling system).
//
// Fail-open by design: the key facts always come straight from Mongo, so if the
// search is slow, fails or finds nothing, the reply is still written from those
// (the prompt tells the AI to hand over to a team member for anything it was
// not given). Nothing in here throws.
//
// Only reads. The shared rag/ files are used as they are; Vtext-specific
// behaviour (several properties, a time limit, a longer text budget) lives here.
const PropertyLead = require("../../model/leads/propertyLeadModel");
const NorCalLead = require("../../model/leads/norCalLeadModel");
const Product = require("../../model/property/productModel");
const VtextConversation = require("../../model/vtext/vtextConversationModel");
const { PRODUCT_TEMPLATE_FIELDS, resolvePropertyVariables } = require("./vtextTemplateService");
const { embedQuery } = require("../rag/embeddingService");
const { search } = require("../rag/qdrantService");
const { sendAlertWithCooldown } = require("./vtextAlertService");

const MAX_PROPERTIES = 3;
const TOP_K = Number(process.env.RAG_VTEXT_TOP_K || 5);
const MIN_SCORE = Number(process.env.RAG_VTEXT_MIN_SCORE || 0.4);
const MAX_CHARS = Number(process.env.RAG_VTEXT_MAX_CHARS || 1500);
const TIMEOUT_MS = Number(process.env.VTEXT_RAG_TIMEOUT_MS || 6000);
const REWRITE_MAX_MESSAGE_CHARS = 60; // longer messages already read as a full question
const RAG_FAILURE_ALERT_COOLDOWN_MS = 30 * 60_000;

const isRagEnabled = () => process.env.VTEXT_RAG_ENABLED === "true";
const isRewriteEnabled = () => process.env.VTEXT_RAG_REWRITE !== "false";

const money = (n) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? `$${Math.round(n).toLocaleString("en-US")}` : "");

/** Rejects after `ms` so a slow Qdrant or Gemini cannot hold up the draft. */
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * The properties this lead has dealt with, with the one this conversation is about first.
 *
 * A contact's own lead links are set once, when the contact is created, and keep only the first
 * property lead found, so a later signup for another property was never seen. The leads are
 * therefore also looked up by the contact's phone number. The property the conversation is about
 * (the one the latest text sent was about, copied onto the conversation; else the follow-up's
 * property) goes first and is marked `current`; the rest follow, newest first. Capped.
 * @returns {Promise<Array<{ slug: string, quotePrice: number|null, buyerType: string, current: boolean, product: object }>>}
 */
async function loadProperties(contact, conversationId) {
  const ids = (contact?.leadRefs || []).filter((r) => r.leadType === "property").map((r) => r.leadId);
  const or = [];
  if (ids.length) or.push({ _id: { $in: ids } });
  if (contact?.phoneE164) or.push({ phoneNormalized: contact.phoneE164 });

  const leads = or.length
    ? await PropertyLead.find({ $or: or }).select("propertySlug quotePrice buyerType createdAt").sort({ createdAt: -1 }).lean()
    : [];

  // The property the conversation is about, when known.
  let currentId = null;
  if (conversationId) {
    const conversation = await VtextConversation.findById(conversationId).select("propertyId").lean();
    currentId = conversation?.propertyId || null;
  }
  if (!currentId && contact?.followUp?.propertyId) currentId = contact.followUp.propertyId;
  const currentProduct = currentId ? await Product.findById(currentId).select(PRODUCT_TEMPLATE_FIELDS).lean() : null;

  const bySlug = new Map();
  if (currentProduct?.slug) bySlug.set(currentProduct.slug, { slug: currentProduct.slug, quotePrice: null, buyerType: "" });
  for (const lead of leads) {
    if (!lead.propertySlug) continue;
    const have = bySlug.get(lead.propertySlug);
    if (have) { // the current property: keep its place, add what the lead told us
      if (have.quotePrice == null) have.quotePrice = lead.quotePrice;
      if (!have.buyerType) have.buyerType = lead.buyerType;
    } else if (bySlug.size < MAX_PROPERTIES) {
      bySlug.set(lead.propertySlug, { slug: lead.propertySlug, quotePrice: lead.quotePrice, buyerType: lead.buyerType });
    }
  }
  if (!bySlug.size) return [];

  const products = await Product.find({ slug: { $in: [...bySlug.keys()] } }).select(PRODUCT_TEMPLATE_FIELDS).lean();
  const productBySlug = new Map(products.map((p) => [p.slug, p]));

  return [...bySlug.values()]
    .filter((e) => productBySlug.has(e.slug))
    .map((e) => ({ slug: e.slug, quotePrice: e.quotePrice, buyerType: e.buyerType, current: !!currentProduct && e.slug === currentProduct.slug, product: productBySlug.get(e.slug) }));
}

/** What a NorCal lead told us on the form. Empty when the contact is not a NorCal lead. */
async function loadNorCalDetails(contact) {
  const ref = (contact?.leadRefs || []).find((r) => r.leadType === "norcal");
  if (!ref) return [];
  const lead = await NorCalLead.findById(ref.leadId).select("where budget bedrooms when buyerType").lean();
  if (!lead) return [];
  return [
    lead.where?.length ? `Areas they want in Northern California: ${lead.where.join(", ")}` : "",
    lead.budget ? `Budget: ${lead.budget}` : "",
    lead.bedrooms ? `Bedrooms: ${lead.bedrooms}` : "",
    lead.when ? `Timeline to buy: ${lead.when}` : "",
    lead.buyerType ? `Buyer type: ${lead.buyerType}` : "",
  ].filter(Boolean);
}

/**
 * Short follow-ups ("and the taxes?") mean nothing to a search on their own.
 * Turns the last messages plus the new one into a standalone question. Any
 * problem returns the original message, so this can never make things worse.
 */
async function rewriteQuery({ messages, replyToBody }) {
  const original = String(replyToBody || "").trim();
  const earlier = (messages || []).slice(0, -1);
  if (!isRewriteEnabled() || !earlier.length || original.length > REWRITE_MAX_MESSAGE_CHARS) return original;

  try {
    const { getClient, MODEL_NAME } = require("./vtextAiReplyService");
    const client = getClient();
    if (!client) return original;

    const recent = earlier
      .slice(-4)
      .map((m) => `${m.direction === "in" ? "Contact" : "Us"}: ${m.body}`)
      .join("\n");
    const prompt = `Rewrite the contact's last message as one standalone question about a property, using the conversation for what it refers to. Keep it under 25 words. Reply with the question only. If the message is not a question, reply with it unchanged.\n\nConversation:\n${recent}\n\nLast message from the contact: ${original}`;

    const model = client.getGenerativeModel({ model: MODEL_NAME });
    const result = await withTimeout(
      model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }],
        // Thinking off: this is a one-line rewrite, and thinking roughly doubled its time (about 1.1s vs 2.3s measured).
        generationConfig: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
      }),
      Math.min(TIMEOUT_MS, 4000),
      "query rewrite"
    );
    const rewritten = String(result?.response?.text() || "").trim().replace(/^["']|["']$/g, "");
    return rewritten && rewritten.length <= 300 ? rewritten : original;
  } catch (err) {
    console.warn("[vtext rag] query rewrite failed, using the message as written:", err.message);
    return original;
  }
}

/** Searches the knowledge base, limited to the lead's own property or properties. */
async function searchKnowledge(query, slugs) {
  const vector = await embedQuery(query);
  const filter = {
    must: [
      { key: "type", match: { value: "property" } },
      { key: "slug", match: { any: slugs.map((s) => String(s).toLowerCase()) } },
    ],
  };
  return search(vector, { filter, limit: TOP_K, scoreThreshold: MIN_SCORE });
}

/** Joins the matched chunks into one block for the prompt: no repeats, labelled by property when there is more than one, capped. */
function formatRetrieved(results, multipleProperties) {
  const seen = new Set();
  const lines = [];
  let length = 0;
  for (const r of results) {
    const text = String(r.payload?.text || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    const label = multipleProperties && r.payload?.propertyName ? `[${r.payload.propertyName}] ` : "";
    const line = `${label}${text}`;
    if (length + line.length > MAX_CHARS && lines.length) break;
    lines.push(line.length > MAX_CHARS ? `${line.slice(0, MAX_CHARS).trim()}…` : line);
    length += line.length;
  }
  return lines.join("\n");
}

async function reportRagFailure(reason, contact) {
  await sendAlertWithCooldown("rag-failing", RAG_FAILURE_ALERT_COOLDOWN_MS, {
    level: "warning",
    title: "AI knowledge search is failing",
    fields: [
      { label: "What this means", value: "Replies are still written, but only from the basic property facts, so more questions will be handed to the team." },
      { label: "Error", value: String(reason).slice(0, 300) },
      { label: "Contact", value: contact?.phoneE164 },
    ],
  }).catch((err) => console.error("[vtext rag] could not send the failure alert:", err.message));
}

/**
 * @param {object} params
 * @param {object} params.contact - vtextContactModel document (leadRefs)
 * @param {object[]} params.messages - recent messages, chronological, the one being answered last
 * @param {string} params.replyToBody
 * @param {string} [params.conversationId] - lets the property this conversation is about go first
 * @returns {Promise<{
 *   properties: Array<{ slug: string, name: string, facts: object, quotePrice: number|null }>,
 *   leadDetails: string[],
 *   retrievedText: string,
 *   sources: string[],
 *   retrieval: { used: boolean, query: string, topScore: number|null, ms: number, error?: string },
 *   propertyContext: object|null,
 * }>} propertyContext is the first property's key facts, the same shape buildPropertyContext returns (the Slack alert uses it).
 */
async function buildReplyKnowledge({ contact, messages, replyToBody, conversationId }) {
  const out = {
    properties: [],
    leadDetails: [],
    retrievedText: "",
    sources: [],
    retrieval: { used: false, query: "", topScore: null, ms: 0 },
    propertyContext: null,
  };

  try {
    const [properties, norCalDetails] = await Promise.all([loadProperties(contact, conversationId), loadNorCalDetails(contact)]);
    out.properties = properties.map((p) => ({
      slug: p.slug,
      name: p.product.productName || p.slug,
      facts: resolvePropertyVariables(p.product),
      quotePrice: p.quotePrice,
      current: p.current,
    }));
    out.propertyContext = (out.properties.find((p) => p.current) || out.properties[0])?.facts || null;

    for (const p of properties) {
      if (money(p.quotePrice)) out.leadDetails.push(`They quoted ${money(p.quotePrice)} for ${p.product.productName || p.slug} (a price they would like to pay, not a formal offer)`);
      if (p.buyerType) out.leadDetails.push(`Buyer type: ${p.buyerType}`);
    }
    out.leadDetails.push(...norCalDetails);
  } catch (err) {
    console.error("[vtext rag] could not load the lead's details:", err.message);
  }

  if (!out.properties.length || !replyToBody) return out;

  const started = Date.now();
  try {
    const query = await rewriteQuery({ messages, replyToBody });
    out.retrieval.query = query;
    const results = await withTimeout(searchKnowledge(query, out.properties.map((p) => p.slug)), TIMEOUT_MS, "knowledge search");

    out.retrieval.used = true;
    out.retrieval.topScore = results.length ? results[0].score : null;
    out.retrievedText = formatRetrieved(results, out.properties.length > 1);
    out.sources = results.map((r) => r.payload?.key).filter(Boolean);
  } catch (err) {
    out.retrieval.error = err.message;
    console.error("[vtext rag] search failed, writing the reply from the basic facts only:", err.message);
    await reportRagFailure(err.message, contact);
  }
  out.retrieval.ms = Date.now() - started;
  return out;
}

module.exports = { isRagEnabled, buildReplyKnowledge, formatRetrieved, rewriteQuery };
