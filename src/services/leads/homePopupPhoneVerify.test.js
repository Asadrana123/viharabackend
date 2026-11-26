// Home pop-up phone check: the Twilio Verify helper and the send / verify endpoints. No network, no DB.
const test = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");
const { sendVerification, checkVerification, setVerifyClientForTests } = require("./twilioVerify");
const HomePopupLead = require("../../model/leads/homePopupLeadModel");
const { sendHomePopupCode, verifyHomePopupCode } = require("../../controller/leads/homePopupLeadController");

process.env.TWILIO_VERIFY_SERVICE_SID = "VA" + "0".repeat(32);
delete process.env.SLACK_LEADS_WEBHOOK_URL;

const twilioError = (code) => Object.assign(new Error(`twilio ${code}`), { code });
const fake = (calls, { send, check } = {}) => () => ({
  createVerification: async (p) => {
    calls.push(["send", p]);
    if (send) throw send;
    return { status: "pending" };
  },
  createCheck: async (p) => {
    calls.push(["check", p]);
    if (check instanceof Error) throw check;
    return { status: check || "approved" };
  },
});

test.afterEach(() => setVerifyClientForTests(null));

test("sends an SMS code to the number", async () => {
  const calls = [];
  setVerifyClientForTests(fake(calls));
  assert.deepStrictEqual(await sendVerification("+919876543210"), { ok: true });
  assert.deepStrictEqual(calls, [["send", { to: "+919876543210", channel: "sms" }]]);
});

test("Twilio errors become reasons", async () => {
  for (const [code, reason] of [[60200, "invalid"], [60203, "limit"], [60410, "blocked"], [60605, "country"], [99999, "error"]]) {
    setVerifyClientForTests(fake([], { send: twilioError(code) }));
    assert.deepStrictEqual(await sendVerification("+13105550122"), { ok: false, reason }, `code ${code}`);
  }
});

test("check: approved is ok, pending is a wrong code, 20404 is expired, junk never reaches Twilio", async () => {
  const calls = [];
  setVerifyClientForTests(fake(calls));
  assert.deepStrictEqual(await checkVerification("+13105550122", " 123 456 "), { ok: true });
  assert.deepStrictEqual(calls[0], ["check", { to: "+13105550122", code: "123456" }]);

  setVerifyClientForTests(fake([], { check: "pending" }));
  assert.deepStrictEqual(await checkVerification("+13105550122", "000000"), { ok: false, reason: "mismatch" });

  setVerifyClientForTests(fake([], { check: twilioError(20404) }));
  assert.deepStrictEqual(await checkVerification("+13105550122", "000000"), { ok: false, reason: "expired" });

  const none = [];
  setVerifyClientForTests(fake(none));
  assert.deepStrictEqual(await checkVerification("+13105550122", "abc"), { ok: false, reason: "mismatch" });
  assert.equal(none.length, 0);
});

test("no service SID: not configured, nothing sent", async () => {
  const saved = process.env.TWILIO_VERIFY_SERVICE_SID;
  process.env.TWILIO_VERIFY_SERVICE_SID = "";
  const calls = [];
  setVerifyClientForTests(fake(calls));
  assert.deepStrictEqual(await sendVerification("+13105550122"), { ok: false, reason: "not_configured" });
  assert.equal(calls.length, 0);
  process.env.TWILIO_VERIFY_SERVICE_SID = saved;
});

// ── endpoints, with the model stubbed ──
const id = new mongoose.Types.ObjectId().toString();
function stubLead(lead) {
  const updates = [];
  const orig = { findById: HomePopupLead.findById, updateOne: HomePopupLead.updateOne };
  HomePopupLead.findById = () => ({ select: () => ({ lean: async () => lead }) });
  HomePopupLead.updateOne = async (q, u) => updates.push(u.$set);
  return { updates, restore: () => Object.assign(HomePopupLead, orig) };
}
function call(handler, body) {
  return new Promise((resolve) => {
    const res = { json: (b) => resolve({ status: 200, body: b }) };
    handler({ params: { id }, body }, res, (err) => resolve({ status: err.statuscode, body: { message: err.message } }));
  });
}
const baseLead = (o = {}) => ({ _id: id, fullName: "Ana Lopez", phoneNormalized: "+13105550122", accessKey: "k".repeat(48), phoneCodeSends: [], ...o });

test("send: wrong key is a 404 and texts nothing", async () => {
  const calls = [];
  setVerifyClientForTests(fake(calls));
  const s = stubLead(baseLead());
  const r = await call(sendHomePopupCode, { key: "nope" });
  s.restore();
  assert.equal(r.status, 404);
  assert.equal(calls.length, 0);
});

test("send: texts the saved number and counts the send", async () => {
  const calls = [];
  setVerifyClientForTests(fake(calls));
  const s = stubLead(baseLead());
  const r = await call(sendHomePopupCode, { key: "k".repeat(48) });
  s.restore();
  assert.equal(r.status, 200);
  assert.equal(calls[0][1].to, "+13105550122");
  assert.equal(s.updates[0].phoneCodeSends.length, 1);
});

test("send: change number saves it unverified and texts the new one", async () => {
  const calls = [];
  setVerifyClientForTests(fake(calls));
  const s = stubLead(baseLead({ phoneVerifiedAt: new Date() }));
  const r = await call(sendHomePopupCode, { key: "k".repeat(48), phone: "+91 98765 43210" });
  s.restore();
  assert.equal(r.status, 200);
  assert.equal(calls[0][1].to, "+919876543210");
  assert.equal(s.updates[0].phoneNormalized, "+919876543210");
  assert.equal(s.updates[0].phoneVerifiedAt, null);
});

test("send: stops at 5 codes a day", async () => {
  const calls = [];
  setVerifyClientForTests(fake(calls));
  const s = stubLead(baseLead({ phoneCodeSends: Array.from({ length: 5 }, () => new Date()) }));
  const r = await call(sendHomePopupCode, { key: "k".repeat(48) });
  s.restore();
  assert.equal(r.status, 429);
  assert.equal(calls.length, 0);
});

test("verify: right code marks the lead verified", async () => {
  setVerifyClientForTests(fake([]));
  const s = stubLead(baseLead());
  const r = await call(verifyHomePopupCode, { key: "k".repeat(48), code: "123456" });
  s.restore();
  assert.deepStrictEqual(r.body, { success: true, phoneVerified: true });
  assert.equal(s.updates[0].phoneVerifyMethod, "code");
  assert.ok(s.updates[0].phoneVerifiedAt instanceof Date);
});

test("verify: wrong code is a 400 and changes nothing", async () => {
  setVerifyClientForTests(fake([], { check: "pending" }));
  const s = stubLead(baseLead());
  const r = await call(verifyHomePopupCode, { key: "k".repeat(48), code: "000000" });
  s.restore();
  assert.equal(r.status, 400);
  assert.match(r.body.message, /doesn't match/);
  assert.equal(s.updates.length, 0);
});
