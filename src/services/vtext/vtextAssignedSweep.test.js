// The stuck-message sweep for "assigned" messages (maintenanceWorker.recoverAssignedMessages): a message routed to
// a line whose send job went missing gets a fresh send job, or is marked "unknown" when it is too old.
// Uses a throwaway local Mongo database and fake queues; skipped when no local Mongo is running.
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const VtextMessage = require("../../model/vtext/vtextMessageModel");
const { recoverAssignedMessages } = require("./workers/maintenanceWorker");
const { dayKey } = require("./vtextCapacityService");
const { getRedisClient, getSubscriberClient } = require("./queue/connection");

const DB_URI = "mongodb://127.0.0.1:27017/vihara_assigned_sweep_test";
const HOUR = 3_600_000;
const NOW = Date.now();
const LINE_ID = new mongoose.Types.ObjectId();

let mongoUp = false;
test.before(async () => {
  try {
    await mongoose.connect(DB_URI, { serverSelectionTimeoutMS: 2000 });
    // let the models finish building their indexes now, or they would re-create the database after the drop below
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
    mongoUp = true;
  } catch {
    mongoUp = false;
  }
});
test.after(async () => {
  if (mongoUp) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  // loading the worker module opens the Redis clients; this test never uses them, and they would keep the process alive
  getRedisClient().disconnect();
  getSubscriberClient().disconnect();
});

const make = (over = {}) =>
  VtextMessage.create({
    direction: "out", contactId: new mongoose.Types.ObjectId(), body: "Hi", status: "assigned",
    lineId: LINE_ID, assignedAt: new Date(NOW - HOUR), ...over,
  });

// fake queues + line lookup + capacity release, recording what the sweep did
function fakes({ lineStatus = "warming", live = [] } = {}) {
  const calls = { send: [], route: [], release: [] };
  return {
    calls,
    deps: {
      now: () => NOW,
      findLine: async () => (lineStatus ? { _id: LINE_ID, status: lineStatus } : null),
      getLineQueue: () => ({
        getJobs: async () => live.map((id) => ({ data: { messageId: String(id) } })),
        add: async (name, data, opts) => { calls.send.push({ name, data, opts }); },
      }),
      getRouteQueue: () => ({ add: async (name, data, opts) => { calls.route.push({ name, data, opts }); } }),
      release: async (line, day, o) => { calls.release.push({ day, o }); },
    },
  };
}

test("a routable line with no send job for the message gets a fresh send job", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const m = await make();
  const { calls, deps } = fakes();
  const out = await recoverAssignedMessages([m], deps);
  assert.deepEqual(out, { resent: 1, expired: 0, waiting: 0, rerouted: 0 });
  assert.equal(calls.send.length, 1);
  assert.equal(calls.send[0].name, "send");
  assert.equal(calls.send[0].data.messageId, String(m._id));
  assert.equal(calls.send[0].data.reservationDay, dayKey(m.assignedAt));
  assert.match(calls.send[0].opts.jobId, new RegExp(`^send-${m._id}-sweep-`)); // a new id, not the original send-<id>
  assert.equal((await VtextMessage.findById(m._id)).status, "assigned"); // the send worker moves it on
});

test("a message whose send job is still waiting, delayed or active is left alone", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const m = await make();
  const { calls, deps } = fakes({ live: [m._id] });
  const out = await recoverAssignedMessages([m], deps);
  assert.deepEqual(out, { resent: 0, expired: 0, waiting: 1, rerouted: 0 });
  assert.equal(calls.send.length, 0);
});

test("a message that has waited too long is marked unknown, not sent on its own, and its capacity is released", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const m = await make({ assignedAt: new Date(NOW - 13 * HOUR) });
  const { calls, deps } = fakes();
  const out = await recoverAssignedMessages([m], deps);
  assert.deepEqual(out, { resent: 0, expired: 1, waiting: 0, rerouted: 0 });
  assert.equal(calls.send.length, 0);
  assert.equal(calls.release.length, 1);
  const after = await VtextMessage.findById(m._id).lean();
  assert.equal(after.status, "unknown");
  assert.equal(after.error.code, "stuck-assigned");
  assert.ok(after.failedAt);
});

test("a line that is not routable (offline, paused...) keeps its messages waiting", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const m = await make({ assignedAt: new Date(NOW - 30 * HOUR) });
  const { calls, deps } = fakes({ lineStatus: "offline" });
  const out = await recoverAssignedMessages([m], deps);
  assert.deepEqual(out, { resent: 0, expired: 0, waiting: 1, rerouted: 0 });
  assert.equal(calls.send.length, 0);
  assert.equal((await VtextMessage.findById(m._id)).status, "assigned");
});

test("an assigned message with no line recorded goes back to queued with a route job", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const m = await make({ lineId: undefined });
  const { calls, deps } = fakes();
  const out = await recoverAssignedMessages([m], deps);
  assert.deepEqual(out, { resent: 0, expired: 0, waiting: 0, rerouted: 1 });
  assert.equal(calls.route.length, 1);
  assert.equal((await VtextMessage.findById(m._id)).status, "queued");
});

test("a message that moved on between the sweep's read and its write is not touched", async (t) => {
  if (!mongoUp) return t.skip("no local Mongo");
  const m = await make({ assignedAt: new Date(NOW - 13 * HOUR) });
  await VtextMessage.updateOne({ _id: m._id }, { $set: { status: "accepted" } }); // sent just now
  const { calls, deps } = fakes();
  const out = await recoverAssignedMessages([m], deps);
  assert.equal(out.expired, 0);
  assert.equal(calls.release.length, 0);
  assert.equal((await VtextMessage.findById(m._id)).status, "accepted");
});
