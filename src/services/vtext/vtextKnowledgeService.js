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

// A few more everyday facts about the lead's own home, read straight from Mongo so they are answered even when the
// knowledge search is slow or down (is it occupied? online? taxes?). All public listing fields (rag/propertyChunker.js
// ALLOWED_FIELDS). Kept apart from the Send-tab template variables, which these are not.
const EXTRA_FIELDS = "onlineOrInPerson occupancyStatus squareFootage yearBuilt monthlyHOADues investmentData.taxData.annualPropertyTax";
const PROPERTY_FIELDS = `${PRODUCT_TEMPLATE_FIELDS} ${EXTRA_FIELDS}`;
const usd = (n) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? `$${Math.round(n).toLocaleString("en-US")}` : "");

/** The facts the AI gets for one of the lead's homes: the template variables plus EXTRA_FIELDS, labelled. Pure. */
function propertyFacts(product = {}) {
  const extra = {
    "Auction type": product.onlineOrInPerson ? `${product.onlineOrInPerson} auction` : "",
    Occupancy: product.occupancyStatus || "",
    "Square feet": typeof product.squareFootage === "number" && product.squareFootage > 0 ? Math.round(product.squareFootage).toLocaleString("en-US") : "",
    "Year built": product.yearBuilt ? String(product.yearBuilt) : "",
    "Monthly HOA": product.monthlyHOADues > 0 ? usd(product.monthlyHOADues) : product.monthlyHOADues === 0 ? "none" : "",
    "Annual property tax": usd(product.investmentData?.taxData?.annualPropertyTax),
  };
  return { ...resolvePropertyVariables(product), ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v)) };
}
const { embedQuery } = require("../rag/embeddingService");
const { search } = require("../rag/qdrantService");
const { sendAlertWithCooldown } = require("./vtextAlertService");
const { isEnabled: isCatalogEnabled, loadOpenIndex, extractHomeSearch, searchListings, describeFilters, loadListingsBySlugs, findMentionedSlugs, formatCatalog } = require("./vtextListingCatalog");

const MAX_PROPERTIES = 3;
const TOP_K = Number(process.env.RAG_VTEXT_TOP_K || 5);
const MIN_SCORE = Number(process.env.RAG_VTEXT_MIN_SCORE || 0.4);
const MAX_CHARS = Number(process.env.RAG_VTEXT_MAX_CHARS || 1500);
const TIMEOUT_MS = Number(process.env.VTEXT_RAG_TIMEOUT_MS || 6000);
const REWRITE_TIMEOUT_MS = Number(process.env.VTEXT_RAG_REWRITE_TIMEOUT_MS || 8000); // gemini-3.8-flash sometimes thinks despite budget 0: 1.7s without, about 4s with
const REWRITE_MAX_MESSAGE_CHARS = 60; // longer messages already read as a full question
const FAQ_TOP_K = Number(process.env.RAG_VTEXT_FAQ_TOP_K || 2);
const FAQ_MIN_SCORE = Number(process.env.RAG_VTEXT_FAQ_MIN_SCORE || 0.62);
const FAQ_MAX_CHARS = Number(process.env.RAG_VTEXT_FAQ_MAX_CHARS || 1200);
const RAG_FAILURE_ALERT_COOLDOWN_MS = 30 * 60_000;

const isRagEnabled = () => process.env.VTEXT_RAG_ENABLED === "true";
const hasFaq = () => process.env.VTEXT_RAG_FAQ !== "false"; // the FAQ search can be switched off on its own
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
async function loadProperties(contact, conversationId, toorak = null) {
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
  // A Toorak lead's home (the Facebook ad it came from) counts as a property of theirs.
  if (toorak?.propertySlug && !bySlug.has(toorak.propertySlug)) bySlug.set(toorak.propertySlug, { slug: toorak.propertySlug, quotePrice: null, buyerType: "" });
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

  const products = await Product.find({ slug: { $in: [...bySlug.keys()] } }).select(PROPERTY_FIELDS).lean();
  const productBySlug = new Map(products.map((p) => [p.slug, p]));

  return [...bySlug.values()]
    .filter((e) => productBySlug.has(e.slug))
    // No conversation property known: the Toorak ad's home is the one the conversation is about.
    .map((e) => ({ slug: e.slug, quotePrice: e.quotePrice, buyerType: e.buyerType, current: e.slug === (currentProduct?.slug || toorak?.propertySlug), product: productBySlug.get(e.slug) }));
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
        // Thinking off: this is a one-line rewrite, and thinking roughly doubled its time (about 1.1s vs 2.3s measured on 2.5 Flash). 3.8 Flash only sometimes honours a budget of 0.
        generationConfig: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
      }),
      REWRITE_TIMEOUT_MS,
      "query rewrite"
    );
    require("../usage/spendRecorder").recordGemini("vtext-knowledge", MODEL_NAME, result);
    const rewritten = String(result?.response?.text() || "").trim().replace(/^["']|["']$/g, "");
    return rewritten && rewritten.length <= 300 ? rewritten : original;
  } catch (err) {
    console.warn("[vtext rag] query rewrite failed, using the message as written:", err.message);
    return original;
  }
}

/**
 * Searches the knowledge base twice from one embedding: the lead's own property or properties, and the
 * approved FAQ (general "how do auctions work" answers, true for every property). A lead with no property
 * (a Northern California lead) still gets the FAQ. A FAQ problem never takes the property facts down with it.
 */
async function searchKnowledge(query, slugs) {
  const vector = await embedQuery(query);
  const propertySearch = slugs.length
    ? search(vector, {
        filter: {
          must: [
            { key: "type", match: { value: "property" } },
            { key: "slug", match: { any: slugs.map((s) => String(s).toLowerCase()) } },
          ],
        },
        limit: TOP_K,
        scoreThreshold: MIN_SCORE,
      })
    : Promise.resolve([]);
  const faqSearch = !hasFaq() ? Promise.resolve([]) : search(vector, { filter: { must: [{ key: "type", match: { value: "faq" } }] }, limit: FAQ_TOP_K, scoreThreshold: FAQ_MIN_SCORE }).catch((err) => {
    console.warn("[vtext rag] FAQ search failed, continuing without it:", err.message);
    return [];
  });
  const [property, faq] = await Promise.all([propertySearch, faqSearch]);
  return { property, faq };
}

/** The matched FAQ entries as one block for the prompt, capped. */
function formatFaq(results) {
  const seen = new Set();
  const parts = [];
  let length = 0;
  for (const r of results) {
    const text = String(r.payload?.text || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    if (length + text.length > FAQ_MAX_CHARS && parts.length) break;
    parts.push(text);
    length += text.length;
  }
  return parts.join("\n\n");
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
async function buildReplyKnowledge({ contact, messages, replyToBody, conversationId, toorak = null, now = new Date() }) {
  const out = {
    properties: [],
    leadDetails: [],
    retrievedText: "",
    faqText: "",
    mentionedSlugs: [],
    sources: [],
    retrieval: { used: false, query: "", topScore: null, faqTopScore: null, ms: 0 },
    propertyContext: null,
  };

  try {
    const [properties, norCalDetails] = await Promise.all([loadProperties(contact, conversationId, toorak), loadNorCalDetails(contact)]);
    out.properties = properties.map((p) => ({
      slug: p.slug,
      name: p.product.productName || p.slug,
      facts: propertyFacts(p.product),
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

  if (!replyToBody) return out;

  // Other homes we have open (vtextListingCatalog.js, never throws): a search when the text asks for homes
  // ("anything under $200k?", "anything in Baltimore?"), and any other home the text names. The lead's own
  // homes are left out: they are above. Its filter step runs alongside the question rewrite below.
  const ownSlugs = new Set(out.properties.map((p) => String(p.slug).toLowerCase()));
  const catalogOn = isCatalogEnabled();
  const index = catalogOn ? await loadOpenIndex({ now }) : { homes: [], facets: null };
  const otherHomes = index.homes.filter((h) => !ownSlugs.has(h.slug));
  const homeSearchStep = catalogOn ? extractHomeSearch({ messages, replyToBody, facets: index.facets }) : null;

  const started = Date.now();
  let query = String(replyToBody).trim();
  try {
    query = await rewriteQuery({ messages, replyToBody });
    out.retrieval.query = query;
    // A question about one of the other homes ("taxes on the Baltimore one?") searches that home's details too.
    // The rewritten question carries what a short follow-up refers to.
    out.mentionedSlugs = findMentionedSlugs(`${replyToBody} ${query}`, otherHomes);
    const searchSlugs = [...ownSlugs, ...out.mentionedSlugs];
    const { property, faq } = await withTimeout(searchKnowledge(query, searchSlugs), TIMEOUT_MS, "knowledge search");

    out.retrieval.used = true;
    out.retrieval.topScore = property.length ? property[0].score : null;
    out.retrieval.faqTopScore = faq.length ? faq[0].score : null;
    out.retrievedText = formatRetrieved(property, searchSlugs.length > 1);
    out.faqText = formatFaq(faq);
    out.sources.push(...[...property, ...faq].map((r) => r.payload?.key).filter(Boolean));
  } catch (err) {
    out.retrieval.error = err.message;
    console.error("[vtext rag] search failed, writing the reply from the basic facts only:", err.message);
    await reportRagFailure(err.message, contact);
  }
  out.retrieval.ms = Date.now() - started;

  if (catalogOn) await addOtherHomes(out, { homeSearchStep, ownSlugs: [...ownSlugs], now });
  return out;
}

/**
 * Fills `out.otherHomes` for the prompt: { searched, failed, description, total, relaxed, matchesText, namedText }.
 * `catalogText` (every line the AI was shown) feeds the dollar check. Never throws.
 */
async function addOtherHomes(out, { homeSearchStep, ownSlugs, now }) {
  const other = { searched: false, failed: false, description: "", total: 0, relaxed: "", matchesText: "", namedText: "" };
  try {
    const step = await homeSearchStep;
    if (!step.ok) other.failed = true;
    else if (step.filters) {
      const result = await searchListings(step.filters, { excludeSlugs: ownSlugs, now });
      Object.assign(other, { searched: true, description: describeFilters(step.filters), total: result.total, relaxed: result.relaxed, matchesText: formatCatalog(result.listings) });
      out.homeSearch = { filters: step.filters, total: result.total, relaxed: result.relaxed, shown: result.listings.map((l) => l.slug) };
    }
    if (out.mentionedSlugs.length) other.namedText = formatCatalog(await loadListingsBySlugs(out.mentionedSlugs, { now }));
  } catch (err) {
    console.error("[vtext catalog] home search failed:", err.message);
    other.failed = true;
  }
  out.otherHomes = other;
  out.catalogText = [other.matchesText, other.namedText].filter(Boolean).join("\n");
  if (other.searched) out.sources.push("catalog:home-search");
  if (other.namedText) out.sources.push("catalog:named-homes");
}

module.exports = { isRagEnabled, buildReplyKnowledge, formatRetrieved, formatFaq, rewriteQuery, propertyFacts };
