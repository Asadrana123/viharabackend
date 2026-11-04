const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanProposal, cleanProposals, decideProblem, canSee, cleanDecision, undeliveredDecisions } = require("./proposalService");

const raw = (over = {}) => ({ id: "P-0003", kind: "editor_preference", title: "Longer pans", proposal: "Hold pans for 3 s.", lands_in: "config/video-recipes.json", limits: "One week.", for_editor: "Dinesh", status: "proposed", evidence: ["private"], ...over });
const dinesh = { role: "editor", name: "Dinesh" };
const preetham = { role: "editor", name: "Preetham" };
const admin = { role: "admin", name: "asad" };

test("keeps a proposal's words and leaves out what the page does not need", () => {
  const p = cleanProposal(raw());
  assert.equal(p.proposalId, "P-0003");
  assert.equal(p.forEditor, "Dinesh");
  assert.equal("evidence" in p, false);
  assert.equal(cleanProposal(raw({ for_editor: undefined })).forEditor, null);
});

test("refuses a proposal it cannot read", () => {
  assert.throws(() => cleanProposal(raw({ id: "../x" })), /not a proposal id/);
  assert.throws(() => cleanProposal(raw({ status: "live" })), /unknown status/);
  assert.throws(() => cleanProposal(raw({ title: "  " })), /title/);
  assert.deepEqual(cleanProposals(undefined), []);
  assert.throws(() => cleanProposals("x"), /as a list/);
});

test("only the named editor decides their own proposal, in any letter case (D-043)", () => {
  const p = { status: "proposed", forEditor: "Dinesh" };
  assert.equal(decideProblem(p, dinesh), null);
  assert.equal(decideProblem(p, { role: "editor", name: " dinesh " }), null);
  assert.match(decideProblem(p, preetham), /only they decide/);
  assert.match(decideProblem(p, admin), /only they decide/);
});

test("only an admin decides what stays the same for everyone", () => {
  const p = { status: "proposed", forEditor: null };
  assert.equal(decideProblem(p, admin), null);
  assert.match(decideProblem(p, dinesh), /admin decides/);
});

test("a decided proposal is not decided again", () => {
  assert.match(decideProblem({ status: "accepted", forEditor: "Dinesh" }, dinesh), /already accepted/);
});

test("an editor sees their own, an admin sees all", () => {
  const own = { forEditor: "Dinesh" };
  const house = { forEditor: null };
  assert.equal(canSee(own, dinesh), true);
  assert.equal(canSee(own, preetham), false);
  assert.equal(canSee(house, dinesh), false);
  assert.equal(canSee(house, admin), true);
  assert.equal(canSee(own, admin), true);
});

test("a decision needs the person's words, kept as typed", () => {
  assert.deepEqual(cleanDecision({ decision: "accept", words: "  Haan, 3 s theek hai  " }), { decision: "accept", words: "Haan, 3 s theek hai" });
  assert.throws(() => cleanDecision({ decision: "approve", words: "x" }), /Accept or decline/);
  assert.throws(() => cleanDecision({ decision: "decline", words: "   " }), /own words/);
});

test("hands over only decisions not yet recorded, oldest first", () => {
  const row = (id, status, at, deliveredAt = null) => ({ proposalId: id, status, decision: { byName: "Dinesh", words: "ok", at: new Date(at), deliveredAt } });
  const rows = undeliveredDecisions([row("P-0002", "declined", "2026-10-31"), row("P-0001", "accepted", "2026-10-30"), row("P-0003", "accepted", "2026-10-29", new Date()), { proposalId: "P-0004", status: "proposed", decision: {} }]);
  assert.deepEqual(rows.map((r) => [r.id, r.decision]), [["P-0001", "accept"], ["P-0002", "decline"]]);
});
