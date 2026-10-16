// scripts/buildApprovedFaq.js
//
// Builds the list of FAQ entries the text assistant may use, from the exported entries
// (src/knowledge/faq-review.json) and the review decisions (src/knowledge/faq-decisions.json).
// Only entries marked "include" or "edit" are written. For "edit" the reviewer's note is the
// wording to use. An entry with no decision is treated as left out. Reads and writes local
// files only.
//
//   node src/scripts/buildApprovedFaq.js [--source faq]
//
// Output: src/knowledge/faq-approved.json
'use strict';

const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../knowledge');
const i = process.argv.indexOf('--source');
const source = i > -1 && process.argv[i + 1] ? process.argv[i + 1] : 'faq';

function readJson(name) {
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) throw new Error(`Missing ${path.relative(process.cwd(), file)}.`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function main() {
  const review = readJson(`${source}-review.json`);
  const { decisions } = readJson(`${source}-decisions.json`);

  const approved = [];
  const problems = [];
  for (const e of review.entries) {
    const d = decisions[e.id];
    if (!d || !d.decision) continue; // undecided: left out
    if (d.decision === 'include') {
      approved.push({ id: e.id, category: e.category, question: e.question, answer: e.answer });
    } else if (d.decision === 'edit') {
      const answer = String(d.note || '').trim();
      if (!answer) { problems.push(`${e.id}: marked "edit" but the note with the new wording is empty`); continue; }
      approved.push({ id: e.id, category: e.category, question: e.question, answer, edited: true });
    }
  }
  const unknown = Object.keys(decisions).filter((id) => !review.entries.some((e) => e.id === id));
  if (unknown.length) problems.push(`decisions for entries that are no longer in the export: ${unknown.join(', ')}`);
  if (problems.length) throw new Error(problems.join('\n'));

  const out = path.join(dir, `${source}-approved.json`);
  fs.writeFileSync(out, JSON.stringify({ source, count: approved.length, entries: approved }, null, 2) + '\n');
  const undecided = review.entries.filter((e) => !(decisions[e.id] && decisions[e.id].decision)).length;
  console.log(`Wrote ${approved.length} approved entries to ${path.relative(process.cwd(), out)} (${approved.filter((a) => a.edited).length} with edited wording, ${undecided} undecided and left out).`);
}

try {
  main();
} catch (err) {
  console.error('FAILED:', err.message);
  process.exit(1);
}
