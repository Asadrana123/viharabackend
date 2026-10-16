// scripts/ragChunkAudit.js
//
// Safety check for the knowledge base: proves that nothing outside the ALLOWED
// list can reach a chunk, and that confidential values never appear in chunk text.
// Reads local Mongo only. Sends nothing, writes nothing, calls no outside service.
//
//   node src/scripts/ragChunkAudit.js            -> every property in the local database
//   node src/scripts/ragChunkAudit.js <slug>     -> one property
//   add --strict to also fail (exit 1) when any listing contradicts itself
//
// Exits 1 on any failure, so it can be run before a deploy or in CI.
//
// It also lists listings that contradict themselves (the number fields against the listing text,
// for example beds 5 but "4 Bedrooms"), for whoever owns the listing data to correct. The chunker
// keeps both versions out of what the AI reads; the data itself still needs fixing.
//
// How: every field of a property is replaced with a unique marker, the chunker
// runs, and each marker found in the chunk text is a field that reaches the
// knowledge base. Any such field that is not in ALLOWED_FIELDS is a failure.
// Then the real values are checked: the reserve price, the current bid and the
// listing agent's details must not appear in any chunk.
'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const { chunkProperty, ALLOWED_FIELDS } = require('../services/rag/propertyChunker');
const { findConflicts } = require('../services/rag/propertyDataConflicts');

const ALLOWED = new Set(ALLOWED_FIELDS);
const fullDate = (d) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

function buildMarked(doc) {
  let n = 0;
  const tokens = new Map(); // path -> { kind, val }
  const mark = (v, path) => {
    if (Array.isArray(v)) return v.map((x) => mark(x, `${path}[]`));
    if (v instanceof Date) {
      const d = new Date(Date.UTC(2031, 0, 1) + ++n * 86400000);
      tokens.set(path, { kind: 'date', val: d });
      return d;
    }
    if (v && typeof v === 'object' && v._bsontype) return v; // ObjectId etc.
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mark(x, path ? `${path}.${k}` : k)]));
    }
    if (typeof v === 'number') {
      const x = 7000000 + ++n * 13;
      tokens.set(path, { kind: 'num', val: x });
      return x;
    }
    if (typeof v === 'string' && v.trim()) {
      const s = `ZQ${++n}QZ`;
      tokens.set(path, { kind: 'str', val: s });
      return s;
    }
    return v;
  };
  const marked = mark(doc, '');
  marked.slug = doc.slug; // keep the real slug so the chunker runs
  return { marked, tokens };
}

function reaches(text, { kind, val }) {
  if (kind === 'str') return text.includes(val);
  if (kind === 'num') return text.includes(val.toLocaleString('en-US')) || text.includes(String(val));
  return text.includes(fullDate(val));
}

async function main() {
  if (!process.env.DB_URI) throw new Error('DB_URI is not set.');
  await mongoose.connect(process.env.DB_URI);

  const strict = process.argv.includes('--strict');
  const slug = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const query = slug ? { slug: slug.toLowerCase() } : { slug: { $type: 'string', $ne: '' } };
  const docs = await mongoose.connection.db.collection('productmodels').find(query).toArray();
  if (!docs.length) throw new Error('No properties found to audit.');

  const failures = [];
  const reached = new Set();
  const conflicts = []; // { slug, items }

  for (const doc of docs) {
    const label = doc.slug;

    // 1. Marker test: which fields reach chunk text?
    const { marked, tokens } = buildMarked(doc);
    const text = chunkProperty(marked).map((c) => c.text).join('\n');
    for (const [path, tok] of tokens) {
      if (reaches(text, tok)) {
        reached.add(path);
        if (!ALLOWED.has(path)) failures.push(`${label}: field "${path}" reaches the knowledge base but is not in ALLOWED_FIELDS`);
      }
    }

    // 2. Real-value test: confidential and listing-agent values must be absent.
    const realText = chunkProperty(doc).map((c) => c.text).join('\n');
    const money = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? `$${Math.round(Number(v)).toLocaleString('en-US')}` : '');
    const publicAmounts = new Set([doc.startBid, doc.minIncrement, doc.emd, doc.investmentData?.valuation?.ViharaValue].map(money).filter(Boolean));
    for (const [name, value] of [['reservePrice', doc.reservePrice], ['currentBid', doc.currentBid]]) {
      const m = money(value);
      if (m && !publicAmounts.has(m) && realText.includes(m)) failures.push(`${label}: ${name} value ${m} appears in a chunk`);
    }
    const agent = doc.listingAgent || {};
    for (const [name, value] of Object.entries(agent)) {
      if (typeof value === 'string' && value.trim().length >= 4 && realText.includes(value.trim())) {
        failures.push(`${label}: listingAgent.${name} appears in a chunk`);
      }
    }
    if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(realText)) failures.push(`${label}: an email address appears in a chunk`);

    // 3. Contradictions inside the record: listed for the data owners, and the contradicting text must not reach a chunk.
    const found = findConflicts(doc);
    if (found.length) {
      conflicts.push({ slug: label, items: found });
      for (const c of found) {
        const text = c.line || c.textValue;
        if (typeof text === 'string' && text.length >= 4 && realText.includes(text)) failures.push(`${label}: the contradicting text "${text}" (${c.field}) still reaches a chunk`);
      }
    }
  }

  console.log(`Audited ${docs.length} propert${docs.length === 1 ? 'y' : 'ies'}. ${reached.size} distinct fields reach the knowledge base; ${ALLOWED.size} are allowed.`);
  const sensitive = [...reached].filter((p) => /reserve|bidder|seller|email|licen|apn|trustee|listingAgent|brevo/i.test(p));
  console.log(`Sensitive-looking fields that reach it: ${sensitive.length ? sensitive.join(', ') : 'none'}`);

  if (conflicts.length) {
    console.log(`\nListings that contradict themselves (${conflicts.length} of ${docs.length}). The number field is used by the AI; the listing text needs correcting:`);
    for (const { slug: sl, items } of conflicts) {
      for (const c of items) console.log(`  - ${sl}: ${c.field} is ${c.fieldValue} in the fields but ${JSON.stringify(c.textValue)} in the listing text`);
    }
    if (strict) failures.push(`${conflicts.length} listing(s) contradict themselves (--strict)`);
  } else {
    console.log('\nNo listing contradicts itself.');
  }

  if (failures.length) {
    console.error(`\nFAILED (${failures.length}):\n- ${failures.join('\n- ')}`);
    return 1;
  }
  console.log('PASSED: nothing outside the allowed list reaches the knowledge base.');
  return 0;
}

main()
  .then(async (code) => {
    await mongoose.disconnect();
    process.exit(code);
  })
  .catch(async (err) => {
    console.error('FAILED:', err.message);
    try { await mongoose.disconnect(); } catch (_e) {}
    process.exit(1);
  });
