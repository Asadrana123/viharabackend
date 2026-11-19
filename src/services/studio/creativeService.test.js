const test = require("node:test");
const assert = require("node:assert/strict");
const s = require("./creativeService");

// Statics made in the Studio: an editor's click as a step for the Creative OS, and the server's updates.
const angle = (id, over = {}) => ({ id, lane: "designed", hook: "A hook", usd: 0.0035, picked: false, ...over });
const creative = (over = {}) => ({ creativeId: "CR-FIX-S01", name: "CR-FIX-S01", state: "ready", review: "pending", ...over });
const req = (over = {}) => ({ state: "angles", requestedBy: "u1", requestedByName: "Preetham", angles: [angle("A1"), angle("A2", { lane: "native", usd: 0 })], creatives: [], spent: 0, limit: 2, commands: [], ...over });

test("a start names the property, the format and one buyer; carousels wait for now", () => {
  assert.deepEqual(s.cleanCreativeStart({ propertyId: "449-georgia-st", format: "static", buyer: { icpId: "fix_and_flip" }, idea: "  Rent day  " }), { propertyId: "449-georgia-st", format: "static", buyer: { icpId: "fix_and_flip", stage: "solution_aware", label: "Fix and Flippers/Uppers" }, idea: "Rent day" });
  assert.throws(() => s.cleanCreativeStart({ propertyId: "../x", format: "static", buyer: { icpId: "fix_and_flip" } }), /Choose a property/);
  assert.throws(() => s.cleanCreativeStart({ propertyId: "a-b", format: "video", buyer: { icpId: "fix_and_flip" } }), /Static or Carousel/);
  assert.throws(() => s.cleanCreativeStart({ propertyId: "a-b", format: "carousel", buyer: { icpId: "fix_and_flip" } }), /Carousels are not ready/);
  assert.throws(() => s.cleanCreativeStart({ propertyId: "a-b", format: "static", buyer: { icpId: "astronaut" } }), /these creatives are for/);
});

test("only the person who started it, or an admin, makes its choices", () => {
  assert.equal(s.actProblem(req(), { _id: "u1", role: "editor" }), null);
  assert.equal(s.actProblem(req(), { _id: "u9", role: "admin" }), null);
  assert.match(s.actProblem(req(), { _id: "u2", role: "editor" }), /Preetham's creative/);
});

test("Make takes only angles on offer and not made yet, within the limit, and moves the page to making", () => {
  assert.deepEqual(s.makeCommand(req(), { angles: ["A1", "A2", "A1"] }), { command: { type: "make", data: { angles: ["A1", "A2"] } }, state: "making" });
  assert.throws(() => s.makeCommand(req(), { angles: [] }), /Tick at least one/);
  assert.throws(() => s.makeCommand(req(), { angles: ["A9"] }), /no angle A9/);
  assert.throws(() => s.makeCommand(req({ angles: [angle("A1", { picked: true })] }), { angles: ["A1"] }), /already made/);
  assert.throws(() => s.makeCommand(req({ spent: 1.999 }), { angles: ["A1"] }), /over its limit of \$2/);
  assert.throws(() => s.makeCommand(req({ state: "making" }), { angles: ["A2"] }), /being made/);
  assert.throws(() => s.makeCommand(req({ commands: [{ type: "make", doneAt: null }] }), { angles: ["A2"] }), /being made/);
  assert.throws(() => s.makeCommand(req({ state: "waiting" }), { angles: ["A1"] }), /nothing to make/);
});

test("an own hook is one short line for an angle not made yet", () => {
  assert.deepEqual(s.hookCommand(req(), { angle: "A1", words: "  Flip it   before the neighbours notice " }).command, { type: "hook", data: { angle: "A1", words: "Flip it before the neighbours notice" } });
  assert.throws(() => s.hookCommand(req(), { angle: "A1", words: "x" }), /Write the hook/);
  assert.throws(() => s.hookCommand(req(), { angle: "A1", words: "x".repeat(161) }), /160 characters/);
  assert.throws(() => s.hookCommand(req({ angles: [angle("A1", { picked: true })] }), { angle: "A1", words: "Fine words" }), /already made/);
});

test("a decision is the editor's, on a creative in review; a reject says why; unknown tags are dropped", () => {
  const r = req({ state: "review", creatives: [creative()] });
  assert.deepEqual(s.decideCommand(r, { creative: "CR-FIX-S01", decision: "reject", words: "Too busy", tags: ["look", "zzz"] }).command, { type: "decide", data: { creative: "CR-FIX-S01", decision: "reject", words: "Too busy", tags: ["look"] } });
  assert.throws(() => s.decideCommand(r, { creative: "CR-FIX-S01", decision: "reject" }), /Say why/);
  assert.throws(() => s.decideCommand(r, { creative: "CR-FIX-S01", decision: "maybe" }), /Approve or Reject/);
  assert.throws(() => s.decideCommand(req({ state: "review", creatives: [creative({ review: "approved" })] }), { creative: "CR-FIX-S01", decision: "approve" }), /already been decided/);
  assert.throws(() => s.decideCommand(req({ state: "review", creatives: [creative({ state: "failed" })] }), { creative: "CR-FIX-S01", decision: "approve" }), /Fix it first/);
  assert.throws(() => s.decideCommand(r, { creative: "CR-NOPE", decision: "approve" }), /not one of these creatives/);
});

test("a revision needs the editor's words, except Fix it on a creative that failed its checks", () => {
  const r = req({ state: "review", creatives: [creative(), creative({ creativeId: "CR-FIX-S02", name: "CR-FIX-S02", state: "failed" })] });
  assert.deepEqual(s.reviseCommand(r, { creative: "CR-FIX-S01", words: "Smaller headline", tags: ["headline"] }).command, { type: "revise", data: { creative: "CR-FIX-S01", words: "Smaller headline", tags: ["headline"] } });
  assert.throws(() => s.reviseCommand(r, { creative: "CR-FIX-S01" }), /Say what to change/);
  assert.equal(s.reviseCommand(r, { creative: "CR-FIX-S02" }).command.data.words, "");
  assert.throws(() => s.reviseCommand(req({ state: "review", creatives: [creative({ review: "rejected" })] }), { creative: "CR-FIX-S01", words: "x" }), /final/);
  assert.throws(() => s.reviseCommand({ ...r, commands: [{ type: "revise", doneAt: null, data: { creative: "CR-FIX-S01" } }] }, { creative: "CR-FIX-S01", words: "x" }), /already being changed/);
  assert.throws(() => s.reviseCommand({ ...r, spent: 2 }, { creative: "CR-FIX-S01", words: "x" }), /spending limit/);
});

test("photos and a new price are checked against what the page showed", () => {
  const r = req({ state: "waiting", unchecked: [{ id: "img-13" }], priceChange: [{ factId: "starting-bid-2", to: "$795,000" }] });
  assert.deepEqual(s.photosCommand(r, { photos: [{ id: "img-13", choice: "enhanced", alterations: "sky" }] }).command.data, { photos: [{ id: "img-13", choice: "enhanced", alterations: "sky" }] });
  assert.throws(() => s.photosCommand(r, { photos: [{ id: "img-01", choice: "original" }] }), /not waiting/);
  assert.throws(() => s.photosCommand(r, { photos: [{ id: "img-13", choice: "enhanced" }] }), /what was changed/);
  assert.deepEqual(s.priceCommand(r, { expected: [{ factId: "starting-bid-2", to: "$795,000" }] }).command.data, { changes: [{ fact_id: "starting-bid-2", to: "$795,000" }] });
  assert.throws(() => s.priceCommand(r, { expected: [{ factId: "starting-bid-2", to: "$800,000" }] }), /out of date/);
  assert.throws(() => s.retryCommand(r), /Only a stopped creative/);
  assert.deepEqual(s.retryCommand(req({ state: "failed" })).command, { type: "retry" });
});

test("an update is kept to what the page needs, and refused when it cannot be read", () => {
  const { creativeId, fields } = s.cleanCreativeUpdate({
    creativeId: "1795000000.000001",
    state: "review",
    angles: [{ id: "A1", lane: "designed", hook: "H", photoSlot: "photo-img-01", usd: "0.0035", picked: true, creativeId: "CR-FIX-S01", secret: "x" }],
    creatives: [{ creativeId: "CR-FIX-S01", name: "CR-FIX-S01", state: "ready", review: "pending", slides: [{ number: 1, slot: "slide-cr-fix-s01-01" }, { number: 2, slot: "../../x" }], hook: { text: "H", live: false, note: "n" } }],
    spent: 0.0035,
    limit: 2,
    notice: "A refused step",
  });
  assert.equal(creativeId, "1795000000.000001");
  assert.equal("secret" in fields.angles[0], false);
  assert.equal(fields.angles[0].usd, 0.0035);
  assert.deepEqual(fields.creatives[0].slides, [{ number: 1, slot: "slide-cr-fix-s01-01" }, { number: 2, slot: null }]);
  assert.equal(fields.notice, "A refused step");
  assert.throws(() => s.cleanCreativeUpdate({ creativeId: "../x", state: "review" }), /not a creative id/);
  assert.throws(() => s.cleanCreativeUpdate({ creativeId: "1795000000.1", state: "live" }), /unknown state/);
  assert.deepEqual(s.cleanCreativeUpdates(undefined), []);
  assert.equal(s.cleanCreativeSlot("slide-cr-fix-s01-01"), "slide-cr-fix-s01-01");
  assert.throws(() => s.cleanCreativeSlot("cut"), /not a file slot/);
});
