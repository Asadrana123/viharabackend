const { test } = require("node:test");
const assert = require("node:assert/strict");
const { toorakReplyRules } = require("./vtextToorakReplyRules");
const { buildPrompt } = require("./vtextAiReplyService");

const home = {
  kind: "property", key: "ml-baltimore", propertySlug: "2529-2531-e-monument-st-baltimore",
  listingUrl: "https://vihara.ai/listing/2529-2531-e-monument-st-baltimore",
  address: "2529-2531 E Monument St, Baltimore", saleStartsAt: "2026-11-07T11:00:00-05:00",
};
const financing = { kind: "financing", key: "financing-v2", propertySlug: "", listingUrl: "https://vihara.ai/auctions", address: "", saleStartsAt: "" };
const BEFORE = new Date("2026-11-03T15:00:00Z");
const AFTER = new Date("2026-11-08T15:00:00Z");

test("no Toorak lead: no extra rules, the prompt is unchanged", () => {
  assert.equal(toorakReplyRules(null), "");
  const args = { contact: { name: "Ann" }, messages: [{ direction: "in", body: "hi" }], replyToBody: "hi", propertyContext: null };
  assert.doesNotMatch(buildPrompt(args), /Toorak/);
});

test("property lead: the home, the sale day before the sale, the scripts' rules", () => {
  const r = toorakReplyRules(home, BEFORE);
  assert.match(r, /Facebook ad for 2529-2531 E Monument St, Baltimore/);
  assert.match(r, /sells online this Saturday, Nov 7/);
  assert.match(r, /cash or planning to finance/);
  assert.match(r, /cal\.com\/vihara-ai-advisor/);
  assert.match(r, /Never mention fees, deposits/);
  assert.match(r, /never "free"/);
  assert.match(r, /RL Auction Inc/);
  assert.match(r, /listing\/2529-2531-e-monument-st-baltimore/);
  assert.doesNotMatch(toorakReplyRules(home, AFTER), /Saturday/);
});

test("financing lead: no home named, still the advisor link", () => {
  const r = toorakReplyRules(financing, BEFORE);
  assert.match(r, /financing form/);
  assert.doesNotMatch(r, /Facebook ad for/);
  assert.match(r, /cal\.com\/vihara-ai-advisor/);
});

test("the rules land in the prompt, before the facts", () => {
  const p = buildPrompt({ contact: { name: "Ann" }, messages: [{ direction: "in", body: "yes" }], replyToBody: "yes", propertyContext: null, toorak: home, now: BEFORE });
  assert.ok(p.indexOf("This is a Facebook (Toorak) lead") < p.indexOf("Property on file"));
});
