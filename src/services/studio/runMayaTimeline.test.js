// Dinesh, 2026-11-12: what Maya does in a scene, chosen on the storyboard, and the timing on the timeline.
const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanUpdate, cleanChats, mayaCommand, musicCommand, timelineCommand, cleanMaya, cleanTimeline, cleanSlot } = require("./runService");
const { cleanCut } = require("./cutStorage");

const run = (over = {}) => ({ runId: "1793500000.000001", state: "storyboard", spent: 0, ...over });
const maya = { choice: "to-camera", pose: null, gesture: null, energy: "normal", options: [{ id: "to-camera", label: "Speaks to camera", action: "talk", usd: 0 }, { id: "walks-in", label: "Walks toward the camera", action: "walk", usd: 0.42 }] };
const frames = [{ ref: "hook/still", beat: "hook", kind: "presenter", maya }, { ref: "b2/s1", beat: "b2", kind: "photo", maya: null }];

test("Maya's action is one the scene offers, or the editor's own, within the limit", () => {
  const r = run({ frames });
  assert.deepEqual(mayaCommand(r, { beat: "hook", id: "walks-in" }), { command: { type: "maya", choice: "hook", data: { id: "walks-in" } }, state: "updating" });
  assert.deepEqual(mayaCommand(r, { beat: "hook", id: "own", pose: " sitting on the steps ", energy: "lively" }).command.data, { id: "own", pose: "sitting on the steps", energy: "lively" });
  assert.throws(() => mayaCommand(r, { beat: "hook", id: "dance" }), /from the list/);
  assert.throws(() => mayaCommand(r, { beat: "b2", id: "walks-in" }), /not in the scene/);
  assert.throws(() => mayaCommand(r, { beat: "hook", id: "own" }), /Write what Maya does/);
  assert.throws(() => mayaCommand(r, { beat: "hook", id: "own", gesture: "x".repeat(301) }), /300/);
  assert.throws(() => mayaCommand(r, { beat: "hook", id: "own", gesture: "waves", energy: "wild" }), /energy/);
  assert.throws(() => mayaCommand({ ...r, spent: 14.9 }, { beat: "hook", id: "walks-in" }), /limit/);
  assert.throws(() => mayaCommand({ ...r, state: "cut" }, { beat: "hook", id: "walks-in" }), /storyboard/);
});

const timeline = {
  seconds: 12.2,
  outro: 2.2,
  builtAt: "2026-11-12T10:00:00.000Z",
  beats: [
    { id: "hook", shots: [{ id: "presenter", movable: false }] },
    { id: "b2", shots: [{ id: "s1", movable: true }, { id: "s2", movable: true }] },
  ],
};

test("the timing changes a scene's pause and its shots' lengths and order, once the video is put together", () => {
  const r = run({ state: "cut", timeline });
  const step = timelineCommand(r, { beats: [{ id: "b2", pause: 0.23, shots: [{ id: "s2", seconds: 1.456 }, { id: "s1", seconds: 2 }] }, { id: "hook" }] });
  assert.deepEqual(step, { command: { type: "timeline", data: { beats: [{ id: "b2", pause: 0.25, shots: [{ id: "s2", seconds: 1.46 }, { id: "s1", seconds: 2 }] }] } }, state: "building" });
  assert.throws(() => timelineCommand(r, { beats: [{ id: "hook" }] }), /Nothing was changed/);
  assert.throws(() => timelineCommand(r, { beats: [{ id: "b9", pause: 0.2 }] }), /no scene "b9"/);
  assert.throws(() => timelineCommand(r, { beats: [{ id: "b2", pause: 3 }] }), /0 to 2 seconds/);
  assert.throws(() => timelineCommand(r, { beats: [{ id: "b2", shots: [{ id: "s1", seconds: 2 }] }] }), /have changed/);
  assert.throws(() => timelineCommand(r, { beats: [{ id: "hook", shots: [{ id: "presenter", seconds: 2 }] }] }), /have changed/);
  assert.throws(() => timelineCommand(r, { beats: [{ id: "b2", shots: [{ id: "s1", seconds: 0.1 }, { id: "s2", seconds: 2 }] }] }), /0.3 to 20/);
  assert.throws(() => timelineCommand({ ...r, state: "storyboard" }, { beats: [{ id: "b2", pause: 0.2 }] }), /once the video is put together/);
  assert.throws(() => timelineCommand({ ...r, timeline: null }, { beats: [{ id: "b2", pause: 0.2 }] }), /once the video is put together/);
});

test("the server's update carries Maya's options on her frame and the timeline, checked", () => {
  const u = cleanUpdate({
    runId: "1793500000.000001",
    state: "cut",
    frames: [{ ref: "hook/still", beat: "hook", kind: "presenter", maya: { ...maya, energy: "wild", options: [{ id: "x", label: "y", action: "fly", usd: "0.5" }] } }, { ref: "b2/s1", beat: "b2", kind: "photo" }],
    timeline: { seconds: 12.204, outro: 2.2, built_at: "2026-11-12T10:00:00.000Z", beats: [{ id: "b2", start: 4, duration: 6, voice: 3.85, pause: 0.15, hold: 2, line: "Three rooms.", shots: [{ id: "s1", ref: "b2/s1", kind: "clip", label: "img-02", start: 4, duration: 2, clip_seconds: 5, movable: true }, { id: "s2", ref: "b2/s2", kind: "weird", start: 6, duration: 4, clip_seconds: null, movable: 1 }], captions: [{ text: "Three", start: 4, duration: 0.5 }] }] },
  });
  assert.deepEqual(u.fields.frames[0].maya, { choice: "to-camera", pose: null, gesture: null, energy: "normal", options: [{ id: "x", label: "y", action: "talk", usd: 0.5 }] });
  assert.equal(u.fields.frames[1].maya, null);
  assert.equal(u.fields.timeline.seconds, 12.2);
  assert.equal(u.fields.timeline.builtAt, "2026-11-12T10:00:00.000Z");
  assert.deepEqual(u.fields.timeline.beats[0].shots.map((s) => [s.kind, s.clipSeconds, s.movable]), [["clip", 5, true], ["photo", null, true]]);
  assert.equal(cleanTimeline(null), null);
  assert.equal(cleanMaya(undefined), null);
});

// D-051 (Asad Rana, 2026-11-13): the editor chooses the music, and the chat's changes are made on the editor's click.
const music = { track: null, volume: null, tracks: [{ id: "placeholder-pad", title: "Pad", moods: ["warm"], seconds: 60, cleared: false, slot: "music-placeholder-pad" }] };

test("music is a track from the library at a volume, or none, once the plan is approved", () => {
  assert.deepEqual(musicCommand(run({ state: "storyboard", music }), { track: "placeholder-pad", volume: 0.2 }), { command: { type: "music", data: { track: "placeholder-pad", volume: 0.2 } }, state: "updating" });
  // A video already put together is put together again with it.
  assert.equal(musicCommand(run({ state: "cut", music }), { track: "placeholder-pad" }).state, "building");
  assert.deepEqual(musicCommand(run({ state: "cut", music: { ...music, track: "placeholder-pad", volume: 0.16 } }), { track: null }).command.data, { track: null });
  assert.throws(() => musicCommand(run({ state: "cut", music }), { track: "hit-song" }), /not a track/);
  assert.throws(() => musicCommand(run({ state: "cut", music }), { track: "placeholder-pad", volume: 0.9 }), /volume/);
  assert.throws(() => musicCommand(run({ state: "cut", music }), { track: null }), /music the video has now/);
  assert.throws(() => musicCommand(run({ state: "gate-a", music }), { track: "placeholder-pad" }), /once the plan is approved/);
  assert.throws(() => musicCommand(run({ state: "done", music }), { track: "placeholder-pad" }), /once the plan is approved/);
});

test("a music track is sent to the Studio to listen to before choosing", () => {
  assert.equal(cleanSlot("music-placeholder-pad"), "music-placeholder-pad");
  assert.equal(cleanCut("AT1-V01/music-placeholder-pad", { sha256: "a".repeat(64), name: "music-placeholder-pad.mp3", bytes: 1000 }).key, `cuts/AT1-V01/music-placeholder-pad/${"a".repeat(64)}.mp3`);
  assert.deepEqual(cleanUpdate({ runId: "1793500000.000001", state: "cut", music }).fields.music, music);
});

test("Claude's chat answer keeps a change the Studio can make, and drops anything else", () => {
  const [a, b, c] = cleanChats([
    { runId: "1793500000.000001", text: "Here it is.", action: { type: "maya", label: "Maya points", beat: "hook", id: "points", energy: "lively" } },
    { runId: "1793500000.000001", text: "Hmm.", action: { type: "delete", label: "x" } },
    { runId: "1793500000.000001", text: "Faster cut.", action: { type: "timeline", beats: [{ id: "b2", pause: 0.1, shots: [{ id: "s1", seconds: 1.2 }] }] } },
  ]);
  assert.deepEqual(a.action, { type: "maya", label: "Maya points", beat: "hook", id: "points", energy: "lively" });
  assert.equal(b.action, null);
  assert.deepEqual(c.action, { type: "timeline", label: "Apply this change", beats: [{ id: "b2", pause: 0.1, shots: [{ id: "s1", seconds: 1.2 }] }] });
});
