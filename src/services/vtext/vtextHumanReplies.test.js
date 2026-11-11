// The AI text replies should read like a person texting (senior's ask, 2026-11-11).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildPrompt, parseModelOutput, looksLikeDeferral, humanizeDashes, detectQuotedPrice } = require("./vtextAiReplyService");

test("a price they put forward is found; a budget or a question is not", () => {
  assert.equal(detectQuotedPrice("I'd pay 20k for it"), 20000);
  assert.equal(detectQuotedPrice("would you take $18,000?"), 18000);
  assert.equal(detectQuotedPrice("my offer is 22k"), 22000);
  assert.equal(detectQuotedPrice("I can do $21,500"), 21500);
  assert.equal(detectQuotedPrice("would you take 18000"), 18000);
  assert.equal(detectQuotedPrice("I'd pay 19,500 for it"), 19500);
  assert.equal(detectQuotedPrice("anything under 200k?"), null);
  assert.equal(detectQuotedPrice("is the starting bid $25k?"), null);
  assert.equal(detectQuotedPrice("I'd pay cash"), null);
  assert.equal(detectQuotedPrice(""), null);
});

test("a quoted price always goes to the team, with the price as the topic", () => {
  // the AI flagged it itself
  const own = parseModelOutput(JSON.stringify({ reply: "Got it, $20k. Want someone to reach out?", needsHuman: false, topic: "", quotedPrice: 20000 }), "I'd pay 20k for it");
  assert.equal(own.needsHuman, true);
  assert.equal(own.topic, "quoted price $20k");
  assert.equal(own.quotedPrice, 20000);
  // the AI missed it: the code check still catches it
  const missed = parseModelOutput(JSON.stringify({ reply: "Got it! Want the link?", needsHuman: false, topic: "", quotedPrice: null }), "would you take $18,500?");
  assert.equal(missed.needsHuman, true);
  assert.equal(missed.topic, "quoted price $18,500");
  // no quote: unchanged
  const plain = parseModelOutput(JSON.stringify({ reply: "Bids start at $25k. Want the link?", needsHuman: false, topic: "", quotedPrice: null }), "how much is it?");
  assert.equal(plain.needsHuman, false);
  assert.equal(plain.topic, "");
  assert.equal(plain.quotedPrice, null);
});
const { SAFE_HANDOFF, checkReplyAmounts, customerTextsOf } = require("./vtextReplyGuard");

test("a plain number the customer typed supports the same amount in the reply; listing numbers do not", () => {
  const messages = [{ direction: "out", body: "Hi, it's Maya" }, { direction: "in", body: "would you take 18000" }];
  const customerTexts = customerTextsOf({ messages, replyToBody: "would you take 18000" });
  assert.equal(checkReplyAmounts({ reply: "Thanks, noted your $18k.", sourceTexts: [], customerTexts }).ok, true);
  // a zip code in the listing facts is not an amount
  assert.equal(checkReplyAmounts({ reply: "The reserve is $13,669.", sourceTexts: ["401 Rensselaer Ave, Ogdensburg, NY 13669"], customerTexts: [] }).ok, false);
});
const { humanReplyDelayMs } = require("./vtextDraftReplyService");

const withEnv = (vars, fn) => {
  const old = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  Object.assign(process.env, vars);
  try { return fn(); } finally {
    for (const [k, v] of Object.entries(old)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
};

test("an auto reply waits 20 to 50 seconds, longer for a long reply, at most 90", () => {
  withEnv({ VTEXT_AI_REPLY_DELAY_MIN_SEC: "", VTEXT_AI_REPLY_DELAY_MAX_SEC: "", VTEXT_AI_REPLY_DELAY_LONG_MAX_SEC: "" }, () => {
    const short = "Yep, still open! Want the link?";
    assert.equal(humanReplyDelayMs(short, () => 0), 20_000);
    assert.equal(humanReplyDelayMs(short, () => 1), 50_000);
    assert.equal(humanReplyDelayMs(short, () => 0.5), 35_000);
    assert.equal(humanReplyDelayMs("x".repeat(240), () => 0), 30_000); // 80 characters past 160 -> 10 s more
    assert.equal(humanReplyDelayMs("x".repeat(2000), () => 1), 90_000); // capped
  });
});

test("the wait can be changed or switched off from the environment", () => {
  withEnv({ VTEXT_AI_REPLY_DELAY_MAX_SEC: "0" }, () => assert.equal(humanReplyDelayMs("hi", () => 0.5), 0));
  withEnv({ VTEXT_AI_REPLY_DELAY_MIN_SEC: "5", VTEXT_AI_REPLY_DELAY_MAX_SEC: "10", VTEXT_AI_REPLY_DELAY_LONG_MAX_SEC: "" }, () =>
    assert.equal(humanReplyDelayMs("hi", () => 1), 10_000));
});

const args = { contact: { name: "Margaret" }, messages: [{ direction: "in", body: "ok how much" }], replyToBody: "ok how much", propertyContext: null };

test("the prompt asks for a person texting, not a chatbot", () => {
  const p = buildPrompt(args);
  assert.match(p, /friendly person from the team texting from their phone, not like a chatbot/);
  assert.match(p, /contractions/);
  assert.match(p, /end with ONE short, easy question/);
  assert.match(p, /When they are wrapping up/);
  assert.match(p, /Never use the long dash/);
  assert.match(p, /"Let me know if you have any other questions"/); // listed as a phrase NOT to use
  assert.match(p, /What's the catch\?/);
  assert.doesNotMatch(p, /1 to 3 sentences/);
});

test("confused: 'Does that make sense?', not a sales question; register: the FAQ page; hand-off asks a good time", () => {
  const p = buildPrompt(args);
  assert.match(p, /end with "Does that make sense\?" or an offer of help\. Never a sales question then/);
  assert.match(p, /our FAQ page, https:\/\/www\.vihara\.ai\/faqs/);
  assert.match(p, /What's a good time to call or text you\?/);
  assert.match(p, /"bestTime"/);
});

test("the lead's own home also carries auction type, occupancy, size, year, HOA and taxes", () => {
  const { propertyFacts } = require("./vtextKnowledgeService");
  const f = propertyFacts({ street: "401 Rensselaer Ave", startBid: 25000, onlineOrInPerson: "Online", occupancyStatus: "Occupied", squareFootage: 2048, yearBuilt: 1918, monthlyHOADues: 0, investmentData: { taxData: { annualPropertyTax: 3644 } } });
  assert.equal(f.property_price, "$25,000");
  assert.equal(f["Auction type"], "Online auction");
  assert.equal(f.Occupancy, "Occupied");
  assert.equal(f["Square feet"], "2,048");
  assert.equal(f["Year built"], "1918");
  assert.equal(f["Monthly HOA"], "none");
  assert.equal(f["Annual property tax"], "$3,644");
  const bare = propertyFacts({ street: "1 A St" });
  assert.equal(bare.Occupancy, undefined); // a missing field is left out, never guessed
  assert.equal(bare["Annual property tax"], undefined);
});

test("the good-time question is asked once per conversation, not on every hand-off", () => {
  const asked = buildPrompt({ ...args, messages: [{ direction: "out", body: "I'll have someone reach out. What's a good time to call or text you?" }, { direction: "in", body: "taxes?" }], replyToBody: "taxes?" });
  assert.match(asked, /You already asked them for a good time to call or text in this conversation\. Do NOT ask again/);
  assert.doesNotMatch(asked, /ask once when suits them/);
  const fresh = buildPrompt(args);
  assert.match(fresh, /ask once when suits them/);
});

test("a time they give to be called or texted goes to the team and is kept", () => {
  const d = parseModelOutput(JSON.stringify({ reply: "Got it, after 5 works. I'll let the team know.", needsHuman: false, topic: "", bestTime: "after 5pm" }), "after 5pm is good");
  assert.equal(d.needsHuman, true);
  assert.equal(d.bestTime, "after 5pm");
  assert.equal(d.topic, "wants a call or text");
  const kept = parseModelOutput(JSON.stringify({ reply: "Got it.", needsHuman: true, topic: "viewing the house", bestTime: "tomorrow morning" }), "tomorrow morning");
  assert.equal(kept.topic, "viewing the house");
  const none = parseModelOutput(JSON.stringify({ reply: "It starts at $25k.", needsHuman: false, topic: "", bestTime: "" }), "how much");
  assert.equal(none.bestTime, "");
  assert.equal(none.needsHuman, false);
});

test("long dashes between words become commas; number ranges stay", () => {
  assert.equal(humanizeDashes("You can talk to the team though—would you like that?"), "You can talk to the team though, would you like that?");
  assert.equal(humanizeDashes("It's a 3 bed – great spot"), "It's a 3 bed, great spot");
  assert.equal(humanizeDashes("Bidding Nov 7–15, 11 AM–3 PM"), "Bidding Nov 7–15, 11 AM–3 PM");
  assert.equal(humanizeDashes("12 Oak St - starting bid $95,000"), "12 Oak St - starting bid $95,000");
  assert.equal(parseModelOutput(JSON.stringify({ reply: "Sure—want the link?", needsHuman: false })).reply, "Sure, want the link?");
});

test("person-like hand-offs still count as hand-offs; offers do not", () => {
  assert.equal(looksLikeDeferral("Good question, let me check with the team and get back to you."), true);
  assert.equal(looksLikeDeferral("I'll have someone from our team text you about that."), true);
  assert.equal(looksLikeDeferral("A team member will follow up."), true);
  assert.equal(looksLikeDeferral("Want someone from the team to reach out?"), false);
  assert.equal(looksLikeDeferral("Someone from the team can walk you through it. Want that?"), false);
  assert.equal(looksLikeDeferral(SAFE_HANDOFF), true);
  assert.doesNotMatch(SAFE_HANDOFF, /shortly|team member/);
});
