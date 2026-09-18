// services/rag/qdrantService.js
//
// The "filing cabinet": stores each property chunk's vector + text in Qdrant
// Cloud, and searches it. This is the only file that talks to Qdrant; the sync
// job (step 4) and the retrieval tool (step 5) use the functions exported here.
//
// ── WHAT LIVES IN A QDRANT POINT ──────────────────────────────────────────────
//   id      — a deterministic UUID derived from the chunk's stable key
//             ("<slug>:<topic>"), so re-syncing OVERWRITES the same point
//             instead of creating a duplicate.
//   vector  — the 768-dim embedding (used for similarity search).
//   payload — the text Maya reads, plus metadata used for filtering:
//             { key, text, type, propertyId, slug, propertyName, address, topic }
//
// ── DESIGN NOTES ──────────────────────────────────────────────────────────────
//   • REST via axios (project dependency); Qdrant Cloud auth is the `api-key`
//     header. URL + key come from env — never hardcoded.
//   • Vector size is imported from the embedder (EMBED_DIMENSIONS), so the
//     collection and the vectors can't fall out of sync.
//   • Payload indexes on type / slug / topic make the per-property hard filter
//     fast — this is what guarantees a Georgia St call can only see Georgia St
//     chunks.
//   • Distance = Cosine, matching the L2-normalized vectors from step 2.
//   • Idempotent setup: ensureCollection() is safe to call on every sync/boot.
//   • Re-sync pattern: deleteByProperty(slug) then upsert — so a topic that
//     became empty (its chunk no longer generated) is removed, not left stale.

'use strict';

const axios = require('axios');
const crypto = require('crypto');
const { EMBED_DIMENSIONS } = require('./embeddingService');

// ── Config (env-overridable) ──────────────────────────────────────────────────
const QDRANT_URL = process.env.QDRANT_URL;                       // https://xxx.cloud.qdrant.io:6333
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const COLLECTION = process.env.QDRANT_COLLECTION || 'vihara_knowledge';
const DISTANCE = process.env.QDRANT_DISTANCE || 'Cosine';

const UPSERT_BATCH = Number(process.env.QDRANT_UPSERT_BATCH || 100);
const REQUEST_TIMEOUT_MS = Number(process.env.QDRANT_TIMEOUT_MS || 15000);
const MAX_RETRIES = Number(process.env.QDRANT_MAX_RETRIES || 3);
const BASE_DELAY_MS = Number(process.env.QDRANT_BASE_DELAY_MS || 400);

// Fields we filter on — indexed as keywords for fast filtered search.
const INDEXED_FIELDS = ['type', 'slug', 'topic', 'propertyId'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Deterministic point id (UUIDv5 from the chunk key) ────────────────────────
// Qdrant point ids must be unsigned ints or UUIDs. We hash the stable string key
// into a fixed UUID so the same chunk always maps to the same id (idempotent
// upserts). Built on crypto (SHA-1) — no external uuid dependency.
const ID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // fixed namespace

function uuidToBytes(uuid) {
  const hex = uuid.replace(/-/g, '');
  const bytes = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

function deterministicId(name) {
  const hash = crypto
    .createHash('sha1')
    .update(Buffer.concat([uuidToBytes(ID_NAMESPACE), Buffer.from(String(name), 'utf8')]))
    .digest();
  const bytes = Buffer.from(hash.slice(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC-4122 variant
  const hex = bytes.toString('hex');
  return [
    hex.substr(0, 8), hex.substr(8, 4), hex.substr(12, 4),
    hex.substr(16, 4), hex.substr(20, 12),
  ].join('-');
}

// ── HTTP client (lazy, cached) ────────────────────────────────────────────────
let _client = null;
function client() {
  if (_client) return _client;
  if (!QDRANT_URL) throw new Error('QDRANT_URL is not set — cannot reach Qdrant.');
  if (!QDRANT_API_KEY) throw new Error('QDRANT_API_KEY is not set — cannot reach Qdrant.');
  _client = axios.create({
    baseURL: QDRANT_URL.replace(/\/+$/, ''),
    timeout: REQUEST_TIMEOUT_MS,
    headers: { 'api-key': QDRANT_API_KEY, 'Content-Type': 'application/json' },
  });
  return _client;
}

async function withRetry(fn, label) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err.response && err.response.status;
      const retriable = !status || status === 429 || (status >= 500 && status < 600);
      if (!retriable || attempt === MAX_RETRIES) break;
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.warn(`[rag-qdrant] ${label} attempt ${attempt}/${MAX_RETRIES} failed (${status || err.code}); retry in ${delay}ms`);
      await sleep(delay);
    }
  }
  throw lastErr;
}

// ── Collection setup (idempotent) ─────────────────────────────────────────────

async function collectionExists() {
  try {
    await client().get(`/collections/${COLLECTION}`);
    return true;
  } catch (err) {
    if (err.response && err.response.status === 404) return false;
    throw err;
  }
}

async function ensureIndexes() {
  for (const field of INDEXED_FIELDS) {
    try {
      await client().put(`/collections/${COLLECTION}/index?wait=true`, {
        field_name: field,
        field_schema: 'keyword',
      });
    } catch (err) {
      // An index that already exists is fine — only surface real failures.
      const status = err.response && err.response.status;
      if (status && status !== 409 && status !== 400) throw err;
    }
  }
}

/**
 * Ensure the collection exists with the right vector config and filter indexes.
 * Safe to call repeatedly (sync start, server boot).
 */
async function ensureCollection() {
  if (!(await collectionExists())) {
    await withRetry(
      () => client().put(`/collections/${COLLECTION}`, {
        vectors: { size: EMBED_DIMENSIONS, distance: DISTANCE },
      }),
      'createCollection'
    );
    console.log(`[rag-qdrant] created collection "${COLLECTION}" (size=${EMBED_DIMENSIONS}, distance=${DISTANCE})`);
  }
  await ensureIndexes();
}

// ── Writes ────────────────────────────────────────────────────────────────────

/**
 * Upsert embedded chunks. Each chunk: { key, text, metadata, vector }.
 * Chunks without a valid vector are skipped (should never happen — guard).
 * @returns {Promise<{upserted:number, skipped:number}>}
 */
async function upsertChunks(chunks) {
  const valid = (Array.isArray(chunks) ? chunks : []).filter(
    (c) => c && Array.isArray(c.vector) && c.vector.length === EMBED_DIMENSIONS && c.key
  );
  const skipped = (Array.isArray(chunks) ? chunks.length : 0) - valid.length;
  if (skipped) console.warn(`[rag-qdrant] skipping ${skipped} chunk(s) with no/invalid vector`);
  if (valid.length === 0) return { upserted: 0, skipped };

  let upserted = 0;
  for (let i = 0; i < valid.length; i += UPSERT_BATCH) {
    const points = valid.slice(i, i + UPSERT_BATCH).map((ch) => ({
      id: deterministicId(ch.key),
      vector: ch.vector,
      payload: { key: ch.key, text: ch.text, ...(ch.metadata || {}) },
    }));
    await withRetry(
      () => client().put(`/collections/${COLLECTION}/points?wait=true`, { points }),
      `upsert(${points.length})`
    );
    upserted += points.length;
  }
  return { upserted, skipped };
}

/**
 * Delete every chunk belonging to one property (by slug). Used before a re-sync
 * so topics that no longer have data don't linger in the index.
 */
async function deleteByProperty(slug) {
  const filter = {
    must: [
      { key: 'type', match: { value: 'property' } },
      { key: 'slug', match: { value: String(slug || '').toLowerCase() } },
    ],
  };
  await withRetry(
    () => client().post(`/collections/${COLLECTION}/points/delete?wait=true`, { filter }),
    `deleteByProperty(${slug})`
  );
}

// ── Read (search) ─────────────────────────────────────────────────────────────

/**
 * Build the Qdrant filter for a property lookup: type=property AND slug=<slug>,
 * optionally narrowed to a single topic. Exposed so the retrieval tool (step 5)
 * doesn't need to know Qdrant's filter syntax.
 */
function buildPropertyFilter(slug, topic) {
  const must = [
    { key: 'type', match: { value: 'property' } },
    { key: 'slug', match: { value: String(slug || '').toLowerCase() } },
  ];
  if (topic) must.push({ key: 'topic', match: { value: topic } });
  return { must };
}

/**
 * Vector search. Returns [{ score, payload }] where payload holds the chunk text
 * and metadata. Pass a filter (e.g. from buildPropertyFilter) to scope results.
 * @param {number[]} vector
 * @param {{ filter?:object, limit?:number, scoreThreshold?:number }} opts
 */
async function search(vector, opts = {}) {
  const { filter = null, limit = 5, scoreThreshold = null } = opts;
  const body = { vector, limit, with_payload: true };
  if (filter) body.filter = filter;
  if (scoreThreshold != null) body.score_threshold = scoreThreshold;

  const { data } = await withRetry(
    () => client().post(`/collections/${COLLECTION}/points/search`, body),
    'search'
  );
  return ((data && data.result) || []).map((r) => ({ score: r.score, payload: r.payload || {} }));
}

module.exports = {
  ensureCollection,
  upsertChunks,
  deleteByProperty,
  search,
  buildPropertyFilter,
  deterministicId, // exported for tests / debugging
  COLLECTION,
};
