// services/slides/slidesBuilder.js
//
// Google Slides / Drive helpers shared by the deck renderer (deckRenderer.js):
// API calls with plain-language errors, and finding the Vihara template's
// layouts and their text boxes.
//
// Each layout's text boxes are told apart by position (left/right, top/bottom),
// not by placeholder index, because the indexes change when the template is
// re-imported into Google Slides.
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

module.exports = { SlidesError, mapLayouts, call, SLIDES_API, DRIVE_API };
