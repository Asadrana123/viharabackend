// The send worker's side of a BlueBubbles send that errored but went out: the message is saved as sent
// (or delivered), with the real message id and no leftover error, instead of failed.
// Throwaway local Mongo database and fake queues; skipped when no local Mongo is running.
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

process.env.VTEXT_SECRETS_KEY = "00".repeat(32); // throwaway key, test process only

const queues = require("./queue/queues");
queues.getRouteQueue = () => ({ add: async () => ({}) });
queues.getLineQueue = () => ({ getJob: async () => null });

const VtextMessage = require("../../model/vtext/vtextMessageModel");
const VtextContact = require("../../model/vtext/vtextContactModel");
const VtextLine = require("../../model/vtext/vtextLineModel");
const { encryptCredentials } = require("../../utils/secretBox");
const { processSendJob } = require("./workers/lineSendWorker");
const { getAdapter } = require("./channels/registry");
const { getRedisClient, getSubscriberClient } = require("./queue/connection");

const DB_URI = "mongodb://127.0.0.1:27017/vihara_bluebubbles_send_test";

let mongoUp = false;
let line;
let counter = 0;

test.before(async () => {
  try {
    await mongoose.connect(DB_URI, { serverSelectionTimeoutMS: 2000 });
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
    mongoUp = true;
  } catch {
    mongoUp = false;
    return;
  }
  line = await VtextLine.create({
    name: "iMessage test line", channelType: "imessage-bluebubbles", address: "vtext@example.test", webhookKey: "bbkey", status: "active",
    config: { serverUrl: "http://127.0.0.1:1" }, credentials: encryptCredentials({ password: "x" }),
  });
});

test.after(async () => {
  if (mongoUp) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await getRedisClient().quit().catch(() => {});
  await getSubscriberClient().quit().catch(() => {});
});

async function assignedText(fields = {}) {
  counter += 1;
  const contact = await VtextContact.create({ phoneE164: `+1212557${String(1000 + counter)}`, phoneStatus: "valid", source: "inbound-unknown", consent: { status: "opted-in" } });
  return VtextMessage.create({
    direction: "out", contactId: contact._id, channelType: "imessage-bluebubbles", lineId: line._id, body: "Hey, it's Maya",
    status: "assigned", origin: { kind: "automation", templateKey: "toorak-intro" }, ...fields,
  });
}

const job = (m) => ({ data: { messageId: String(m._id), reservationDay: "2026-11-05" } });

async function withSend(fakeSend, fn) {
  const adapter = getAdapter("imessage-bluebubbles");
  const realSend = adapter.send;
  adapter.send = fakeSend;
  try {
    await fn();
  } finally {
    adapter.send = realSend;
  }
}

test("a recovered send that was already delivered is saved as delivered, with the real id", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const deliveredAt = new Date("2026-11-05T14:00:07Z");
  const message = await assignedText();
  await withSend(async () => ({ providerMessageId: "REAL-GUID", providerStatus: "sent", deliveredAt, recoveredFrom: "INVALID_RECIPIENT" }), async () => {
    await processSendJob(line._id, job(message));
  });
  const after = await VtextMessage.findById(message._id);
  assert.equal(after.status, "delivered");
  assert.equal(after.provider.messageId, "REAL-GUID");
  assert.equal(after.deliveredAt.getTime(), deliveredAt.getTime());
  assert.ok(after.sentAt);
});

test("a recovered send after a timeout retry clears the old error and stays accepted until delivery comes in", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const message = await assignedText({ status: "sending", error: { kind: "transient", code: "TIMEOUT", message: "timeout" } });
  await withSend(async () => ({ providerMessageId: "G2", providerStatus: "sent", deliveredAt: null, recoveredFrom: "TIMEOUT" }), async () => {
    await processSendJob(line._id, job(message));
  });
  const after = await VtextMessage.findById(message._id);
  assert.equal(after.status, "accepted");
  assert.equal(after.provider.messageId, "G2");
  assert.equal(after.error?.code, undefined);
});

test("a normal send is unchanged: accepted", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const message = await assignedText();
  await withSend(async () => ({ providerMessageId: "G3", providerStatus: "sent" }), async () => {
    await processSendJob(line._id, job(message));
  });
  const after = await VtextMessage.findById(message._id);
  assert.equal(after.status, "accepted");
  assert.equal(after.deliveredAt, undefined);
});
