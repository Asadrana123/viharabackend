// services/rag/propertyRetrievalService.js
//
// The live-call brain of RAG. Given the caller's QUESTION and the property that
// the call is already scoped to, it:
//
//   embed the question ──► search Qdrant (filtered to THIS property) ──► text
//
// and hands that text back to the webhook, which returns it to VAPI as the
// tool result. Maya then speaks an answer grounded in it.
//
// ── GUARANTEES ────────────────────────────────────────────────────────────────
//   • Property scoping is a HARD filter (type=property AND this property). Maya
//     can never pull another property's facts into this call.
//   • NEVER INVENT — if nothing relevant is found (or anything fails), it returns
//     an honest "I don't have that" message, not a guess. Combined with Maya's
//     prompt rule, that keeps her from fabricating.
//   • NEVER THROWS — any error (Gemini/Qdrant down, bad input) resolves to a
//     graceful fallback so the call keeps going.

'use strict';

const { embedQuery } = require('./embeddingService');
const { search } = require('./qdrantService');

// ── Tunables (env-overridable) ────────────────────────────────────────────────
const TOP_K = Number(process.env.RAG_TOP_K || 3);
// Cosine similarity floor. Normalized Gemini vectors: strong matches ~0.6–0.85,
// weak ones ~0.3–0.45. Below this we treat it as "not found" rather than serve
// a loose match. Tune if answers feel too strict or too loose.
const SCORE_THRESHOLD = Number(process.env.RAG_SCORE_THRESHOLD || 0.4);
// Cap the factual text handed back, so Maya's turn stays snappy for voice.
const MAX_CHARS = Number(process.env.RAG_MAX_CHARS || 700);

// Messages returned AS the tool result when we have nothing to give. Phrased as
// honest "no info" cues — Maya reads them and (per her prompt) does not invent.
const FALLBACK_UNCLEAR = "I didn't catch a clear question to look up.";
const FALLBACK_NO_PROPERTY = "I don't have a specific property in context to look that up.";
const FALLBACK_NOT_FOUND = "I don't have that specific detail about this property on file.";
const FALLBACK_ERROR = "I can't pull that detail up right this second.";

// Build the Qdrant filter. Always constrained to property chunks, and to THIS
// property by slug (preferred — the stable landing identifier) or propertyId.
// Optional topic narrows further. Either slug or propertyId is enough because
// both are indexed in Qdrant.
function buildFilter({ slug, propertyId, topic }) {
  const must = [{ key: 'type', match: { value: 'property' } }];
  if (slug) must.push({ key: 'slug', match: { value: String(slug).toLowerCase() } });
  else if (propertyId) must.push({ key: 'propertyId', match: { value: String(propertyId) } });
  if (topic) must.push({ key: 'topic', match: { value: topic } });
  return { must };
}

// Join the top chunks into one compact factual block, de-duplicated and capped.
function formatResults(results) {
  const seen = new Set();
  const parts = [];
  for (const r of results) {
    const t = String((r.payload && r.payload.text) || '').trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    parts.push(t);
    if (parts.join(' ').length >= MAX_CHARS) break;
  }
  let text = parts.join(' ');
  if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS).trim() + '…';
  return text;
}

/**
 * Answer one property question for a live call.
 *
 * @param {object}  p
 * @param {string}  p.question     The caller's question (from the tool args).
 * @param {string} [p.slug]        Property slug (preferred scope key).
 * @param {string} [p.propertyId]  Mongo _id (fallback scope key).
 * @param {string} [p.topic]       Optional topic filter (e.g. "schools").
 * @param {number} [p.limit]       Max chunks to consider (default TOP_K).
 * @returns {Promise<{ ok:boolean, text:string }>}  `text` is always safe to speak.
 */
async function answerPropertyQuestion({ question, slug = null, propertyId = null, topic = null, limit = TOP_K } = {}) {
  const q = String(question || '').trim();
  if (!q) return { ok: false, text: FALLBACK_UNCLEAR };
  if (!slug && !propertyId) return { ok: false, text: FALLBACK_NO_PROPERTY };

  try {
    const vector = await embedQuery(q);
    const filter = buildFilter({ slug, propertyId, topic });
    const results = await search(vector, { filter, limit, scoreThreshold: SCORE_THRESHOLD });

    if (!results || results.length === 0) {
      return { ok: false, text: FALLBACK_NOT_FOUND };
    }
    return { ok: true, text: formatResults(results) };
  } catch (err) {
    console.error('[rag-retrieval] lookup failed:', err.message);
    return { ok: false, text: FALLBACK_ERROR };
  }
}

module.exports = { answerPropertyQuestion };
