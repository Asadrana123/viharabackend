// STOP / START / HELP for the Twilio SMS line, and opt-outs that Twilio reports (error 21610).
// Twilio's Advanced Opt-Out already answers a keyword, so our own confirmation must not be sent as well.
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
const { handleMessageReceived, handleMessageStatus } = require("./workers/inboundWorker");
const { processSendJob } = require("./workers/lineSendWorker");
const { getAdapter } = require("./channels/registry");
const { ChannelError } = require("./channels/channelError");
const { canSend } = require("./vtextComplianceService");
const { getRedisClient, getSubscriberClient } = require("./queue/connection");

const DB_URI = "mongodb://127.0.0.1:27017/vihara_twilio_optout_test";

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
    name: "iMessage test line", channelType: "imessage-bluebubbles", address: "vtext@example.test", webhookKey: "imkey", status: "active",
    config: { serverUrl: "http://127.0.0.1:1" }, credentials: encryptCredentials({ password: "x" }),
  });
  twilioLine = await VtextLine.create({
    name: "Twilio test line", channelType: "twilio-sms", address: "+15559876543", webhookKey: "twkey", status: "active",
    config: { messagingServiceSid: `MG${"a".repeat(32)}` }, credentials: encryptCredentials({ accountSid: `AC${"b".repeat(32)}`, authToken: "t" }),
  });
});

test.after(async () => {
  if (mongoUp) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await getRedisClient().quit().catch(() => {});
  await getSubscriberClient().quit().catch(() => {});
});

const newContact = (fields = {}) => {
  counter += 1;
  return VtextContact.create({ phoneE164: `+1212556${String(1000 + counter)}`, phoneStatus: "valid", source: "inbound-unknown", consent: { status: "opted-in" }, ...fields });
};

/** What the inbound worker receives for a text from this contact. `optOutType` is only set on Twilio's keyword events. */
const inbound = (contact, body, { optOutType, line = twilioLine } = {}) => {
  counter += 1;
  return handleMessageReceived(
    { type: "message.received", providerEventId: `evt-${counter}`, providerMessageId: `in-${counter}`, from: contact.phoneE164, to: line.address, body, receivedAt: new Date(), optOutType },
    line
  );
};

const queuedText = (contact, status = "queued") =>
  VtextMessage.create({ direction: "out", contactId: contact._id, channelType: "twilio-sms", body: "Hello again", status, origin: { kind: "automation", templateKey: "followup-1" } });

const systemReply = (contact, templateKey) => VtextMessage.findOne({ contactId: contact._id, "origin.kind": "system", "origin.templateKey": templateKey });
const reloadContact = (contact) => VtextContact.findById(contact._id);

test("STOP that Twilio handled: opted out everywhere, pending texts cancelled, and no second confirmation from us", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await newContact();
  const pending = await queuedText(contact);

  await inbound(contact, "STOP", { optOutType: "STOP" });

  const after = await reloadContact(contact);
  assert.equal(after.optOut.isOptedOut, true);
  assert.equal(after.optOut.method, "keyword");
  assert.equal(after.consent.status, "opted-out");
  assert.equal((await VtextMessage.findById(pending._id)).status, "cancelled");
  assert.equal(await systemReply(contact, "stop-confirm"), null, "Twilio already confirmed; ours would only fail with 21610");
  assert.equal(canSend(after, { origin: { kind: "automation" } }).allowed, false, "blocked for every line and channel");
});

test("a keyword Twilio acted on counts even when our own text matching would miss it", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await newContact();
  await inbound(contact, "no more of these please", { optOutType: "STOP" });
  const after = await reloadContact(contact);
  assert.equal(after.optOut.isOptedOut, true);
  assert.equal(await systemReply(contact, "stop-confirm"), null);
});

test("an opt-out phrase Twilio does NOT handle ('remove me') is still honored, and our confirmation is sent", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await newContact();
  await inbound(contact, "please remove me from this list");
  assert.equal((await reloadContact(contact)).optOut.isOptedOut, true);
  const confirm = await systemReply(contact, "stop-confirm");
  assert.ok(confirm, "Twilio never saw a keyword, so we answer");
  assert.deepEqual([...confirm.channelPolicy.channels], ["twilio-sms"]);
});

test("STOP on the iMessage line is unchanged: we send the confirmation", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await newContact();
  await inbound(contact, "STOP", { line: imessageLine });
  assert.equal((await reloadContact(contact)).optOut.isOptedOut, true);
  assert.ok(await systemReply(contact, "stop-confirm"));
});

test("START after a STOP resubscribes without a second confirmation; an admin opt-out is left alone", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await newContact();
  await inbound(contact, "STOP", { optOutType: "STOP" });
  await inbound(contact, "START", { optOutType: "START" });
  const after = await reloadContact(contact);
  assert.equal(after.optOut.isOptedOut, false);
  assert.equal(after.consent.status, "opted-in");
  assert.equal(await systemReply(contact, "resubscribe-confirm"), null, "Twilio sent its own");

  const admin = await newContact({ optOut: { isOptedOut: true, method: "admin" }, consent: { status: "opted-out" } });
  await inbound(admin, "START", { optOutType: "START" });
  assert.equal((await reloadContact(admin)).optOut.isOptedOut, true, "a person's decision is not undone by a keyword");
});

test("HELP on Twilio is answered by Twilio, not by us; elsewhere we still answer", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const onTwilio = await newContact();
  await inbound(onTwilio, "HELP", { optOutType: "HELP" });
  assert.equal(await systemReply(onTwilio, "help"), null);

  const onImessage = await newContact();
  await inbound(onImessage, "HELP", { line: imessageLine });
  assert.ok(await systemReply(onImessage, "help"));
});

test("'YES' to our question from someone who is not opted out is a normal reply, not a resubscribe", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await newContact();
  await inbound(contact, "YES", { optOutType: "START" }); // Twilio counts YES as START
  const after = await reloadContact(contact);
  assert.equal(after.optOut?.isOptedOut || false, false);
  assert.equal(await systemReply(contact, "resubscribe-confirm"), null);
  assert.ok(await VtextMessage.findOne({ contactId: contact._id, direction: "in", body: "YES" }), "the reply is kept");
});

test("a send Twilio refuses with 21610 opts the contact out here too and cancels their other pending texts", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const adapter = getAdapter("twilio-sms");
  const realSend = adapter.send;
  try {
    adapter.send = async () => { throw new ChannelError("recipient", "OPTED_OUT", "recipient opted out (21610)"); };
    const contact = await newContact();
    const other = await queuedText(contact);
    const sending = await queuedText(contact, "assigned");
    await VtextMessage.updateOne({ _id: sending._id }, { $set: { lineId: twilioLine._id } });

    await assert.rejects(processSendJob(twilioLine._id, { data: { messageId: String(sending._id), reservationDay: "2026-10-28" } }));

    const after = await reloadContact(contact);
    assert.equal(after.optOut.isOptedOut, true);
    assert.equal(after.optOut.method, "provider");
    assert.equal(after.optOut.keyword, "21610");
    assert.equal(after.consentEvents.at(-1).method, "provider");
    assert.equal((await VtextMessage.findById(sending._id)).status, "failed");
    assert.equal((await VtextMessage.findById(other._id)).status, "cancelled");
    assert.equal(canSend(after, { origin: { kind: "automation" } }).allowed, false);
  } finally {
    adapter.send = realSend;
  }
});

test("a delivery receipt that fails with 21610 does the same, and never twice", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await newContact();
  const message = await VtextMessage.create({
    direction: "out", contactId: contact._id, lineId: twilioLine._id, channelType: "twilio-sms", body: "Hi", status: "accepted", provider: { messageId: "SM-OPT-1" },
  });
  const event = { type: "message.status", providerMessageId: "SM-OPT-1", status: "failed", errorCode: "21610", errorKind: "recipient" };

  await handleMessageStatus(event, twilioLine);
  const once = await reloadContact(contact);
  assert.equal(once.optOut.isOptedOut, true);
  assert.equal(once.optOut.method, "provider");
  const events = once.consentEvents.length;

  await handleMessageStatus(event, twilioLine); // a repeated receipt
  assert.equal((await reloadContact(contact)).consentEvents.length, events, "no second opt-out event");
  assert.equal((await VtextMessage.findById(message._id)).status, "failed");
});

test("'not a valid mobile number' (21614) marks the contact a landline so the gate stops further tries", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const adapter = getAdapter("twilio-sms");
  const realSend = adapter.send;
  try {
    adapter.send = async () => { throw new ChannelError("recipient", "TWILIO_21614", "not a valid mobile number"); };
    const contact = await newContact();
    const message = await queuedText(contact, "assigned");
    await VtextMessage.updateOne({ _id: message._id }, { $set: { lineId: twilioLine._id } });
    await assert.rejects(processSendJob(twilioLine._id, { data: { messageId: String(message._id), reservationDay: "2026-10-28" } }));
    const after = await reloadContact(contact);
    assert.equal(after.phoneStatus, "landline");
    assert.equal(canSend(after, { origin: { kind: "automation" } }).allowed, false);
    assert.equal(after.optOut?.isOptedOut || false, false, "a landline is not an opt-out");
  } finally {
    adapter.send = realSend;
  }
});

test("a Twilio send interrupted mid-call is never sent again, but a retry after a known transient error is", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const adapter = getAdapter("twilio-sms");
  const realSend = adapter.send;
  let calls = 0;
  try {
    adapter.send = async () => { calls += 1; return { providerMessageId: "SMretry" }; };
    const job = (m) => ({ data: { messageId: String(m._id), reservationDay: "2026-10-28" } });

    // "sending" with no recorded error: the job died in the middle of the call, so it may already be at Twilio.
    const interrupted = await queuedText(await newContact(), "sending");
    await VtextMessage.updateOne({ _id: interrupted._id }, { $set: { lineId: twilioLine._id } });
    await processSendJob(twilioLine._id, job(interrupted));
    const after = await VtextMessage.findById(interrupted._id);
    assert.equal(calls, 0, "no second send");
    assert.equal(after.status, "failed");
    assert.equal(after.error.code, "UNCERTAIN");

    // "sending" after the previous attempt recorded a transient error: it definitely did not go out, so retry.
    const retry = await queuedText(await newContact(), "sending");
    await VtextMessage.updateOne({ _id: retry._id }, { $set: { lineId: twilioLine._id, error: { kind: "transient", code: "ETIMEDOUT", message: "timeout before sending" } } });
    await processSendJob(twilioLine._id, job(retry));
    assert.equal(calls, 1);
    assert.equal((await VtextMessage.findById(retry._id)).status, "accepted");
  } finally {
    adapter.send = realSend;
  }
});
