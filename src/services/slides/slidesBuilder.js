// services/slides/slidesBuilder.js
//
// Turns a deck plan into a real Google Slides file:
//   copy the Vihara template → add one slide per planned slide on its layout →
//   fill the placeholders → add speaker notes → remove the template's sample slides →
//   share with the admin who asked.
//
// Each layout's text boxes are told apart by position (left/right, top/bottom),
// not by placeholder index, because the indexes change when the template is
// re-imported into Google Slides.
const { getAuthorizedClient } = require("./googleAuthService");

const SLIDES_API = "https://slides.googleapis.com/v1/presentations";
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";

class SlidesError extends Error {}

async function call(client, opts) {
  try {
    return (await client.request(opts)).data;
  } catch (e) {
    const status = e.response?.status;
    const reason = e.response?.data?.error?.message || e.message;
    if (e.message?.includes("invalid_grant") || status === 401) {
      throw new SlidesError("The Google connection has expired. Reconnect Google in the Slides Agent tab and try again.");
    }
    if (status === 404) throw new SlidesError("The Vihara template deck was not found in the connected Google account. Check GOOGLE_SLIDES_TEMPLATE_ID.");
    throw new SlidesError(`Google Slides error: ${reason}`);
  }
}

const pos = (el) => ({ x: el.transform?.translateX || 0, y: el.transform?.translateY || 0 });
const byX = (a, b) => pos(a).x - pos(b).x;
const byY = (a, b) => pos(a).y - pos(b).y;

// layout name → { layoutId, slots: { field → layout placeholder objectId } }
function mapLayouts(presentation) {
  const out = {};
  for (const layout of presentation.layouts || []) {
    const name = layout.layoutProperties?.displayName;
    const ph = (layout.pageElements || []).filter((el) => el.shape?.placeholder);
    const ofType = (t) => ph.filter((el) => el.shape.placeholder.type === t);
    const title = ofType("TITLE")[0]?.objectId;
    const bodies = ofType("BODY");
    const slots = { title };

    if (name === "VIHARA_TITLE" || name === "VIHARA_CLOSING") slots.subtitle = bodies[0]?.objectId;
    if (name === "VIHARA_SECTION") slots.sectionNumber = bodies[0]?.objectId;
    if (name === "VIHARA_CONTENT") slots.bullets = bodies[0]?.objectId;
    if (name === "VIHARA_IMAGE_TEXT") {
      const [left, right] = [...bodies].sort(byX);
      slots.body = left?.objectId;
      slots.callout = right?.objectId;
    }
    if (name === "VIHARA_STATS") {
      // 4 columns, each a number (top) over a label (bottom).
      const sorted = [...bodies].sort((a, b) => byX(a, b) || byY(a, b));
      for (let i = 0; i < 4; i++) {
        const [value, label] = sorted.slice(i * 2, i * 2 + 2).sort(byY);
        slots[`stat${i}`] = value?.objectId;
        slots[`statLabel${i}`] = label?.objectId;
      }
    }
    if (name?.startsWith("VIHARA_")) out[name] = { layoutId: layout.objectId, slots };
  }
  return out;
}

// The text that goes in each slot of one planned slide.
function slotTexts(s) {
  const t = { title: s.title, subtitle: s.subtitle, sectionNumber: s.sectionNumber, body: s.body, callout: s.callout };
  if (s.layout === "VIHARA_CONTENT") t.bullets = (s.bullets || []).join("\n");
  if (s.layout === "VIHARA_STATS") {
    (s.stats || []).forEach((st, i) => {
      t[`stat${i}`] = st.value;
      t[`statLabel${i}`] = st.label;
    });
  }
  return t;
}

const hexToRgb = (hex) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
};

/**
 * @param {{ deckTitle: string, slides: object[] }} plan  checked by deckPlanner
 * @param {{ shareWith?: string, primaryColor?: string, onStep?: (s: string) => void }} opts
 * @returns {Promise<{ presentationId: string, url: string }>}
 */
async function buildDeck(plan, { shareWith, primaryColor = "#0c4bea", onStep = () => {} } = {}) {
  const client = await getAuthorizedClient();
  if (!client) throw new SlidesError("Google is not connected. Connect Google in the Slides Agent tab first.");
  const templateId = process.env.GOOGLE_SLIDES_TEMPLATE_ID;
  if (!templateId) throw new SlidesError("GOOGLE_SLIDES_TEMPLATE_ID is not set.");

  onStep("Copying the Vihara template");
  const copy = await call(client, {
    url: `${DRIVE_API}/${templateId}/copy?fields=id&supportsAllDrives=true`,
    method: "POST",
    data: { name: plan.deckTitle.slice(0, 120) || "Vihara deck" },
  });
  const id = copy.id;

  const fields = "layouts(objectId,layoutProperties(displayName),pageElements(objectId,transform,shape(placeholder))),slides(objectId)";
  const pres = await call(client, { url: `${SLIDES_API}/${id}?fields=${encodeURIComponent(fields)}` });
  const layouts = mapLayouts(pres);
  const missing = [...new Set(plan.slides.map((s) => s.layout))].filter((l) => !layouts[l]);
  if (missing.length) throw new SlidesError(`The template is missing layout(s): ${missing.join(", ")}`);

  onStep("Adding the slides");
  const requests = [];
  plan.slides.forEach((s, i) => {
    const { layoutId, slots } = layouts[s.layout];
    const texts = slotTexts(s);
    const filled = Object.entries(slots).filter(([field, phId]) => phId && texts[field]);
    const objId = (field) => `vs${i}_${field}`;

    requests.push({
      createSlide: {
        objectId: `vs${i}_slide`,
        insertionIndex: i,
        slideLayoutReference: { layoutId },
        placeholderIdMappings: filled.map(([field, phId]) => ({ layoutPlaceholderObjectId: phId, objectId: objId(field) })),
      },
    });
    for (const [field] of filled) {
      requests.push({ insertText: { objectId: objId(field), text: texts[field], insertionIndex: 0 } });
      // Google's import centres titles; Vihara slides are left-aligned (only the callout panel is centred).
      if (field !== "callout") {
        requests.push({ updateParagraphStyle: { objectId: objId(field), textRange: { type: "ALL" }, style: { alignment: "START" }, fields: "alignment" } });
      }
    }

    if (s.layout === "VIHARA_CONTENT" && texts.bullets) {
      requests.push({ createParagraphBullets: { objectId: objId("bullets"), textRange: { type: "ALL" }, bulletPreset: "BULLET_DISC_CIRCLE_SQUARE" } });
    }
    // The right-hand panel was an image box in the template, so its text has no style of its own.
    if (s.layout === "VIHARA_IMAGE_TEXT" && texts.callout) {
      requests.push({
        updateTextStyle: {
          objectId: objId("callout"),
          textRange: { type: "ALL" },
          style: { fontSize: { magnitude: 22, unit: "PT" }, bold: true, foregroundColor: { opaqueColor: { rgbColor: hexToRgb(primaryColor) } } },
          fields: "fontSize,bold,foregroundColor",
        },
      });
      requests.push({ updateParagraphStyle: { objectId: objId("callout"), textRange: { type: "ALL" }, style: { alignment: "CENTER" }, fields: "alignment" } });
      requests.push({ updateShapeProperties: { objectId: objId("callout"), shapeProperties: { contentAlignment: "MIDDLE" }, fields: "contentAlignment" } });
    }
  });
  // The template's own sample slides go last, once the new slides exist.
  for (const s of pres.slides || []) requests.push({ deleteObject: { objectId: s.objectId } });
  await call(client, { url: `${SLIDES_API}/${id}:batchUpdate`, method: "POST", data: { requests } });

  onStep("Writing speaker notes");
  const notesFields = "slides(objectId,slideProperties(notesPage(notesProperties(speakerNotesObjectId))))";
  const built = await call(client, { url: `${SLIDES_API}/${id}?fields=${encodeURIComponent(notesFields)}` });
  const noteRequests = [];
  plan.slides.forEach((s, i) => {
    const slide = built.slides?.find((x) => x.objectId === `vs${i}_slide`);
    const notesId = slide?.slideProperties?.notesPage?.notesProperties?.speakerNotesObjectId;
    if (notesId && s.speakerNotes?.trim()) noteRequests.push({ insertText: { objectId: notesId, text: s.speakerNotes.trim(), insertionIndex: 0 } });
  });
  if (noteRequests.length) await call(client, { url: `${SLIDES_API}/${id}:batchUpdate`, method: "POST", data: { requests: noteRequests } });

  if (shareWith) {
    // The deck lives in the connected account's Drive; give the admin who asked edit access too.
    await call(client, {
      url: `${DRIVE_API}/${id}/permissions?sendNotificationEmail=false&supportsAllDrives=true`,
      method: "POST",
      data: { type: "user", role: "writer", emailAddress: shareWith },
    }).catch((e) => console.warn(`Slides: could not share deck ${id} with ${shareWith}: ${e.message}`));
  }

  return { presentationId: id, url: `https://docs.google.com/presentation/d/${id}/edit` };
}

module.exports = { buildDeck, SlidesError, mapLayouts };
