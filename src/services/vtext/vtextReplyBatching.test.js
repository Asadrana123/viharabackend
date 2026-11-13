// Several texts in a row get one AI reply, and replies keep their order (draftReplyWorker.js).
// The pure parts always run; the parts that read Mongo use a throwaway local database and are skipped when no local
// Mongo is running. Nothing here calls the AI, BlueBubbles, Twilio or Slack.
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

process.env.VTEXT_ENABLE_SLACK_ALERTS = "false";

const VtextMessage = require("../../model/vtext/vtextMessageModel");
const VtextContact = require("../../model/vtext/vtextContactModel");
const { replyBatchDelayMs, mergeUnansweredTexts, autoReplyDelayMs } = require("./workers/draftReplyWorker");
const { getRedisClient, getSubscriberClient } = require("./queue/connection");

const DB_URI = "mongodb://127.0.0.1:27017/vihara_reply_batching_test";
let mongoUp = false;

test.before(async () => {
  try {
    await mongoose.connect(DB_URI, { serverSelectionTimeoutMS: 2000 });
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
    mongoUp = true;
  } catch {
    mongoUp = false;
  }
});

test.after(async () => {
  if (mongoUp) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await getRedisClient().quit().catch(() => {});
  await getSubscriberClient().quit().catch(() => {});
});

test.beforeEach(async () => {
  if (mongoUp) await Promise.all([VtextMessage.deleteMany({}), VtextContact.deleteMany({})]);
});

const id = () => new mongoose.Types.ObjectId();

test("the batching wait is 15 seconds by default, can be changed, and 0 switches it off", () => {
  const saved = process.env.VTEXT_AI_REPLY_BATCH_SEC;
  try {
    delete process.env.VTEXT_AI_REPLY_BATCH_SEC;
    assert.equal(replyBatchDelayMs(), 15_000);
    process.env.VTEXT_AI_REPLY_BATCH_SEC = "8";
    assert.equal(replyBatchDelayMs(), 8_000);
    process.env.VTEXT_AI_REPLY_BATCH_SEC = "0";
    assert.equal(replyBatchDelayMs(), 0);
    process.env.VTEXT_AI_REPLY_BATCH_SEC = "nonsense";
    assert.equal(replyBatchDelayMs(), 15_000);
  } finally {
    if (saved === undefined) delete process.env.VTEXT_AI_REPLY_BATCH_SEC;
    else process.env.VTEXT_AI_REPLY_BATCH_SEC = saved;
  }
});

test("their texts since our last message are answered as one message", () => {
  const hi = { _id: id(), direction: "in", body: "Hi" };
  const second = { _id: id(), direction: "in", body: "Tested by U" };
  const recent = [
    { _id: id(), direction: "out", body: "Hi Ujjwal - this is Maya from Vihara. Are you there?" },
    hi,
    second,
  ];
  const { history, replyToBody } = mergeUnansweredTexts(recent, second);
  assert.equal(replyToBody, "Hi\nTested by U");
  assert.equal(history.length, 2);
  assert.equal(history[0].direction, "out");
  assert.deepEqual(history[1], { direction: "in", body: "Hi\nTested by U" });
});

test("texts we already answered stay as history, and a keyword is not answered by the AI", () => {
  const recent = [
    { _id: id(), direction: "in", body: "Is it still for sale?" },
    { _id: id(), direction: "out", body: "Yes it is!" },
    { _id: id(), direction: "in", body: "HELP" },
    { _id: id(), direction: "in", body: "What's the starting bid?" },
  ];
  const { history, replyToBody } = mergeUnansweredTexts(recent, recent[3]);
  assert.equal(replyToBody, "What's the starting bid?");
  assert.deepEqual(history.map((m) => m.body), ["Is it still for sale?", "Yes it is!", "What's the starting bid?"]);
});

test("one text on its own is answered exactly as before", () => {
  const only = { _id: id(), direction: "in", body: "Yes" };
  const { history, replyToBody } = mergeUnansweredTexts([only], only);
  assert.equal(replyToBody, "Yes");
  assert.deepEqual(history, [{ direction: "in", body: "Yes" }]);
});

test("the pause is counted from their text: a reply drafted late goes out sooner", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const saved = { min: process.env.VTEXT_AI_REPLY_DELAY_MIN_SEC, max: process.env.VTEXT_AI_REPLY_DELAY_MAX_SEC };
  process.env.VTEXT_AI_REPLY_DELAY_MIN_SEC = "30";
  process.env.VTEXT_AI_REPLY_DELAY_MAX_SEC = "30";
  try {
    const now = Date.now();
    const conversationId = id();
    assert.equal(await autoReplyDelayMs({ conversationId, messageId: id(), body: "ok", textAt: new Date(now - 20_000), now }), 10_000);
    assert.equal(await autoReplyDelayMs({ conversationId, messageId: id(), body: "ok", textAt: new Date(now - 20 * 60_000), now }), 0);
  } finally {
    for (const [k, v] of [["VTEXT_AI_REPLY_DELAY_MIN_SEC", saved.min], ["VTEXT_AI_REPLY_DELAY_MAX_SEC", saved.max]]) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("a reply never goes out before an earlier reply that is still waiting", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const saved = process.env.VTEXT_AI_REPLY_DELAY_MAX_SEC;
  process.env.VTEXT_AI_REPLY_DELAY_MAX_SEC = "0"; // no human pause, so only the order rule is left
  try {
    const now = Date.now();
    const contact = await VtextContact.create({ name: "Sam", phoneE164: "+12125550101", phoneStatus: "valid", source: "inbound-unknown" });
    const conversationId = id();
    await VtextMessage.create({
      direction: "out", contactId: contact._id, conversationId, channelType: "imessage-bluebubbles", body: "first reply",
      status: "queued", scheduledFor: new Date(now + 40_000), idempotencyKey: "batching-first",
    });
    const wait = await autoReplyDelayMs({ conversationId, messageId: id(), body: "second reply", textAt: new Date(now), now });
    assert.equal(wait, 45_000);
  } finally {
    if (saved === undefined) delete process.env.VTEXT_AI_REPLY_DELAY_MAX_SEC;
    else process.env.VTEXT_AI_REPLY_DELAY_MAX_SEC = saved;
  }
});

test("the job for an earlier text leaves the reply to the job for the newest text", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await VtextContact.create({ name: "Sam", phoneE164: "+12125550102", phoneStatus: "valid", source: "inbound-unknown" });
  const conversationId = id();
  const base = { contactId: contact._id, conversationId, channelType: "imessage-bluebubbles", direction: "in", status: "received" };
  const first = await VtextMessage.create({ ...base, body: "Hi", createdAt: new Date(Date.now() - 3000) });
  const second = await VtextMessage.create({ ...base, body: "Tested by U" });
  const { hasNewerTextToAnswer } = require("./workers/draftReplyWorker")._test;
  assert.equal(await hasNewerTextToAnswer(conversationId, first), true);
  assert.equal(await hasNewerTextToAnswer(conversationId, second), false);
});

test("a newer STOP/HELP text does not take over: the earlier text still gets its reply", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await VtextContact.create({ name: "Sam", phoneE164: "+12125550103", phoneStatus: "valid", source: "inbound-unknown" });
  const conversationId = id();
  const base = { contactId: contact._id, conversationId, channelType: "imessage-bluebubbles", direction: "in", status: "received" };
  const first = await VtextMessage.create({ ...base, body: "What's the starting bid?", createdAt: new Date(Date.now() - 3000) });
  await VtextMessage.create({ ...base, body: "HELP" });
  // The job goes on to draft (it is not skipped): with no AI key in tests it stops at the AI call, which is fine here.
  const { hasNewerTextToAnswer } = require("./workers/draftReplyWorker")._test;
  assert.equal(await hasNewerTextToAnswer(conversationId, first), false);
});
