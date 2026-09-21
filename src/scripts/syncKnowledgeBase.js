// scripts/syncKnowledgeBase.js
//
// Standalone runner to (re)build the property knowledge base in Qdrant.
//
//   node scripts/syncKnowledgeBase.js              → sync ALL properties
//   node scripts/syncKnowledgeBase.js georgia-st   → sync one property (slug)
//   node scripts/syncKnowledgeBase.js <mongoId>    → sync one property (id)
//
// Run it once to fill the base, and again whenever property data changes (or
// wire syncProperty into a post-save hook later for automatic updates).
//
// Requires these env vars (in .env):
//   GEMINI_API_KEY, QDRANT_URL, QDRANT_API_KEY, and the Mongo connection string.

'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const { syncAllProperties, syncProperty } = require('../services/rag/ragSyncService');

// Accept whichever name this project already uses for the Mongo URI.
const MONGO_URI = process.env.DB_URI

async function main() {
  if (!MONGO_URI) {
    throw new Error(
      'Mongo connection string not found. Set MONGO_URI (or DB_URL / DATABASE_URL / ' +
      'MONGODB_URI / MONGO_URL) in your .env.'
    );
  }

  await mongoose.connect(MONGO_URI);
  console.log('[rag-sync] connected to Mongo');

  const target = process.argv[2]; // optional slug or id
  const result = target
    ? await syncProperty(target)
    : await syncAllProperties();

  console.log('[rag-sync] summary:\n' + JSON.stringify(result, null, 2));
}

main()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[rag-sync] FAILED:', err.message);
    try { await mongoose.disconnect(); } catch (_e) {}
    process.exit(1);
  });
