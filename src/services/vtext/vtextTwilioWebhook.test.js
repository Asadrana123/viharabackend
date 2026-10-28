// Twilio's webhooks end to end through the real route and controller (form-encoded body, X-Twilio-Signature,
// TwiML reply) and the status handler. Uses a throwaway local Mongo database and a fake inbound queue;
// skipped when no local Mongo is running. Nothing here calls Twilio.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const twilio = require("twilio");

process.env.VTEXT_ENABLED = "true";
process.env.VTEXT_SECRETS_KEY = "00".repeat(32); // throwaway key, test process only
const BASE_URL = "https://api.example.test";
const AUTH_TOKEN = "test-auth-token";

// Fake the inbound queue BEFORE the controller loads (it destructures getInboundQueue at require time).
const queues = require("./queue/queues");
const queuedJobs = [];
queues.getInboundQueue = () => ({ add: async (name, data, opts) => (queuedJobs.push({ name, data, opts }), { id: opts.jobId }) });

const VtextLine = require("../../model/vtext/vtextLineModel");
const VtextContact = require("../../model/vtext/vtextContactModel");
const VtextMessage = require("../../model/vtext/vtextMessageModel");
const VtextWebhookEvent = require("../../model/vtext/vtextWebhookEventModel");
const webhookRoutes = require("../../routes/vtext/vtextWebhookRoutes");
const { handleMessageStatus } = require("./workers/inboundWorker");
const { encryptCredentials } = require("../../utils/secretBox");
const { getRedisClient, getSubscriberClient } = require("./queue/connection");

const DB_URI = "mongodb://127.0.0.1:27017/vihara_twilio_webhook_test";

let mongoUp = false;
let server;
let port;
let twilioLine;
let androidLine;

test.before(async () => {
  try {
    await mongoose.connect(DB_URI, { serverSelectionTimeoutMS: 2000 });
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
    mongoUp = true;
  } catch {
    mongoUp = false;
    return;
  }
  const app = express();
  app.use(bodyParser.json({ limit: "5mb", verify: (req, res, buf) => { req.rawBody = buf; } })); // same as app.js
  app.use("/api/webhooks/vtext", webhookRoutes);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;

  twilioLine = await VtextLine.create({
    name: "Twilio test line",
    channelType: "twilio-sms",
    address: "+15559876543",
    webhookKey: "twiliokey1",
    status: "active",
    config: { messagingServiceSid: `MG${"a".repeat(32)}` },
    credentials: encryptCredentials({ accountSid: `AC${"b".repeat(32)}`, authToken: AUTH_TOKEN }),
  });
  androidLine = await VtextLine.create({
    name: "Android test line",
    channelType: "android-sms",
    address: "+15550000001",
    webhookKey: "androidkey1",
    status: "active",
    config: { serverUrl: "http://127.0.0.1:1" },
    credentials: encryptCredentials({ username: "u", password: "p" }),
  });
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongoUp) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await getRedisClient().quit().catch(() => {});
  await getSubscriberClient().quit().catch(() => {});
});

const post = (path, { form, json, headers = {} }) =>
  fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: json ? { "content-type": "application/json", ...headers } : { "content-type": "application/x-www-form-urlencoded", ...headers },
    body: json ? JSON.stringify(json) : new URLSearchParams(form).toString(),
  });

const signedPost = (path, form, { token = AUTH_TOKEN, signUrl = `${BASE_URL}${path}` } = {}) =>
  post(path, { form, headers: { "x-twilio-signature": twilio.getExpectedTwilioSignature(token, signUrl, form) } });

test("a correctly signed delivery receipt is stored, queued, and answered with empty TwiML", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  process.env.VTEXT_PUBLIC_BASE_URL = BASE_URL;
  const before = queuedJobs.length;
  const path = "/api/webhooks/vtext/twilio-sms/twiliokey1?cb=status&mid=64f000000000000000000001";

  const res = await signedPost(path, { MessageSid: "SM1", MessageStatus: "delivered", To: "+15551234567" });

  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/xml/);
  assert.equal(await res.text(), "<Response></Response>");

  const event = await VtextWebhookEvent.findOne({ lineKey: "twiliokey1" }).sort({ createdAt: -1 }).lean();
  assert.equal(event.channelType, "twilio-sms");
  assert.equal(event.signatureValid, true);
  assert.equal(event.body.MessageSid, "SM1"); // the form body was parsed (the app-level parser only reads JSON)
  assert.equal(event.body.MessageStatus, "delivered");
  assert.deepEqual({ ...event.query }, { cb: "status", mid: "64f000000000000000000001" });
  assert.equal(queuedJobs.length, before + 1);
  assert.equal(queuedJobs.at(-1).data.webhookEventId, String(event._id));
});

test("a wrong signature, a wrong signing URL, or no public URL is rejected and nothing is stored", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  process.env.VTEXT_PUBLIC_BASE_URL = BASE_URL;
  const path = "/api/webhooks/vtext/twilio-sms/twiliokey1?cb=status&mid=64f000000000000000000002";
  const form = { MessageSid: "SM2", MessageStatus: "delivered" };
  const count = () => VtextWebhookEvent.countDocuments({ "body.MessageSid": "SM2" });
  const queued = queuedJobs.length;

  assert.equal((await signedPost(path, form, { token: "someone-elses-token" })).status, 401);
  assert.equal((await signedPost(path, form, { signUrl: `https://evil.example.test${path}` })).status, 401);
  assert.equal((await post(path, { form })).status, 401); // no signature header at all

  delete process.env.VTEXT_PUBLIC_BASE_URL; // can't compute the signed URL: fail closed
  assert.equal((await signedPost(path, form)).status, 401);
  process.env.VTEXT_PUBLIC_BASE_URL = BASE_URL;

  assert.equal(await count(), 0);
  assert.equal(queuedJobs.length, queued);
});

test("an inbound reply (no ?cb=status) is stored with the sender's fields", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  process.env.VTEXT_PUBLIC_BASE_URL = BASE_URL;
  const path = "/api/webhooks/vtext/twilio-sms/twiliokey1";
  const res = await signedPost(path, { MessageSid: "SM3", From: "+15551234567", To: "+15559876543", Body: "Yes please", OptOutType: "" });
  assert.equal(res.status, 200);
  const event = await VtextWebhookEvent.findOne({ "body.MessageSid": "SM3" }).lean();
  assert.equal(event.body.Body, "Yes please");
  assert.deepEqual({ ...event.query }, {});
});

test("an unknown line key or a channel mismatch is a 404", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  assert.equal((await post("/api/webhooks/vtext/twilio-sms/nosuchkey", { form: { MessageSid: "SM4" } })).status, 404);
  assert.equal((await post("/api/webhooks/vtext/imessage-bluebubbles/twiliokey1", { form: { MessageSid: "SM4" } })).status, 404);
});

test("other channels still post JSON and still get the JSON reply", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const res = await post("/api/webhooks/vtext/android-sms/androidkey1", { json: { event: "sms:delivered", id: "evt-1", payload: { messageId: "g1" } } });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true });
  const event = await VtextWebhookEvent.findOne({ "body.id": "evt-1" }).lean();
  assert.equal(event.body.event, "sms:delivered");
});

test("status handler: moves forward, a late failure never undoes a delivery, ids are scoped to the line's channel", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await VtextContact.create({ phoneE164: "+15551230001", phoneStatus: "valid", source: "inbound-unknown" });
  const make = (fields) =>
    VtextMessage.create({ direction: "out", contactId: contact._id, lineId: twilioLine._id, channelType: "twilio-sms", body: "Hi", status: "accepted", ...fields });

  // receipts in order
  const a = await make({ provider: { messageId: "SM-A" } });
  await handleMessageStatus({ type: "message.status", providerMessageId: "SM-A", status: "sent", at: new Date() }, twilioLine);
  assert.equal((await VtextMessage.findById(a._id)).status, "sent");
  await handleMessageStatus({ type: "message.status", providerMessageId: "SM-A", status: "delivered", at: new Date() }, twilioLine);
  const delivered = await VtextMessage.findById(a._id);
  assert.equal(delivered.status, "delivered");
  assert.ok(delivered.deliveredAt);

  // a late "failed" must not overwrite it
  await handleMessageStatus({ type: "message.status", providerMessageId: "SM-A", status: "failed", errorCode: "30003", errorKind: "recipient" }, twilioLine);
  assert.equal((await VtextMessage.findById(a._id)).status, "delivered");

  // an out-of-order "sent" after delivered does not go backwards
  await handleMessageStatus({ type: "message.status", providerMessageId: "SM-A", status: "sent", at: new Date() }, twilioLine);
  assert.equal((await VtextMessage.findById(a._id)).status, "delivered");

  // a failure on a text that was never delivered is recorded with its code and kind
  const b = await make({ provider: { messageId: "SM-B" } });
  await handleMessageStatus({ type: "message.status", providerMessageId: "SM-B", status: "failed", errorCode: "30003", errorKind: "recipient", errorMessage: "unreachable" }, twilioLine);
  const failed = await VtextMessage.findById(b._id);
  assert.equal(failed.status, "failed");
  assert.equal(failed.error.code, "30003");
  assert.equal(failed.error.kind, "recipient");

  // the receipt finds its message by our id (the ?mid= on the callback URL) when the provider id is not stored
  const c = await make({});
  await handleMessageStatus({ type: "message.status", providerMessageId: "SM-C", tempGuid: String(c._id), status: "delivered", at: new Date() }, twilioLine);
  assert.equal((await VtextMessage.findById(c._id)).status, "delivered");

  // the same provider id on another channel is a different message
  const other = await make({ channelType: "android-sms", lineId: androidLine._id, provider: { messageId: "SM-D" } });
  await handleMessageStatus({ type: "message.status", providerMessageId: "SM-D", status: "delivered", at: new Date() }, twilioLine);
  assert.equal((await VtextMessage.findById(other._id)).status, "accepted");
});
