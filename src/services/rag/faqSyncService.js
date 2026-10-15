// services/rag/faqSyncService.js
//
// Puts the approved FAQ (src/knowledge/faq-approved.json, built by scripts/buildApprovedFaq.js from
// the review decisions) into the knowledge base as type "faq" points, so the text assistant can
// answer general "how do auctions work" questions. Each entry becomes one chunk, "Question ... Answer ...".
//
// Same safety as the property sync: embed FIRST, then replace, so a Gemini failure never empties
// the FAQ. The whole set is replaced each time, so a withdrawn entry is removed.
'use strict';

const fs = require('fs');
const path = require('path');
const { embedChunks } = require('./embeddingService');
const { ensureCollection, upsertChunks, deleteByType } = require('./qdrantService');

const APPROVED_FILE = path.join(__dirname, '../../knowledge/faq-approved.json');

/** The approved FAQ as chunks ready to embed. */
function loadFaqChunks(file = APPROVED_FILE) {
  if (!fs.existsSync(file)) return [];
  const { entries } = JSON.parse(fs.readFileSync(file, 'utf8'));
  return (entries || [])
    .filter((e) => e && e.id && e.question && e.answer)
    .map((e) => ({
      key: `faq:${e.id}`,
      topic: 'faq',
      text: `Question: ${e.question}\nAnswer: ${e.answer}`,
      metadata: { type: 'faq', topic: 'faq', category: e.category || '', question: e.question },
    }));
}

/** @returns {Promise<{ status: string, chunks: number }>} */
async function syncFaq(file) {
  const chunks = loadFaqChunks(file);
  if (!chunks.length) return { status: 'skipped', chunks: 0 }; // nothing approved: leave what is there alone
  await ensureCollection();
  const embedded = await embedChunks(chunks); // slow, failure-prone: before anything is deleted
  await deleteByType('faq');
  const { upserted } = await upsertChunks(embedded);
  return { status: 'synced', chunks: upserted };
}

module.exports = { syncFaq, loadFaqChunks };
