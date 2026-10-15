// scripts/syncFaq.js
//
// Puts the approved FAQ into the knowledge base (Qdrant). Run after buildApprovedFaq.js, and again
// whenever the approved list changes.
//
//   node src/scripts/syncFaq.js
//
// Needs .env: GEMINI_API_KEY, QDRANT_URL, QDRANT_API_KEY (and QDRANT_COLLECTION: use a dev
// collection, never the live one, when testing).
'use strict';

require('dotenv').config();
const { syncFaq, loadFaqChunks } = require('../services/rag/faqSyncService');

(async () => {
  const n = loadFaqChunks().length;
  console.log(`[faq-sync] ${n} approved entr${n === 1 ? 'y' : 'ies'} to sync`);
  const result = await syncFaq();
  console.log('[faq-sync]', JSON.stringify(result));
  process.exit(0);
})().catch((err) => {
  console.error('[faq-sync] FAILED:', err.message);
  process.exit(1);
});
