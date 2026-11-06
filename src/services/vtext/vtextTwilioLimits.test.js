// Capacity for the Twilio SMS line: conservative placeholder limits, per-line overrides, no warm-up ramp, no
// reply-ratio throttle, a real daily cap with a reply reserve, and no activation until the limits are set by hand.
// Throwaway local Mongo database; skipped when no local Mongo is running.
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

process.env.VTEXT_SECRETS_KEY = "00".repeat(32); // throwaway key, test process only

const VtextLine = require("../../model/vtext/vtextLineModel");
const { ROUTABLE_STATUSES } = VtextLine;
const { encryptCredentials } = require("../../utils/secretBox");
const capacity = require("./vtextCapacityService");
const { startWarmup } = require("../../controller/vtext/vtextLineController");
const { getRedisClient, getSubscriberClient } = require("./queue/connection");

const DB_URI = "mongodb://127.0.0.1:27017/vihara_twilio_limits_test";

let mongoUp = false;
let counter = 0;

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

/** A plain (unsaved) line object is enough for the pure capacity maths. */
const plain = (channelType, fields = {}) => ({ _id: new mongoose.Types.ObjectId(), channelType, warmup: { enabled: true }, ...fields });

const saved = (channelType, fields = {}) => {
  counter += 1;
  return VtextLine.create({
    name: `${channelType} ${counter}`, channelType, address: channelType === "twilio-sms" ? `+1555000${1000 + counter}` : `vtext${counter}@example.test`,
    webhookKey: `key${counter}`, status: "provisioning",
    config: channelType === "twilio-sms" ? { messagingServiceSid: `MG${"a".repeat(32)}` } : { serverUrl: "http://127.0.0.1:1" },
    credentials: encryptCredentials({ password: "x" }),
    ...fields,
  });
};

test("a Twilio line gets low placeholder limits, and a per-line value beats the default (an empty field does not)", () => {
  const defaults = capacity.limitsFor(plain("twilio-sms"));
  assert.equal(defaults.perMinute, 10);
  assert.equal(defaults.perDay, 200);
  assert.equal(defaults.newRecipientsPerHour, 60);
  assert.equal(defaults.replyReservePct, 10);

  const tuned = capacity.limitsFor(plain("twilio-sms", { limits: { perDay: 40, perMinute: 3, newRecipientsPerHour: null } }));
  assert.equal(tuned.perDay, 40);
  assert.equal(tuned.perMinute, 3);
  assert.equal(tuned.newRecipientsPerHour, 60, "a null field falls back to the default");
});

test("no warm-up ramp: the daily cap is the limit from day one, even when warm-up is 'started'", () => {
  assert.equal(capacity.effectiveDailyCap(plain("twilio-sms")), 200);
  assert.equal(capacity.effectiveDailyCap(plain("twilio-sms", { warmup: { enabled: true, startedAt: new Date() } })), 200);
  assert.equal(capacity.effectiveDailyCap(plain("twilio-sms", { limits: { perDay: 50 }, warmup: { enabled: true, startedAt: new Date() } })), 50);
  // the iMessage line still ramps: day 1 of its warm-up is far below its full limit
  assert.ok(capacity.effectiveDailyCap(plain("imessage-bluebubbles", { warmup: { enabled: true, startedAt: new Date() } })) < capacity.limitsFor(plain("imessage-bluebubbles")).perDay);
});

test("the low-reply-ratio throttle halves an iMessage line but not a Twilio line", () => {
  const health = { sentLast7d: 500, replyRatio7d: 0.01 }; // lots sent, almost no replies
  assert.equal(capacity.effectiveDailyCap(plain("twilio-sms", { health })), 200, "fallback texts reply less; carriers police quality");
  const iMessage = plain("imessage-bluebubbles", { health, warmup: { enabled: false } });
  assert.equal(capacity.effectiveDailyCap(iMessage), Math.floor(capacity.limitsFor(iMessage).perDay * 0.5));
});

test("the daily cap is enforced for real: cold texts stop at 90%, the rest is kept for replies", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const line = await saved("twilio-sms", { limits: { perDay: 10, perMinute: 10, newRecipientsPerHour: 60 }, status: "warming" });

  let cold = 0;
  for (let i = 0; i < 12; i += 1) {
    if ((await capacity.reserve(line, { isReply: false, isNewRecipient: false })).ok) cold += 1;
  }
  assert.equal(cold, 9, "floor(10 x 0.9) cold texts");

  assert.equal((await capacity.reserve(line, { isReply: true })).ok, true, "a reply can use the reserve");
  assert.equal((await capacity.reserve(line, { isReply: true })).ok, false, "and then the day is full");
  assert.equal(await capacity.remainingForSend(line, { isReply: true }), 0);
});

test("activation needs the limits set by hand: it names what is missing, and works once they are", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const call = (id) =>
    new Promise((resolve, reject) => {
      const out = {};
      const res = { status(code) { out.code = code; return this; }, json(body) { out.body = body; resolve(out); return this; } };
      startWarmup({ params: { id: String(id) }, user: { _id: new mongoose.Types.ObjectId(), name: "Adarsh" } }, res, reject);
    });

  const line = await saved("twilio-sms");
  const none = await call(line._id);
  assert.equal(none.code, 400);
  assert.deepEqual(none.body.missing, ["perMinute", "perDay", "newRecipientsPerHour"]);
  assert.equal((await VtextLine.findById(line._id)).status, "provisioning", "still not routable");

  await VtextLine.updateOne({ _id: line._id }, { $set: { "limits.perDay": 100, "limits.perMinute": 5 } });
  const partial = await call(line._id);
  assert.equal(partial.code, 400);
  assert.deepEqual(partial.body.missing, ["newRecipientsPerHour"]);

  await VtextLine.updateOne({ _id: line._id }, { $set: { "limits.newRecipientsPerHour": 30 } });
  const ok = await call(line._id);
  assert.equal(ok.code, 200);
  const active = await VtextLine.findById(line._id);
  assert.equal(active.status, "warming");
  assert.ok(ROUTABLE_STATUSES.includes(active.status));

  // an iMessage line is not asked for limits: it has its own defaults and warm-up schedule
  const imessage = await saved("imessage-bluebubbles");
  assert.equal((await call(imessage._id)).code, 200);
});
