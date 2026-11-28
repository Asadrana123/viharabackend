// D-047: the editor's own hand on a Studio video - their idea, craft, hook, voiceover lines, camera moves and images.
const test = require("node:test");
const assert = require("node:assert/strict");
const { BUYER_TYPES, cleanUpdate, cleanCraft, cleanStart, ideaCommand, craftCommand, hookCommand, voCommand, shotCommand, cleanImage, cleanSlot, cleanReuse } = require("./runService");

const run = (over = {}) => ({ runId: "1793500000.000001", state: "concept-choice", spent: 0, ...over });

test("a video starts with the editor's idea and craft, both optional", () => {
  assert.deepEqual(cleanStart({}), { idea: null, craft: null, buyer: null, story: null, finish: null, outfit: null });
  assert.deepEqual(cleanStart({ idea: "  Maya opens the door  ", craft: { seconds: 30, pace: "fast", voiceSpeed: 1.1 } }), { idea: "Maya opens the door", craft: { seconds: 30, pace: "fast", voiceSpeed: 1.1 }, buyer: null, story: null, finish: null, outfit: null });
  assert.throws(() => cleanCraft({ seconds: 33, pace: "fast", voiceSpeed: 1 }), /length/);
  assert.throws(() => cleanCraft({ seconds: 30, pace: "slowest", voiceSpeed: 1 }), /pace/);
  assert.throws(() => cleanCraft({ seconds: 30, pace: "calm", voiceSpeed: 2 }), /speed/);
});

test("D-070: the editor may choose Maya's outfit at the start, with or without a storytelling style", () => {
  assert.equal(cleanStart({ outfit: "festive-rust-blouse" }).outfit, "festive-rust-blouse");
  assert.equal(cleanStart({ outfit: "professional-navy-dress" }).outfit, "professional-navy-dress");
  assert.equal(cleanStart({ outfit: "everyday" }).outfit, "everyday");
  assert.equal(cleanStart({ outfit: "" }).outfit, null);
  assert.equal(cleanStart({ outfit: "everyday" }).story, null);
  assert.throws(() => cleanStart({ outfit: "pirate-costume" }), /one of Maya's outfits/);
});

test("D-057: the editor picks one buyer; the stage is the matrix's unless they chose another", () => {
  assert.deepEqual(cleanStart({ buyer: { icpId: "first_time_investor" } }).buyer, { icpId: "first_time_investor", stage: "unaware", label: "First-time Investor" });
  assert.deepEqual(cleanStart({ buyer: { icpId: "homeowner", stage: "most_aware" } }).buyer, { icpId: "homeowner", stage: "most_aware", label: "First-time Homeowner/Repeat Homeowner" });
  assert.equal(BUYER_TYPES.length, 8);
  assert.throws(() => cleanStart({ buyer: { icpId: "wholesaler" } }), /one buyer type/);
  assert.throws(() => cleanStart({ buyer: { icpId: "homeowner", stage: "curious" } }), /awareness stage/);
  // What the server reports is kept when it checks out, and dropped otherwise.
  assert.deepEqual(cleanUpdate({ runId: "1793500000.000001", state: "concepts", buyer: { icpId: "realtor", stage: "solution_aware" } }).fields.buyer, { icpId: "realtor", stage: "solution_aware", label: "Realtors/Buyer's Agents" });
  assert.equal(cleanUpdate({ runId: "1793500000.000001", state: "concepts", buyer: { icpId: "nobody" } }).fields.buyer, null);
});

test("the editor tells their own story instead of picking a concept", () => {
  const step = ideaCommand(run(), { words: "A first-time investor walks in at sunrise and finds the deal." });
  assert.equal(step.state, "concepts");
  assert.equal(step.command.type, "idea");
  assert.throws(() => ideaCommand(run(), { words: "short" }), /few lines/);
  assert.throws(() => ideaCommand(run({ state: "hook-choice" }), { words: "A long enough story here." }), /not waiting for a concept/);
  // Stopped while the concepts were written: a changed story is taken; stopped later, it is not.
  assert.equal(ideaCommand(run({ state: "failed", hooks: [], plan: null }), { words: "Buy-and-hold investors, listen up." }).state, "concepts");
  assert.throws(() => ideaCommand(run({ state: "failed", hooks: [{ id: "H1" }], plan: null }), { words: "A long enough story here." }), /not waiting for a concept/);
});

test("craft changes only until the plan is written", () => {
  const step = craftCommand(run({ state: "hook-choice" }), { craft: { seconds: 45, pace: "calm", voiceSpeed: 0.9 } });
  assert.deepEqual(step.command.data.craft, { seconds: 45, pace: "calm", voice_speed: 0.9 });
  assert.throws(() => craftCommand(run({ state: "gate-a" }), { craft: { seconds: 45, pace: "calm", voiceSpeed: 0.9 } }), /already written/);
});

test("the editor's own hook never says auction, bid or listing (D-031)", () => {
  const ok = hookCommand(run({ state: "hook-choice" }), { vo: "What if this one paid for itself?", visual: "Maya at the door" });
  assert.equal(ok.state, "package");
  assert.deepEqual(ok.command.data.hook, { vo: "What if this one paid for itself?", visual: "Maya at the door" });
  assert.throws(() => hookCommand(run({ state: "hook-choice" }), { vo: "Bidding starts now" }), /Bidding/);
  assert.throws(() => hookCommand(run({ state: "hook-choice" }), { vo: " ", visual: "x" }), /what Maya says/);
  // A figure token is a figure, not the word "bid" (the hint tells editors to write figures so).
  assert.equal(hookCommand(run({ state: "hook-choice" }), { vo: "Yours from {starting-bid}." }).state, "package");
});

test("the editor's own hook has no title lines (D-076): any sent are dropped", () => {
  const ok = hookCommand(run({ state: "hook-choice" }), { line1: "Old", line2: "title", vo: "Three things on my wishlist." });
  assert.deepEqual(ok.command.data.hook, { vo: "Three things on my wishlist.", visual: "" });
});

test("voiceover lines change at the plan, only where the editor changed them", () => {
  const r = run({ state: "gate-a", story: [{ id: "hook", vo: "Old line" }, { id: "close", vo: "See the deal" }] });
  const step = voCommand(r, { lines: { hook: "New line", close: "See the deal", nope: "x" } });
  assert.deepEqual(step.command.data.lines, { hook: "New line" });
  assert.equal(step.state, "updating");
  assert.throws(() => voCommand(r, { lines: { close: "See the deal" } }), /at least one/);
});

test("an earlier property clip is one the shot offers, at $0, even at the limit", () => {
  const key = "cb00eac847a1e5173510bbe8";
  const frames = [{ ref: "b2/s1", options: [{ id: "dolly-in", usd: 0.38 }], reuse: { current: null, options: [{ key, from: "LH960-V05" }] } }];
  const r = run({ state: "storyboard", frames, spent: 15 });
  assert.deepEqual(shotCommand(r, { ref: "b2/s1", reuse: key }).command, { type: "shot", choice: "b2/s1", data: { reuse: key } });
  assert.throws(() => shotCommand(r, { ref: "b2/s1", reuse: "aef473ccbd3637d3a94d385a" }), /not one of this shot's choices/);
  assert.throws(() => shotCommand(run({ state: "storyboard", frames: [{ ...frames[0], reuse: { current: key, options: frames[0].reuse.options } }] }), { ref: "b2/s1", reuse: key }), /already uses/);
  assert.throws(() => shotCommand({ ...r, state: "revision" }, { ref: "b2/s1", reuse: key }), /storyboard/);
});

test("earlier clips are cleaned: hex keys only, a slot of their own", () => {
  const c = cleanReuse({ current: "nope", options: [{ key: "cb00eac847a1e5173510bbe8", from: "LH960-V05", image: "img-07", motion: "dolly-in", approvedBy: "Preetham", seconds: 3.1 }, { key: "../etc" }] });
  assert.equal(c.current, null);
  assert.equal(c.options.length, 1);
  assert.equal(c.options[0].slot, "reuse-cb00eac847a1e5173510bbe8");
  assert.equal(cleanSlot("reuse-cb00eac847a1e5173510bbe8"), "reuse-cb00eac847a1e5173510bbe8");
  assert.throws(() => cleanSlot("reuse-zz"), /not a file slot/);
  assert.equal(cleanReuse(null), null);
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
  assert.equal(shotCommand({ ...r, state: "cut" }, { ref: "b2/s1", camera: "pan-left" }).command.type, "shot");
  assert.throws(() => shotCommand({ ...r, state: "revision" }, { ref: "b2/s1", camera: "pan-left" }), /storyboard/);
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

test("D-065: a video starts with the storytelling style the editor picked, an approved one only", () => {
  const { cleanStory, STORY_STYLES } = require("./runService");
  assert.ok(STORY_STYLES.includes("town-title-standing"));
  assert.deepEqual(cleanStory({ style: "town-title-standing", owl: true }), { style: "town-title-standing", owl: true, owl_place: "shoulder" });
  assert.deepEqual(cleanStory({ style: "mini-story", owl: true, owlPlace: "hand" }), { style: "mini-story", owl: true, owl_place: "hand" });
  assert.throws(() => cleanStory({ style: "mini-story", owl: true, owlPlace: "roof" }), /where Ollie is/);
  assert.deepEqual(cleanStory({ style: "mini-story" }), { style: "mini-story", owl: false });
  assert.equal(cleanStory(null), null);
  assert.deepEqual(cleanStart({ story: { style: "seated-explainer" } }).story, { style: "seated-explainer", owl: false });
  assert.deepEqual(cleanStory({ style: "street-interview" }), { style: "street-interview", owl: false });
  assert.throws(() => cleanStory({ style: "made-up" }), /storytelling styles/);
});

test("D-075: the editor chooses the button and before and after, before the plan is written", () => {
  const { cleanFinish, finishData, finishCommand } = require("./runService");
  assert.deepEqual(cleanFinish({ cta: "comment", ctaWord: " WeHo " }), { cta: "comment", ctaWord: "WeHo", staging: true });
  assert.deepEqual(cleanFinish({ cta: "explore", staging: false }), { cta: "explore", ctaWord: null, staging: false });
  assert.deepEqual(cleanFinish({}), { cta: null, ctaWord: null, staging: true });
  assert.throws(() => cleanFinish({ cta: "comment" }), /word people comment/);
  assert.throws(() => cleanFinish({ cta: "comment", ctaWord: "bid" }), /never says auction, bid or listing/);
  assert.throws(() => cleanFinish({ cta: "see" }), /Choose the button/);
  assert.deepEqual(finishData({ cta: "comment", ctaWord: "WeHo", staging: true }), { cta: "comment", cta_word: "WeHo", staging: true });
  assert.deepEqual(cleanStart({ finish: { cta: "register" } }).finish, { cta: "register", ctaWord: null, staging: true });
  const step = finishCommand(run({ state: "hook-choice" }), { finish: { cta: "explore", staging: false } });
  assert.deepEqual(step.command, { type: "finish", data: { finish: { cta: "explore", staging: false } } });
  assert.throws(() => finishCommand(run({ state: "gate-a" }), { finish: { cta: "explore" } }), /already written/);
});

test("D-075: furnishing the empty rooms is the editor's click within the limit, and each picture their decision", () => {
  const { stagingMakeCommand, stagingDecideCommand } = require("./runService");
  const staging = { on: true, usdEach: 0.075, rooms: [{ image: "img-06", room: "living room", state: "found" }, { image: "img-08", room: "bedroom", state: "made" }] };
  assert.deepEqual(stagingMakeCommand(run({ staging }), {}).command, { type: "staging-make", data: {} });
  assert.deepEqual(stagingMakeCommand(run({ staging }), { images: ["img-08"] }).command, { type: "staging-make", data: { images: ["img-08"] } });
  assert.throws(() => stagingMakeCommand(run({ staging, spent: 14.99 }), {}), /limit/);
  assert.throws(() => stagingMakeCommand(run({ staging: { ...staging, on: false } }), {}), /off/);
  assert.throws(() => stagingMakeCommand(run({ staging, state: "gate-a" }), {}), /already written/);
  const used = stagingDecideCommand(run({ staging }), { decisions: [{ image: "img-08", use: true, faithful: true }] });
  assert.deepEqual(used.command.data.decisions, [{ image: "img-08", use: true, faithful: true }]);
  assert.throws(() => stagingDecideCommand(run({ staging }), { decisions: [{ image: "img-08", use: true }] }), /adds only furniture/);
  assert.throws(() => stagingDecideCommand(run({ staging }), { decisions: [{ image: "img-06", use: false }] }), /no furnished picture waiting/);
  assert.equal(cleanSlot("staged-img-08"), "staged-img-08");
  const u = cleanUpdate({ runId: "1793500000.000001", state: "hook-choice", finish: { cta: "comment", ctaWord: "WeHo", staging: true }, staging: { on: true, usdEach: 0.075, rooms: [{ image: "img-08", room: "bedroom", state: "made", photoSlot: "photo-img-08", stagedSlot: "staged-img-08" }] } });
  assert.equal(u.fields.finish.ctaWord, "WeHo");
  assert.equal(u.fields.staging.rooms[0].stagedSlot, "staged-img-08");
});
