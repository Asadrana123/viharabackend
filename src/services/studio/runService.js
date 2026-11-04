// services/studio/runService.js
//
// New videos started in the Video Studio (D-035): the person who started one picks its concept and
// hook and decides Gate A; an admin may step in. What the server sends is checked and trimmed here,
// and a person's words are kept as typed. Nothing paid is started from here.

const crypto = require("node:crypto");

const STATES = new Set(["queued", "concepts", "concept-choice", "hooks", "hook-choice", "package", "gate-a", "approved", "frames", "storyboard", "generating", "clips", "ready-to-build", "building", "cut", "revision", "done", "rejected", "failed"]);
// The limit for a video (D-044). The server checks it again against what was really spent.
const VIDEO_LIMIT_USD = 15;
const SLOT = /^(animatic|cut|clip-[a-z0-9-]{1,80}|frame-[a-z0-9-]{1,80})$/;
const FRAME_KINDS = new Set(["photo", "presenter", "generated", "later", "screen"]);
const MAX_WORDS = 2000;

const clip = (value, max) => String(value ?? "").slice(0, max);

/** In the form of a Slack ts, which is what the Creative OS's requests are keyed by. */
const newRunId = (now = Date.now()) => `${Math.floor(now / 1000)}.${String(crypto.randomInt(0, 1e6)).padStart(6, "0")}`;

/** What the page needs of a concept, a hook and a plan. */
const concept = (c) => ({ id: clip(c?.id, 8), title: clip(c?.title, 200), structure: clip(c?.structure, 40), logline: clip(c?.logline, 800), look: clip(c?.look, 400), why: clip(c?.why, 800) });
const hook = (h) => ({ id: clip(h?.id, 8), visual: clip(h?.visual, 800), vo: clip(h?.vo, 800), onScreen: (Array.isArray(h?.on_screen) ? h.on_screen : []).slice(0, 2).map((l) => clip(l, 200)) });
const plan = (p) => {
  if (!p) return null;
  const list = (l) => (Array.isArray(l) ? l.slice(0, 30).map((x) => clip(x, 500)) : []);
  const items = Array.isArray(p.price?.items) ? p.price.items.slice(0, 60).map((i) => ({ what: clip(i?.what, 200), usd: Number(i?.usd) || 0, cached: Boolean(i?.cached) })) : [];
  return { beats: Number(p.beats) || 0, seconds: Number(p.seconds) || 0, errors: list(p.errors), warnings: list(p.warnings), price: { total: Number(p.price?.total) || 0, items } };
};

/** Checks what the server says about one run, and returns the fields stored. */
function cleanUpdate(u) {
  const runId = String(u?.runId ?? "");
  const state = String(u?.state ?? "");
  if (!/^\d{6,}\.\d{1,9}$/.test(runId)) throw new Error(`"${runId}" is not a run id.`);
  if (!STATES.has(state)) throw new Error(`${runId}: unknown state "${state}".`);
  // A build refused for parts not made yet goes back to generate, whatever version the server runs.
  const unmade = state === "ready-to-build" && /generated assets are missing/i.test(String(u?.error ?? ""));
  return {
    runId,
    fields: {
      state: unmade ? "approved" : state,
      coreId: u?.coreId ? clip(u.coreId, 80) : null,
      concepts: Array.isArray(u?.concepts) ? u.concepts.slice(0, 12).map(concept) : [],
      hooks: Array.isArray(u?.hooks) ? u.hooks.slice(0, 12).map(hook) : [],
      plan: plan(u?.plan),
      // The image storyboard (D-046): one frame per shot, in order.
      frames: Array.isArray(u?.frames)
        ? u.frames.slice(0, 60).map((f) => ({ ref: clip(f?.ref, 120), beat: clip(f?.beat, 40), kind: FRAME_KINDS.has(f?.kind) ? f.kind : "screen", camera: clip(f?.camera, 60), seconds: Number(f?.seconds) || null, state: clip(f?.state, 30), note: f?.note ? clip(f.note, 500) : null, usd: Number(f?.usd) || 0, slot: clip(f?.slot, 90) }))
        : [],
      framesPrice: Number(u?.framesPrice) || 0,
      clips: Array.isArray(u?.clips) ? u.clips.slice(0, 100).map((c) => ({ ref: clip(c?.ref, 120), state: clip(c?.state, 30), note: c?.note ? clip(c.note, 500) : null, slot: clip(c?.slot, 90) })) : [],
      cut: u?.cut ? { name: clip(u.cut.name, 120), state: clip(u.cut.state, 30), seconds: Number(u.cut.seconds) || 0 } : null,
      // What making the rejected clips again costs (D-046); null when none is rejected.
      remakePrice: u?.remakePrice === null || u?.remakePrice === undefined ? null : Number(u.remakePrice) || 0,
      spent: Number(u?.spent) || 0,
      error: u?.error ? clip(u.error, 2000) : null,
    },
  };
}

function cleanUpdates(list) {
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length > 100) throw new Error("Send at most 100 updates as a list.");
  return list.map(cleanUpdate);
}

function cleanReady(list) {
  if (!Array.isArray(list) || list.length > 500) throw new Error("Send the properties as a list.");
  return list.map((r) => {
    const propertyId = clip(r?.propertyId, 120);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(propertyId)) throw new Error(`"${propertyId}" is not a property id.`);
    return { propertyId, ready: Boolean(r?.ready), photos: Number(r?.photos) || 0, angle: r?.angle ? clip(r.angle, 60) : null, blockedBy: r?.blockedBy ? clip(r.blockedBy, 300) : null };
  });
}

/** Why this person may not act on this run, or null. */
const actProblem = (run, user) => (user.role === "admin" || String(run.requestedBy) === String(user._id) ? null : `This is ${run.requestedByName}'s video: they make its choices.`);

/** A pick of a concept or a hook, for a run waiting for one. Returns the command and the run's next state. */
function pickCommand(run, body) {
  const what = String(body?.what ?? "");
  if (what !== "concept" && what !== "hook") throw new Error("Pick a concept or a hook.");
  if (run.state !== `${what}-choice`) throw new Error(`This video is not waiting for a ${what} now.`);
  const choice = String(body?.id ?? "");
  const options = what === "concept" ? run.concepts : run.hooks;
  if (!options.some((o) => o.id === choice)) throw new Error(`There is no ${what} ${choice}.`);
  return { command: { type: "pick", what, choice }, state: what === "concept" ? "hooks" : "package" };
}

/** Gate A, with the person's words. A change or a rejection needs them. */
function gateCommand(run, body) {
  const decision = String(body?.decision ?? "");
  if (!["approve", "revise", "reject"].includes(decision)) throw new Error("Approve, ask for a change, or reject.");
  if (run.state !== "gate-a") throw new Error("This video is not waiting for Gate A now.");
  const words = String(body?.words ?? "").trim();
  if (decision !== "approve" && !words) throw new Error("Say what should change, or why not.");
  if (words.length > MAX_WORDS) throw new Error(`At most ${MAX_WORDS} characters.`);
  if (decision === "approve" && run.plan?.errors?.length) throw new Error("This plan has errors, so it cannot be approved.");
  return { command: { type: "gate", decision, words }, state: decision === "revise" ? "package" : decision === "approve" ? "approved" : "rejected" };
}

/** Generate at the price shown, for an approved plan within the limit. Also a retry after a partial run. */
function generateCommand(run) {
  if (run.state !== "approved") throw new Error("This video is not waiting to generate now.");
  const price = run.plan?.price?.total ?? 0;
  if ((run.spent ?? 0) + price > VIDEO_LIMIT_USD) throw new Error(`This is over the $${VIDEO_LIMIT_USD} limit for a video. An admin decides what happens next.`);
  return { command: { type: "generate" }, state: "generating" };
}

/** The storyboard's frames, drawn at the price shown, for a storyboard plan after Gate A (D-046). */
function framesCommand(run) {
  if (run.state !== "frames") throw new Error("This video is not waiting for its storyboard now.");
  if ((run.spent ?? 0) + (run.framesPrice ?? 0) > VIDEO_LIMIT_USD) throw new Error(`This is over the $${VIDEO_LIMIT_USD} limit for a video. An admin decides what happens next.`);
  return { command: { type: "frames" }, state: "generating" };
}

/** One clip at Gate B, or one storyboard frame (D-046). A rejection says why. */
function clipCommand(run, body) {
  const board = run.state === "storyboard";
  if (run.state !== "clips" && !board) throw new Error("This video is not waiting for its clips now.");
  const list = board ? run.frames ?? [] : run.clips;
  const ref = String(body?.ref ?? "");
  const target = list.find((c) => c.ref === ref);
  if (!target) throw new Error(`There is no ${board ? "frame" : "clip"} ${ref}.`);
  if (target.state !== "pending") throw new Error(`This ${board ? "frame" : "clip"} is already ${target.state}.`);
  const decision = String(body?.decision ?? "");
  if (decision !== "approve" && decision !== "reject") throw new Error("Approve or reject.");
  const words = String(body?.words ?? "").trim();
  if (decision === "reject" && !words) throw new Error(`Say what is wrong with this ${board ? "frame" : "clip"}.`);
  const state = decision === "approve" ? "approved" : "rejected";
  // Shown at once; the server records it and confirms on its next round.
  const updated = list.map((c) => (c.ref === ref ? { ...c, state, note: words || null } : c));
  return { command: { type: "clip", choice: ref, decision, words: words.slice(0, MAX_WORDS) }, state: run.state, ...(board ? { frames: updated } : { clips: updated }) };
}

/** Make the rejected clips again, in the words of their rejection, at the price shown (D-046). */
function remakeCommand(run) {
  const list = run.state === "storyboard" ? run.frames : run.state === "clips" ? run.clips : null;
  if (!list?.some((c) => c.state === "rejected")) throw new Error("This video has no rejected clip to make again.");
  const price = run.remakePrice ?? 0;
  if ((run.spent ?? 0) + price > VIDEO_LIMIT_USD) throw new Error(`This is over the $${VIDEO_LIMIT_USD} limit for a video. An admin decides what happens next.`);
  return { command: { type: "remake" }, state: "generating" };
}

function buildCommand(run) {
  const allApproved = run.state === "clips" && run.clips?.length > 0 && run.clips.every((c) => c.state === "approved");
  if (run.state !== "ready-to-build" && !allApproved) throw new Error("This video is not ready to build.");
  return { command: { type: "build" }, state: "building" };
}

/**
 * The cut (Gate C). A change or a rejection needs the person's words. A change may name the shots to
 * make again (D-046): they go back to their clips, rejected in those words, and the cut is built again.
 */
function cutCommand(run, body) {
  if (run.state !== "cut") throw new Error("This video has no cut waiting.");
  const decision = String(body?.decision ?? "");
  if (!["approve", "revise", "reject"].includes(decision)) throw new Error("Approve, ask for a change, or reject.");
  const words = String(body?.words ?? "").trim();
  if (decision !== "approve" && !words) throw new Error("Say what should change, or why not.");
  const shots = Array.isArray(body?.shots) ? [...new Set(body.shots.map(String))] : [];
  if (shots.length && decision !== "revise") throw new Error("Shots to make again go with a change.");
  const unknown = shots.filter((s) => !run.clips?.some((c) => c.ref === s));
  if (unknown.length) throw new Error(`There is no clip ${unknown.join(", ")}.`);
  const command = { type: "cut", decision, words: words.slice(0, MAX_WORDS), ...(shots.length ? { shots } : {}) };
  if (shots.length) return { command, state: "clips", clips: run.clips.map((c) => (shots.includes(c.ref) ? { ...c, state: "rejected", note: words.slice(0, 500) } : c)) };
  return { command, state: decision === "approve" ? "done" : decision === "reject" ? "rejected" : "revision" };
}

function cleanSlot(slot) {
  const s = String(slot ?? "");
  if (!SLOT.test(s)) throw new Error(`"${s}" is not a file slot.`);
  return s;
}

module.exports = { VIDEO_LIMIT_USD, generateCommand, framesCommand, remakeCommand, clipCommand, buildCommand, cutCommand, cleanSlot, newRunId, cleanUpdate, cleanUpdates, cleanReady, actProblem, pickCommand, gateCommand };
