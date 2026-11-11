const { test } = require("node:test");
const assert = require("node:assert/strict");
const VtextConversation = require("../../model/vtext/vtextConversationModel");
const VtextContact = require("../../model/vtext/vtextContactModel");
const VtextMessage = require("../../model/vtext/vtextMessageModel");
const slack = require("../shared/slackService");
const { dueReminder, waitedWords, runNeedsHumanReminders } = require("./vtextNeedsHumanReminder");

const NOW = new Date("2026-11-11T18:00:00Z");
const ago = (min) => new Date(NOW.getTime() - min * 60_000);
const conv = (over) => ({ needsHuman: true, needsHumanAt: ago(0), needsHumanReminders: 0, ...over });

test("first reminder after 30 minutes, the last after 2 hours, then none", () => {
  assert.equal(dueReminder(conv({ needsHumanAt: ago(29) }), NOW), 0);
  assert.equal(dueReminder(conv({ needsHumanAt: ago(30) }), NOW), 1);
  assert.equal(dueReminder(conv({ needsHumanAt: ago(90), needsHumanReminders: 1 }), NOW), 0);
  assert.equal(dueReminder(conv({ needsHumanAt: ago(120), needsHumanReminders: 1 }), NOW), 2);
  assert.equal(dueReminder(conv({ needsHumanAt: ago(500), needsHumanReminders: 2 }), NOW), 0); // done: no spam
  assert.equal(dueReminder(conv({ needsHumanAt: ago(150) }), NOW), 2); // missed the first window: only the last one
});

test("no reminder once the team replied or marked it handled, or for an old flag with no start time", () => {
  assert.equal(dueReminder(conv({ needsHuman: false, needsHumanAt: ago(60) }), NOW), 0);
  assert.equal(dueReminder(conv({ needsHumanAt: undefined }), NOW), 0);
});

test("waiting time in words", () => {
  assert.equal(waitedWords(ago(35), NOW), "35 minutes");
  assert.equal(waitedWords(ago(60), NOW), "1 hour");
  assert.equal(waitedWords(ago(125), NOW), "2 hours 5 minutes");
});

test("a due conversation is claimed, then posted once to Slack with what the team needs", async (t) => {
  const waiting = { _id: "c1", contactId: "p1", propertyId: null, needsHuman: true, needsHumanAt: ago(40), needsHumanReminders: 0, bestTimeToReach: "after 5pm" };
  const chain = (v) => ({ select: () => chain(v), sort: () => chain(v), limit: () => chain(v), lean: async () => v });
  t.mock.method(VtextConversation, "find", () => chain([waiting]));
  const claims = [];
  t.mock.method(VtextConversation, "updateOne", async (filter, update) => { claims.push({ filter, update }); return { modifiedCount: 1 }; });
  t.mock.method(VtextContact, "findById", () => chain({ name: "Margaret", phoneE164: "+15555550100" }));
  t.mock.method(VtextMessage, "findOne", (q) => chain(q.direction === "in" ? { body: "can somebody just call me" } : { aiDraft: { topic: "call request" } }));
  const posts = [];
  t.mock.method(slack, "notifyVtextAlert", async (a) => { posts.push(a); return true; });

  const out = await runNeedsHumanReminders({ now: NOW });
  assert.deepEqual(out, { checked: 1, sent: 1 });
  assert.deepEqual(claims[0].filter, { _id: "c1", needsHuman: true, needsHumanReminders: 0 });
  assert.deepEqual(claims[0].update, { $set: { needsHumanReminders: 1 } });
  assert.equal(posts.length, 1);
  assert.equal(posts[0].title, "Still waiting for a reply after 40 minutes");
  const field = (label) => posts[0].fields.find((f) => f.label === label)?.value;
  assert.equal(field("Contact"), "Margaret");
  assert.equal(field("Topic"), "call request");
  assert.equal(field("Best time to reach them"), "after 5pm");
  assert.equal(field("Their last text"), "can somebody just call me");
});

test("handled while we looked (the claim matches nothing): no post", async (t) => {
  const chain = (v) => ({ select: () => chain(v), sort: () => chain(v), limit: () => chain(v), lean: async () => v });
  t.mock.method(VtextConversation, "find", () => chain([{ _id: "c2", needsHuman: true, needsHumanAt: ago(45), needsHumanReminders: 0 }]));
  t.mock.method(VtextConversation, "updateOne", async () => ({ modifiedCount: 0 }));
  const posts = [];
  t.mock.method(slack, "notifyVtextAlert", async (a) => { posts.push(a); return true; });
  const out = await runNeedsHumanReminders({ now: NOW });
  assert.equal(out.sent, 0);
  assert.equal(posts.length, 0);
});
