const test = require("node:test");
const assert = require("node:assert/strict");
const { newRunId, cleanUpdate, cleanUpdates, cleanReady, actProblem, pickCommand, gateCommand, generateCommand, clipCommand, buildCommand, cutCommand, cleanSlot } = require("./runService");

const run = (over = {}) => ({ state: "concept-choice", requestedBy: "u1", requestedByName: "Dinesh", concepts: [{ id: "C1" }], hooks: [{ id: "H1" }], plan: { errors: [] }, ...over });

test("a run id reads as the Creative OS's request id", () => {
  assert.match(newRunId(1793500000000), /^1793500000\.\d{6}$/);
});

test("keeps what the page needs and leaves the rest of a concept out", () => {
  const { runId, fields } = cleanUpdate({ runId: "1793500000.000001", state: "concept-choice", coreId: "AT1405-V01", concepts: [{ id: "C1", title: "T", structure: "deal-reveal", logline: "L", look: "L", why: "W", proposed_by: "Claude", research: ["x"] }], hooks: [{ id: "H1", visual: "V", vo: "Line", on_screen: ["a", "b"], interrupt: "x" }] });
  assert.equal(runId, "1793500000.000001");
  assert.equal("proposed_by" in fields.concepts[0], false);
  assert.deepEqual(fields.hooks[0], { id: "H1", visual: "V", vo: "Line", onScreen: ["a", "b"] });
});

test("refuses an update it cannot read", () => {
  assert.throws(() => cleanUpdate({ runId: "../x", state: "gate-a" }), /not a run id/);
  assert.throws(() => cleanUpdate({ runId: "1793500000.1", state: "live" }), /unknown state/);
  assert.deepEqual(cleanUpdates(undefined), []);
  assert.throws(() => cleanReady([{ propertyId: "../x" }]), /not a property id/);
});

test("only the person who started it, or an admin, makes its choices (D-035)", () => {
  assert.equal(actProblem(run(), { _id: "u1", role: "editor" }), null);
  assert.equal(actProblem(run(), { _id: "u9", role: "admin" }), null);
  assert.match(actProblem(run(), { _id: "u2", role: "editor" }), /Dinesh's video/);
});

test("a pick must be one on offer, at the moment it is waited for", () => {
  assert.deepEqual(pickCommand(run(), { what: "concept", id: "C1" }), { command: { type: "pick", what: "concept", choice: "C1" }, state: "hooks" });
  assert.deepEqual(pickCommand(run({ state: "hook-choice" }), { what: "hook", id: "H1" }).state, "package");
  assert.throws(() => pickCommand(run(), { what: "hook", id: "H1" }), /not waiting for a hook/);
  assert.throws(() => pickCommand(run(), { what: "concept", id: "C9" }), /no concept C9/);
  assert.throws(() => pickCommand(run(), { what: "gate", id: "C1" }), /concept or a hook/);
});

test("Gate A needs words for a change, and a plan with errors cannot be approved", () => {
  const gate = run({ state: "gate-a" });
  assert.equal(gateCommand(gate, { decision: "approve" }).state, "approved");
  assert.deepEqual(gateCommand(gate, { decision: "revise", words: " Shorter hook " }), { command: { type: "gate", decision: "revise", words: "Shorter hook" }, state: "package" });
  assert.throws(() => gateCommand(gate, { decision: "reject" }), /Say what/);
  assert.throws(() => gateCommand(run(), { decision: "approve" }), /not waiting for Gate A/);
  assert.throws(() => gateCommand(run({ state: "gate-a", plan: { errors: ["bad"] } }), { decision: "approve" }), /errors/);
});

test("generates only for an approved plan within the limit, counting what was spent (D-044)", () => {
  const ok = run({ state: "approved", spent: 6, plan: { price: { total: 9 } } });
  assert.deepEqual(generateCommand(ok), { command: { type: "generate" }, state: "generating" });
  assert.throws(() => generateCommand(run({ state: "approved", spent: 6, plan: { price: { total: 9.01 } } })), /over the \$15 limit/);
  assert.throws(() => generateCommand(run({ state: "gate-a" })), /not waiting to generate/);
});

test("a clip must exist, and a rejection says why", () => {
  const r = run({ state: "clips", clips: [{ ref: "a/b" }] });
  assert.equal(clipCommand(r, { ref: "a/b", decision: "approve" }).command.choice, "a/b");
  assert.throws(() => clipCommand(r, { ref: "a/b", decision: "reject" }), /what is wrong/);
  assert.throws(() => clipCommand(r, { ref: "x", decision: "approve" }), /no clip x/);
  assert.throws(() => clipCommand(run(), { ref: "a/b", decision: "approve" }), /not waiting for its clips/);
});

test("the build waits for the clips, and a cut needs words for a change", () => {
  assert.equal(buildCommand(run({ state: "ready-to-build" })).state, "building");
  assert.equal(buildCommand(run({ state: "clips", clips: [{ state: "approved" }] })).state, "building");
  assert.throws(() => buildCommand(run({ state: "clips", clips: [{ state: "approved" }, { state: "pending" }] })), /not ready to build/);
  assert.throws(() => buildCommand(run({ state: "clips" })), /not ready to build/);
  const cut = run({ state: "cut" });
  assert.equal(cutCommand(cut, { decision: "approve" }).state, "done");
  assert.equal(cutCommand(cut, { decision: "revise", words: "0:14 fast" }).state, "revision");
  assert.throws(() => cutCommand(cut, { decision: "reject" }), /Say what/);
});

test("a file goes only in a known slot", () => {
  assert.equal(cleanSlot("clip-rent-day-rent-counter"), "clip-rent-day-rent-counter");
  assert.equal(cleanSlot("cut"), "cut");
  assert.throws(() => cleanSlot("../x"), /not a file slot/);
});
