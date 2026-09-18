// services/rag/embeddingService.js
//
// The "translator": turns text into vectors (embeddings) using Google's Gemini
// embedding API. Used at TWO moments, and the only difference between them is a
// task-type hint that improves retrieval quality:
//
//   • embedDocuments(texts)  → for the STORED property chunks (setup / sync).
//                              task type RETRIEVAL_DOCUMENT.
//   • embedQuery(text)       → for the CALLER'S QUESTION on a live call.
//                              task type RETRIEVAL_QUERY.
//
// Both call the same model with the same dimensions, so the vectors live in the
// same space and can be compared by Qdrant.
//
// ── DESIGN NOTES ──────────────────────────────────────────────────────────────
//   • REST via axios (already a project dependency) — no new SDK to add.
//   • Model + dimensions are env-configurable. Default is gemini-embedding-001
//     (GA, 768-dim). text-embedding-004 is intentionally NOT used — Google
//     deprecated it on 2026-01-14.
//   • 768-dim Gemini vectors are NOT auto-normalized, so we L2-normalize them.
//     Without this, dot-product similarity in Qdrant is subtly wrong.
//   • Batched: batchEmbedContents embeds many chunks per HTTP call, with a small
//     inter-batch delay so a large sync stays under free-tier rate limits.
//   • Retries with exponential backoff on 429 / 5xx / network blips. The setup
//     job embeds many chunks; a transient blip must not sink the whole run.
//   • Every returned vector's length is verified against EMBED_DIMENSIONS, so a
//     silent config/model drift fails loudly instead of poisoning the index.

'use strict';

const axios = require('axios');

// ── Config (all env-overridable) ──────────────────────────────────────────────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Model + output size. Keep these in lockstep with the Qdrant collection's
// vector size (step 3 imports EMBED_DIMENSIONS from here so they can't drift).
const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001';
const EMBED_DIMENSIONS = Number(process.env.GEMINI_EMBED_DIMENSIONS || 768);

// L2-normalize returned vectors. Required at dims < 3072; harmless otherwise.
const EMBED_NORMALIZE = String(process.env.GEMINI_EMBED_NORMALIZE || 'true') === 'true';

// Batch + resilience knobs.
const BATCH_SIZE = Number(process.env.GEMINI_EMBED_BATCH_SIZE || 100);
const BATCH_DELAY_MS = Number(process.env.GEMINI_EMBED_BATCH_DELAY_MS || 200);
const MAX_RETRIES = Number(process.env.GEMINI_EMBED_MAX_RETRIES || 4);
const BASE_DELAY_MS = Number(process.env.GEMINI_EMBED_BASE_DELAY_MS || 500);
const REQUEST_TIMEOUT_MS = Number(process.env.GEMINI_EMBED_TIMEOUT_MS || 20000);

// Safety cap on a single input's length. Gemini-embedding-001 accepts ~2048
// input tokens; chunks are far smaller, but an unusually long propertyDescription
// could exceed it — truncate by characters as a guard (~4 chars ≈ 1 token).
const MAX_INPUT_CHARS = Number(process.env.GEMINI_EMBED_MAX_INPUT_CHARS || 6000);

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL_PATH = `models/${EMBED_MODEL}`;

// Task types — the hint that tells Gemini how the text will be used.
const TASK_DOCUMENT = 'RETRIEVAL_DOCUMENT';
const TASK_QUERY = 'RETRIEVAL_QUERY';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function assertKey() {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set — cannot create embeddings.');
  }
}

// Trim + hard-cap a single input string. Returns "" for absent input.
function prepInput(text) {
  const s = (text == null ? '' : String(text)).trim();
  if (!s) return '';
  return s.length > MAX_INPUT_CHARS ? s.slice(0, MAX_INPUT_CHARS) : s;
}

// L2-normalize a vector so |v| = 1. Leaves a zero vector untouched.
function normalize(vec) {
  if (!EMBED_NORMALIZE || !Array.isArray(vec)) return vec;
  let sumSq = 0;
  for (const x of vec) sumSq += x * x;
  const norm = Math.sqrt(sumSq);
  if (!norm || !Number.isFinite(norm)) return vec;
  return vec.map((x) => x / norm);
}

// Verify a vector is the shape we expect; throw otherwise so drift fails loudly.
function validateVector(vec, where) {
  if (!Array.isArray(vec) || vec.length !== EMBED_DIMENSIONS) {
    throw new Error(
      `[rag-embed] ${where}: expected a ${EMBED_DIMENSIONS}-dim vector, got ` +
      `${Array.isArray(vec) ? vec.length : typeof vec}. Check GEMINI_EMBED_MODEL / ` +
      `GEMINI_EMBED_DIMENSIONS.`
    );
  }
  return vec;
}

// Retry wrapper: exponential backoff on rate limits, 5xx, and network errors.
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
      console.warn(
        `[rag-embed] ${label} attempt ${attempt}/${MAX_RETRIES} failed ` +
        `(${status || err.code || 'network'}); retrying in ${delay}ms`
      );
      await sleep(delay);
    }
  }
  throw lastErr;
}

// ── Single embedding (used by the live query path) ────────────────────────────
async function embedOne(text, taskType) {
  assertKey();
  const input = prepInput(text);
  if (!input) throw new Error('[rag-embed] embedOne called with empty text.');

  const url = `${API_BASE}/${MODEL_PATH}:embedContent?key=${GEMINI_API_KEY}`;
  const body = {
    model: MODEL_PATH,
    content: { parts: [{ text: input }] },
    taskType,
    outputDimensionality: EMBED_DIMENSIONS,
  };

  const { data } = await withRetry(
    () => axios.post(url, body, { timeout: REQUEST_TIMEOUT_MS }),
    `embedOne(${taskType})`
  );

  const values = data && data.embedding && data.embedding.values;
  return normalize(validateVector(values, 'embedOne'));
}

// ── Batched embedding (used by the setup / sync path) ─────────────────────────
async function embedBatch(texts, taskType) {
  assertKey();
  const inputs = texts.map(prepInput);

  const url = `${API_BASE}/${MODEL_PATH}:batchEmbedContents?key=${GEMINI_API_KEY}`;
  const body = {
    requests: inputs.map((text) => ({
      model: MODEL_PATH,
      content: { parts: [{ text }] },
      taskType,
      outputDimensionality: EMBED_DIMENSIONS,
    })),
  };

  const { data } = await withRetry(
    () => axios.post(url, body, { timeout: REQUEST_TIMEOUT_MS }),
    `embedBatch(${taskType}, n=${inputs.length})`
  );

  const embeddings = (data && data.embeddings) || [];
  if (embeddings.length !== inputs.length) {
    throw new Error(
      `[rag-embed] batch size mismatch: sent ${inputs.length}, got ${embeddings.length}.`
    );
  }
  return embeddings.map((e, i) => normalize(validateVector(e && e.values, `embedBatch[${i}]`)));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Embed the caller's QUESTION on a live call. One text → one vector.
 * @param {string} text
 * @returns {Promise<number[]>}
 */
function embedQuery(text) {
  return embedOne(text, TASK_QUERY);
}

/**
 * Embed STORED chunk texts for the knowledge base. Batched + rate-limited.
 * Order of the returned vectors matches the order of `texts`.
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
async function embedDocuments(texts) {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  const out = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const slice = texts.slice(i, i + BATCH_SIZE);
    const vectors = await embedBatch(slice, TASK_DOCUMENT);
    out.push(...vectors);
    if (i + BATCH_SIZE < texts.length && BATCH_DELAY_MS > 0) {
      await sleep(BATCH_DELAY_MS); // ease off between batches during a big sync
    }
  }
  return out;
}

/**
 * Convenience for the sync step: take chunker output and return the same chunks
 * with a `.vector` attached, preserving order. Chunks whose text is empty are
 * kept out (they should never occur — the chunker drops empties — but guard).
 * @param {Array<{key,text,metadata,topic}>} chunks
 * @returns {Promise<Array<{key,text,metadata,topic,vector:number[]}>>}
 */
async function embedChunks(chunks) {
  const usable = (Array.isArray(chunks) ? chunks : []).filter(
    (c) => c && typeof c.text === 'string' && c.text.trim()
  );
  if (usable.length === 0) return [];
  const vectors = await embedDocuments(usable.map((c) => c.text));
  return usable.map((c, i) => ({ ...c, vector: vectors[i] }));
}

module.exports = {
  embedQuery,
  embedDocuments,
  embedChunks,
  // Exported so step 3 (Qdrant) creates the collection with a matching vector
  // size, and step 5 (retrieval) stays consistent. Single source of truth.
  EMBED_MODEL,
  EMBED_DIMENSIONS,
};
