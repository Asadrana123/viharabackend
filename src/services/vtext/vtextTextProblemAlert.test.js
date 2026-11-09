// The per-text problem alert (vtextTextProblemAlert): one Slack message per text that did not get out, nothing for a
// text the SMS fallback is now carrying, never the same text twice. Uses a throwaway local Mongo database; skipped
// when none is running. The Slack call is replaced by a list, so nothing is posted anywhere.
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

process.env.VTEXT_ENABLE_SLACK_ALERTS = "false"; // belt and braces: the fake notify below is what gets called

const VtextMessage = require("../../model/vtext/vtextMessageModel");
const VtextContact = require("../../model/vtext/vtextContactModel");
const { reportTextProblem, whichText, whatWentWrong } = require("./vtextTextProblemAlert");

const DB_URI = "mongodb://127.0.0.1:27017/vihara_text_problem_alert_test";
let mongoUp = false;
let counter = 0;
const posts = [];
const deps = { notify: async (a) => { posts.push(a); return true; } };
const field = (alert, label) => alert.fields.find((f) => f.label === label)?.value;

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
});

test.beforeEach(async () => {
  posts.length = 0;
  process.env.VTEXT_SMS_FALLBACK_ENABLED = "true";
  delete process.env.VTEXT_SMS_FALLBACK_NO_RECEIPT_MODE;
  delete process.env.VTEXT_TEXT_ALERTS_PER_HOUR;
  if (mongoUp) await VtextMessage.deleteMany({});
});

const newContact = () => {
  counter += 1;
  return VtextContact.create({ name: "Sam Lee", phoneE164: `+1212555${1000 + counter}`, phoneStatus: "valid", source: "inbound-unknown", consent: { status: "opted-in" } });
};
const newText = (contact, fields = {}) => {
  counter += 1;
  return VtextMessage.create({
    direction: "out", contactId: contact._id, channelType: "imessage-bluebubbles", body: "Hi Sam, thanks for signing up.",
    status: "failed", error: { kind: "recipient", code: "MESSAGE_SEND_ERROR", message: "BlueBubbles could not deliver" },
    origin: { kind: "automation", templateKey: "form-intro-partner" }, idempotencyKey: `t-${counter}`, ...fields,
  });
};

test("an iMessage with no SMS on its way posts one ❌ naming the lead, the text and why no SMS went", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await newContact();
  const msg = await newText(contact);
  assert.equal(await reportTextProblem(msg, { fallback: { queued: false, reason: "no consent on file" } }, deps), "posted");
  assert.equal(posts.length, 1);
  const a = posts[0];
  assert.equal(a.icon, "❌");
  assert.equal(a.title, "Text not delivered");
  assert.equal(field(a, "Lead"), "Sam Lee");
  assert.equal(field(a, "Phone"), contact.phoneE164, "full number: the alert is internal");
  assert.equal(field(a, "Which text"), "First text: Partner Program form");
  assert.equal(field(a, "SMS fallback"), "Not sent: no consent on file");
  assert.match(field(a, "What went wrong"), /not on iMessage/);
});

test("the same text reported twice (a repeated receipt, a second trigger) posts once", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const msg = await newText(await newContact());
  const results = await Promise.all([reportTextProblem(msg, {}, deps), reportTextProblem(msg, {}, deps)]);
  assert.deepEqual(results.sort(), ["posted", "skipped"]);
  assert.equal(await reportTextProblem(msg, {}, deps), "skipped");
  assert.equal(posts.length, 1);
});

test("nothing is posted while the SMS fallback is carrying the text", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await newContact();
  assert.equal(await reportTextProblem(await newText(contact), { fallback: { queued: true } }, deps), "skipped");
  assert.equal(await reportTextProblem(await newText(contact, { fallback: { status: "queued" } }), {}, deps), "skipped");
  assert.equal(posts.length, 0);
});

test("the SMS copy failing too posts ❌ with both reasons", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await newContact();
  const original = await newText(contact, { error: { kind: "recipient", code: "22" }, fallback: { status: "queued" } });
  const sms = await newText(contact, { channelType: "twilio-sms", fallbackOf: original._id, error: { kind: "recipient", code: "30006" } });
  assert.equal(await reportTextProblem(sms, {}, deps), "posted");
  assert.equal(posts[0].title, "Text not delivered by iMessage or SMS");
  assert.equal(field(posts[0], "Which text"), "First text: Partner Program form (the SMS copy)");
  assert.match(field(posts[0], "What went wrong"), /landline/);
  assert.match(field(posts[0], "What went wrong"), /Before that, iMessage: Not delivered on iMessage/);
});

test("no receipt in verify mode asks a person to check (✋); with the fallback off it says so", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await newContact();
  const noReceipt = { status: "unknown", error: { kind: "transient", code: "no-receipt" } };
  await reportTextProblem(await newText(contact, noReceipt), {}, deps);
  assert.equal(posts[0].icon, "✋");
  assert.match(field(posts[0], "What to do"), /Send by SMS/);

  process.env.VTEXT_SMS_FALLBACK_ENABLED = "false";
  await reportTextProblem(await newText(contact, noReceipt), {}, deps);
  assert.equal(posts[1].icon, "❌");
  assert.equal(field(posts[1], "SMS fallback"), "Not sent: the SMS fallback is switched off");
});

test("auto mode with the SMS skipped says why (a known iPhone, say)", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  process.env.VTEXT_SMS_FALLBACK_NO_RECEIPT_MODE = "auto";
  const msg = await newText(await newContact(), { status: "unknown", error: { kind: "transient", code: "no-receipt" } });
  await reportTextProblem(msg, { fallback: { queued: false, reason: "this number is known to be an iPhone, so the iMessage probably arrived" } }, deps);
  assert.equal(posts[0].icon, "❌");
  assert.match(field(posts[0], "SMS fallback"), /known to be an iPhone/);
});

test("uncertain Twilio send is ⚠️, a lost send job is 🔴, an opt-out posts nothing here, a delivered text posts nothing", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const contact = await newContact();
  await reportTextProblem(await newText(contact, { channelType: "twilio-sms", error: { kind: "recipient", code: "UNCERTAIN" } }), {}, deps);
  await reportTextProblem(await newText(contact, { status: "unknown", error: { kind: "transient", code: "stuck-assigned", message: "lost" } }), {}, deps);
  assert.equal(await reportTextProblem(await newText(contact, { channelType: "twilio-sms", error: { kind: "recipient", code: "OPTED_OUT" } }), {}, deps), "skipped");
  assert.equal(await reportTextProblem(await newText(contact, { status: "delivered", error: undefined }), {}, deps), "skipped");
  assert.deepEqual(posts.map((p) => p.icon), ["⚠️", "🔴"]);
});

test("past the hourly cap the rest are held back and one 'many texts failing' alert is sent", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  process.env.VTEXT_TEXT_ALERTS_PER_HOUR = "2";
  const contact = await newContact();
  const results = [];
  for (let i = 0; i < 4; i += 1) results.push(await reportTextProblem(await newText(contact), {}, deps));
  assert.deepEqual(results, ["posted", "posted", "suppressed", "suppressed"]);
  assert.deepEqual(posts.map((p) => p.title), ["Text not delivered", "Text not delivered", "Many texts are failing"]);
});

test("which text: labels for each kind of text", () => {
  const w = (origin, extra = {}) => whichText({ origin, ...extra });
  assert.equal(w({ kind: "automation", templateKey: "toorak-nov15-update" }), "Toorak sale update (Nov 15)");
  assert.equal(w({ kind: "automation", templateKey: "calcom-reminder-60" }), "Cal.com call reminder (60 min before)");
  assert.equal(w({ kind: "automation", templateKey: "followup-2" }), "Follow-up text #2");
  assert.equal(w({ kind: "manual", sentBy: { adminName: "Adi" } }), "Sent by hand by Adi");
  assert.equal(w({ kind: "system", templateKey: "stop-confirm" }), "STOP confirmation");
  assert.equal(w({ kind: "bulk" }), "Bulk send");
  assert.match(whatWentWrong({ error: { code: "30007" } }), /spam/);
  assert.equal(whatWentWrong({ error: { message: "something odd" } }), "something odd");
});
