// services/rag/ragSyncService.js
//
// The "fill the cabinet" job. Ties the previous three pieces together:
//
//   productModel (Mongo) ──► chunkProperty ──► embedChunks ──► Qdrant (swap)
//
// For each property it builds topic chunks, embeds them, then atomically-ish
// swaps them into the index (delete this property's old chunks, upsert the new
// set) so a re-sync never leaves stale topics behind.
//
// Two entry points:
//   • syncAllProperties()      — (re)build the whole knowledge base.
//   • syncProperty(idOrSlug)   — (re)build ONE property (for on-save triggers or
//                                targeted fixes).
//
// This module has NO process management (no Mongo connect / exit) so it can be
// called from a running app (an admin route, a cron, a post-save hook). The
// standalone runner in scripts/syncKnowledgeBase.js handles connect/disconnect.

'use strict';

const mongoose = require('mongoose');
const productModel = require('../../model/property/productModel');
const { chunkProperty } = require('./propertyChunker');
const { embedChunks } = require('./embeddingService');
const { ensureCollection, upsertChunks, deleteByProperty } = require('./qdrantService');

// Default scope: every property that has a real slug (the chunker needs one to
// build filterable chunks). Narrow this in one place if needed — e.g. add
// `isTestProperty: { $ne: true }` — without changing the sync flow below.
const DEFAULT_QUERY = { slug: { $type: 'string', $ne: '' } };

/**
 * Sync a single already-loaded property document (plain object from .lean()).
 * Returns a small result record; never throws for "no content" (that's a skip).
 */
async function syncOneDoc(property) {
  const label = property.slug || String(property._id);

  const chunks = chunkProperty(property);
  if (!chunks.length) {
    return { slug: label, status: 'skipped', reason: 'no usable content', chunks: 0 };
  }

  // Embed FIRST — the slow, failure-prone step. Doing it before any delete means
  // a Gemini hiccup can never wipe the property's existing index.
  const embedded = await embedChunks(chunks);

  // Swap: clear the old chunks for this property, then write the fresh set.
  // Sequential with wait=true; the no-data window only occurs on a re-sync and
  // lasts a few milliseconds.
  await deleteByProperty(property.slug);
  const { upserted } = await upsertChunks(embedded);

  return { slug: label, status: 'synced', chunks: upserted };
}

/**
 * (Re)build ONE property by Mongo _id or by slug.
 * @param {string} idOrSlug
 */
async function syncProperty(idOrSlug) {
  await ensureCollection();

  const query = mongoose.Types.ObjectId.isValid(idOrSlug)
    ? { _id: idOrSlug }
    : { slug: String(idOrSlug).trim().toLowerCase() };

  const property = await productModel.findOne(query).lean();
  if (!property) {
    const err = new Error(`Property not found for "${idOrSlug}"`);
    err.statusCode = 404;
    throw err;
  }
  return syncOneDoc(property);
}

/**
 * (Re)build the WHOLE knowledge base. Streams properties one at a time so memory
 * stays flat as the catalog grows, and isolates failures per property.
 * @param {{ query?: object }} [opts]  Override the default selection query.
 * @returns {Promise<{properties:number, chunks:number, synced:string[], skipped:object[], errors:object[]}>}
 */
async function syncAllProperties(opts = {}) {
  const query = opts.query || DEFAULT_QUERY;
  await ensureCollection();

  const summary = { properties: 0, chunks: 0, synced: [], skipped: [], errors: [] };
  const cursor = productModel.find(query).lean().cursor();

  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    summary.properties += 1;
    try {
      const res = await syncOneDoc(doc);
      if (res.status === 'synced') {
        summary.chunks += res.chunks;
        summary.synced.push(res.slug);
        console.log(`[rag-sync] ✓ ${res.slug} — ${res.chunks} chunks`);
      } else {
        summary.skipped.push({ slug: res.slug, reason: res.reason });
        console.log(`[rag-sync] – ${res.slug} skipped (${res.reason})`);
      }
    } catch (err) {
      summary.errors.push({ slug: doc.slug || String(doc._id), error: err.message });
      console.error(`[rag-sync] ✗ ${doc.slug || doc._id} — ${err.message}`);
    }
  }

  console.log(
    `[rag-sync] done — ${summary.synced.length} synced, ` +
    `${summary.skipped.length} skipped, ${summary.errors.length} errors, ` +
    `${summary.chunks} chunks total`
  );
  return summary;
}

module.exports = { syncProperty, syncAllProperties };
