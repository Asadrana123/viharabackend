// Phone checks before texting (branch phone-number-checks, 2026-11-28):
//   - the free format check (libphonenumber-js) and Twilio Lookup's line type (faked here: no network, no cost)
//   - what they mean: invalid / landline → no texts; VoIP → SMS only, never the Mac
//   - Twilio's own number errors (21211, 21614, 30005, 30006) mark the number for every later sender
//   - the router keeps a "not on iMessage" for 180 days, and trusts what our own iMessages proved
// Throwaway local Mongo database and fake queues; the DB tests are skipped when no local Mongo is running.
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

process.env.VTEXT_SECRETS_KEY = "00".repeat(32); // throwaway key, test process only
process.env.VTEXT_ENABLE_SLACK_ALERTS = "false";
process.env.VTEXT_SMS_FALLBACK_ENABLED = "true";

const queues = require("./queue/queues");
queues.getRouteQueue = () => ({ add: async () => ({}) });
queues.getLineQueue = () => ({ getJob: async () => null });

const VtextMessage = require("../../model/vtext/vtextMessageModel");
const VtextContact = require("../../model/vtext/vtextContactModel");
const VtextLine = require("../../model/vtext/vtextLineModel");
const VtextSettings = require("../../model/vtext/vtextSettingsModel");
const PhoneLookup = require("../../model/leads/phoneLookupModel");
const { encryptCredentials } = require("../../utils/secretBox");
const { checkPhoneFormat } = require("../../utils/phoneCheck");
const { lookupPhone, checkContactPhone, verdictFor, setLookupForTests } = require("../leads/phoneLookupService");
const { phoneStatusForTwilioError } = require("./vtextPhoneFacts");
const { enqueueOutbound } = require("./vtextMessageService");
const { selectLine } = require("./vtextRouter");
const { handleMessageReceived, handleMessageStatus } = require("./workers/inboundWorker");
const { processSendJob } = require("./workers/lineSendWorker");
const { getAdapter } = require("./channels/registry");
const { ChannelError } = require("./channels/channelError");
const { getRedisClient, getSubscriberClient } = require("./queue/connection");

const DB_URI = "mongodb://127.0.0.1:27017/vihara_phone_checks_test";
const DAY = 86_400_000;
let mongoUp = false;
let imessageLine;
let twilioLine;
let counter = 0;

// Fake Twilio Lookup: answers from this table and counts the (paid) calls.
const answers = new Map();
const paidCalls = [];
const fakeLookup = async (e164) => {
  paidCalls.push(e164);
  const a = answers.get(e164);
  if (a instanceof Error) throw a;
  return { valid: true, validationErrors: [], country: "US", carrierName: "Test Carrier", errorCode: null, lineType: "mobile", ...a };
};

// Real-range US numbers, so the free check passes and Twilio is asked (212 = New York, 415 = San Francisco).
const nextUsNumber = () => {
  counter += 1;
  return `+1415523${String(1000 + counter)}`;
};

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
    name: "iMessage test line", channelType: "imessage-bluebubbles", address: "vtext@example.test", webhookKey: "pc-im", status: "active",
    config: { serverUrl: "http://127.0.0.1:1" }, credentials: encryptCredentials({ password: "x" }),
  });
  twilioLine = await VtextLine.create({
    name: "Twilio test line", channelType: "twilio-sms", address: "+15559876543", webhookKey: "pc-tw", status: "active",
    config: { messagingServiceSid: `MG${"a".repeat(32)}` }, credentials: encryptCredentials({ accountSid: `AC${"b".repeat(32)}`, authToken: "t" }),
  });
  await VtextSettings.updateOne({}, { $set: { smsOnly: false } }, { upsert: true });
});

test.after(async () => {
  setLookupForTests(null);
  if (mongoUp) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await getRedisClient().quit().catch(() => {});
  await getSubscriberClient().quit().catch(() => {});
});

test.beforeEach(() => {
  process.env.PHONE_LOOKUP_ENABLED = "true";
  answers.clear();
  paidCalls.length = 0;
  setLookupForTests(fakeLookup);
});

const newContact = (fields = {}) =>
  VtextContact.create({ phoneE164: nextUsNumber(), phoneStatus: "unknown", source: "admin", consent: { status: "opted-in" }, ...fields });
const reload = (c) => VtextContact.findById(c._id);
const route = async (contact) => (await selectLine({ channelPolicy: { mode: "any" }, isReplyToInbound: false }, contact)).line;

// ─── No database needed ──────────────────────────────────────────────────────

test("free check: the numbers from the 27 Nov alerts", () => {
  assert.deepEqual(checkPhoneFormat("+14989977708"), { valid: false, country: null }, "Gary: 498 is not a real area code");
  assert.equal(checkPhoneFormat("+15555555555").valid, false, "555 test number");
  assert.equal(checkPhoneFormat("+11234567890").valid, false, "123-456-7890");
  assert.deepEqual(checkPhoneFormat("+13238363636"), { valid: true, country: "US" }, "Jess: a real LA number (a landline: only Twilio can tell)");
  assert.deepEqual(checkPhoneFormat("+19426417273"), { valid: true, country: "CA" }, "Viraj: 942 is a Toronto area code");
  assert.equal(checkPhoneFormat("").valid, false);
  assert.equal(checkPhoneFormat("not a number").valid, false);
});

test("what a lookup means for texting", () => {
  assert.deepEqual(verdictFor({ valid: false }), { phoneStatus: "invalid", iMessage: false });
  assert.deepEqual(verdictFor({ valid: true, lineType: "landline" }), { phoneStatus: "landline", iMessage: false });
  assert.deepEqual(verdictFor({ valid: true, lineType: "nonFixedVoip" }), { phoneStatus: "valid", iMessage: false }, "Google Voice: SMS, never iMessage");
  assert.deepEqual(verdictFor({ valid: true, lineType: "fixedVoip" }), { phoneStatus: "valid", iMessage: false });
  assert.deepEqual(verdictFor({ valid: true, lineType: "tollFree" }), { phoneStatus: null, iMessage: false });
  assert.deepEqual(verdictFor({ valid: true, lineType: "mobile" }), { phoneStatus: "valid", iMessage: null }, "a mobile may be an iPhone: try iMessage");
  assert.deepEqual(verdictFor({ valid: true, lineType: "unknown" }), { phoneStatus: null, iMessage: null });
  assert.deepEqual(verdictFor({ source: "format", valid: true }), { phoneStatus: null, iMessage: null });
  assert.deepEqual(verdictFor(null), { phoneStatus: null, iMessage: null });
});

test("Twilio errors that are about the number", () => {
  assert.equal(phoneStatusForTwilioError("TWILIO_21211"), "invalid");
  assert.equal(phoneStatusForTwilioError("30005"), "invalid");
  assert.equal(phoneStatusForTwilioError("TWILIO_21614"), "landline");
  assert.equal(phoneStatusForTwilioError(30006), "landline");
  assert.equal(phoneStatusForTwilioError("30003"), null, "phone off / out of coverage passes");
  assert.equal(phoneStatusForTwilioError("TWILIO_21408"), null, "country not enabled is about our account, not the number");
  assert.equal(phoneStatusForTwilioError(undefined), null);
});

// ─── Lookup ──────────────────────────────────────────────────────────────────

test("a US number is looked up once and kept; a number that can't exist is never paid for", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const phone = nextUsNumber();
  answers.set(phone, { lineType: "landline", carrierName: "AT&T" });

  const first = await lookupPhone(phone);
  assert.equal(first.source, "twilio");
  assert.equal(first.lineType, "landline");
  const second = await lookupPhone(phone);
  assert.equal(second.lineType, "landline");
  assert.deepEqual(paidCalls, [phone], "paid once");

  const gary = await lookupPhone("+14989977708");
  assert.equal(gary.valid, false);
  assert.equal(gary.source, "format");
  assert.equal(paidCalls.length, 1, "the free check stopped it");
});

test("two texts at the same moment pay for one lookup", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const phone = nextUsNumber();
  const [a, b] = await Promise.all([lookupPhone(phone), lookupPhone(phone)]);
  assert.equal(a.lineType, "mobile");
  assert.equal(b.lineType, "mobile");
  assert.deepEqual(paidCalls, [phone]);
});

test("not paid for: Lookup switched off, a non-US number, or a stale-free answer already kept", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  process.env.PHONE_LOOKUP_ENABLED = "false";
  const off = await lookupPhone(nextUsNumber());
  assert.equal(off.source, "format");
  assert.equal(off.valid, true);

  process.env.PHONE_LOOKUP_ENABLED = "true";
  const canada = await lookupPhone("+19426417273");
  assert.equal(canada.source, "format");
  assert.equal(canada.country, "CA");
  const india = await lookupPhone("+919876543210");
  assert.equal(india.source, "format");
  assert.equal(paidCalls.length, 0);
});

test("an old answer is looked up again after 180 days", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const phone = nextUsNumber();
  await PhoneLookup.create({ phoneE164: phone, source: "twilio", valid: true, lineType: "landline", checkedAt: new Date(Date.now() - 200 * DAY) });
  answers.set(phone, { lineType: "mobile" });
  assert.equal((await lookupPhone(phone)).lineType, "mobile", "ported to a mobile since");
  assert.equal(paidCalls.length, 1);
});

test("Twilio failing: the text still goes as before, nothing wrong is saved, and Lookups pause", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const phone = nextUsNumber();
  answers.set(phone, new Error("Twilio is down"));
  const result = await lookupPhone(phone);
  assert.equal(result.source, "format");
  assert.equal(result.checkedAt, null, "not saved as a final answer");
  assert.equal(await PhoneLookup.findOne({ phoneE164: phone, source: "twilio" }), null);

  const contact = await newContact();
  const verdict = await checkContactPhone(contact);
  assert.deepEqual(verdict, { phoneStatus: null, iMessage: null }, "paused: only the free check, no new facts");
  const after = await reload(contact);
  assert.equal(after.phoneStatus, "unknown");
  assert.equal(after.lookup.source, "format", "so a later text asks Twilio again");
  assert.equal(paidCalls.length, 1, "no second call while paused");
});

// ─── What it does to texts ───────────────────────────────────────────────────

test("a landline gets no text at all (from any sender), and the contact shows why", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const phone = (await newContact()).phoneE164; // a lead who ticked the SMS box, number not checked yet
  answers.set(phone, { lineType: "landline" });
  const { blocked, reason } = await enqueueOutbound({ to: phone, body: "Hi - this is Maya from Vihara. Are you there?", origin: { kind: "bulk", templateKey: "test" } });
  assert.equal(blocked, true);
  assert.match(reason, /landline/);
  const contact = await VtextContact.findOne({ phoneE164: phone });
  assert.equal(contact.phoneStatus, "landline");
  assert.equal(contact.lookup.lineType, "landline");
  assert.equal(contact.lookup.source, "twilio");
});

test("a number that can't exist is blocked before any Twilio cost", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const { blocked, reason } = await enqueueOutbound({ to: "+14989977708", body: "Hi Gary", origin: { kind: "bulk", templateKey: "test" } });
  assert.equal(blocked, true);
  assert.match(reason, /invalid/);
  assert.equal(paidCalls.length, 0);
});

test("a VoIP number (Google Voice) goes straight to Twilio SMS, never to the Mac", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const phone = (await newContact()).phoneE164;
  answers.set(phone, { lineType: "nonFixedVoip", carrierName: "Google (Grand Central) - SVR" });
  const { blocked } = await enqueueOutbound({ to: phone, body: "Hi", origin: { kind: "automation", templateKey: "test" } });
  assert.equal(blocked, false);
  const contact = await VtextContact.findOne({ phoneE164: phone });
  assert.equal(contact.phoneStatus, "valid");
  assert.equal(contact.channelReachability.find((r) => r.channelType === "imessage-bluebubbles").reachable, false);
  assert.equal(String((await route(contact))?._id), String(twilioLine._id));
});

test("a mobile is tried on iMessage first, as before", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const phone = (await newContact()).phoneE164;
  await enqueueOutbound({ to: phone, body: "Hi", origin: { kind: "automation", templateKey: "test" } });
  const contact = await VtextContact.findOne({ phoneE164: phone });
  assert.equal(contact.phoneStatus, "valid");
  assert.equal(contact.lookup.lineType, "mobile");
  assert.equal(String((await route(contact))?._id), String(imessageLine._id));
});

test("someone who texted us is never marked a landline by a lookup, and a known iPhone keeps iMessage", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const texted = await newContact({ phoneStatus: "valid", lastInboundAt: new Date() });
  answers.set(texted.phoneE164, { lineType: "landline" });
  await checkContactPhone(texted);
  assert.equal((await reload(texted)).phoneStatus, "valid");

  const iphone = await newContact({ iphone: { isIphone: true, learnedAt: new Date() } });
  answers.set(iphone.phoneE164, { lineType: "fixedVoip" });
  await checkContactPhone(iphone);
  const after = await reload(iphone);
  assert.equal(after.channelReachability.find((r) => r.channelType === "imessage-bluebubbles"), undefined);
  assert.equal(String((await route(after))?._id), String(imessageLine._id));
});

test("a contact is checked once: the next text doesn't look it up again", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const phone = (await newContact()).phoneE164;
  await enqueueOutbound({ to: phone, body: "One", origin: { kind: "automation", templateKey: "test" } });
  await enqueueOutbound({ to: phone, body: "Two", origin: { kind: "automation", templateKey: "test" } });
  assert.equal(paidCalls.length, 1);
});

// ─── The router and what our own texts proved ────────────────────────────────

test("router: 'not on iMessage' is kept for 180 days, not 30", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const at = (daysAgo) => [{ channelType: "imessage-bluebubbles", reachable: false, checkedAt: new Date(Date.now() - daysAgo * DAY) }];
  const fortyDays = await newContact({ phoneStatus: "valid", channelReachability: at(40) });
  assert.equal(String((await route(fortyDays))?._id), String(twilioLine._id), "40 days ago: still SMS (it went back to the Mac before)");
  const longAgo = await newContact({ phoneStatus: "valid", channelReachability: at(200) });
  assert.equal(String((await route(longAgo))?._id), String(imessageLine._id), "after 180 days: try iMessage once more");
});

test("router: an error 22 learned from our own iMessage sends them to SMS; a 'Delivered' keeps iMessage", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const notIphone = await newContact({ phoneStatus: "valid", iphone: { isIphone: false, learnedAt: new Date() } });
  assert.equal(String((await route(notIphone))?._id), String(twilioLine._id));
  const oldNo = await newContact({ phoneStatus: "valid", iphone: { isIphone: false, learnedAt: new Date(Date.now() - 200 * DAY) } });
  assert.equal(String((await route(oldNo))?._id), String(imessageLine._id), "an old 'no' (maybe an outage) expires");
  const iphone = await newContact({
    phoneStatus: "valid",
    iphone: { isIphone: true, learnedAt: new Date() },
    channelReachability: [{ channelType: "imessage-bluebubbles", reachable: false, checkedAt: new Date() }],
  });
  assert.equal(String((await route(iphone))?._id), String(imessageLine._id), "a delivered iMessage is proof");
});

// ─── Twilio's own errors mark the number ─────────────────────────────────────

const twilioText = (contact) =>
  VtextMessage.create({
    direction: "out", contactId: contact._id, lineId: twilioLine._id, channelType: "twilio-sms", body: "Hi", status: "sent",
    provider: { messageId: `SM${++counter}` }, origin: { kind: "automation", templateKey: "test" },
  });
const receipt = (message, errorCode) =>
  handleMessageStatus(
    { type: "message.status", providerEventId: `rcpt-${++counter}`, providerMessageId: message.provider.messageId, status: "failed", errorCode, errorKind: "recipient", at: new Date() },
    twilioLine
  );

test("receipts: 30005 marks the number invalid, 30006 a landline, 30003 leaves it alone", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const gone = await newContact({ phoneStatus: "valid" });
  await receipt(await twilioText(gone), "30005");
  assert.equal((await reload(gone)).phoneStatus, "invalid");

  const landline = await newContact({ phoneStatus: "valid" });
  await receipt(await twilioText(landline), "30006");
  assert.equal((await reload(landline)).phoneStatus, "landline");

  const off = await newContact({ phoneStatus: "valid" });
  await receipt(await twilioText(off), "30003");
  assert.equal((await reload(off)).phoneStatus, "valid");

  // …so the next bulk text to that number is blocked, whatever script sends it.
  const { blocked } = await enqueueOutbound({ to: gone.phoneE164, body: "Hi again", origin: { kind: "bulk", templateKey: "test" } });
  assert.equal(blocked, true);
});

test("send refused with 21211 (not a valid number) marks the number invalid", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const adapter = getAdapter("twilio-sms");
  const realSend = adapter.send;
  try {
    adapter.send = async () => { throw new ChannelError("recipient", "TWILIO_21211", "The 'To' number is not a valid phone number."); };
    const contact = await newContact({ phoneStatus: "valid" });
    const message = await VtextMessage.create({
      direction: "out", contactId: contact._id, lineId: twilioLine._id, channelType: "twilio-sms", body: "Hi", status: "assigned",
      origin: { kind: "automation", templateKey: "test" },
    });
    await assert.rejects(processSendJob(twilioLine._id, { data: { messageId: String(message._id), reservationDay: "2026-11-28" } }));
    assert.equal((await reload(contact)).phoneStatus, "invalid");
  } finally {
    adapter.send = realSend;
  }
});

test("a number we marked bad that then texts us is textable again", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await newContact({ phoneStatus: "landline" });
  await handleMessageReceived(
    { type: "message.received", providerEventId: `in-${++counter}`, providerMessageId: `in-${counter}`, from: contact.phoneE164, to: twilioLine.address, body: "Hi, got your call", receivedAt: new Date() },
    twilioLine
  );
  assert.equal((await reload(contact)).phoneStatus, "valid");
});
