// The SMS fallback (vtextSmsFallbackService): when an iMessage cannot be delivered, the same text goes out once by
// Twilio SMS, and never twice. Uses a throwaway local Mongo database and fake queues; skipped when no local Mongo is
// running. Nothing here talks to Twilio, BlueBubbles, Redis or Slack.
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

process.env.VTEXT_SECRETS_KEY = "00".repeat(32); // throwaway key, test process only

// Fake the queues BEFORE any module destructures them.
const queues = require("./queue/queues");
const routeJobs = [];
const removedJobs = [];
queues.getRouteQueue = () => ({ add: async (name, data, opts) => (routeJobs.push({ data, opts }), { id: opts?.jobId }) });
queues.getLineQueue = () => ({ getJob: async (id) => ({ remove: async () => removedJobs.push(id) }) });

const VtextMessage = require("../../model/vtext/vtextMessageModel");
const VtextContact = require("../../model/vtext/vtextContactModel");
const VtextLine = require("../../model/vtext/vtextLineModel");
const VtextConversation = require("../../model/vtext/vtextConversationModel");
const { encryptCredentials } = require("../../utils/secretBox");
const fallback = require("./vtextSmsFallbackService");
const { handleMessageStatus } = require("./workers/inboundWorker");
const { runUnconfirmedSendSweep } = require("./workers/maintenanceWorker");
const { selectLine } = require("./vtextRouter");
const { sendSmsFallback } = require("../../controller/vtext/vtextMessageController");
const { processSendJob } = require("./workers/lineSendWorker");
const { getAdapter } = require("./channels/registry");
const { ChannelError } = require("./channels/channelError");
const { leadTextingHours } = require("../../utils/textingWindow");
const { getRedisClient, getSubscriberClient } = require("./queue/connection");

const DB_URI = "mongodb://127.0.0.1:27017/vihara_sms_fallback_test";
const NOW = new Date("2026-10-28T17:00:00Z"); // 1 PM Eastern: texting hours are open
const NIGHT = new Date("2026-10-28T07:00:00Z"); // 3 AM Eastern: closed

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

test.beforeEach(() => {
  process.env.VTEXT_SMS_FALLBACK_ENABLED = "true";
  delete process.env.VTEXT_SMS_FALLBACK_NO_RECEIPT_MODE;
  delete process.env.VTEXT_SMS_FALLBACK_MAX_PER_HOUR;
  routeJobs.length = 0;
  removedJobs.length = 0;
});

const newContact = (fields = {}) => {
  counter += 1;
  return VtextContact.create({
    phoneE164: `+1212555${String(1000 + counter)}`, phoneStatus: "valid", source: "inbound-unknown", consent: { status: "opted-in" }, ...fields,
  });
};

/** An iMessage text that the receipt said could not be delivered (error 22), unless overridden. */
const newOriginal = (contact, fields = {}) => {
  counter += 1;
  return VtextMessage.create({
    direction: "out", contactId: contact._id, lineId: imessageLine._id, channelType: "imessage-bluebubbles",
    body: "Hi Sam, thanks for your interest. Want to see homes under $150K?", status: "failed",
    error: { kind: "recipient", code: "22", message: "Not delivered" },
    provider: { messageId: `BB-${counter}` }, sentAt: new Date(Date.now() - 5 * 60_000),
    idempotencyKey: `fb-intro-text-lead${counter}`, origin: { kind: "automation", templateKey: "fb-intro" }, ...fields,
  });
};

const fallbackFor = (original) => VtextMessage.findOne({ fallbackOf: original._id });
const reload = (doc) => VtextMessage.findById(doc._id);

test("an explicit not-delivered receipt queues exactly one SMS, linked to the original, pinned to Twilio", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await newContact();
  const original = await newOriginal(contact, { status: "accepted", error: undefined });

  await handleMessageStatus({ type: "message.status", providerMessageId: original.provider.messageId, status: "failed", errorCode: "22", errorKind: "recipient" }, imessageLine);

  const sms = await fallbackFor(original);
  assert.ok(sms, "a fallback message exists");
  assert.equal(sms.body, original.body);
  assert.equal(sms.direction, "out");
  assert.deepEqual({ mode: sms.channelPolicy.mode, channels: [...sms.channelPolicy.channels] }, { mode: "only", channels: ["twilio-sms"] });
  assert.equal(sms.idempotencyKey, `${original.idempotencyKey}-sms`);
  assert.equal(sms.origin.templateKey, "fb-intro");
  assert.ok(["queued"].includes(sms.status));
  assert.ok(routeJobs.some((j) => j.data.messageId === String(sms._id)), "route job added");

  const after = await reload(original);
  assert.equal(after.status, "failed");
  assert.equal(after.fallback.status, "queued");
  assert.equal(String(after.fallback.messageId), String(sms._id));
  assert.equal(after.fallback.trigger, "not-delivered");

  const updated = await VtextContact.findById(contact._id);
  const reach = updated.channelReachability.find((r) => r.channelType === "imessage-bluebubbles");
  assert.equal(reach.reachable, false, "later texts to this number skip iMessage");
});

test("two triggers at once, and a repeated receipt, still make one fallback", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await newContact();
  const original = await newOriginal(contact);

  const results = await Promise.all([
    fallback.maybeQueueSmsFallback(original, { trigger: "not-delivered" }, { now: () => NOW }),
    fallback.maybeQueueSmsFallback(original, { trigger: "send-error" }, { now: () => NOW }),
  ]);
  await fallback.maybeQueueSmsFallback(await reload(original), { trigger: "not-delivered" }, { now: () => NOW });

  assert.equal(results.filter((r) => r.queued).length, 1);
  assert.equal(await VtextMessage.countDocuments({ fallbackOf: original._id }), 1);
});

test("the unique key is the backstop when the claim and the message disagree", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await newContact();
  const original = await newOriginal(contact);
  const existing = await VtextMessage.create({
    direction: "out", contactId: contact._id, body: "x", status: "queued", idempotencyKey: `${original.idempotencyKey}-sms`, fallbackOf: original._id,
  });

  const result = await fallback.maybeQueueSmsFallback(original, { trigger: "not-delivered" }, { now: () => NOW });
  assert.equal(result.queued, false);
  assert.equal(await VtextMessage.countDocuments({ fallbackOf: original._id }), 1);
  assert.equal(String((await reload(original)).fallback.messageId), String(existing._id));
});

test("it does nothing while switched off", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  process.env.VTEXT_SMS_FALLBACK_ENABLED = "false";
  const original = await newOriginal(await newContact());
  const result = await fallback.maybeQueueSmsFallback(original, { trigger: "not-delivered" });
  assert.equal(result.queued, false);
  assert.equal(await fallbackFor(original), null);
  assert.equal((await reload(original)).fallback?.status, undefined);
});

test("safety checks: each of these never sends, and the permanent ones are remembered", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const cases = [
    ["opted out", { optOut: { isOptedOut: true } }, {}, "opted out"],
    ["not a US number", { phoneE164: "+447911123456" }, {}, "US phone"],
    ["an email contact", { phoneE164: "sam@example.test" }, {}, "US phone"],
    ["a system reply", {}, { origin: { kind: "system", templateKey: "stop-confirm" } }, "system replies"],
    ["too old", {}, { sentAt: new Date(NOW.getTime() - 30 * 3_600_000) }, "older than"],
    ["they replied since", { lastInboundAt: new Date(NOW.getTime() - 60_000) }, { sentAt: new Date(NOW.getTime() - 300_000) }, "replied"],
    ["landline", { phoneStatus: "landline" }, {}, "landline"],
  ];
  for (const [name, contactFields, messageFields, expected] of cases) {
    const contact = await newContact(contactFields);
    const original = await newOriginal(contact, messageFields);
    const result = await fallback.maybeQueueSmsFallback(original, { trigger: "not-delivered" }, { now: () => NOW });
    assert.equal(result.queued, false, name);
    assert.ok(result.reason.includes(expected), `${name}: "${result.reason}" should mention "${expected}"`);
    assert.equal(await fallbackFor(original), null, `${name}: no message`);
    assert.equal((await reload(original)).fallback.status, "skipped", `${name}: remembered`);
  }

  const delivered = await newOriginal(await newContact(), { status: "delivered", error: undefined });
  assert.equal((await fallback.maybeQueueSmsFallback(delivered, { trigger: "not-delivered" }, { now: () => NOW })).queued, false);
});

test("the consent switch: ON blocks a contact with no consent; OFF lets them through (opt-outs still block)", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const { updateSettings } = require("./vtextSettingsService");
  try {
    await updateSettings({ requireConsent: true }, { adminName: "test" });
    const noConsent = await newOriginal(await newContact({ consent: { status: "unknown" } }));
    const blocked = await fallback.maybeQueueSmsFallback(noConsent, { trigger: "not-delivered" }, { now: () => NOW });
    assert.equal(blocked.queued, false);
    assert.equal(await fallbackFor(noConsent), null);

    await updateSettings({ requireConsent: false }, { adminName: "test" });
    const allowed = await newOriginal(await newContact({ consent: { status: "unknown" } }));
    assert.equal((await fallback.maybeQueueSmsFallback(allowed, { trigger: "not-delivered" }, { now: () => NOW })).queued, true);

    const optedOut = await newOriginal(await newContact({ consent: { status: "unknown" }, optOut: { isOptedOut: true } }));
    assert.equal((await fallback.maybeQueueSmsFallback(optedOut, { trigger: "not-delivered" }, { now: () => NOW })).queued, false, "an opt-out blocks even with the switch off");
  } finally {
    await updateSettings({ requireConsent: true }, { adminName: "test" });
  }
});

test("no routable Twilio line, or the hourly cap: not sent, and NOT remembered, so a later try can work", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  // hourly cap
  process.env.VTEXT_SMS_FALLBACK_MAX_PER_HOUR = "1";
  const capped = await newOriginal(await newContact());
  await VtextMessage.updateOne({ _id: (await newOriginal(await newContact()))._id }, { $set: { fallbackOf: capped._id } }); // one fallback already made this hour
  const capResult = await fallback.maybeQueueSmsFallback(capped, { trigger: "not-delivered" }, { now: () => new Date() });
  assert.equal(capResult.queued, false);
  assert.match(capResult.reason, /hourly/);
  assert.equal((await reload(capped)).fallback?.status, undefined);
  delete process.env.VTEXT_SMS_FALLBACK_MAX_PER_HOUR;

  // no routable SMS line
  await VtextLine.updateOne({ _id: twilioLine._id }, { $set: { status: "paused" } });
  const waiting = await newOriginal(await newContact());
  const result = await fallback.maybeQueueSmsFallback(waiting, { trigger: "not-delivered" }, { now: () => new Date() });
  await VtextLine.updateOne({ _id: twilioLine._id }, { $set: { status: "active" } });
  assert.equal(result.queued, false);
  assert.match(result.reason, /no active Twilio/);
  assert.equal((await reload(waiting)).fallback?.status, undefined);

  // and it works once the line is back
  const retry = await fallback.maybeQueueSmsFallback(await reload(waiting), { trigger: "not-delivered" }, { now: () => new Date() });
  assert.equal(retry.queued, true);
});

test("outside texting hours the SMS is held until the number's morning", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await newContact();
  const original = await newOriginal(contact, { sentAt: new Date(NIGHT.getTime() - 300_000) });
  const result = await fallback.maybeQueueSmsFallback(original, { trigger: "not-delivered" }, { now: () => NIGHT });
  assert.equal(result.queued, true);
  const sms = await fallbackFor(original);
  assert.ok(sms.scheduledFor > NIGHT, "scheduled for later");
  assert.equal(leadTextingHours(contact.phoneE164, sms.scheduledFor).open, true, "inside 8 AM-9 PM where they are");
  assert.ok(sms.scheduledFor.getTime() - NIGHT.getTime() < 8 * 3_600_000);
});

test("a receipt that arrives late cancels a fallback that has not gone out", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await newContact();
  const original = await newOriginal(contact, { status: "accepted", error: undefined });
  await handleMessageStatus({ type: "message.status", providerMessageId: original.provider.messageId, status: "failed", errorCode: "22", errorKind: "recipient" }, imessageLine);
  const sms = await fallbackFor(original);
  assert.equal(sms.status, "queued");

  // the original is confirmed after all
  await handleMessageStatus({ type: "message.status", providerMessageId: original.provider.messageId, status: "delivered", at: new Date() }, imessageLine);

  assert.equal((await reload(sms)).status, "cancelled");
  const after = await reload(original);
  assert.equal(after.status, "delivered");
  assert.equal(after.fallback.status, "cancelled");
});

test("a receipt that arrives after the SMS already went out flags a duplicate and alerts", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await newContact();
  const original = await newOriginal(contact);
  await fallback.maybeQueueSmsFallback(original, { trigger: "not-delivered" }, { now: () => NOW });
  const sms = await fallbackFor(original);
  await VtextMessage.updateOne({ _id: sms._id }, { $set: { status: "sent" } });

  const alerts = [];
  const result = await fallback.onOriginalConfirmed(await reload(original), { notify: async (payload) => alerts.push(payload) });

  assert.equal(result.action, "duplicate");
  assert.equal((await reload(original)).fallback.duplicate, true);
  assert.equal((await reload(sms)).status, "sent", "the sent SMS is left alone");
  assert.equal(alerts.length, 1);
});

test("an assigned fallback is cancelled with its send job removed", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await newContact();
  const original = await newOriginal(contact);
  await fallback.maybeQueueSmsFallback(original, { trigger: "not-delivered" }, { now: () => NOW });
  const sms = await fallbackFor(original);
  await VtextMessage.updateOne({ _id: sms._id }, { $set: { status: "assigned", lineId: twilioLine._id } });

  await fallback.onOriginalConfirmed(await reload(original), {});

  assert.equal((await reload(sms)).status, "cancelled");
  assert.ok(removedJobs.includes(`send-${sms._id}`));
});

test("no-receipt: 'verify' (default) sends nothing; 'auto' sends unless the number is a known iPhone; 'off' sends nothing", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const staleAccepted = async (contactFields) => {
    const contact = await newContact(contactFields);
    const message = await newOriginal(contact, { status: "accepted", error: undefined });
    await VtextMessage.collection.updateOne({ _id: message._id }, { $set: { updatedAt: new Date(Date.now() - 30 * 60_000) } }); // 30 minutes without a receipt
    return message;
  };

  const verify = await staleAccepted({});
  await runUnconfirmedSendSweep();
  assert.equal((await reload(verify)).status, "unknown");
  assert.equal(await fallbackFor(verify), null, "verify mode: a person decides");

  process.env.VTEXT_SMS_FALLBACK_NO_RECEIPT_MODE = "off";
  const off = await staleAccepted({});
  await runUnconfirmedSendSweep();
  assert.equal(await fallbackFor(off), null);

  process.env.VTEXT_SMS_FALLBACK_NO_RECEIPT_MODE = "auto";
  const auto = await staleAccepted({});
  const iphone = await staleAccepted({ iphone: { isIphone: true } });
  await runUnconfirmedSendSweep();
  const sms = await fallbackFor(auto);
  assert.ok(sms, "auto mode sends");
  assert.equal((await reload(auto)).fallback.trigger, "no-receipt-auto");
  assert.equal(await fallbackFor(iphone), null, "a known iPhone is never auto-sent");

  // and a no-receipt fallback does NOT mark iMessage as unreachable (a missing receipt proves nothing)
  const contact = await VtextContact.findById(auto.contactId);
  assert.equal(contact.channelReachability.find((r) => r.channelType === "imessage-bluebubbles"), undefined);
});

test("the send-time check: cancels when the iMessage got delivered or they replied, holds at night, otherwise lets it through", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const makeFallback = async (originalFields = {}, contactFields = {}) => {
    const contact = await newContact(contactFields);
    const original = await newOriginal(contact, originalFields);
    await fallback.maybeQueueSmsFallback(original, { trigger: "not-delivered" }, { now: () => NOW });
    const sms = await fallbackFor(original);
    await VtextMessage.updateOne({ _id: sms._id }, { $set: { status: "assigned", lineId: twilioLine._id } });
    return { contact, original, sms: await reload(sms) };
  };
  const run = (sms, contact, now) => fallback.guardFallbackBeforeSend(sms, contact, twilioLine, "2026-10-28", { now: () => now });

  // fine to send
  let f = await makeFallback();
  assert.equal(await run(f.sms, f.contact, NOW), false);
  assert.equal((await reload(f.sms)).status, "assigned");

  // iMessage delivered meanwhile
  f = await makeFallback();
  await VtextMessage.updateOne({ _id: f.original._id }, { $set: { status: "delivered" } });
  assert.equal(await run(await reload(f.sms), f.contact, NOW), true);
  assert.equal((await reload(f.sms)).status, "cancelled");
  assert.equal((await reload(f.original)).fallback.status, "cancelled");

  // they replied meanwhile
  f = await makeFallback();
  const replied = await VtextContact.findByIdAndUpdate(f.contact._id, { $set: { lastInboundAt: new Date(f.original.sentAt.getTime() + 1000) } }, { new: true });
  assert.equal(await run(await reload(f.sms), replied, NOW), true);
  assert.equal((await reload(f.sms)).status, "cancelled");

  // texting hours closed at send time: re-queued for the morning, route job delayed
  f = await makeFallback();
  routeJobs.length = 0;
  assert.equal(await run(await reload(f.sms), f.contact, NIGHT), true);
  const held = await reload(f.sms);
  assert.equal(held.status, "queued");
  assert.equal(held.lineId, undefined);
  assert.ok(held.scheduledFor > NIGHT);
  assert.equal(routeJobs.length, 1);
  assert.ok(routeJobs[0].opts.delay > 0);

  // switched off meanwhile
  f = await makeFallback();
  process.env.VTEXT_SMS_FALLBACK_ENABLED = "false";
  assert.equal(await run(await reload(f.sms), f.contact, NOW), true);
  assert.equal((await reload(f.sms)).status, "cancelled");
});

test("routing: Twilio is never a default; a number known to be off iMessage goes to Twilio only while the fallback is on", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const message = { channelPolicy: { mode: "any", channels: [] }, excludeLineIds: [], isReplyToInbound: false };
  const withConversations = async (contact) => {
    for (const line of [imessageLine, twilioLine]) {
      await VtextConversation.create({ contactId: contact._id, lineId: line._id, channelType: line.channelType, contactPhone: contact.phoneE164, lineAddress: line.address });
    }
  };

  const normal = await newContact();
  await withConversations(normal);
  assert.equal(String((await selectLine(message, normal)).line._id), String(imessageLine._id), "an ordinary contact still goes by iMessage");

  const offImessage = await newContact({ channelReachability: [{ channelType: "imessage-bluebubbles", reachable: false, checkedAt: new Date() }] });
  await withConversations(offImessage);
  assert.equal(String((await selectLine(message, offImessage)).line._id), String(twilioLine._id));

  process.env.VTEXT_SMS_FALLBACK_ENABLED = "false";
  assert.equal((await selectLine(message, offImessage)).line, null, "fallback off: it waits rather than going to Twilio");
});

test("the Send by SMS button: refuses the wrong messages, queues a failed one once, and can retry a skipped one", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  // catchAsyncError does not return its promise, so wait for the response (or an error) explicitly.
  const call = (id) =>
    new Promise((resolve, reject) => {
      const out = {};
      const res = { status(code) { out.code = code; return this; }, json(body) { out.body = body; resolve(out); return this; } };
      sendSmsFallback({ params: { id: String(id) }, user: { name: "Adarsh" } }, res, reject);
    });

  const delivered = await newOriginal(await newContact(), { status: "delivered", error: undefined });
  assert.equal((await call(delivered._id)).code, 400);

  const noReceipt = await newOriginal(await newContact(), { status: "unknown", error: { kind: "transient", code: "no-receipt" } });
  const first = await call(noReceipt._id);
  assert.equal(first.code, 200);
  assert.equal((await fallbackFor(noReceipt)).status, "queued");
  assert.equal((await reload(noReceipt)).fallback.trigger, "manual");

  assert.equal((await call(noReceipt._id)).code, 409, "a second click does not send a second SMS");
  assert.equal(await VtextMessage.countDocuments({ fallbackOf: noReceipt._id }), 1);

  // skipped for a reason that has since been fixed: a person can retry
  const contact = await newContact({ optOut: { isOptedOut: true } });
  const skipped = await newOriginal(contact);
  await fallback.maybeQueueSmsFallback(skipped, { trigger: "not-delivered" }, { now: () => NOW });
  assert.equal((await reload(skipped)).fallback.status, "skipped");
  await VtextContact.updateOne({ _id: contact._id }, { $set: { optOut: { isOptedOut: false } } });
  assert.equal((await call(skipped._id)).code, 200);
});

test("the send worker: a BlueBubbles 'could not deliver' error fails the iMessage and queues the SMS; other errors do not", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const adapter = getAdapter("imessage-bluebubbles");
  const realSend = adapter.send;
  const assigned = async () => {
    const contact = await newContact();
    return newOriginal(contact, { status: "assigned", error: undefined, provider: undefined, sentAt: undefined });
  };
  const job = (message) => ({ data: { messageId: String(message._id), reservationDay: "2026-10-28" } });

  try {
    // MESSAGE_SEND_ERROR: the number is not on iMessage
    adapter.send = async () => { throw new ChannelError("recipient", "MESSAGE_SEND_ERROR", "Message Send Error"); };
    const notOnImessage = await assigned();
    await assert.rejects(processSendJob(imessageLine._id, job(notOnImessage)), /Message Send Error/); // permanent: BullMQ is told not to retry
    const failed = await reload(notOnImessage);
    assert.equal(failed.status, "failed");
    const sms = await fallbackFor(notOnImessage);
    assert.ok(sms, "the SMS was queued");
    assert.equal(sms.status, "queued");
    assert.equal(failed.fallback.trigger, "send-error");

    // a bad number is the recipient's problem but not an iMessage-delivery problem: no SMS
    adapter.send = async () => { throw new ChannelError("recipient", "INVALID_RECIPIENT", "bad chat"); };
    const invalid = await assigned();
    await assert.rejects(processSendJob(imessageLine._id, job(invalid)));
    assert.equal((await reload(invalid)).status, "failed");
    assert.equal(await fallbackFor(invalid), null);
  } finally {
    adapter.send = realSend;
  }
});
