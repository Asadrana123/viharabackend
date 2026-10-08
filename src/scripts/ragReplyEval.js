// scripts/ragReplyEval.js
//
// Tuning tool for the AI text replies: shows, for a property and some questions,
// what the knowledge base returns and what the AI would write. Sends nothing
// and writes nothing (it only reads Mongo and Qdrant, and calls Gemini).
//
//   node src/scripts/ragReplyEval.js <property-slug> "what are the taxes?" "and the HOA?"
//
// A question can follow an earlier one: each question after the first is shown
// to the AI with the previous questions as conversation history, so a short
// follow-up like "and the HOA?" is tried the way it would really arrive.
//
// Needs .env: DB_URI, GEMINI_API_KEY, QDRANT_URL, QDRANT_API_KEY (and
// QDRANT_COLLECTION - use a dev collection, never the live one, when testing).
'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../model/property/productModel');
const { PRODUCT_TEMPLATE_FIELDS, resolvePropertyVariables } = require('../services/vtext/vtextTemplateService');
const { rewriteQuery } = require('../services/vtext/vtextKnowledgeService');
const { embedQuery } = require('../services/rag/embeddingService');
const { search, COLLECTION } = require('../services/rag/qdrantService');
const { formatRetrieved } = require('../services/vtext/vtextKnowledgeService');
const { generateDraftReply } = require('../services/vtext/vtextAiReplyService');

async function main() {
  const [slug, ...questions] = process.argv.slice(2);
  if (!slug || !questions.length) {
    throw new Error('Usage: node src/scripts/ragReplyEval.js <property-slug> "question" ["follow-up" ...]');
  }
  if (!process.env.DB_URI) throw new Error('DB_URI is not set.');

  await mongoose.connect(process.env.DB_URI);
  const product = await Product.findOne({ slug: slug.toLowerCase() }).select(PRODUCT_TEMPLATE_FIELDS).lean();
  if (!product) throw new Error(`No property with slug "${slug}".`);
  console.log(`Property: ${product.productName || slug}   Qdrant collection: ${COLLECTION}\n`);

  const facts = resolvePropertyVariables(product);
  const history = [];

  for (const question of questions) {
    history.push({ direction: 'in', body: question });
    console.log('='.repeat(72));
    console.log(`Question: ${question}`);

    const query = await rewriteQuery({ messages: history, replyToBody: question });
    if (query !== question) console.log(`Searched as: ${query}`);

    const started = Date.now();
    const vector = await embedQuery(query);
    const results = await search(vector, {
      filter: { must: [{ key: 'type', match: { value: 'property' } }, { key: 'slug', match: { any: [slug.toLowerCase()] } }] },
      limit: Number(process.env.RAG_VTEXT_TOP_K || 5),
      scoreThreshold: Number(process.env.RAG_VTEXT_MIN_SCORE || 0.4),
    });
    console.log(`Search: ${results.length} chunk(s) in ${Date.now() - started} ms`);
    for (const r of results) console.log(`  ${r.score.toFixed(3)}  ${r.payload.key}`);

    const knowledge = {
      properties: [{ slug, name: product.productName || slug, facts, quotePrice: null }],
      leadDetails: [],
      retrievedText: formatRetrieved(results, false),
    };
    const draft = await generateDraftReply({ contact: { name: 'Test' }, messages: history, replyToBody: question, propertyContext: facts, knowledge });
    console.log(`Reply:   ${draft ? draft.reply : '(no reply)'}`);
    if (draft) console.log(`Handoff: ${draft.needsHuman ? `yes (${draft.topic || 'no topic'})` : 'no'}`);

    if (draft) history.push({ direction: 'out', body: draft.reply });
  }
}

main()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('FAILED:', err.message);
    try { await mongoose.disconnect(); } catch (_e) {}
    process.exit(1);
  });
