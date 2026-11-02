// services/studio/runService.js
//
// New videos started in the Video Studio (D-035): the person who started one picks its concept and
// hook and decides Gate A; an admin may step in. What the server sends is checked and trimmed here,
// and a person's words are kept as typed. Nothing paid is started from here.

const crypto = require("node:crypto");

const STATES = new Set(["queued", "concepts", "concept-choice", "hooks", "hook-choice", "package", "gate-a", "approved", "rejected", "failed"]);
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
  return {
    runId,
    fields: {
      state,
      coreId: u?.coreId ? clip(u.coreId, 80) : null,
      concepts: Array.isArray(u?.concepts) ? u.concepts.slice(0, 12).map(concept) : [],
      hooks: Array.isArray(u?.hooks) ? u.hooks.slice(0, 12).map(hook) : [],
      plan: plan(u?.plan),
      error: u?.error ? clip(u.error, 800) : null,
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

module.exports = { newRunId, cleanUpdate, cleanUpdates, cleanReady, actProblem, pickCommand, gateCommand };
