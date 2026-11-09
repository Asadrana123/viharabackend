// The dead-line alert (vtextDeadLineAlert) and the "SMS only" switch (vtextRouter.selectLine). Uses a throwaway local
// Mongo database; skipped when none is running. Slack is replaced by a list; nothing talks to BlueBubbles or Twilio.
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

process.env.VTEXT_SECRETS_KEY = "00".repeat(32); // throwaway key, test process only
process.env.VTEXT_ENABLE_SLACK_ALERTS = "false";

const VtextMessage = require("../../model/vtext/vtextMessageModel");
const VtextContact = require("../../model/vtext/vtextContactModel");
const VtextLine = require("../../model/vtext/vtextLineModel");
const VtextSettings = require("../../model/vtext/vtextSettingsModel");
const { encryptCredentials } = require("../../utils/secretBox");
const { runDeadLineCheck } = require("./vtextDeadLineAlert");
const { selectLine } = require("./vtextRouter");
const { getRedisClient, getSubscriberClient } = require("./queue/connection");

const DB_URI = "mongodb://127.0.0.1:27017/vihara_line_health_test";
const NOW = new Date("2026-11-09T12:00:00Z");
const HOUR = 3_600_000;
let mongoUp = false;
let imessageLine;
let twilioLine;
let counter = 0;
const posts = [];
const deps = (extra = {}) => ({ now: () => NOW, lines: [imessageLine], notify: async (a) => { posts.push(a); return true; }, ...extra });

test.before(async () => {
  try {
    await mongoose.connect(DB_URI, { serverSelectionTimeoutMS: 2000 });
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
    mongoUp = true;
  } catch {
    mongoUp = false;
    return;
  }
  imessageLine = (await VtextLine.create({
    name: "Mac Mini line", channelType: "imessage-bluebubbles", address: "vtext@example.test", webhookKey: "lh-im", status: "active",
    config: { serverUrl: "http://127.0.0.1:1" }, credentials: encryptCredentials({ password: "x" }),
  })).toObject();
  twilioLine = await VtextLine.create({
    name: "Twilio line", channelType: "twilio-sms", address: "+15559876543", webhookKey: "lh-tw", status: "active",
    config: { messagingServiceSid: `MG${"a".repeat(32)}` }, credentials: encryptCredentials({ accountSid: `AC${"b".repeat(32)}`, authToken: "t" }),
  });
});

test.after(async () => {
  if (mongoUp) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await getRedisClient().quit().catch(() => {});
  await getSubscriberClient().quit().catch(() => {});
});

test.beforeEach(async () => {
  posts.length = 0;
  if (!mongoUp) return;
  await VtextMessage.deleteMany({});
  // reset, not delete: the settings service caches the document for 5 s
  await VtextSettings.updateOne({}, { $set: { alertState: {}, smsOnly: false } }, { upsert: true });
  await VtextLine.updateOne({ _id: twilioLine._id }, { $set: { status: "active" } });
});

const newContact = (phone) => {
  counter += 1;
  return VtextContact.create({ phoneE164: phone || `+1212555${3000 + counter}`, phoneStatus: "valid", source: "inbound-unknown", consent: { status: "opted-in" } });
};
/** One send on the iMessage line, `hoursAgo` before NOW. */
const send = async (hoursAgo, fields = {}) => {
  counter += 1;
  const at = new Date(NOW.getTime() - hoursAgo * HOUR);
  return VtextMessage.create({
    direction: "out", contactId: (await newContact())._id, lineId: imessageLine._id, channelType: "imessage-bluebubbles", body: "Hi",
    status: "failed", error: { kind: "recipient", code: "22" }, failedAt: at, idempotencyKey: `lh-${counter}`, ...fields,
  });
};

// ---- dead-line alert ----

test("5+ sends in 6 hours and none delivered: one 🔴 alert, not repeated on the next check", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  for (let i = 0; i < 4; i += 1) await send(1 + i);
  await send(2, { status: "unknown", error: { kind: "transient", code: "no-receipt" }, failedAt: undefined, sentAt: new Date(NOW.getTime() - 2 * HOUR) });
  await send(30, { status: "delivered", error: undefined, failedAt: undefined, sentAt: new Date(NOW.getTime() - 30 * HOUR), deliveredAt: new Date(NOW.getTime() - 30 * HOUR) });

  assert.deepEqual((await runDeadLineCheck(deps())).map((r) => r.state), ["dead"]);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].icon, "🔴");
  assert.match(posts[0].title, /not delivering: Mac Mini line/);
  const field = (l) => posts[0].fields.find((f) => f.label === l)?.value;
  assert.equal(field("Sent in the last 6 hours"), "5, none delivered");
  assert.equal(field("Last delivered text"), "30 hours ago");
  assert.match(field("How they failed"), /not delivered \(error 22\): 4/);
  assert.match(field("How they failed"), /no receipt: 1/);

  await runDeadLineCheck(deps({ now: () => new Date(NOW.getTime() + 30 * 60_000) }));
  assert.equal(posts.length, 1, "not repeated within 6 hours");
});

test("after an alert, the first delivery posts 🟢 once and clears it", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  for (let i = 0; i < 5; i += 1) await send(1 + i);
  await runDeadLineCheck(deps());
  await send(0.5, { status: "delivered", error: undefined, failedAt: undefined, sentAt: new Date(NOW.getTime() + 10 * 60_000), deliveredAt: new Date(NOW.getTime() + 10 * 60_000) });

  const later = () => new Date(NOW.getTime() + 60 * 60_000);
  assert.deepEqual((await runDeadLineCheck(deps({ now: later }))).map((r) => r.state), ["recovered"]);
  assert.equal(posts[1].icon, "🟢");
  assert.deepEqual((await runDeadLineCheck(deps({ now: later }))).map((r) => r.state), ["ok"], "no second 🟢");
  assert.equal(posts.length, 2);
});

test("no alert: too few sends, one delivered among many, or the failures are all in the last 15 minutes", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  for (let i = 0; i < 3; i += 1) await send(1 + i);
  assert.deepEqual((await runDeadLineCheck(deps())).map((r) => r.state), ["too-few"]);

  for (let i = 0; i < 4; i += 1) await send(0.1); // 6 minutes ago: receipts may still come
  assert.deepEqual((await runDeadLineCheck(deps())).map((r) => r.state), ["too-few"]);

  await send(3);
  await send(3, { status: "read", error: undefined, failedAt: undefined, sentAt: new Date(NOW.getTime() - 3 * HOUR), deliveredAt: new Date(NOW.getTime() - 3 * HOUR) });
  assert.deepEqual((await runDeadLineCheck(deps())).map((r) => r.state), ["ok"]);
  assert.equal(posts.length, 0);
});

// ---- SMS only ----

const route = async (contact, msg = {}) => (await selectLine({ channelPolicy: { mode: "any" }, isReplyToInbound: false, ...msg }, contact)).line;
const smsOnly = (on) => VtextSettings.findOneAndUpdate({}, { $set: { smsOnly: on } }, { upsert: true });
// getSettings caches for 5 s; the router accepts a getSettings hook so the tests read the switch straight away.
const routeWith = async (on, contact, msg = {}) =>
  (await selectLine({ channelPolicy: { mode: "any" }, isReplyToInbound: false, ...msg }, contact, { getSettings: async () => ({ smsOnly: on }) })).line;

test("SMS only OFF: a US number goes by iMessage as before", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  await smsOnly(false);
  assert.equal(String((await routeWith(false, await newContact()))._id), String(imessageLine._id));
});

test("SMS only ON: a US number goes by the Twilio line", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  assert.equal(String((await routeWith(true, await newContact()))._id), String(twilioLine._id));
});

test("SMS only ON still uses iMessage for non-US numbers, images, and texts pinned to iMessage", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  assert.equal(String((await routeWith(true, await newContact("+917019230000")))._id), String(imessageLine._id), "non-US");
  assert.equal(String((await routeWith(true, await newContact(), { media: { file: "meme1.jpg" } }))._id), String(imessageLine._id), "image");
  const pinned = await routeWith(true, await newContact(), { channelPolicy: { mode: "only", channels: ["imessage-bluebubbles"] } });
  assert.equal(String(pinned._id), String(imessageLine._id), "pinned");
});

test("SMS only ON with no usable Twilio line falls back to normal routing (iMessage) instead of stalling", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  await VtextLine.updateOne({ _id: twilioLine._id }, { $set: { status: "paused" } });
  assert.equal(String((await routeWith(true, await newContact()))._id), String(imessageLine._id));
});

test("the switch is saved through the settings service with who changed it", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const { updateSettings } = require("./vtextSettingsService");
  const s = await updateSettings({ smsOnly: true }, { _id: new mongoose.Types.ObjectId(), name: "Adi" });
  assert.equal(s.smsOnly, true);
  assert.equal(s.smsOnlyChangedBy.adminName, "Adi");
  assert.ok(s.smsOnlyChangedAt);
  assert.equal(String((await route(await newContact()))._id), String(twilioLine._id), "the router reads the saved switch");
});
