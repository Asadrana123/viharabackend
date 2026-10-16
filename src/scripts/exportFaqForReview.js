// scripts/exportFaqForReview.js
//
// Turns the website's FAQ (or glossary) into a plain-text review file, so a person at Vihara can
// approve each entry before the text AI is allowed to use it. Nothing is indexed here. Reads the
// website's data file only; writes one JSON file. No database, no network.
//
//   node src/scripts/exportFaqForReview.js                       -> FAQ page, to src/knowledge/faq-review.json
//   node src/scripts/exportFaqForReview.js --source glossary     -> glossary, to src/knowledge/glossary-review.json
//   node src/scripts/exportFaqForReview.js --site <path to the website's src/components/Resources>
//
// The website repo is separate, so this is a local tool: the reviewed text is saved in this repo
// and is re-exported when the website's content changes. Each entry gets a stable id (a hash of
// its question), plain text, and automatic flags with a suggested decision. The suggestion is
// advice for the reviewer, never a decision.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const SOURCES = {
  faq: { file: 'Faqs/faqData.js', variable: 'faqData', out: 'faq-review.json' },
  glossary: { file: 'Glossary/glossaryData.js', variable: 'glosaryData', out: 'glossary-review.json' },
};

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** Runs a website data file (an ES module with plain data) and returns one of its variables. */
function loadVariable(file, variable) {
  const code = fs
    .readFileSync(file, 'utf8')
    .replace(/^import .*$/gm, '')
    .replace(/^export default .*$/gm, '')
    .replace(/export const /g, 'const ');
  return vm.runInNewContext(`${code}\n;${variable}`, {}, { timeout: 5000 });
}

const ENTITIES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&rsquo;': '’', '&lsquo;': '‘', '&ldquo;': '“', '&rdquo;': '”' };

/** HTML answer to readable plain text: list items become "- " lines, tags and extra whitespace go. */
function toPlainText(html) {
  return String(html || '')
    .replace(/\s+/g, ' ') // source indentation and line breaks mean nothing in HTML: start from single spaces
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|ul|ol|li)>/gi, '\n')
    .replace(/<li[^>]*>\s*/gi, '\n- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? ' ')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Automatic flags ───────────────────────────────────────────────────────────
// level: "exclude" (suggest leaving out), "review" (a person must confirm it is current and safe),
// "note" (information only). The strongest level among an entry's flags becomes its suggestion.
const RULES = [
  { id: 'reserve', level: 'exclude', test: /reserve|subject to (the )?seller'?s? approval/i, reason: 'About the reserve price or whether sellers accept less. The AI is told never to discuss the reserve or negotiation.' },
  { id: 'below-offer', level: 'exclude', test: /below the reserve|accept (a )?(lower|bids)|counter ?bid/i, reason: 'Describes accepting or countering offers, which is negotiation.' },
  { id: 'live-foreclosure', level: 'review', test: /live (foreclosure )?auction|courthouse|trustee|in person at|postponed|canceled/i, reason: 'Describes live or courthouse foreclosure auctions, not the online auctions the texts are about.' },
  { id: 'financing', level: 'review', test: /mortgage|financ|cash only|loan|hard money/i, reason: 'A payment or financing policy. Confirm it is current.' },
  { id: 'numbers', level: 'review', test: /\$\s?\d|\d+\s?%|\b\d+\s*(hours?|days?|minutes?|properties)\b|\b(six|seven|twelve|twenty)\b\s+(hours?|days?)/i, reason: 'Contains a specific amount, percentage, deadline or limit. Confirm it is current.' },
  { id: 'legal', level: 'review', test: /\b(deed|lien|warranty|legal|escrow|purchase agreement|lawyer|attorney|title (company|insurance|transfer))\b/i, reason: 'Touches legal or contract matters. The AI must not give legal advice.' },
  { id: 'special-program', level: 'review', test: /match the bid|registration limit|limit on the number|purchase profile|direct offer|proxy/i, reason: 'A specific program or rule that may change. Confirm it is current.' },
  { id: 'agents', level: 'review', test: /real estate agent|buyer'?s agent|commission|broker/i, reason: 'About agents or commissions, which vary by listing.' },
  { id: 'wording', level: 'note', test: /bank-owned|\bREO\b|foreclosure/i, reason: 'Uses "bank-owned" or "foreclosure" wording that the calling scripts deliberately dropped.' },
  { id: 'screens', level: 'note', test: /navigation bar|click|dashboard|tab\b|button|log in|sign up/i, reason: 'Refers to screens on the website. Fine if a text can say where to look.' },
];

function assess(question, answer) {
  const text = `${question}\n${answer}`;
  const flags = RULES.filter((r) => r.test.test(text)).map((r) => ({ id: r.id, level: r.level, reason: r.reason }));
  const suggestion = flags.some((f) => f.level === 'exclude') ? 'exclude' : flags.some((f) => f.level === 'review') ? 'review' : 'include';
  return { flags, suggestion };
}

function main() {
  const sourceName = arg('source', 'faq');
  const source = SOURCES[sourceName];
  if (!source) throw new Error(`Unknown --source "${sourceName}". Use one of: ${Object.keys(SOURCES).join(', ')}.`);

  const site = path.resolve(arg('site', path.join(__dirname, '../../../../vihara-new-website/src/components/Resources')));
  const file = path.join(site, source.file);
  if (!fs.existsSync(file)) throw new Error(`Cannot find ${file}. Pass --site <path to the website's src/components/Resources>.`);

  const data = loadVariable(file, source.variable);
  const entries = [];
  const seen = new Set();
  for (const group of data) {
    for (const item of group.questions || []) {
      const question = toPlainText(item.question);
      const answer = toPlainText(item.answer);
      if (!question || !answer) continue;
      const id = `${sourceName}-${crypto.createHash('sha1').update(question.toLowerCase()).digest('hex').slice(0, 8)}`;
      if (seen.has(id)) continue; // the same question twice in one source
      seen.add(id);
      entries.push({ id, source: sourceName, category: String(group.category || '').trim(), question, answer, ...assess(question, answer) });
    }
  }

  const outDir = path.join(__dirname, '../knowledge');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, source.out);
  fs.writeFileSync(outFile, JSON.stringify({ source: sourceName, exportedFrom: path.relative(process.cwd(), file), count: entries.length, entries }, null, 2) + '\n');

  const tally = entries.reduce((t, e) => ((t[e.suggestion] = (t[e.suggestion] || 0) + 1), t), {});
  console.log(`Exported ${entries.length} ${sourceName} entries to ${path.relative(process.cwd(), outFile)}`);
  console.log(`Suggested: include ${tally.include || 0}, review ${tally.review || 0}, exclude ${tally.exclude || 0}`);
}

try {
  main();
} catch (err) {
  console.error('FAILED:', err.message);
  process.exit(1);
}
