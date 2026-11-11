// scripts/vtextReplyDryRun.js
//
// Writes the AI text replies a lead would get, through the same steps a real inbound text takes
// (vtextKnowledgeService.buildReplyKnowledge -> vtextAiReplyService.generateDraftReply -> the dollar
// check in vtextReplyGuard), but SENDS NOTHING and WRITES NOTHING: it only reads Mongo and Qdrant
// and calls Gemini. No contact, conversation or message is created.
//
//   node src/scripts/vtextReplyDryRun.js <property-slug | -> "question" ["follow-up" ...]
//
// <property-slug> is the home the pretend lead signed up for; "-" means a lead with no home.
// Each question after the first is sent with the earlier ones (and the replies) as history.
//
// Needs .env: DB_URI, GEMINI_API_KEY, QDRANT_URL, QDRANT_API_KEY (and QDRANT_COLLECTION: a dev
// collection when testing). VTEXT_RAG_CATALOG=false shows the replies without the other homes.
'use strict';

require('dotenv').config();
// Nothing may reach a person or Slack from here (a failed search would otherwise post a Slack alert).
process.env.OUTBOUND_DISABLED = 'true';
require('../config/outboundSwitch').installOutboundGuards();
const mongoose = require('mongoose');
const Product = require('../model/property/productModel');
const { buildReplyKnowledge } = require('../services/vtext/vtextKnowledgeService');
const { loadOpenIndex, describeFilters } = require('../services/vtext/vtextListingCatalog');
const { generateDraftReply } = require('../services/vtext/vtextAiReplyService');
const { SAFE_HANDOFF, checkReplyAmounts, collectSourceTexts, customerTextsOf } = require('../services/vtext/vtextReplyGuard');

async function main() {
  const args = process.argv.slice(2);
  const asOfArg = args.find((a) => a.startsWith('--as-of='));
  const [slug, ...questions] = args.filter((a) => a !== asOfArg);
  if (!slug || !questions.length) {
    throw new Error('Usage: node src/scripts/vtextReplyDryRun.js [--as-of=YYYY-MM-DD] <property-slug | -> "question" ["follow-up" ...]');
  }
  if (!process.env.DB_URI) throw new Error('DB_URI is not set.');
  await mongoose.connect(process.env.DB_URI);

  // --as-of: which homes count as still open, for an old copy of the database whose auctions have all closed.
  let now = new Date();
  if (asOfArg) {
    now = new Date(`${asOfArg.slice('--as-of='.length)}T00:00:00Z`);
    if (Number.isNaN(now.getTime())) throw new Error(`Bad date in ${asOfArg}`);
  }
  const { homes } = await loadOpenIndex({ now });
  console.log(`Homes open as of ${now.toISOString().slice(0, 10)}: ${homes.length}`);

  // A pretend contact: no phone (so no real lead is matched), the home set the way a follow-up sets it.
  const contact = { name: 'Margaret' };
  if (slug !== '-') {
    const product = await Product.findOne({ slug: slug.toLowerCase() }).select('_id productName').lean();
    if (!product) throw new Error(`No property with slug "${slug}".`);
    contact.followUp = { propertyId: product._id };
    console.log(`Lead signed up for: ${product.productName || slug}`);
  } else {
    console.log('Lead with no home on file');
  }

  const history = [];
  for (const question of questions) {
    history.push({ direction: 'in', body: question });
    console.log('='.repeat(72));
    console.log(`Text in:  ${question}`);

    const knowledge = await buildReplyKnowledge({ contact, messages: history, replyToBody: question, now });
    if (knowledge.retrieval.query && knowledge.retrieval.query !== question) console.log(`Searched:  ${knowledge.retrieval.query}`);
    const hs = knowledge.homeSearch;
    if (hs) console.log(`Home search: ${describeFilters(hs.filters)} -> ${hs.total} match${hs.relaxed ? ` (none exact; closest shown, ${hs.relaxed} dropped)` : ''}; shown: ${hs.shown.join(', ') || '-'}`);
    else if (knowledge.otherHomes?.failed) console.log('Home search: FAILED');
    if (knowledge.mentionedSlugs?.length) console.log(`Also looked up: ${knowledge.mentionedSlugs.join(', ')}`);
    if (knowledge.retrieval.error) console.log(`Search error: ${knowledge.retrieval.error}`);

    let draft = await generateDraftReply({ contact, messages: history, replyToBody: question, propertyContext: knowledge.propertyContext, knowledge });
    if (draft) {
      const check = checkReplyAmounts({
        reply: draft.reply,
        sourceTexts: collectSourceTexts({ knowledge, messages: history, replyToBody: question }),
        customerTexts: customerTextsOf({ messages: history, replyToBody: question }),
      });
      if (!check.ok) {
        console.log(`Guard:    replaced, amounts not given to the AI: ${check.unsupported.join(', ')} (draft was: ${draft.reply})`);
        draft = { reply: SAFE_HANDOFF, needsHuman: true, topic: 'amount to check' };
      }
    }
    console.log(`Reply:    ${draft ? draft.reply : '(no reply)'}`);
    if (draft) console.log(`Handoff:  ${draft.needsHuman ? `yes (${draft.topic || 'no topic'})` : 'no'}`);
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
