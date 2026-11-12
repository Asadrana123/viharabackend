// services/studio/runService.js
//
// New videos started in the Video Studio (D-035): the person who started one picks its concept and
// hook and decides Gate A; an admin may step in. What the server sends is checked and trimmed here,
// and a person's words are kept as typed. Nothing paid is started from here.

const crypto = require("node:crypto");

const STATES = new Set(["queued", "concepts", "concept-choice", "hooks", "hook-choice", "package", "gate-a", "approved", "frames", "storyboard", "generating", "clips", "ready-to-build", "building", "cut", "revision", "done", "rejected", "failed", "updating"]);
// The limit for a video (D-044). The server checks it again against what was really spent.
const VIDEO_LIMIT_USD = 15;
const SLOT = /^(animatic|cut|layers|clip-[a-z0-9-]{1,80}|frame-[a-z0-9-]{1,80}|photo-[a-z0-9-]{1,80})$/;
const FRAME_KINDS = new Set(["photo", "presenter", "generated", "later", "screen"]);
const MAX_WORDS = 2000;
// The Claude models an editor may choose to write a video's concepts, hooks and plan. The choice is theirs.
const CLAUDE_MODELS = ["haiku", "sonnet", "opus"];

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

/** A video's costs as the server reports them: what, which tool, how much, who made it and when. */
function cleanCosts(c) {
  if (!c || typeof c !== "object") return null;
  const money = (n) => Math.round((Number(n) || 0) * 10000) / 10000;
  return {
    total: money(c.total),
    items: (Array.isArray(c.items) ? c.items.slice(0, 200) : []).map((i) => ({ what: clip(i?.what, 60), tool: clip(i?.tool, 40), usd: money(i?.usd), by: i?.by ? clip(i.by, 80) : null, at: i?.at ? clip(i.at, 40) : null, replaced: Boolean(i?.replaced), ...(i?.unreported ? { unreported: true } : {}) })),
    byTool: (Array.isArray(c.byTool) ? c.byTool.slice(0, 20) : []).map((t) => ({ tool: clip(t?.tool, 40), usd: money(t?.usd) })),
    // Items spent on with no amount reported (a Claude run stopped at its time limit): the total is less than was spent.
    unreported: Math.max(0, Math.min(200, Math.round(Number(c.unreported) || 0))),
  };
}

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
        ? u.frames.slice(0, 60).map((f) => ({
            ref: clip(f?.ref, 120),
            beat: clip(f?.beat, 40),
            kind: FRAME_KINDS.has(f?.kind) ? f.kind : "screen",
            camera: clip(f?.camera, 120),
            seconds: Number(f?.seconds) || null,
            state: clip(f?.state, 30),
            note: f?.note ? clip(f.note, 500) : null,
            usd: Number(f?.usd) || 0,
            slot: clip(f?.slot, 90),
            // D-047: the shot's photograph and camera move, and the moves the editor may choose, with their price.
            image: f?.image ? clip(f.image, 40) : null,
            choice: f?.choice ? clip(f.choice, 40) : null,
            options: Array.isArray(f?.options) ? f.options.slice(0, 12).map((o) => ({ id: clip(o?.id, 40), label: clip(o?.label, 120), usd: Number(o?.usd) || 0, invents: Boolean(o?.invents) })) : [],
          }))
        : [],
      framesPrice: Number(u?.framesPrice) || 0,
      clips: Array.isArray(u?.clips) ? u.clips.slice(0, 100).map((c) => ({ ref: clip(c?.ref, 120), state: clip(c?.state, 30), note: c?.note ? clip(c.note, 500) : null, slot: clip(c?.slot, 90) })) : [],
      cut: u?.cut ? { name: clip(u.cut.name, 120), state: clip(u.cut.state, 30), seconds: Number(u.cut.seconds) || 0 } : null,
      // What the video has cost so far, item by item, and by tool.
      costs: cleanCosts(u?.costs),
      // What making the rejected clips again costs (D-046); null when none is rejected.
      remakePrice: u?.remakePrice === null || u?.remakePrice === undefined ? null : Number(u.remakePrice) || 0,
      spent: Number(u?.spent) || 0,
      error: u?.error ? clip(u.error, 2000) : null,
      // D-047: the editor's own idea and craft, the voiceover by beat, the photographs, and what is still to make.
      idea: u?.idea ? clip(u.idea, MAX_WORDS) : null,
      craft: u?.craft ? cleanCraftOrNull(u.craft) : null,
      story: Array.isArray(u?.story) ? u.story.slice(0, 20).map((b) => ({ id: clip(b?.id, 40), role: clip(b?.role, 20), vo: clip(b?.vo, 800), shown: clip(b?.shown, 800), seconds: Number(b?.seconds) || 0 })) : [],
      photos: Array.isArray(u?.photos) ? u.photos.slice(0, 60).map((p) => ({ id: clip(p?.id, 40), kind: clip(p?.kind, 20), slot: clip(p?.slot, 90) })) : [],
      todo: Array.isArray(u?.todo) ? u.todo.slice(0, 40).map((t) => clip(t, 200)) : [],
      sfx: typeof u?.sfx === "boolean" ? u.sfx : null,
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

/** The editor's choice of Claude model, checked. */
function cleanModel(value) {
  const model = String(value ?? "");
  if (!CLAUDE_MODELS.includes(model)) throw new Error("Choose the Claude model that writes this video: Haiku, Sonnet or Opus.");
  return model;
}

/** Why this person may not act on this run, or null. */
const actProblem = (run, user) => (user.role === "admin" || String(run.requestedBy) === String(user._id) ? null : `This is ${run.requestedByName}'s video: they make its choices.`);

const PACES = ["calm", "normal", "fast"];
const LENGTHS = [15, 20, 30, 45, 60];

/** The editor's craft choices for a video (D-040, D-047): its length, its pace and how fast Maya speaks. */
function cleanCraft(c) {
  const seconds = Number(c?.seconds);
  const pace = String(c?.pace ?? "");
  const voiceSpeed = Number(c?.voiceSpeed ?? c?.voice_speed);
  if (!LENGTHS.includes(seconds)) throw new Error(`Choose a length: ${LENGTHS.join(", ")} seconds.`);
  if (!PACES.includes(pace)) throw new Error("Choose a pace: calm, normal or fast.");
  if (!Number.isFinite(voiceSpeed) || voiceSpeed < 0.8 || voiceSpeed > 1.25) throw new Error("Maya's speed is 0.8 to 1.25.");
  return { seconds, pace, voiceSpeed: Math.round(voiceSpeed * 100) / 100 };
}
const cleanCraftOrNull = (c) => {
  try {
    return cleanCraft(c);
  } catch {
    return null;
  }
};

/** What an editor gives when starting a video (D-047): an idea for the story and craft choices, both optional. */
function cleanStart(body) {
  const idea = String(body?.idea ?? "").trim();
  if (idea.length > MAX_WORDS) throw new Error(`Keep the idea to ${MAX_WORDS} characters.`);
  return { idea: idea || null, craft: body?.craft ? cleanCraft(body.craft) : null };
}
/** The craft as the Creative OS reads it. */
const craftData = (c) => ({ seconds: c.seconds, pace: c.pace, voice_speed: c.voiceSpeed });

/** The editor tells their own story instead of picking one of the concepts (D-047). */
function ideaCommand(run, body) {
  // A video that stopped before its hooks were written (no concept picked yet) takes a changed story too, so
  // the editor is never left with only Try again on the same words.
  const stoppedAtConcepts = run.state === "failed" && !(run.hooks ?? []).length && !run.plan;
  if (run.state !== "concept-choice" && !stoppedAtConcepts) throw new Error("This video is not waiting for a concept now.");
  const words = String(body?.words ?? "").trim();
  if (words.length < 10) throw new Error("Tell your story in a few lines.");
  if (words.length > MAX_WORDS) throw new Error(`At most ${MAX_WORDS} characters.`);
  return { command: { type: "idea", words }, state: "concepts", idea: words };
}

/** The editor's craft choices, changed before the plan is written (D-047). */
function craftCommand(run, body) {
  if (!["queued", "concepts", "concept-choice", "hooks", "hook-choice"].includes(run.state)) throw new Error("The plan is already written: ask for the change at the plan instead.");
  const craft = cleanCraft(body?.craft);
  return { command: { type: "craft", data: { craft: craftData(craft) } }, state: run.state, craft };
}

const HOOK_WORDS = /\b(auctions?|bid|bids|bidding|bidders?|listings?)\b/i;

/** The editor's own hook, in their words, picked by them (D-047). Hooks never say auction, bid or listing (D-031). */
function hookCommand(run, body) {
  if (run.state !== "hook-choice") throw new Error("This video is not waiting for a hook now.");
  const hook = { line1: String(body?.line1 ?? "").trim(), line2: String(body?.line2 ?? "").trim(), vo: String(body?.vo ?? "").trim(), visual: String(body?.visual ?? "").trim() };
  if (!hook.line1 || !hook.line2 || !hook.vo) throw new Error("A hook needs both title lines and what Maya says.");
  if (Object.values(hook).some((v) => v.length > 400)) throw new Error("Keep each part under 400 characters.");
  // A figure token such as {starting-bid} shows a figure, not the word "bid": tokens are left out of the check.
  const word = HOOK_WORDS.exec(Object.values(hook).join(" ").replace(/\{[a-z0-9-]+\}/gi, " "))?.[0];
  if (word) throw new Error(`Hooks never say "${word}": it scares a cold reader off. Say it in deal words instead.`);
  return { command: { type: "hook", data: { hook } }, state: "package" };
}

/** The editor's own voiceover lines at the plan (D-047). Figures stay in {curly braces}. */
function voCommand(run, body) {
  if (run.state !== "gate-a") throw new Error("This video is not waiting for its plan to be approved now, so its lines can no longer change here.");
  const lines = body?.lines && typeof body.lines === "object" ? body.lines : {};
  const story = run.story ?? [];
  const changed = Object.fromEntries(
    Object.entries(lines)
      .map(([id, v]) => [String(id), String(v ?? "").trim()])
      .filter(([id, v]) => v && story.some((b) => b.id === id && b.vo !== v))
  );
  if (!Object.keys(changed).length) throw new Error("Nothing was changed. Edit at least one of Maya's lines, then save.");
  if (Object.values(changed).some((v) => v.length > 600)) throw new Error("One of Maya's lines is over 600 characters. Keep each to what she can say in that card's time.");
  return { command: { type: "vo", data: { lines: changed } }, state: "updating" };
}

const SHOT_STATES = ["approved", "frames", "storyboard", "clips", "ready-to-build"];

/** The editor's camera move or photograph for one shot of the property, on the storyboard (D-047). */
function shotCommand(run, body) {
  if (!SHOT_STATES.includes(run.state)) throw new Error("Shots are changed on the storyboard, before the video is built.");
  const ref = String(body?.ref ?? "");
  const frame = (run.frames ?? []).find((f) => f.ref === ref);
  if (!frame || !frame.options?.length) throw new Error(`Shot ${ref} takes no camera move.`);
  const camera = body?.camera ? String(body.camera) : null;
  const image = body?.image ? String(body.image) : null;
  if (!camera && !image) throw new Error("Choose a camera move or a photograph.");
  const option = camera ? frame.options.find((o) => o.id === camera) : null;
  if (camera && !option) throw new Error(`"${camera}" does not fit this shot.`);
  if (image && !(run.photos ?? []).some((p) => p.id === image)) throw new Error(`${image} is not an approved photograph of this property.`);
  if (option && (run.spent ?? 0) + option.usd > VIDEO_LIMIT_USD) throw new Error(`This move is over the $${VIDEO_LIMIT_USD} limit for a video. Choose a free move (the ones without a price).`);
  return { command: { type: "shot", choice: ref, data: { ...(camera ? { camera } : {}), ...(image ? { image } : {}) } }, state: "updating" };
}

const IMAGE_KINDS = ["original", "enhanced", "generated"];
const IMAGE_TYPES = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

/**
 * An image of the property the editor uploads (D-047), approved by them as what they say it is. It may not
 * show anything the property does not have. Checked here before it is stored.
 */
function cleanImage(run, body, file) {
  if (["done", "rejected", "failed"].includes(run.state)) throw new Error("This video is finished.");
  if (!file?.buffer?.length) throw new Error("Choose an image.");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Images are at most 25 MB.");
  const ext = IMAGE_TYPES[file.mimetype];
  if (!ext) throw new Error("Upload a JPEG, PNG or WebP image.");
  const kind = String(body?.kind ?? "");
  if (!IMAGE_KINDS.includes(kind)) throw new Error("Say what the image is: a photo as it is, an edited photo, or an AI-recreated picture.");
  const alterations = String(body?.alterations ?? "").trim();
  if (kind === "enhanced" && !alterations) throw new Error("Say what you changed in the photo.");
  if (alterations.length > 500) throw new Error("Keep what you changed under 500 characters.");
  if (String(body?.faithful) !== "true") throw new Error("Confirm the image shows this property as it is: no room, building, view or renovation it does not have.");
  const base = String(file.originalname ?? "image").replace(/\.[^.]*$/, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+/, "").slice(0, 60) || "image";
  const disclosure = String(body?.disclosure ?? "") === "not_required" ? "not_required" : "required";
  const sha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");
  return { key: `uploads/${run.runId}/${sha256}${ext}`, name: `${base}${ext}`, kind, alterations: kind === "enhanced" ? alterations : null, disclosure: kind === "enhanced" ? disclosure : null, faithful: true, bytes: file.size, contentType: file.mimetype };
}

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
  if (run.state !== "gate-a") throw new Error("This video is not waiting for its plan to be approved now.");
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
  // Also on the storyboard itself, when a picture is still to draw (e.g. after its photo was changed, or a
  // draw that failed): the editor draws the missing ones without waiting for every other decision.
  const missing = run.state === "storyboard" && (run.framesPrice ?? 0) > 0;
  if (run.state !== "frames" && !missing) throw new Error("This video is not waiting for its storyboard now.");
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

/**
 * Runs the writing step that stopped (the concepts, the hooks or the plan) again, for example after the
 * Anthropic credits were topped up. The server works out which step it was.
 */
/** Asks the server for the video as it stands now, e.g. when the page looks out of date. Changes nothing. */
function viewCommand(run) {
  if (!run.coreId) throw new Error("This video has not started yet.");
  return { command: { type: "view" }, state: run.state };
}

function retryCommand(run) {
  if (run.state !== "failed") throw new Error("Only a stopped video can be tried again.");
  if (!run.coreId) throw new Error("This video never started. Start a new video for this property.");
  return { command: { type: "retry" }, state: "concepts" };
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
  // What the change is about, from the Creative OS's layers; a change or rejection names one, or ticks a shot.
  const tags = Array.isArray(body?.tags) ? [...new Set(body.tags.map(String))] : [];
  const unknownTag = tags.find((t) => !CUT_LAYERS.includes(t));
  if (unknownTag) throw new Error(`"${unknownTag}" is not something that can change.`);
  if (decision !== "approve" && !tags.length && !shots.length) throw new Error("Choose what this is about (voice, sound, captions...), or tick the shots to make again.");
  const unknown = shots.filter((s) => !run.clips?.some((c) => c.ref === s));
  if (unknown.length) throw new Error(`There is no clip ${unknown.join(", ")}.`);
  const command = { type: "cut", decision, words: words.slice(0, MAX_WORDS), ...(shots.length ? { shots } : {}), ...(tags.length && decision !== "approve" ? { tags } : {}) };
  if (shots.length) return { command, state: "clips", clips: run.clips.map((c) => (shots.includes(c.ref) ? { ...c, state: "rejected", note: words.slice(0, 500) } : c)) };
  // A change that names no shot goes back to the plan (D-050, Dinesh: "When you make changes, it doesn't
  // happen"): Claude writes it again in the editor's words, they approve it, and the cut is built again.
  return { command, state: decision === "approve" ? "done" : decision === "reject" ? "rejected" : "package" };
}

/**
 * The video in layers for Premiere (D-050, Dinesh): the last build's footage, graphics with transparency, voice,
 * sound and captions, as one download. Nothing paid; the video stays where it is.
 */
function layersCommand(run) {
  if (!["cut", "revision", "done"].includes(run.state)) throw new Error("Layers come from a video that has been put together. Build the video first.");
  return { command: { type: "layers" }, state: run.state };
}

/** What a chat attachment may be: a photo, a PDF or a text document (D-050). */
const CHAT_TYPES = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "application/pdf": ".pdf", "text/plain": ".txt", "text/markdown": ".md" };
const CHAT_MAX_FILES = 5;

/**
 * A message in a video's Studio chat (D-050, Dinesh: "an intelligent chatbox ... And have a link file pin where
 * we can add, photo or document"). Claude reads the video and answers; the chat itself changes nothing.
 */
function chatMessage(run, body, files = []) {
  if (!run.coreId) throw new Error("This video has not started yet. The chat opens once its story is being written.");
  const text = String(body?.text ?? "").trim();
  if (!text && !files.length) throw new Error("Write a message, or attach a photo or a document.");
  if (text.length > MAX_WORDS) throw new Error(`A message is at most ${MAX_WORDS} characters.`);
  if (files.length > CHAT_MAX_FILES) throw new Error(`Attach at most ${CHAT_MAX_FILES} files to one message.`);
  const attachments = files.map((f) => {
    const ext = CHAT_TYPES[f.mimetype];
    if (!ext) throw new Error(`"${f.originalname}" cannot be attached: photos (PNG, JPG, WebP), PDFs and text files can.`);
    const sha256 = require("crypto").createHash("sha256").update(f.buffer).digest("hex");
    return { key: `chat/${run.runId}/${sha256}${ext}`, name: clip(f.originalname, 120), contentType: f.mimetype };
  });
  return { text: text || "(see the attached file)", attachments };
}

/** Claude's answers from the server, checked: which video, the reply, and the change it hands back. */
function cleanChats(list) {
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length > 100) throw new Error("Send at most 100 chat answers as a list.");
  return list.map((c) => {
    const runId = String(c?.runId ?? "");
    if (!/^\d{6,}\.\d{1,9}$/.test(runId)) throw new Error(`"${runId}" is not a run id.`);
    return { runId, text: clip(c?.text, 4000), change: c?.change ? clip(c.change, 2000) : null };
  });
}

/** States after the plan from which an editor may go back and change it (D-050). */
const REOPEN_FROM = ["approved", "frames", "storyboard", "clips", "ready-to-build", "cut", "revision"];

/**
 * Going back to change the plan from a later step, in the editor's words (D-050, Dinesh: "I can't go back and
 * fix it"). What was approved and made stays; only what the change touches is made again, after they approve
 * the plan at its new price.
 */
function reopenCommand(run, body) {
  if (!REOPEN_FROM.includes(run.state)) throw new Error(run.state === "gate-a" ? "The plan is open now: change its lines or ask for a change on it." : run.state === "done" || run.state === "rejected" ? "This video is finished. Start a new video for a new version." : "Wait until this step has finished, then go back to the plan.");
  const words = String(body?.words ?? "").trim();
  if (!words) throw new Error("Say what should change, in your words: which part, and how.");
  return { command: { type: "reopen", words: words.slice(0, MAX_WORDS) }, state: "package" };
}

/** The layers a cut change can name, as the Creative OS records them (src/video/record.ts LAYERS). */
const CUT_LAYERS = ["script", "voice", "music", "captions", "text", "pacing", "shot", "presenter", "accuracy", "cta"];

/**
 * The editor's sound effects on or off (Dinesh, 2026-11-11). A video with a cut is built again with the
 * choice; before that it applies when the video is put together.
 */
function soundCommand(run, body) {
  if (typeof body?.sfx !== "boolean") throw new Error("Turn the sound effects on or off.");
  if (!run.coreId) throw new Error("This video has not started yet.");
  if (["building", "generating", "done", "rejected"].includes(run.state)) throw new Error(run.state === "building" || run.state === "generating" ? "Wait until this step has finished, then change the sound effects." : "This video is finished.");
  const rebuild = run.state === "cut";
  return { command: { type: "sound", data: { sfx: body.sfx, rebuild } }, state: rebuild ? "building" : run.state, sfx: body.sfx };
}

function cleanSlot(slot) {
  const s = String(slot ?? "");
  if (!SLOT.test(s)) throw new Error(`"${s}" is not a file slot.`);
  return s;
}

module.exports = { chatMessage, cleanChats, CHAT_TYPES, layersCommand, reopenCommand, REOPEN_FROM, soundCommand, CUT_LAYERS, viewCommand, retryCommand, cleanCraft, cleanStart, craftData, ideaCommand, craftCommand, hookCommand, voCommand, shotCommand, cleanImage, VIDEO_LIMIT_USD, CLAUDE_MODELS, cleanModel, generateCommand, framesCommand, remakeCommand, clipCommand, buildCommand, cutCommand, cleanSlot, newRunId, cleanUpdate, cleanUpdates, cleanReady, actProblem, pickCommand, gateCommand };
