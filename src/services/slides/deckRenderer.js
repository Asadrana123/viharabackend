// services/slides/deckRenderer.js
//
// Turns a visual plan (slides with a `type` from slideTypes.js) into Google Slides.
//   buildVisualDeck: copy the Vihara template → one slide per planned slide →
//     template types fill the template's placeholders; drawn types put the title
//     in the template's title box and draw the rest (cards, badges, icons…) →
//     speaker notes → remove the template's sample slides → share with the admin.
//   updateVisualDeck: apply a changed plan to the same file, rebuilding only the
//     slides that changed.
const { getAuthorizedClient } = require("./googleAuthService");
const { SlidesError, mapLayouts, call, SLIDES_API, DRIVE_API } = require("./slidesBuilder");
const { TYPES } = require("./slideTypes");
const { Canvas, palette } = require("./slideDesign");

const leftAlign = (objectId) => ({
  updateParagraphStyle: { objectId, textRange: { type: "ALL" }, style: { alignment: "START" }, fields: "alignment" },
});

// Draws a layout's elements on the slide, resolving colour names to the palette.
function draw(canvas, ops) {
  const c = canvas.c;
  const col = (k) => (k ? c[k] || k : undefined);
  for (const o of ops) {
    if (o.op === "shape") canvas.shape(o.type, o.x, o.y, o.w, o.h, { fill: col(o.fill), outline: col(o.outline) });
    else if (o.op === "badge") canvas.iconBadge(o.icon, o.x, o.y, o.d, { fill: col(o.fill || "primarySoft"), color: col(o.color || "primary"), scale: o.scale });
    else if (o.op === "icon") canvas.icon(o.name, o.x, o.y, o.s, col(o.color));
    else if (o.op === "text") {
      const runs = o.runs ? o.runs.map((r) => ({ ...r, color: col(r.color) })) : o.text;
      canvas.text(o.x, o.y, o.w, o.h, runs, { ...o, color: col(o.color) });
    }
  }
}

// Requests for one slide, with Google object id `slideId` (≥ 5 characters).
// insertionIndex: where it goes; undefined = at the end.
function slideRequests(s, slideId, insertionIndex, layouts, colors) {
  const t = TYPES[s.type];
  const requests = [];
  const ph = (field) => `${slideId}_${field}`;
  const at = insertionIndex === undefined ? {} : { insertionIndex };

  if (t.template) {
    const { layoutId, slots } = layouts[t.template];
    const texts = {
      title: s.title,
      subtitle: s.subtitle,
      sectionNumber: s.number,
      bullets: (s.bullets || []).join("\n"),
    };
    // Overlay types draw their own text, so the template's boxes are created then removed.
    const filled = Object.entries(slots).filter(([f, id]) => id && texts[f]);
    const drawnHere = t.overlay ? filled.map(([f]) => f) : [];
    requests.push({
      createSlide: {
        objectId: slideId,
        ...at,
        slideLayoutReference: { layoutId },
        placeholderIdMappings: filled.map(([f, id]) => ({ layoutPlaceholderObjectId: id, objectId: ph(f) })),
      },
    });
    for (const [f] of filled) {
      if (drawnHere.includes(f)) requests.push({ deleteObject: { objectId: ph(f) } });
      else requests.push({ insertText: { objectId: ph(f), text: texts[f], insertionIndex: 0 } }, leftAlign(ph(f)));
    }
    if (s.type === "bullets") {
      requests.push({ createParagraphBullets: { objectId: ph("bullets"), textRange: { type: "ALL" }, bulletPreset: "BULLET_DISC_CIRCLE_SQUARE" } });
    }
    if (t.overlay) {
      const canvas = new Canvas(slideId, colors);
      draw(canvas, t.overlay(s));
      requests.push(...canvas.requests);
    }
    return requests;
  }

  // Drawn: the template's content layout gives the header, logo and title box.
  const { layoutId, slots } = layouts.VIHARA_CONTENT;
  requests.push({
    createSlide: {
      objectId: slideId,
      ...at,
      slideLayoutReference: { layoutId },
      placeholderIdMappings: [
        { layoutPlaceholderObjectId: slots.title, objectId: ph("title") },
        { layoutPlaceholderObjectId: slots.bullets, objectId: ph("unused") },
      ],
    },
  });
  requests.push({ insertText: { objectId: ph("title"), text: s.title, insertionIndex: 0 } }, leftAlign(ph("title")));
  requests.push({ deleteObject: { objectId: ph("unused") } }); // the bullet box; drawn slides don't use it
  const canvas = new Canvas(slideId, colors);
  draw(canvas, t.layout(s));
  requests.push(...canvas.requests);
  return requests;
}

async function connected() {
  const client = await getAuthorizedClient();
  if (!client) throw new SlidesError("Google is not connected. Connect Google in the Slides Agent tab first.");
  return client;
}

const batch = (client, id, requests) =>
  requests.length ? call(client, { url: `${SLIDES_API}/${id}:batchUpdate`, method: "POST", data: { requests } }) : null;

async function loadLayouts(client, id, slides) {
  const fields = "layouts(objectId,layoutProperties(displayName),pageElements(objectId,transform,shape(placeholder))),slides(objectId)";
  const pres = await call(client, { url: `${SLIDES_API}/${id}?fields=${encodeURIComponent(fields)}` });
  const layouts = mapLayouts(pres);
  const needed = new Set(["VIHARA_CONTENT", ...slides.map((s) => TYPES[s.type]?.template).filter(Boolean)]);
  const missing = [...needed].filter((l) => !layouts[l]);
  if (missing.length) throw new SlidesError(`The template is missing layout(s): ${missing.join(", ")}`);
  return { layouts, existingIds: (pres.slides || []).map((s) => s.objectId) };
}

// Sets the speaker notes of the given slides ([{ slideId, text }]), replacing what's there.
async function writeNotes(client, id, entries) {
  if (!entries.length) return;
  const fields = "slides(objectId,slideProperties(notesPage(notesProperties(speakerNotesObjectId),pageElements(objectId,shape(text(textElements(endIndex)))))))";
  const pres = await call(client, { url: `${SLIDES_API}/${id}?fields=${encodeURIComponent(fields)}` });
  const requests = [];
  for (const { slideId, text } of entries) {
    const notes = pres.slides?.find((x) => x.objectId === slideId)?.slideProperties?.notesPage;
    const notesId = notes?.notesProperties?.speakerNotesObjectId;
    if (!notesId) continue;
    const shape = notes.pageElements?.find((e) => e.objectId === notesId)?.shape;
    const length = Math.max(0, ...(shape?.text?.textElements || []).map((e) => e.endIndex || 0));
    // A text box always ends with one "\n" that can't be deleted.
    if (length > 1) requests.push({ deleteText: { objectId: notesId, textRange: { type: "ALL" } } });
    if (text?.trim()) requests.push({ insertText: { objectId: notesId, text: text.trim(), insertionIndex: 0 } });
  }
  await batch(client, id, requests);
}

/**
 * A new deck from a plan checked by deckPlanner.
 * @param {{ deckTitle: string, slides: object[] }} plan
 * @param {{ shareWith?: string, kitColors?: object, onStep?: (s: string) => void }} opts
 * @returns {Promise<{ presentationId: string, url: string, slideIds: string[] }>}
 */
async function buildVisualDeck(plan, { shareWith, kitColors, onStep = () => {} } = {}) {
  const client = await connected();
  const templateId = process.env.GOOGLE_SLIDES_TEMPLATE_ID;
  if (!templateId) throw new SlidesError("GOOGLE_SLIDES_TEMPLATE_ID is not set.");
  const colors = palette(kitColors);

  onStep("Copying the Vihara template");
  const { id } = await call(client, {
    url: `${DRIVE_API}/${templateId}/copy?fields=id&supportsAllDrives=true`,
    method: "POST",
    data: { name: plan.deckTitle.slice(0, 120) || "Vihara deck" },
  });
  const { layouts, existingIds } = await loadLayouts(client, id, plan.slides);

  onStep("Designing the slides");
  const slideIds = plan.slides.map((_, i) => `slide${String(i).padStart(2, "0")}`);
  const requests = plan.slides.flatMap((s, i) => slideRequests(s, slideIds[i], i, layouts, colors));
  // The template's own sample slides go last, once the new slides exist.
  for (const sid of existingIds) requests.push({ deleteObject: { objectId: sid } });
  await batch(client, id, requests);

  onStep("Writing speaker notes");
  await writeNotes(client, id, plan.slides.map((s, i) => ({ slideId: slideIds[i], text: s.speakerNotes })));

  if (shareWith) {
    // The deck lives in the connected account's Drive; give the admin who asked edit access too.
    await call(client, {
      url: `${DRIVE_API}/${id}/permissions?sendNotificationEmail=false&supportsAllDrives=true`,
      method: "POST",
      data: { type: "user", role: "writer", emailAddress: shareWith },
    }).catch((e) => console.warn(`Slides: could not share deck ${id} with ${shareWith}: ${e.message}`));
  }

  return { presentationId: id, url: `https://docs.google.com/presentation/d/${id}/edit`, slideIds };
}

// A slide's content without its speaker notes, with keys sorted, for comparing.
function slideKey(s) {
  const { speakerNotes, ...rest } = s;
  const sort = (v) => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])]));
    return typeof v === "string" ? v.trim() : v;
  };
  return JSON.stringify(sort(rest));
}

/**
 * Applies a changed plan to an existing deck, in the same file: slides whose
 * content didn't change are kept as they are (with any edits made in Google
 * Slides); changed and new slides are rebuilt; removed ones are deleted.
 * @param {{ presentationId: string, oldSlides: object[], oldSlideIds: string[], oldTitle: string,
 *           plan: { deckTitle: string, slides: object[] }, revision: number, kitColors?: object, onStep?: (s: string) => void }} input
 * @returns {Promise<{ slideIds: string[], changedSlides: number[], removedCount: number }>}
 */
async function updateVisualDeck({ presentationId: id, oldSlides, oldSlideIds, oldTitle, plan, revision, kitColors, onStep = () => {} }) {
  const client = await connected();
  const colors = palette(kitColors);
  const { layouts, existingIds } = await loadLayouts(client, id, plan.slides);
  const present = new Set(existingIds);

  // Walk the new plan in order, keeping each old slide that's unchanged and still in the file.
  const oldKeys = oldSlides.map(slideKey);
  const used = new Set();
  let from = 0;
  const slideIds = [];
  const changedSlides = [];
  const keptNotes = [];
  const requests = [];
  plan.slides.forEach((s, j) => {
    const key = slideKey(s);
    let k = -1;
    for (let i = from; i < oldSlides.length; i++) {
      if (!used.has(i) && oldKeys[i] === key && present.has(oldSlideIds[i])) {
        k = i;
        break;
      }
    }
    if (k >= 0) {
      used.add(k);
      from = k + 1;
      slideIds.push(oldSlideIds[k]);
      if ((oldSlides[k].speakerNotes || "").trim() !== (s.speakerNotes || "").trim()) keptNotes.push({ slideId: oldSlideIds[k], text: s.speakerNotes });
      return;
    }
    const newId = `r${revision}s${String(j).padStart(2, "0")}`;
    slideIds.push(newId);
    changedSlides.push(j + 1);
    requests.push(...slideRequests(s, newId, undefined, layouts, colors));
  });
  const removed = oldSlideIds.filter((sid, i) => !used.has(i) && present.has(sid));
  for (const sid of removed) requests.push({ deleteObject: { objectId: sid } });
  // Put every slide of the plan in its place, one move at a time.
  slideIds.forEach((sid, k) => requests.push({ updateSlidesPosition: { slideObjectIds: [sid], insertionIndex: k } }));

  onStep(changedSlides.length ? `Rebuilding ${changedSlides.length} slide${changedSlides.length === 1 ? "" : "s"}` : "Updating the deck");
  await batch(client, id, requests);

  onStep("Writing speaker notes");
  const newNotes = changedSlides.map((n) => ({ slideId: slideIds[n - 1], text: plan.slides[n - 1].speakerNotes }));
  await writeNotes(client, id, [...newNotes, ...keptNotes]);

  if (plan.deckTitle && plan.deckTitle !== oldTitle) {
    await call(client, { url: `${DRIVE_API}/${id}?supportsAllDrives=true`, method: "PATCH", data: { name: plan.deckTitle.slice(0, 120) } }).catch(() => {});
  }
  return { slideIds, changedSlides, removedCount: removed.length };
}

module.exports = { buildVisualDeck, updateVisualDeck };
