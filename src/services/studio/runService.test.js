const test = require("node:test");
const assert = require("node:assert/strict");
const { newRunId, cleanUpdate, cleanUpdates, cleanReady, actProblem, pickCommand, gateCommand } = require("./runService");

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
