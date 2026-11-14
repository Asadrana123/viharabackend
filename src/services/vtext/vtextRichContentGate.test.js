const test = require("node:test");
const assert = require("node:assert/strict");
const VtextMessage = require("../../model/vtext/vtextMessageModel");
const { hasLink, isReactionText, hasWrittenReply, decideRichContent, applyRichContentRule, BLOCK_REASON } = require("./vtextRichContentGate");
const { firstLeadText } = require("./firstLeadText");
const { bodyForContact, stepDefinition, TOTAL_STEPS, planFollowUps } = require("./vtextFollowUpSequence");
const { reminderText } = require("../calcom/calcomPayload");

test("hasLink finds http, www and bare domains, and nothing in plain texts", () => {
  for (const t of [
    "register: https://www.vihara.ai/listing/12-oak",
    "see www.vihara.ai",
    "Book here cal.com/vihara/walkthrough",
    "Go to vihara.ai/listing/x",
    "Join here: http://meet.google.com/abc",
  ]) {
    assert.equal(hasLink(t), true, t);
  }
  for (const t of [
    firstLeadText("Jane"),
    firstLeadText(""),
    "Hi Jane, checking in. Will you be participating in the auction?",
    "The sale is on Nov. 15 at 3 p.m. at 12 Oak St. Questions?",
    "Starting bid is $95,000.00 - 3.5 baths",
  ]) {
    assert.equal(hasLink(t), false, t);
  }
});

test("isReactionText spots tapbacks, not real replies", () => {
  assert.equal(isReactionText("Loved “Hi Jane - this is Maya from Vihara.”"), true);
  assert.equal(isReactionText("Laughed at “haha”"), true);
  assert.equal(isReactionText("Reacted 👍 to “Are you there?”"), true);
  assert.equal(isReactionText('Liked "Are you there?"'), true);
  assert.equal(isReactionText("Removed a heart from “Are you there?”"), true);
  assert.equal(isReactionText("Yes I'm here"), false);
  assert.equal(isReactionText("Loved the photos, what's the starting bid?"), false);
});

test("before a reply: image dropped, body goes alone", () => {
  const r = decideRichContent({ body: "Hi Jane, still interested?", media: { file: "meme1.jpeg" }, replied: false });
  assert.equal(r.body, "Hi Jane, still interested?");
  assert.equal(r.media, undefined);
  assert.equal(r.blockReason, undefined);
  assert.deepEqual(r.changes, ["image left out (no reply yet)"]);
});

test("before a reply: a link is swapped for the link-free text, or blocked when there is none", () => {
  const swapped = decideRichContent({ body: "Join here: https://meet.google.com/x", bodyWithoutLinks: "The link is in your invite.", replied: false });
  assert.equal(swapped.body, "The link is in your invite.");
  assert.equal(swapped.blockReason, undefined);

  const blocked = decideRichContent({ body: "Register: https://vihara.ai/listing/x", replied: false });
  assert.equal(blocked.blockReason, BLOCK_REASON);

  // A "link-free" version that still has a link doesn't count.
  const stillLink = decideRichContent({ body: "https://a.com", bodyWithoutLinks: "see vihara.ai", replied: false });
  assert.equal(stillLink.blockReason, BLOCK_REASON);
});

test("after a written reply: links and images go as they are", () => {
  const r = decideRichContent({ body: "Here it is: https://vihara.ai/listing/x", media: { file: "meme1.jpeg" }, replied: true });
  assert.equal(r.body, "Here it is: https://vihara.ai/listing/x");
  assert.deepEqual(r.media, { file: "meme1.jpeg" });
  assert.equal(r.blockReason, undefined);
});

test("hasWrittenReply: no lookup for a contact who never texted; tapbacks are excluded in the query", async (t) => {
  const calls = [];
  t.mock.method(VtextMessage, "exists", async (q) => {
    calls.push(q);
    return { _id: "m1" };
  });
  assert.equal(await hasWrittenReply({ _id: "c1" }), false);
  assert.equal(calls.length, 0);

  assert.equal(await hasWrittenReply({ _id: "c1", lastInboundAt: new Date() }), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].direction, "in");
  assert.ok(calls[0].body.$not.test("Loved “hi”"));
  assert.ok(!calls[0].body.$not.test("yes"));
});

test("applyRichContentRule skips the lookup for plain text", async (t) => {
  const exists = t.mock.method(VtextMessage, "exists", async () => null);
  const r = await applyRichContentRule({ contact: { _id: "c1", lastInboundAt: new Date() }, body: firstLeadText("Jane") });
  assert.equal(r.body, firstLeadText("Jane"));
  assert.equal(exists.mock.callCount(), 0);
});

test("Cal.com reminder: the link-free version has no links", () => {
  const base = { name: "Jane Doe", startTime: new Date("2026-11-04T23:00:00Z"), timeZone: "America/Los_Angeles", now: new Date("2026-11-04T22:30:00Z") };
  assert.equal(hasLink(reminderText({ ...base, meetingUrl: "https://meet.google.com/abc", uid: "xyz" })), true);
  const plain = reminderText({ ...base, meetingUrl: "", uid: "" });
  assert.equal(hasLink(plain), false);
  assert.match(plain, /video link is in your calendar invite/);
});

test("follow-ups: 3 text-only steps on days 1, 3 and 6, no links, no images", () => {
  assert.equal(TOTAL_STEPS, 3);
  assert.deepEqual([1, 2, 3].map((s) => stepDefinition(s).offsetDays), [1, 3, 6]);
  for (const s of [1, 2, 3]) {
    const def = stepDefinition(s);
    assert.equal(def.media, undefined);
    for (const b of def.bodies) assert.equal(hasLink(b), false, b);
  }
});

test("follow-ups: a contact always gets the same wording; contacts are spread across wordings", () => {
  const def = stepDefinition(2);
  assert.equal(bodyForContact(def, "673f0a1b2c3d4e5f6a7b8c9d"), bodyForContact(def, "673f0a1b2c3d4e5f6a7b8c9d"));
  const seen = new Set();
  for (let i = 0; i < 50; i++) seen.add(bodyForContact(def, `673f0a1b2c3d4e5f6a7b8c${String(i).padStart(2, "0")}`));
  assert.equal(seen.size, def.bodies.length);
});

test("follow-ups: a sequence already 2 old steps in only has the day-6 text left; 3+ in has none", () => {
  const signupDay = "2026-11-10";
  assert.deepEqual(planFollowUps({ signupDay, today: "2026-11-12", auctionDay: null, doneSteps: [1, 2], takenDays: [signupDay] }), [{ step: 3, day: "2026-11-16" }]);
  assert.deepEqual(planFollowUps({ signupDay, today: "2026-11-13", auctionDay: null, doneSteps: [1, 2, 3], takenDays: [signupDay] }), []);
  // The auction cuts it short.
  assert.deepEqual(planFollowUps({ signupDay, today: signupDay, auctionDay: "2026-11-14", takenDays: [signupDay] }), [
    { step: 1, day: "2026-11-11" },
    { step: 2, day: "2026-11-13" },
  ]);
});
