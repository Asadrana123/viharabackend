// services/studio/creativeService.js
//
// Statics made in the Studio (vihara.ai/studio/creatives): what an editor's click becomes as a step for the Creative
// OS server, checked against what the page last showed, and what the server sends back, kept to what the page needs.
// The Creative OS checks every step again (src/loop/studio-creative.ts); these checks only keep a stale or doubled
// click from being queued.

const { cleanBuyer } = require("./runService");

/** What one creative request may spend across its designs and Claude runs (the Creative OS's limit). */
const CREATIVE_LIMIT_USD = 2;
/** One generated design (MiniMax image-01 through treg, catalog price), what a carousel's Make adds. */
const DESIGN_USD = 0.0035;
const FORMATS = ["static", "carousel"];
// writing: Claude writes a carousel's options; options: the editor picks one (D-059).
const STATES = ["queued", "waiting", "angles", "writing", "options", "making", "review", "failed"];
const REVIEW_TAGS = ["headline", "image", "numbers", "cta", "look"];
const PHOTO_CHOICES = ["original", "enhanced", "generated", "skip"];
const CREATIVE_ID = /^\d{6,}\.\d{1,9}$/;
const SLOT = /^(slide-[a-z0-9-]{1,80}|photo-[a-z0-9-]{1,80})$/;

const clip = (value, max) => String(value ?? "").slice(0, max);
const strings = (list, n, max) => (Array.isArray(list) ? list.slice(0, n).map((s) => clip(s, max)) : []);

/** What an editor gives when starting: the property, the format, the buyer (D-057) and their idea, if any. */
function cleanCreativeStart(body) {
  const propertyId = clip(body?.propertyId, 120);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(propertyId)) throw new Error("Choose a property.");
  const format = String(body?.format ?? "");
  if (!FORMATS.includes(format)) throw new Error("Choose Static or Carousel.");
  let buyer;
  try {
    buyer = cleanBuyer(body?.buyer);
  } catch (e) {
    throw new Error(e.message.replace("this video is", "these creatives are"));
  }
  const idea = String(body?.idea ?? "").trim();
  if (idea.length > 1000) throw new Error("Keep your idea to 1000 characters.");
  return { propertyId, format, buyer, idea: idea || null };
}

/** Only the person who started it, or an admin, makes its choices (D-035). */
const actProblem = (c, user) => (user.role === "admin" || String(c.requestedBy) === String(user._id) ? null : `This is ${c.requestedByName}'s creative: they make its choices.`);

const openSteps = (c, type) => (c.commands ?? []).filter((x) => !x.doneAt && (!type || x.type === type));
const busy = (c) => {
  if (c.state === "making" || openSteps(c, "make").length) throw new Error("These creatives are being made. Wait for them, then try again.");
  if (c.state === "queued") throw new Error("This creative has not started yet. Wait a moment, then click Refresh from server.");
  if (c.state === "writing" || openSteps(c, "write").length) throw new Error("Claude is writing the carousel options. Wait for them, then try again.");
};
const angleOf = (c, id) => {
  const a = (c.angles ?? []).find((x) => x.id === String(id ?? ""));
  if (!a) throw new Error(`There is no angle ${clip(id, 8) || "?"} here.`);
  return a;
};
const creativeOf = (c, id) => {
  const x = (c.creatives ?? []).find((y) => y.creativeId === String(id ?? ""));
  if (!x) throw new Error(`${clip(id, 40) || "That creative"} is not one of these creatives.`);
  return x;
};

/** The editor's own hook for one angle, in their words. */
function hookCommand(c, body) {
  busy(c);
  const a = angleOf(c, body?.angle);
  if (a.picked) throw new Error(`${a.id} is already made; its hook can no longer change.`);
  const words = String(body?.words ?? "").replace(/\s+/g, " ").trim();
  if (words.length < 3) throw new Error("Write the hook first.");
  if (words.length > 160) throw new Error("Keep the hook to one short line (160 characters at most).");
  return { command: { type: "hook", data: { angle: a.id, words } }, state: c.state };
}

/** The editor's Make click on the ticked angles (a static) or on one option (a carousel), at the price shown, within the limit. */
function makeCommand(c, body) {
  busy(c);
  if (c.format === "carousel") {
    if (!["options", "review"].includes(c.state)) throw new Error("There is no carousel option to make yet. Click Refresh from server.");
    const option = (c.options ?? []).find((o) => o.id === String(body?.option ?? ""));
    if (!option) throw new Error("Pick one of the options, then click Make.");
    if (option.made) throw new Error(`${option.id} is already made.`);
    if ((option.problems ?? []).length) throw new Error(`${option.id} cannot be made as it stands. Ask Claude to write again.`);
    const limit = c.limit ?? CREATIVE_LIMIT_USD;
    if ((c.spent ?? 0) + DESIGN_USD > limit + 1e-9) throw new Error(`Making this would take the carousel over its limit of $${limit}. Ask an admin.`);
    return { command: { type: "make", data: { option: option.id } }, state: "making" };
  }
  if (!["angles", "review"].includes(c.state)) throw new Error("There is nothing to make yet. Click Refresh from server.");
  const ids = [...new Set(strings(body?.angles, 7, 8))];
  if (!ids.length) throw new Error("Tick at least one angle, then click Make.");
  const angles = ids.map((id) => angleOf(c, id));
  const made = angles.filter((a) => a.picked);
  if (made.length) throw new Error(`${made.map((a) => a.id).join(", ")} ${made.length === 1 ? "is" : "are"} already made.`);
  const held = angles.find((a) => a.problem);
  if (held) throw new Error(held.problem);
  const price = angles.reduce((n, a) => n + (Number(a.usd) || 0), 0);
  const limit = c.limit ?? CREATIVE_LIMIT_USD;
  if ((c.spent ?? 0) + price > limit + 1e-9) throw new Error(`Making these would take this creative over its limit of $${limit}. Tick fewer designed angles, or ask an admin.`);
  return { command: { type: "make", data: { angles: ids } }, state: "making" };
}

/** The editor's Approve or Reject on one creative, with their words (needed to reject) and tags. */
function decideCommand(c, body) {
  busy(c);
  const x = creativeOf(c, body?.creative);
  const decision = String(body?.decision ?? "");
  if (!["approve", "reject"].includes(decision)) throw new Error("Choose Approve or Reject.");
  if (x.state !== "ready") throw new Error(`${x.name} did not pass its automatic checks, so it cannot be approved or rejected yet. Click Fix it first.`);
  if (x.review !== "pending") throw new Error(`${x.name} has already been decided.`);
  const words = String(body?.words ?? "").trim().slice(0, 1000);
  if (decision === "reject" && !words) throw new Error("Say why you are rejecting it, so the next one is better.");
  const tags = strings(body?.tags, 5, 20).filter((t) => REVIEW_TAGS.includes(t));
  return { command: { type: "decide", data: { creative: x.creativeId, decision, words, tags } }, state: c.state };
}

/** The editor's words for a change to one creative (Claude edits it), or Fix it on one that failed its checks. */
function reviseCommand(c, body) {
  busy(c);
  const x = creativeOf(c, body?.creative);
  if (x.review === "approved" || x.review === "rejected") throw new Error(`${x.name} is already ${x.review}, which is final. Make a new creative instead.`);
  if (openSteps(c, "revise").some((s) => s.data?.creative === x.creativeId)) throw new Error(`${x.name} is already being changed. Wait for it.`);
  const words = String(body?.words ?? "").trim().slice(0, 1500);
  if (!words && x.state !== "failed") throw new Error("Say what to change, then click Revise.");
  if ((c.spent ?? 0) >= (c.limit ?? CREATIVE_LIMIT_USD)) throw new Error("This creative has reached its spending limit, so Claude cannot change it again. Ask an admin.");
  const tags = strings(body?.tags, 5, 20).filter((t) => REVIEW_TAGS.includes(t));
  return { command: { type: "revise", data: { creative: x.creativeId, words, tags } }, state: c.state };
}

/** D-056: the editor says what each unchecked photo of the property is. */
function photosCommand(c, body) {
  busy(c);
  const open = new Set((c.unchecked ?? []).map((p) => p.id));
  if (!open.size) throw new Error("This property's photos have all been checked. Click Refresh from server.");
  const list = Array.isArray(body?.photos) ? body.photos : [];
  if (!list.length || list.length > 60) throw new Error("Choose what each photo is, then save.");
  const seen = new Set();
  const photos = list.map((p) => {
    const id = clip(p?.id, 40);
    if (!open.has(id)) throw new Error(`Photo ${id || "?"} is not waiting to be checked. Click Refresh from server and check the rest.`);
    if (seen.has(id)) throw new Error(`Photo ${id} is in the list twice.`);
    seen.add(id);
    const choice = String(p?.choice ?? "");
    if (!PHOTO_CHOICES.includes(choice)) throw new Error(`Choose what photo ${id} is: a real photo, edited, an AI image, or Don't use.`);
    const alterations = String(p?.alterations ?? "").trim();
    if (choice === "enhanced" && !alterations) throw new Error(`You marked photo ${id} as edited: say what was changed in it (for example "sky replaced").`);
    return { id, choice, ...(choice === "enhanced" ? { alterations: alterations.slice(0, 300) } : {}) };
  });
  return { command: { type: "photos", data: { photos } }, state: c.state };
}

/** D-058: the editor confirms the property's new price exactly as they were shown it. */
function priceCommand(c, body) {
  busy(c);
  const waiting = c.priceChange ?? [];
  if (!waiting.length) throw new Error("There is no price change waiting to be confirmed. Click Refresh from server.");
  const list = Array.isArray(body?.expected) ? body.expected : [];
  const same = list.length === waiting.length && waiting.every((w) => list.some((e) => String(e?.factId ?? "") === w.factId && String(e?.to ?? "") === w.to));
  if (!same) throw new Error("The new numbers on this page are out of date. Click Refresh from server, check them, then confirm.");
  return { command: { type: "price", data: { changes: waiting.map((w) => ({ fact_id: w.factId, to: w.to })) } }, state: c.state };
}

/**
 * Try again on a stopped request. It carries the start's own details, so a request the server refused to open (a
 * property that was not available yet) is opened then; one already open is only tried again.
 */
/** A carousel's options written again by Claude, around the editor's own words (optional). */
function writeCommand(c, body) {
  if (c.format !== "carousel") throw new Error("Only a carousel's options are written again.");
  busy(c);
  if (!["options", "review", "failed"].includes(c.state)) throw new Error("Wait until this step has finished, then write again.");
  if ((c.spent ?? 0) >= (c.limit ?? CREATIVE_LIMIT_USD)) throw new Error("This creative has reached its spending limit, so Claude cannot write again. Ask an admin.");
  const words = String(body?.words ?? "").trim();
  if (words.length > 1000) throw new Error("Keep your idea to 1000 characters.");
  return { command: { type: "write", data: { words } }, state: "writing" };
}

function retryCommand(c) {
  if (c.state !== "failed") throw new Error("Only a stopped creative can be tried again.");
  const open = (c.commands ?? []).find((x) => x.type === "open")?.data;
  return { command: { type: "retry", ...(open ? { data: { open } } : {}) }, state: c.state };
}

const viewCommand = (c) => ({ command: { type: "view" }, state: c.state });

/** One of the server's updates, kept to what the page needs. */
function cleanCreativeUpdate(u) {
  const creativeId = String(u?.creativeId ?? "");
  if (!CREATIVE_ID.test(creativeId)) throw new Error(`"${clip(creativeId, 40)}" is not a creative id.`);
  if (!STATES.includes(u?.state)) throw new Error(`"${clip(u?.state, 20)}" is an unknown state.`);
  const has = (k) => u[k] !== undefined && u[k] !== null;
  const fields = { state: u.state, error: u.error ? clip(u.error, 4000) : null };
  if (has("notice")) fields.notice = clip(u.notice, 2000);
  if (has("answer")) fields.answer = { creativeId: clip(u.answer.creativeId, 40), text: clip(u.answer.text, 2000) };
  if (Array.isArray(u.notes)) fields.notes = strings(u.notes, 10, 600);
  if (Array.isArray(u.angles))
    fields.angles = u.angles.slice(0, 10).map((a) => ({
      id: clip(a?.id, 8),
      lane: a?.lane === "native" ? "native" : "designed",
      hook: clip(a?.hook, 300),
      hookBy: a?.hookBy ? clip(a.hookBy, 80) : null,
      direction: clip(a?.direction, 80),
      look: clip(a?.look, 300),
      photo: clip(a?.photo, 40),
      photoSlot: SLOT.test(String(a?.photoSlot ?? "")) ? a.photoSlot : null,
      figures: strings(a?.figures, 8, 60),
      usd: Number(a?.usd) || 0,
      picked: a?.picked === true,
      creativeId: a?.creativeId ? clip(a.creativeId, 40) : null,
      note: clip(a?.note, 600),
      warnings: strings(a?.warnings, 5, 400),
      problem: a?.problem ? clip(a.problem, 400) : null,
    }));
  if (Array.isArray(u.creatives))
    fields.creatives = u.creatives.slice(0, 40).map((x) => ({
      creativeId: clip(x?.creativeId, 40),
      name: clip(x?.name, 40),
      angleId: x?.angleId ? clip(x.angleId, 8) : null,
      state: x?.state === "failed" ? "failed" : "ready",
      review: ["pending", "approved", "revision_requested", "rejected"].includes(x?.review) ? x.review : "pending",
      slides: (Array.isArray(x?.slides) ? x.slides : []).slice(0, 20).map((s) => ({ number: Number(s?.number) || 0, slot: SLOT.test(String(s?.slot ?? "")) ? s.slot : null })),
      width: Number(x?.width) || 1080,
      height: Number(x?.height) || 1350,
      errors: strings(x?.errors, 10, 600),
      warnings: strings(x?.warnings, 10, 600),
      hook: { text: clip(x?.hook?.text, 300), live: x?.hook?.live === true, note: x?.hook?.note ? clip(x.hook.note, 400) : null },
      history: (Array.isArray(x?.history) ? x.history : []).slice(-20).map((h) => ({ action: clip(h?.action, 30), by: clip(h?.by, 80), at: clip(h?.at, 40), note: h?.note ? clip(h.note, 600) : null })),
    }));
  if (Array.isArray(u.options))
    fields.options = u.options.slice(0, 3).map((o) => ({
      id: ["O1", "O2", "O3"].includes(o?.id) ? o.id : "O1",
      title: clip(o?.title, 120),
      why: clip(o?.why, 600),
      architecture: clip(o?.architecture, 40),
      hook: clip(o?.hook, 300),
      hookApproved: o?.hookApproved === true,
      photoSlot: SLOT.test(String(o?.photoSlot ?? "")) ? o.photoSlot : null,
      slides: (Array.isArray(o?.slides) ? o.slides : []).slice(0, 8).map((s) => ({ role: clip(s?.role, 30), text: clip(s?.text, 300), facts: Number(s?.facts) || 0 })),
      problems: strings(o?.problems, 10, 600),
      made: o?.made === true,
    }));
  if (Array.isArray(u.ideas)) fields.ideas = u.ideas.slice(-10).map((i) => ({ words: clip(i?.words, 1000), by: clip(i?.by, 80), at: clip(i?.at, 40) }));
  if (Array.isArray(u.unchecked)) fields.unchecked = u.unchecked.slice(0, 60).map((p) => ({ id: clip(p?.id, 40), slot: SLOT.test(String(p?.slot ?? "")) ? p.slot : null }));
  if (has("usablePhotos")) fields.usablePhotos = Number(u.usablePhotos) || 0;
  if (Array.isArray(u.priceChange)) fields.priceChange = u.priceChange.slice(0, 10).map((p) => ({ label: clip(p?.label, 80), factId: clip(p?.factId, 80), from: clip(p?.from, 80), to: clip(p?.to, 80) }));
  if (has("spent")) fields.spent = Number(u.spent) || 0;
  if (has("limit")) fields.limit = Number(u.limit) || CREATIVE_LIMIT_USD;
  if (u.buyer && typeof u.buyer === "object") fields.buyer = { icpId: clip(u.buyer.icpId, 40), stage: clip(u.buyer.stage, 40), label: clip(u.buyer.label, 120) };
  return { creativeId, fields };
}

function cleanCreativeUpdates(list) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list) || list.length > 200) throw new Error("Send the updates as a list.");
  return list.map(cleanCreativeUpdate);
}

function cleanCreativeSlot(slot) {
  const s = String(slot ?? "");
  if (!SLOT.test(s)) throw new Error(`"${clip(s, 100)}" is not a file slot.`);
  return s;
}

module.exports = { CREATIVE_LIMIT_USD, REVIEW_TAGS, cleanCreativeStart, actProblem, hookCommand, makeCommand, writeCommand, decideCommand, reviseCommand, photosCommand, priceCommand, retryCommand, viewCommand, cleanCreativeUpdate, cleanCreativeUpdates, cleanCreativeSlot };
