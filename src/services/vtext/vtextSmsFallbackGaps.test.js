// The SMS fallback for the iMessage failures that used to leave a lead with nothing (2026-11-13):
//   - the iMessage line is down (offline / paused / quarantined, or the Mac refused the connection): the text goes
//     by SMS; a reply to their text waits 30 minutes first; texts already waiting on the down line are moved;
//   - the iMessage line has no room: SMS for someone new, wait for someone we already text by iMessage;
//   - a rejected recipient and any receipt error: the SMS copy goes (only 22 / Message Send Error mark the number);
//   - a send that kept timing out: the Mac is asked; not there -> SMS, there -> sent, can't ask -> a person decides;
//   - a text whose send job was lost: the SMS copy goes.
// Uses a throwaway local Mongo database and fake queues and Mac; skipped when no local Mongo is running.
// Nothing here talks to BlueBubbles, Twilio or Slack.
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

process.env.VTEXT_SECRETS_KEY = "00".repeat(32); // throwaway key, test process only
process.env.VTEXT_ENABLE_SLACK_ALERTS = "false";

// Fake the queues BEFORE any module destructures them.
const queues = require("./queue/queues");
const routeJobs = [];
const removedJobs = [];
queues.getRouteQueue = () => ({ add: async (name, data, opts) => (routeJobs.push({ data, opts }), { id: opts?.jobId }) });
queues.getLineQueue = () => ({ getJob: async (id) => ({ remove: async () => removedJobs.push(id) }), getJobs: async () => [], add: async () => ({}) });

const VtextMessage = require("../../model/vtext/vtextMessageModel");
const VtextContact = require("../../model/vtext/vtextContactModel");
const VtextLine = require("../../model/vtext/vtextLineModel");
const VtextConversation = require("../../model/vtext/vtextConversationModel");
const { encryptCredentials } = require("../../utils/secretBox");
const { selectLine, smsInsteadOfIMessage } = require("./vtextRouter");
const { handleMessageStatus } = require("./workers/inboundWorker");
const { processSendJob } = require("./workers/lineSendWorker");
const { recoverAssignedMessages } = require("./workers/maintenanceWorker");
const { finalizeExhaustedJob, checkMacAfterGivingUp } = require("./queue/lineWorkerManager");
const { getAdapter } = require("./channels/registry");
const { ChannelError } = require("./channels/channelError");
const { getRedisClient, getSubscriberClient } = require("./queue/connection");

const DB_URI = "mongodb://127.0.0.1:27017/vihara_sms_fallback_gaps_test";
const IMESSAGE = "imessage-bluebubbles";

let mongoUp = false;
let imessageLine;
let twilioLine;
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
  imessageLine = await VtextLine.create({
    name: "iMessage test line", channelType: IMESSAGE, address: "vtext@example.test", webhookKey: "gapim", status: "active",
    config: { serverUrl: "http://127.0.0.1:1" }, credentials: encryptCredentials({ password: "x" }),
  });
  twilioLine = await VtextLine.create({
    name: "Twilio test line", channelType: "twilio-sms", address: "+15559876543", webhookKey: "gaptw", status: "active",
    config: { messagingServiceSid: `MG${"a".repeat(32)}` }, credentials: encryptCredentials({ accountSid: `AC${"b".repeat(32)}`, authToken: "t" }),
  });
});

test.after(async () => {
  getAdapter(IMESSAGE)._test.setClientFactoryForTests(null);
  if (mongoUp) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await getRedisClient().quit().catch(() => {});
  await getSubscriberClient().quit().catch(() => {});
});

test.beforeEach(async () => {
  process.env.VTEXT_SMS_FALLBACK_ENABLED = "true";
  delete process.env.VTEXT_SMS_FALLBACK_REPLY_WAIT_MIN;
  routeJobs.length = 0;
  removedJobs.length = 0;
  if (mongoUp) {
    await VtextLine.updateOne({ _id: imessageLine._id }, { $set: { status: "active", "routing.acceptsNewContacts": true } });
  }
});

const newContact = (fields = {}) => {
  counter += 1;
  return VtextContact.create({ phoneE164: `+1212555${String(3000 + counter)}`, phoneStatus: "valid", source: "inbound-unknown", consent: { status: "opted-in" }, ...fields });
};
const firstText = (fields = {}) => ({ channelPolicy: { mode: "any", channels: [] }, excludeLineIds: [], isReplyToInbound: false, createdAt: new Date(), ...fields });
const setIMessageLine = (fields) => VtextLine.updateOne({ _id: imessageLine._id }, { $set: fields });
const iMessageText = (contact, fields = {}) => {
  counter += 1;
  return VtextMessage.create({
    direction: "out", contactId: contact._id, lineId: imessageLine._id, channelType: IMESSAGE, body: "Hi Sam - this is Maya from Vihara. Are you there?",
    status: "assigned", assignedAt: new Date(Date.now() - 5 * 60_000), idempotencyKey: `gap-${counter}`, origin: { kind: "automation", templateKey: "fb-intro" }, ...fields,
  });
};
const fallbackFor = (original) => VtextMessage.findOne({ fallbackOf: original._id });
const reload = (doc) => VtextMessage.findById(doc._id);
const markedOffIMessage = async (contactId) =>
  (await VtextContact.findById(contactId).lean()).channelReachability?.find((r) => r.channelType === IMESSAGE)?.reachable === false;

// ---- #5: the iMessage line is down ----

for (const status of ["offline", "paused", "quarantined"]) {
  test(`routing: the iMessage line is ${status}, so a first text goes by SMS`, async (t) => {
    if (!mongoUp) return t.skip("no local Mongo");
    await setIMessageLine({ status });
    const contact = await newContact();
    const result = await selectLine(firstText(), contact);
    assert.equal(String(result.line?._id), String(twilioLine._id));
    assert.equal(result.smsInstead, "the iMessage line is down");
  });
}

test("routing: with the line down, a reply waits 30 minutes, then goes by SMS", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  await setIMessageLine({ status: "offline" });
  const contact = await newContact();

  const fresh = await selectLine(firstText({ isReplyToInbound: true, createdAt: new Date(Date.now() - 5 * 60_000) }), contact);
  assert.equal(fresh.line, null);
  assert.ok(fresh.retryInMs >= 24 * 60_000 && fresh.retryInMs <= 25 * 60_000, `re-checked when the 30 minutes are up (${fresh.retryInMs})`);

  const old = await selectLine(firstText({ isReplyToInbound: true, createdAt: new Date(Date.now() - 31 * 60_000) }), contact);
  assert.equal(String(old.line?._id), String(twilioLine._id));

  process.env.VTEXT_SMS_FALLBACK_REPLY_WAIT_MIN = "0";
  assert.equal(String((await selectLine(firstText({ isReplyToInbound: true }), contact)).line?._id), String(twilioLine._id), "0 = no wait");
});

test("routing: a text that just failed to reach the Mac (line excluded) counts as the line being down", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await newContact();
  const result = await selectLine(firstText({ excludeLineIds: [imessageLine._id] }), contact);
  assert.equal(String(result.line?._id), String(twilioLine._id));
});

test("routing: nothing changes while the iMessage line is up, or when the fallback is off", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await newContact();
  assert.equal(String((await selectLine(firstText(), contact)).line?._id), String(imessageLine._id));

  await setIMessageLine({ status: "offline" });
  process.env.VTEXT_SMS_FALLBACK_ENABLED = "false";
  assert.equal((await selectLine(firstText(), contact)).line, null, "fallback off: it waits for the line, as before");
});

test("routing: never by SMS for a pinned text, an image, or a non-US number", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  await setIMessageLine({ status: "offline" });
  const us = await newContact();
  const india = await newContact({ phoneE164: `+9198765${String(10000 + counter)}` });
  assert.equal(await smsInsteadOfIMessage(firstText({ channelPolicy: { mode: "only", channels: [IMESSAGE] } }), us), null);
  assert.equal(await smsInsteadOfIMessage(firstText({ media: { file: "home.jpg" } }), us), null);
  assert.equal(await smsInsteadOfIMessage(firstText(), india), null);
});

// ---- #4: the iMessage line has no room ----

test("routing: the iMessage line has no room: SMS for someone new, wait for someone we already text by iMessage", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  await setIMessageLine({ "routing.acceptsNewContacts": false });
  const stranger = await newContact();
  const result = await selectLine(firstText(), stranger);
  assert.equal(String(result.line?._id), String(twilioLine._id));
  assert.equal(result.smsInstead, "the iMessage line has no room left today");

  const known = await newContact();
  await VtextConversation.create({ contactId: known._id, lineId: imessageLine._id, channelType: IMESSAGE, contactPhone: known.phoneE164, lineAddress: imessageLine.address });
  assert.equal(await smsInsteadOfIMessage(firstText(), known), null);
});

// ---- #9: the Mac refused the connection ----

test("send: the Mac refused the connection, so the text goes back for routing without the iMessage line (no retries)", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const adapter = getAdapter(IMESSAGE);
  const realSend = adapter.send;
  adapter.send = async () => { throw new ChannelError("transient", "CONNECTION_REFUSED", "Could not connect to BlueBubbles"); };
  try {
    const contact = await newContact();
    const message = await iMessageText(contact);
    await processSendJob(imessageLine._id, { data: { messageId: String(message._id), reservationDay: "2026-11-13" } });
    const after = await reload(message);
    assert.equal(after.status, "queued");
    assert.ok(after.excludeLineIds.some((id) => String(id) === String(imessageLine._id)));
    assert.equal(routeJobs.length, 1, "routed again");

    // fallback off: the old behaviour, retried by BullMQ
    process.env.VTEXT_SMS_FALLBACK_ENABLED = "false";
    const other = await iMessageText(contact);
    await assert.rejects(processSendJob(imessageLine._id, { data: { messageId: String(other._id), reservationDay: "2026-11-13" } }), /Could not connect/);
  } finally {
    adapter.send = realSend;
  }
});

// ---- #5: texts already waiting on a down line ----

test("sweep: texts waiting on a down iMessage line are moved back for routing", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  await setIMessageLine({ status: "paused" });
  const contact = await newContact();
  const message = await iMessageText(contact, { assignedAt: new Date(Date.now() - 10 * 60_000) });
  const released = [];
  const out = await recoverAssignedMessages([message.toObject()], { release: async (...a) => released.push(a) });
  assert.equal(out.rerouted, 1);
  const after = await reload(message);
  assert.equal(after.status, "queued");
  assert.equal(after.lineId, undefined);
  assert.equal(released.length, 1, "the line's capacity is freed");
  assert.ok(removedJobs.includes(`send-${message._id}`));
  assert.equal(routeJobs.length, 1);

  process.env.VTEXT_SMS_FALLBACK_ENABLED = "false";
  const waiting = await iMessageText(contact);
  const out2 = await recoverAssignedMessages([waiting.toObject()], { release: async () => {} });
  assert.equal(out2.waiting, 1, "fallback off: it waits for the line, as before");
});

// ---- #14: never sent ----

test("sweep: a text whose send job was lost for 12 hours gets its SMS copy", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await newContact();
  const message = await iMessageText(contact, { assignedAt: new Date(Date.now() - 13 * 3_600_000), createdAt: new Date(Date.now() - 13 * 3_600_000) });
  const calls = [];
  await recoverAssignedMessages([message.toObject()], {
    release: async () => {},
    reportTextProblem: async () => {},
    queueSmsFallback: async (original, info) => (calls.push({ id: String(original._id), ...info }), { queued: true }),
  });
  assert.equal((await reload(message)).status, "unknown");
  assert.deepEqual(calls, [{ id: String(message._id), trigger: "never-sent", reason: "stuck-assigned" }]);
});

// ---- #12: any receipt error ----

test("receipt: any error code sends the SMS copy; only 22 marks the number off iMessage", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  for (const [code, marks] of [["4", false], ["22", true]]) {
    const contact = await newContact();
    const message = await iMessageText(contact, { status: "accepted", provider: { messageId: `BB-R-${code}` }, sentAt: new Date(Date.now() - 2 * 60_000) });
    await handleMessageStatus({ type: "message.status", providerMessageId: `BB-R-${code}`, status: "failed", errorKind: code === "22" ? "recipient" : "line", errorCode: code, errorMessage: "Not delivered" }, imessageLine);
    assert.equal((await reload(message)).status, "failed");
    assert.ok(await fallbackFor(message), `the SMS copy is queued for error ${code}`);
    assert.equal(await markedOffIMessage(contact._id), marks, `error ${code} ${marks ? "marks" : "does not mark"} the number`);
  }
});

// ---- #8: gave up after retries ----

const exhaustedJob = (message) => ({ attemptsMade: 4, opts: { attempts: 4 }, data: { messageId: String(message._id), reservationDay: "2026-11-13" } });
const timedOut = (contact) => iMessageText(contact, { status: "sending", error: { kind: "transient", code: "TIMEOUT", message: "BlueBubbles didn't respond in time" } });

test("gave up after retries: not in the Mac's Messages, so it failed and the SMS copy goes", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await newContact();
  const message = await timedOut(contact);
  const calls = [];
  await finalizeExhaustedJob(imessageLine._id, exhaustedJob(message), new Error("timeout"), {
    checkMac: async () => ({ notSent: true }),
    queueSmsFallback: async (original, info) => (calls.push(info), { queued: true }),
    reportTextProblem: async () => {},
  });
  assert.equal((await reload(message)).status, "failed");
  assert.deepEqual(calls, [{ trigger: "send-unconfirmed", reason: "TIMEOUT" }]);
});

test("gave up after retries: in the Mac's Messages after all, so it is recorded sent and no SMS goes", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await newContact();
  const message = await timedOut(contact);
  let queued = false;
  await finalizeExhaustedJob(imessageLine._id, exhaustedJob(message), new Error("timeout"), {
    checkMac: async () => ({ sent: { providerMessageId: "BB-FOUND", deliveredAt: new Date() } }),
    queueSmsFallback: async () => { queued = true; return { queued: true }; },
    reportTextProblem: async () => { throw new Error("must not alert"); },
  });
  const after = await reload(message);
  assert.equal(after.status, "delivered");
  assert.equal(after.provider.messageId, "BB-FOUND");
  assert.equal(after.error?.kind, undefined);
  assert.equal(queued, false);
});

test("gave up after retries: the Mac can't be asked, so no automatic SMS; the alert says a person should check", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await newContact();
  const message = await timedOut(contact);
  let queued = false;
  let reported = null;
  await finalizeExhaustedJob(imessageLine._id, exhaustedJob(message), new Error("timeout"), {
    checkMac: async () => ({ fallback: { queued: false, reason: "the Mac could not be asked whether it went out" } }),
    queueSmsFallback: async () => { queued = true; return { queued: true }; },
    reportTextProblem: async (m, opts) => { reported = opts; },
  });
  assert.equal((await reload(message)).status, "failed");
  assert.equal(queued, false);
  assert.match(reported.fallback.reason, /could not be asked/);
});

test("the Mac check itself: found / not found / unreachable, and only for unsure errors", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const adapter = getAdapter(IMESSAGE);
  const contact = await newContact();
  const message = await timedOut(contact);
  const sentCopy = { guid: "BB-SEEN", isFromMe: true, error: 0, text: message.body, dateCreated: Date.now() - 60_000, dateDelivered: null };

  adapter._test.setClientFactoryForTests(() => ({ getChatMessages: async () => [sentCopy] }));
  assert.deepEqual(await checkMacAfterGivingUp(imessageLine._id, message), { sent: { providerMessageId: "BB-SEEN", deliveredAt: null } });

  adapter._test.setClientFactoryForTests(() => ({ getChatMessages: async () => [] }));
  assert.deepEqual(await checkMacAfterGivingUp(imessageLine._id, message), { notSent: true });

  adapter._test.setClientFactoryForTests(() => ({ getChatMessages: async () => { throw new Error("ngrok tunnel offline"); } }));
  const unreachable = await checkMacAfterGivingUp(imessageLine._id, message);
  assert.equal(unreachable.fallback.queued, false);

  const refused = await iMessageText(contact, { status: "sending", error: { kind: "transient", code: "AUTH_FAILED" } });
  assert.deepEqual(await checkMacAfterGivingUp(imessageLine._id, refused), {}, "not an unsure error: nothing to check");
  adapter._test.setClientFactoryForTests(null);
});
