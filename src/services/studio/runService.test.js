const test = require("node:test");
const assert = require("node:assert/strict");
const { newRunId, cleanUpdate, cleanUpdates, cleanReady, actProblem, pickCommand, gateCommand, generateCommand, framesCommand, remakeCommand, clipCommand, buildCommand, cutCommand, soundCommand, reopenCommand, layersCommand, chatMessage, cleanChats, cleanSlot } = require("./runService");

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

test("a build refused for parts not made yet goes back to generate", () => {
  const u = (error) => cleanUpdate({ runId: "1793500000.000001", state: "ready-to-build", error }).fields.state;
  assert.equal(u("Generated assets are missing. Run npm run video -- generate"), "approved");
  assert.equal(u("The build failed: render"), "ready-to-build");
  assert.equal(u(null), "ready-to-build");
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
  assert.throws(() => gateCommand(run(), { decision: "approve" }), /not waiting for its plan to be approved/);
  assert.throws(() => gateCommand(run({ state: "gate-a", plan: { errors: ["bad"] } }), { decision: "approve" }), /errors/);
});

test("generates only for an approved plan within the limit, counting what was spent (D-044)", () => {
  const ok = run({ state: "approved", spent: 6, plan: { price: { total: 9 } } });
  assert.deepEqual(generateCommand(ok), { command: { type: "generate" }, state: "generating" });
  assert.throws(() => generateCommand(run({ state: "approved", spent: 6, plan: { price: { total: 9.01 } } })), /over the \$15 limit/);
  assert.throws(() => generateCommand(run({ state: "gate-a" })), /not waiting to generate/);
});

test("a clip must exist, and a rejection says why", () => {
  const r = run({ state: "clips", clips: [{ ref: "a/b", state: "pending" }] });
  assert.equal(clipCommand(r, { ref: "a/b", decision: "approve" }).command.choice, "a/b");
  assert.equal(clipCommand(r, { ref: "a/b", decision: "approve" }).clips[0].state, "approved");
  assert.throws(() => clipCommand(run({ state: "clips", clips: [{ ref: "a/b", state: "approved" }] }), { ref: "a/b", decision: "approve" }), /already approved/);
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
  assert.equal(cutCommand(cut, { decision: "revise", words: "0:14 fast", tags: ["pacing"] }).state, "package");
  assert.deepEqual(cutCommand(cut, { decision: "revise", words: "remove sfx", tags: ["music"] }).command.tags, ["music"]);
  // Dinesh, 2026-11-11: a change names what it is about, so the server can record it.
  assert.throws(() => cutCommand(cut, { decision: "revise", words: "remove sfx" }), /Choose what this is about/);
  assert.throws(() => cutCommand(cut, { decision: "revise", words: "x", tags: ["vibes"] }), /not something that can change/);
  assert.throws(() => cutCommand(cut, { decision: "reject" }), /Say what/);
});

test("the sound effects are the editor's to turn off; a finished cut is built again (Dinesh, 2026-11-11)", () => {
  assert.deepEqual(soundCommand(run({ state: "cut", coreId: "NO2508-V02" }), { sfx: false }), { command: { type: "sound", data: { sfx: false, rebuild: true } }, state: "building", sfx: false });
  assert.equal(soundCommand(run({ state: "storyboard", coreId: "NO2508-V02" }), { sfx: false }).state, "storyboard");
  assert.throws(() => soundCommand(run({ state: "building", coreId: "NO2508-V02" }), { sfx: true }), /Wait until/);
  assert.throws(() => soundCommand(run({ state: "cut", coreId: "NO2508-V02" }), { sfx: "no" }), /on or off/);
  assert.equal(cleanUpdate({ runId: "1793500000.000001", state: "cut", sfx: false }).fields.sfx, false);
});

test("a rejected clip is made again within the limit, and a cut's change can name its shots (D-046)", () => {
  const clips = [{ ref: "a/b", state: "rejected", note: "Too dark" }, { ref: "c/d", state: "approved" }];
  assert.deepEqual(remakeCommand(run({ state: "clips", clips, spent: 10, remakePrice: 0.5 })), { command: { type: "remake" }, state: "generating" });
  assert.throws(() => remakeCommand(run({ state: "clips", clips, spent: 14.8, remakePrice: 0.5 })), /over the \$15 limit/);
  assert.throws(() => remakeCommand(run({ state: "clips", clips: [{ ref: "c/d", state: "approved" }] })), /no rejected clip/);
  const cut = run({ state: "cut", clips: [{ ref: "a/b", state: "approved" }, { ref: "c/d", state: "approved" }] });
  const step = cutCommand(cut, { decision: "revise", words: "Shot 2 too fast", shots: ["c/d"] });
  assert.deepEqual(step.command, { type: "cut", decision: "revise", words: "Shot 2 too fast", shots: ["c/d"] });
  assert.equal(step.state, "clips");
  assert.deepEqual(step.clips.map((c) => c.state), ["approved", "rejected"]);
  assert.throws(() => cutCommand(cut, { decision: "revise", words: "x", shots: ["z/z"] }), /no clip z\/z/);
  assert.throws(() => cutCommand(cut, { decision: "approve", shots: ["c/d"] }), /go with a change/);
  assert.equal(cleanUpdate({ runId: "1793500000.000001", state: "clips", remakePrice: 0.42 }).fields.remakePrice, 0.42);
  assert.equal(cleanUpdate({ runId: "1793500000.000001", state: "clips" }).fields.remakePrice, null);
});

test("the image storyboard is drawn on a click within the limit, and each frame is decided (D-046)", () => {
  assert.deepEqual(framesCommand(run({ state: "frames", spent: 0, framesPrice: 1.05 })), { command: { type: "frames" }, state: "generating" });
  assert.throws(() => framesCommand(run({ state: "frames", spent: 14.5, framesPrice: 1.05 })), /over the \$15 limit/);
  assert.throws(() => framesCommand(run({ state: "approved" })), /not waiting for its storyboard/);
  // On the storyboard, a picture still to draw can be drawn; with none missing there is nothing to draw.
  assert.equal(framesCommand(run({ state: "storyboard", spent: 0.6, framesPrice: 0.075 })).state, "generating");
  assert.throws(() => framesCommand(run({ state: "storyboard", spent: 0.6, framesPrice: 0 })), /not waiting for its storyboard/);
  const board = run({ state: "storyboard", frames: [{ ref: "hook/still", state: "pending" }, { ref: "b1/s1", state: "photo" }], clips: [] });
  const step = clipCommand(board, { ref: "hook/still", decision: "reject", words: "Her shadow falls the wrong way" });
  assert.equal(step.state, "storyboard");
  assert.deepEqual(step.frames[0], { ref: "hook/still", state: "rejected", note: "Her shadow falls the wrong way" });
  assert.equal(step.clips, undefined);
  assert.throws(() => clipCommand(board, { ref: "b1/s1", decision: "approve" }), /already photo/);
  assert.equal(remakeCommand(run({ state: "storyboard", frames: step.frames, remakePrice: 0.075 })).state, "generating");
  const u = cleanUpdate({ runId: "1793500000.000001", state: "storyboard", framesPrice: 0.15, frames: [{ ref: "hook/still", beat: "hook", kind: "presenter", camera: "Maya speaks to camera", seconds: 4, state: "pending", slot: "frame-hook-still" }] });
  assert.equal(u.fields.framesPrice, 0.15);
  assert.equal(u.fields.frames[0].kind, "presenter");
  assert.equal(cleanSlot("frame-hook-still"), "frame-hook-still");
});

test("a video's costs are kept item by item and by tool", () => {
  const u = cleanUpdate({ runId: "1793500000.000001", state: "clips", costs: { total: 1.69, items: [{ what: "Property clip", tool: "Kling", usd: 0.672, by: "Preetham", at: "2026-11-05T10:00:00.000Z", replaced: true }], byTool: [{ tool: "Kling", usd: 1.34 }] } });
  assert.deepEqual(u.fields.costs, { total: 1.69, items: [{ what: "Property clip", tool: "Kling", usd: 0.672, by: "Preetham", at: "2026-11-05T10:00:00.000Z", replaced: true }], byTool: [{ tool: "Kling", usd: 1.34 }], unreported: 0 });
  assert.equal(cleanUpdate({ runId: "1793500000.000001", state: "clips" }).fields.costs, null);
  // A Claude run stopped at its time limit: spent, amount never reported.
  const cut = cleanUpdate({ runId: "1793500000.000001", state: "gate-a", costs: { total: 0.4, unreported: 1, items: [{ what: "Writing the plan and animatic", tool: "Claude Opus", usd: 0, unreported: true }], byTool: [] } });
  assert.equal(cut.fields.costs.unreported, 1);
  assert.equal(cut.fields.costs.items[0].unreported, true);
});

test("a file goes only in a known slot", () => {
  assert.equal(cleanSlot("clip-rent-day-rent-counter"), "clip-rent-day-rent-counter");
  assert.equal(cleanSlot("cut"), "cut");
  assert.throws(() => cleanSlot("../x"), /not a file slot/);
});

test("the editor chooses the Claude model that writes the video, from the three on offer", () => {
  const { cleanModel, CLAUDE_MODELS } = require("./runService");
  assert.deepEqual(CLAUDE_MODELS, ["haiku", "sonnet", "opus"]);
  for (const m of CLAUDE_MODELS) assert.equal(cleanModel(m), m);
  assert.throws(() => cleanModel(undefined), /Choose the Claude model/);
  assert.throws(() => cleanModel("claude-opus-5-5"), /Choose the Claude model/);
});

test("a stopped video can be tried again; others cannot", () => {
  const { retryCommand } = require("./runService");
  assert.deepEqual(retryCommand({ state: "failed", coreId: "LV18753-V05" }), { command: { type: "retry" }, state: "concepts" });
  assert.throws(() => retryCommand({ state: "clips", coreId: "X" }), /stopped video/);
  assert.throws(() => retryCommand({ state: "failed", coreId: null }), /never started/);
});

test("an editor goes back to the plan from a later step, in their words (D-050, Dinesh)", () => {
  for (const state of ["storyboard", "clips", "cut", "revision", "ready-to-build"]) {
    assert.deepEqual(reopenCommand(run({ state }), { words: "Add Maya saying buyers meet deals on the logo" }), { command: { type: "reopen", words: "Add Maya saying buyers meet deals on the logo" }, state: "package" });
  }
  assert.throws(() => reopenCommand(run({ state: "cut" }), { words: " " }), /Say what should change/);
  assert.throws(() => reopenCommand(run({ state: "gate-a" }), { words: "x" }), /plan is open now/);
  assert.throws(() => reopenCommand(run({ state: "done" }), { words: "x" }), /finished/);
  assert.throws(() => reopenCommand(run({ state: "generating" }), { words: "x" }), /Wait until/);
});

test("the layers for Premiere come from a video that has been put together (D-050, Dinesh)", () => {
  for (const state of ["cut", "revision", "done"]) assert.deepEqual(layersCommand(run({ state })), { command: { type: "layers" }, state });
  assert.throws(() => layersCommand(run({ state: "clips" })), /Build the video first/);
  assert.equal(cleanSlot("layers"), "layers");
});

test("a chat message carries the editor's words and their photos or documents (D-050, Dinesh)", () => {
  const r = run({ state: "cut", coreId: "AT1405-V01", runId: "1793500000.000001" });
  const png = { mimetype: "image/png", originalname: "kitchen ref.png", buffer: Buffer.from("x") };
  const m = chatMessage(r, { text: " Add buyers meet deals at the end " }, [png]);
  assert.equal(m.text, "Add buyers meet deals at the end");
  assert.match(m.attachments[0].key, /^chat\/[0-9.]+\/[0-9a-f]{64}\.png$/);
  assert.equal(chatMessage(r, {}, [png]).text, "(see the attached file)");
  assert.throws(() => chatMessage(r, { text: " " }), /Write a message/);
  assert.throws(() => chatMessage(r, { text: "x" }, [{ mimetype: "video/mp4", originalname: "a.mp4", buffer: Buffer.from("x") }]), /cannot be attached/);
  assert.throws(() => chatMessage(run({ state: "queued" }), { text: "x" }), /has not started/);
  assert.deepEqual(cleanChats([{ runId: "1793500000.000001", text: "Sure.", change: null }]), [{ runId: "1793500000.000001", text: "Sure.", change: null, action: null }]);
  assert.throws(() => cleanChats([{ runId: "x" }]), /not a run id/);
});
