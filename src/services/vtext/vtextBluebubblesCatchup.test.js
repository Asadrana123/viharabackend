// Catching up from the Mac (vtextBluebubblesCatchup): receipts and replies BlueBubbles had but whose webhook push
// never reached us. Uses a throwaway local Mongo database and a fake BlueBubbles; skipped when no local Mongo is
// running. Nothing here talks to BlueBubbles, Twilio or Slack.
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

process.env.VTEXT_SECRETS_KEY = "00".repeat(32); // throwaway key, test process only
process.env.VTEXT_ENABLE_SLACK_ALERTS = "false";
delete process.env.VTEXT_AI_DRAFT_REPLY_ENABLED;

const VtextMessage = require("../../model/vtext/vtextMessageModel");
const VtextContact = require("../../model/vtext/vtextContactModel");
const VtextLine = require("../../model/vtext/vtextLineModel");
const { encryptCredentials } = require("../../utils/secretBox");
const { getAdapter } = require("./channels/registry");
const catchup = require("./vtextBluebubblesCatchup");
const { getRedisClient, getSubscriberClient } = require("./queue/connection");

const DB_URI = "mongodb://127.0.0.1:27017/vihara_bb_catchup_test";
const adapter = getAdapter("imessage-bluebubbles");
let mongoUp = false;
let line;
let counter = 0;

// A fake BlueBubbles server: `rows` is the Mac's Messages database.
let rows = [];
let queries = [];
let failNext = false;
const fakeClient = () => ({
  queryMessages: async ({ after, before, limit, offset }) => {
    queries.push({ after, before, limit, offset });
    if (failNext) throw new Error("ngrok tunnel offline");
    return rows.filter((r) => r.dateCreated >= after && r.dateCreated <= before).slice(offset, offset + limit);
  },
  getMessage: async (guid) => {
    if (failNext) throw new Error("ngrok tunnel offline");
    return rows.find((r) => r.guid === guid) || null;
  },
});

test.before(async () => {
  try {
    await mongoose.connect(DB_URI, { serverSelectionTimeoutMS: 2000 });
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
    mongoUp = true;
  } catch {
    mongoUp = false;
    return;
  }
  adapter._test.setClientFactoryForTests(fakeClient);
  line = await VtextLine.create({
    name: "Mac Mini test line", channelType: "imessage-bluebubbles", address: "vtext@example.test", webhookKey: "catchupkey", status: "active",
    config: { serverUrl: "http://127.0.0.1:1" }, credentials: encryptCredentials({ password: "x" }),
  });
  line = await VtextLine.findById(line._id).select("+credentials.iv +credentials.tag +credentials.ciphertext");
});

test.after(async () => {
  adapter._test.setClientFactoryForTests(null);
  if (mongoUp) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await getRedisClient().quit().catch(() => {});
  await getSubscriberClient().quit().catch(() => {});
});

test.beforeEach(async () => {
  rows = [];
  queries = [];
  failNext = false;
  delete process.env.VTEXT_SMS_FALLBACK_ENABLED;
  if (mongoUp) await Promise.all([VtextMessage.deleteMany({}), VtextContact.deleteMany({})]);
});

const NOW = Date.now();
const newContact = () => {
  counter += 1;
  return VtextContact.create({ name: "Sam Lee", phoneE164: `+1212555${2000 + counter}`, phoneStatus: "valid", source: "inbound-unknown", consent: { status: "opted-in" } });
};
const ourText = (contact, guid, fields = {}) => VtextMessage.create({
  direction: "out", contactId: contact._id, lineId: line._id, channelType: "imessage-bluebubbles", body: "Hi Sam",
  status: "accepted", provider: { messageId: guid }, sentAt: new Date(NOW - 20 * 60_000), idempotencyKey: `k-${guid}`, ...fields,
});
const macRow = (guid, fields = {}) => ({ guid, isFromMe: true, dateCreated: NOW - 20 * 60_000, error: 0, dateDelivered: null, dateRead: null, ...fields });
const deps = (extra = {}) => ({ lines: [line], now: () => new Date(NOW), setWatermark: async () => {}, watermark: null, notify: async () => true, ...extra });

test("a delivered receipt the webhook lost is picked up, and the 'no receipt' error goes away", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await newContact();
  const msg = await ourText(contact, "BB-1", { status: "unknown", error: { kind: "transient", code: "no-receipt", message: "No delivery confirmation" }, failedAt: new Date() });
  rows = [macRow("BB-1", { dateDelivered: NOW - 19 * 60_000 })];

  const summary = await catchup.runCatchup(deps());
  assert.equal(summary.statuses, 1);
  const after = await VtextMessage.findById(msg._id).lean();
  assert.equal(after.status, "delivered");
  assert.ok(after.deliveredAt);
  assert.equal(after.error, undefined);
  assert.equal(after.failedAt, undefined);
});

test("a late read receipt is picked up; a status we already have is left alone", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await newContact();
  const read = await ourText(contact, "BB-2", { status: "delivered", deliveredAt: new Date(NOW - 19 * 60_000) });
  const same = await ourText(contact, "BB-3", { status: "delivered", deliveredAt: new Date(NOW - 19 * 60_000) });
  rows = [macRow("BB-2", { dateDelivered: NOW - 19 * 60_000, dateRead: NOW - 5 * 60_000 }), macRow("BB-3", { dateDelivered: NOW - 19 * 60_000 })];

  const summary = await catchup.runReadRecheck(deps());
  assert.equal(summary.statuses.length, 1);
  assert.equal((await VtextMessage.findById(read._id)).status, "read");
  assert.equal((await VtextMessage.findById(same._id)).status, "delivered");
});

test("a not-delivered (error 22) the webhook lost marks the text failed as a recipient problem", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const msg = await ourText(await newContact(), "BB-4");
  rows = [macRow("BB-4", { error: 22 })];
  await catchup.runCatchup(deps());
  const after = await VtextMessage.findById(msg._id).lean();
  assert.equal(after.status, "failed");
  assert.equal(after.error.code, "22");
  assert.equal(after.error.kind, "recipient");
});

test("a missed reply is saved once, run twice; one already received is not duplicated; the team is told", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await newContact();
  rows = [
    { guid: "IN-1", isFromMe: false, text: "Yes, interested", dateCreated: NOW - 15 * 60_000, handle: { address: contact.phoneE164 }, chats: [{ guid: `any;-;${contact.phoneE164}` }] },
    { guid: "IN-2", isFromMe: false, text: "Already have this one", dateCreated: NOW - 14 * 60_000, handle: { address: contact.phoneE164 }, chats: [{ guid: `any;-;${contact.phoneE164}` }] },
  ];
  await VtextMessage.create({ direction: "in", contactId: contact._id, lineId: line._id, channelType: "imessage-bluebubbles", body: "Already have this one", status: "received", provider: { messageId: "IN-2" } });

  const alerts = [];
  const first = await catchup.runCatchup(deps({ notify: async (a) => { alerts.push(a); return true; } }));
  const second = await catchup.runCatchup(deps());
  assert.equal(first.replies, 1);
  assert.equal(second.replies, 0);
  assert.equal(await VtextMessage.countDocuments({ direction: "in", "provider.messageId": "IN-1" }), 1);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].title, /Missed 1 reply/);
  assert.match(alerts[0].fields.find((f) => f.label === "Replies").value, /Sam Lee: Yes, interested/);
});

test("the read recheck never pulls in replies (no AI reply to a day-old message)", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await newContact();
  rows = [{ guid: "IN-3", isFromMe: false, text: "hello", dateCreated: NOW - 10 * 60 * 60_000, handle: { address: contact.phoneE164 }, chats: [] }];
  await catchup.runReadRecheck(deps());
  assert.equal(await VtextMessage.countDocuments({ direction: "in" }), 0);
});

test("the time window: from the last run minus 10 minutes, never more than 24 hours, never the last 2 minutes", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  await catchup.runCatchup(deps({ watermark: new Date(NOW - 30 * 60_000) }));
  assert.equal(queries[0].after, NOW - 40 * 60_000);
  assert.equal(queries[0].before, NOW - 2 * 60_000);
  await catchup.runCatchup(deps({ watermark: new Date(NOW - 5 * 24 * 60 * 60_000) }));
  assert.equal(queries[1].after, NOW - 24 * 60 * 60_000);
});

test("the watermark only moves when the Mac answered", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const moved = [];
  failNext = true;
  const down = await catchup.runCatchup(deps({ setWatermark: async (k, d) => moved.push(d) }));
  assert.deepEqual(down.failedLines, [line.name]);
  assert.equal(moved.length, 0);
  failNext = false;
  await catchup.runCatchup(deps({ setWatermark: async (k, d) => moved.push(d) }));
  assert.equal(moved.length, 1);
});

test("before giving up on a text, the Mac is asked: delivered there → applied; nothing there or Mac down → give up as before", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await newContact();
  const delivered = await ourText(contact, "BB-5");
  const silent = await ourText(contact, "BB-6");
  rows = [macRow("BB-5", { dateDelivered: NOW - 18 * 60_000 }), macRow("BB-6")];

  assert.equal(await catchup.confirmBeforeGivingUp(delivered.toObject(), { line }), true);
  assert.equal((await VtextMessage.findById(delivered._id)).status, "delivered");
  assert.equal(await catchup.confirmBeforeGivingUp(silent.toObject(), { line }), false);
  failNext = true;
  assert.equal(await catchup.confirmBeforeGivingUp(silent.toObject(), { line }), false);
});

test("paging: more than one page of messages is read", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  rows = Array.from({ length: 620 }, (_, i) => macRow(`P-${i}`, { dateCreated: NOW - 60 * 60_000 + i }));
  const events = await adapter.fetchRecentEvents({ line, after: NOW - 2 * 60 * 60_000, before: NOW });
  assert.equal(queries.length, 2);
  assert.equal(queries[1].offset, 500);
  assert.equal(events.length, 0, "rows with no receipt yet make no events");
});

test("the watchdog's check answers which replies never arrived, and when the catch-up last found some", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const { missing } = require("../../controller/vtext/vtextWebhookController");
  const contact = await newContact();
  await VtextMessage.create({ direction: "in", contactId: contact._id, lineId: line._id, channelType: "imessage-bluebubbles", body: "hi", status: "received", provider: { messageId: "IN-HAVE" } });
  const call = (params, body) => new Promise((resolve, reject) => {
    const res = { status: (code) => ({ json: (data) => resolve({ code, data }) }) };
    missing({ params, body }, res, reject);
  });

  const ok = await call({ channelType: "imessage-bluebubbles", lineKey: "catchupkey" }, { guids: ["IN-HAVE", "IN-LOST", 42] });
  assert.equal(ok.code, 200);
  assert.deepEqual(ok.data.missing, ["IN-LOST"], "non-string ids are ignored");
  assert.ok("missedRepliesFoundAt" in ok.data);
  assert.equal((await call({ channelType: "imessage-bluebubbles", lineKey: "wrong" }, { guids: [] })).code, 404);
  assert.equal((await call({ channelType: "twilio-sms", lineKey: "catchupkey" }, { guids: [] })).code, 404);
});

test("finding missed replies stamps the time the Mac's watchdog reads", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await newContact();
  rows = [{ guid: "IN-9", isFromMe: false, text: "hello?", dateCreated: NOW - 12 * 60_000, handle: { address: contact.phoneE164 }, chats: [] }];
  const stamps = [];
  await catchup.runCatchup(deps({ setWatermark: async (k, d) => stamps.push(k) }));
  assert.deepEqual(stamps.sort(), ["bbCatchupAt", "bbMissedReplyAt"]);
});
