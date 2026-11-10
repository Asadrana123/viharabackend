// D-047: the editor's own hand on a Studio video - their idea, craft, hook, voiceover lines, camera moves and images.
const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanUpdate, cleanCraft, cleanStart, ideaCommand, craftCommand, hookCommand, voCommand, shotCommand, cleanImage, cleanSlot } = require("./runService");

const run = (over = {}) => ({ runId: "1793500000.000001", state: "concept-choice", spent: 0, ...over });

test("a video starts with the editor's idea and craft, both optional", () => {
  assert.deepEqual(cleanStart({}), { idea: null, craft: null });
  assert.deepEqual(cleanStart({ idea: "  Maya opens the door  ", craft: { seconds: 30, pace: "fast", voiceSpeed: 1.1 } }), { idea: "Maya opens the door", craft: { seconds: 30, pace: "fast", voiceSpeed: 1.1 } });
  assert.throws(() => cleanCraft({ seconds: 33, pace: "fast", voiceSpeed: 1 }), /length/);
  assert.throws(() => cleanCraft({ seconds: 30, pace: "slowest", voiceSpeed: 1 }), /pace/);
  assert.throws(() => cleanCraft({ seconds: 30, pace: "calm", voiceSpeed: 2 }), /speed/);
});

test("the editor tells their own story instead of picking a concept", () => {
  const step = ideaCommand(run(), { words: "A first-time investor walks in at sunrise and finds the deal." });
  assert.equal(step.state, "concepts");
  assert.equal(step.command.type, "idea");
  assert.throws(() => ideaCommand(run(), { words: "short" }), /few lines/);
  assert.throws(() => ideaCommand(run({ state: "hook-choice" }), { words: "A long enough story here." }), /not waiting for a concept/);
});

test("craft changes only until the plan is written", () => {
  const step = craftCommand(run({ state: "hook-choice" }), { craft: { seconds: 45, pace: "calm", voiceSpeed: 0.9 } });
  assert.deepEqual(step.command.data.craft, { seconds: 45, pace: "calm", voice_speed: 0.9 });
  assert.throws(() => craftCommand(run({ state: "gate-a" }), { craft: { seconds: 45, pace: "calm", voiceSpeed: 0.9 } }), /already written/);
});

test("the editor's own hook never says auction, bid or listing (D-031)", () => {
  const ok = hookCommand(run({ state: "hook-choice" }), { line1: "This house", line2: "pays you back", vo: "What if this one paid for itself?" });
  assert.equal(ok.state, "package");
  assert.equal(ok.command.data.hook.line1, "This house");
  assert.throws(() => hookCommand(run({ state: "hook-choice" }), { line1: "Bidding starts", line2: "now", vo: "x" }), /Bidding/);
  assert.throws(() => hookCommand(run({ state: "hook-choice" }), { line1: "One line", line2: "", vo: "x" }), /both title lines/);
  // A figure token is a figure on screen, not the word "bid" (the hint tells editors to write figures so).
  assert.equal(hookCommand(run({ state: "hook-choice" }), { line1: "From {starting-bid}", line2: "in the pines", vo: "Yours from {starting-bid}." }).state, "package");
});

test("voiceover lines change at the plan, only where the editor changed them", () => {
  const r = run({ state: "gate-a", story: [{ id: "hook", vo: "Old line" }, { id: "close", vo: "See the deal" }] });
  const step = voCommand(r, { lines: { hook: "New line", close: "See the deal", nope: "x" } });
  assert.deepEqual(step.command.data.lines, { hook: "New line" });
  assert.equal(step.state, "updating");
  assert.throws(() => voCommand(r, { lines: { close: "See the deal" } }), /at least one/);
});

test("a camera move is one the shot offers, within the limit", () => {
  const frames = [{ ref: "b2/s1", options: [{ id: "pan-left", usd: 0 }, { id: "depth-push", usd: 0.7 }] }, { ref: "hook/still", options: [] }];
  const r = run({ state: "storyboard", frames, photos: [{ id: "img-03" }] });
  assert.deepEqual(shotCommand(r, { ref: "b2/s1", camera: "depth-push" }).command, { type: "shot", choice: "b2/s1", data: { camera: "depth-push" } });
  assert.deepEqual(shotCommand(r, { ref: "b2/s1", image: "img-03" }).command.data, { image: "img-03" });
  assert.throws(() => shotCommand(r, { ref: "hook/still", camera: "pan-left" }), /no camera move/);
  assert.throws(() => shotCommand(r, { ref: "b2/s1", camera: "spin" }), /does not fit/);
  assert.throws(() => shotCommand(r, { ref: "b2/s1", image: "img-99" }), /not an approved photograph/);
  assert.throws(() => shotCommand({ ...r, spent: 14.9 }, { ref: "b2/s1", camera: "depth-push" }), /limit/);
  assert.throws(() => shotCommand({ ...r, state: "cut" }, { ref: "b2/s1", camera: "pan-left" }), /storyboard/);
});

test("an uploaded image says what it is and is confirmed to show the property as it is", () => {
  const file = { buffer: Buffer.from("png-bytes"), size: 9, mimetype: "image/png", originalname: "my kitchen (redo).png" };
  const img = cleanImage(run(), { kind: "enhanced", alterations: "Brighter light, sky replaced", faithful: "true" }, file);
  assert.match(img.key, /^uploads\/1793500000\.000001\/[a-f0-9]{64}\.png$/);
  assert.equal(img.name, "my-kitchen-redo-.png");
  assert.equal(img.disclosure, "required");
  assert.throws(() => cleanImage(run(), { kind: "enhanced", faithful: "true" }, file), /what you changed/);
  assert.throws(() => cleanImage(run(), { kind: "original" }, file), /as it is/);
  assert.throws(() => cleanImage(run(), { kind: "original", faithful: "true" }, { ...file, mimetype: "application/pdf" }), /JPEG, PNG or WebP/);
  assert.throws(() => cleanImage(run({ state: "done" }), { kind: "original", faithful: "true" }, file), /finished/);
});

test("the server's view carries the editor's story, photographs, camera options and what is still to make", () => {
  const { fields } = cleanUpdate({
    runId: "1793500000.000001",
    state: "approved",
    idea: "Maya at sunrise",
    craft: { seconds: 30, pace: "fast", voiceSpeed: 1.1 },
    story: [{ id: "hook", role: "hook", vo: "{starting-bid}", shown: "$124K", seconds: 3 }],
    photos: [{ id: "img-01", kind: "original", slot: "photo-img-01" }],
    todo: ["background b2/s1"],
    frames: [{ ref: "b2/s1", kind: "photo", camera: "push-in", image: "img-01", choice: "push-in", options: [{ id: "pan-left", label: "Pan left", usd: 0 }] }],
  });
  assert.equal(fields.idea, "Maya at sunrise");
  assert.deepEqual(fields.craft, { seconds: 30, pace: "fast", voiceSpeed: 1.1 });
  assert.equal(fields.story[0].shown, "$124K");
  assert.equal(fields.photos[0].slot, "photo-img-01");
  assert.deepEqual(fields.todo, ["background b2/s1"]);
  assert.deepEqual(fields.frames[0].options[0], { id: "pan-left", label: "Pan left", usd: 0, invents: false });
  assert.equal(cleanUpdate({ runId: "1793500000.000001", state: "updating" }).fields.state, "updating");
  assert.equal(cleanSlot("photo-img-01"), "photo-img-01");
});
