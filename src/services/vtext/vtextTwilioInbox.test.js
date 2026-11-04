// The admin inbox for the SMS fallback: one merged thread per person, replies that stay on SMS, and a Leads-tab count
// that does not call a re-sent iMessage "failed". Throwaway local Mongo database; skipped when none is running.
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

process.env.VTEXT_SECRETS_KEY = "00".repeat(32); // throwaway key, test process only

const VtextMessage = require("../../model/vtext/vtextMessageModel");
const VtextContact = require("../../model/vtext/vtextContactModel");
const VtextConversation = require("../../model/vtext/vtextConversationModel");
const { getConversationMessages } = require("../../controller/vtext/vtextConversationController");
const { createDraftReply } = require("./vtextDraftReplyService");
const { getVtextTextSummaryForPhones } = require("./vtextLeadMessagesService");
const { getRedisClient, getSubscriberClient } = require("./queue/connection");

const DB_URI = "mongodb://127.0.0.1:27017/vihara_twilio_inbox_test";
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

const callMessages = (id, query = {}) =>
  new Promise((resolve, reject) => {
    const out = {};
    const res = { status(code) { out.code = code; return this; }, json(body) { out.body = body; resolve(out); return this; } };
    getConversationMessages({ params: { id: String(id) }, query }, res, reject);
  });

test("scope=contact merges a person's iMessage and SMS threads, oldest first; the default stays one thread", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await VtextContact.create({ phoneE164: "+12125557001", phoneStatus: "valid", source: "inbound-unknown", consent: { status: "opted-in" } });
  const other = await VtextContact.create({ phoneE164: "+12125557002", phoneStatus: "valid", source: "inbound-unknown", consent: { status: "opted-in" } });
  const imessageConv = await VtextConversation.create({ contactId: contact._id, lineId: new mongoose.Types.ObjectId(), channelType: "imessage-bluebubbles", contactPhone: contact.phoneE164, lineAddress: "a@example.test" });
  const smsConv = await VtextConversation.create({ contactId: contact._id, lineId: new mongoose.Types.ObjectId(), channelType: "twilio-sms", contactPhone: contact.phoneE164, lineAddress: "+15550001111" });

  const make = (conversation, channelType, body, at, contactId = contact._id) =>
    VtextMessage.create({ direction: "out", contactId, conversationId: conversation._id, channelType, body, status: "sent", createdAt: at });
  await make(imessageConv, "imessage-bluebubbles", "first, by iMessage", new Date("2026-10-28T10:00:00Z"));
  await make(smsConv, "twilio-sms", "second, by SMS", new Date("2026-10-28T10:20:00Z"));
  await make(imessageConv, "imessage-bluebubbles", "third", new Date("2026-10-28T10:30:00Z"));
  const otherConv = await VtextConversation.create({ contactId: other._id, lineId: new mongoose.Types.ObjectId(), channelType: "twilio-sms", contactPhone: other.phoneE164, lineAddress: "+15550001111" });
  await make(otherConv, "twilio-sms", "someone else", new Date("2026-10-28T10:10:00Z"), other._id); // never mixed in

  const merged = await callMessages(smsConv._id, { scope: "contact" });
  assert.deepEqual(merged.body.messages.map((m) => m.body), ["first, by iMessage", "second, by SMS", "third"]);
  assert.deepEqual(merged.body.messages.map((m) => m.channelType), ["imessage-bluebubbles", "twilio-sms", "imessage-bluebubbles"]);

  const single = await callMessages(smsConv._id);
  assert.deepEqual(single.body.messages.map((m) => m.body), ["second, by SMS"]);
});

test("a reply drafted for an SMS thread is pinned to SMS; an iMessage draft keeps the default", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await VtextContact.create({ phoneE164: "+12125557003", phoneStatus: "valid", source: "inbound-unknown", consent: { status: "opted-in" } });
  const base = { contactId: contact._id, conversationId: new mongoose.Types.ObjectId(), lineId: new mongoose.Types.ObjectId(), inboundMessageId: new mongoose.Types.ObjectId(), body: "Thanks!", model: "test" };

  const sms = await createDraftReply({ ...base, channelType: "twilio-sms" });
  assert.deepEqual({ mode: sms.channelPolicy.mode, channels: [...sms.channelPolicy.channels] }, { mode: "only", channels: ["twilio-sms"] });

  const imessage = await createDraftReply({ ...base, channelType: "imessage-bluebubbles" });
  assert.equal(imessage.channelPolicy.mode, "any");
  assert.deepEqual([...imessage.channelPolicy.channels], []);
});

test("the Leads-tab summary does not count a re-sent iMessage as failed, but still counts a plain failure", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const reached = await VtextContact.create({ phoneE164: "+12125557004", phoneStatus: "valid", source: "inbound-unknown", consent: { status: "opted-in" } });
  const lost = await VtextContact.create({ phoneE164: "+12125557005", phoneStatus: "valid", source: "inbound-unknown", consent: { status: "opted-in" } });
  const out = (contactId, channelType, status, extra = {}) => VtextMessage.create({ direction: "out", contactId, channelType, body: "Hi", status, ...extra });

  const sms = await out(reached._id, "twilio-sms", "delivered");
  await out(reached._id, "imessage-bluebubbles", "failed", { fallback: { status: "queued", messageId: sms._id } });
  await out(lost._id, "imessage-bluebubbles", "failed"); // no fallback was possible

  const summary = await getVtextTextSummaryForPhones(["+12125557004", "+12125557005"]);
  assert.deepEqual({ sent: summary["+12125557004"].sent, failed: summary["+12125557004"].failed }, { sent: 1, failed: 0 });
  assert.deepEqual({ sent: summary["+12125557005"].sent, failed: summary["+12125557005"].failed }, { sent: 0, failed: 1 });
});
