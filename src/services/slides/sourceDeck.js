// services/slides/sourceDeck.js
//
// Reads a deck the admin wants restyled into the Vihara design:
//   a Google Slides link → read it directly (the connected account must be able to open it);
//   a .pptx upload → converted to Google Slides in the connected Drive, read, then deleted.
// For each slide we keep a picture of it (many decks are pictures of slides,
// with no real text), whatever text it has, and its speaker notes.
const { getAuthorizedClient } = require("./googleAuthService");
const { SlidesError, call, SLIDES_API, DRIVE_API } = require("./slidesBuilder");

const MAX_SOURCE_SLIDES = Number(process.env.SLIDES_RESTYLE_MAX_SLIDES) || 25;
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

async function connected() {
  const client = await getAuthorizedClient();
  if (!client) throw new SlidesError("Google is not connected. Connect Google in the Slides Agent tab first.");
  return client;
}

// The presentation id from a Google Slides link, or null.
function presentationIdFromUrl(url) {
  const m = String(url || "").match(/docs\.google\.com\/presentation\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]{20,})/);
  return m ? m[1] : null;
}

// Clear wording for the two ways opening someone else's deck usually fails.
async function openable(client, presentationId) {
  try {
    return (await client.request({ url: `${SLIDES_API}/${presentationId}?fields=title,slides(objectId)` })).data;
  } catch (e) {
    const status = e.response?.status;
    if (status === 403 || status === 404) {
      throw new SlidesError("The connected Google account can't open this deck. Share it with that account (or set the link to \"Anyone with the link can view\") and try again.");
    }
    if (status === 400) throw new SlidesError("That link isn't a Google Slides deck. If it's a PowerPoint file, upload the .pptx instead.");
    throw new SlidesError(`Google Slides error: ${e.response?.data?.error?.message || e.message}`);
  }
}

/**
 * Checks a deck can be read and isn't too long, before a job is started.
 * @returns {Promise<{ title: string, slideCount: number }>}
 */
async function checkSource(presentationId) {
  const client = await connected();
  const pres = await openable(client, presentationId);
  const slideCount = (pres.slides || []).length;
  if (!slideCount) throw new SlidesError("This deck has no slides.");
  if (slideCount > MAX_SOURCE_SLIDES) throw new SlidesError(`This deck has ${slideCount} slides; the most the agent can restyle at once is ${MAX_SOURCE_SLIDES}.`);
  return { title: pres.title || "Untitled deck", slideCount };
}

/**
 * Uploads a .pptx into the connected Drive as a Google Slides file (to read it).
 * @returns {Promise<string>} the new presentation's id; delete it with removeTemporary() when done
 */
async function importPptx(buffer, fileName) {
  const client = await connected();
  const boundary = `vihara${Date.now()}`;
  const meta = JSON.stringify({ name: `[temp] ${fileName || "Uploaded deck"}`.slice(0, 120), mimeType: "application/vnd.google-apps.presentation" });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${PPTX_MIME}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const file = await call(client, {
    url: `${DRIVE_API.replace("/drive/v3", "/upload/drive/v3")}?uploadType=multipart&fields=id`,
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  return file.id;
}

async function removeTemporary(presentationId) {
  const client = await connected();
  await call(client, { url: `${DRIVE_API}/${presentationId}?supportsAllDrives=true`, method: "DELETE" }).catch((e) =>
    console.warn(`Slides: could not delete temporary upload ${presentationId}: ${e.message}`)
  );
}

const textOf = (shape) =>
  (shape?.text?.textElements || [])
    .map((t) => t.textRun?.content || "")
    .join("")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Everything the agent needs to rebuild a deck: per slide, a PNG of the slide,
 * its text and its speaker notes.
 * @returns {Promise<{ title: string, slides: { text: string, notes: string, image: string }[] }>} image is base64 PNG
 */
async function readSourceDeck(presentationId, { onStep = () => {} } = {}) {
  const client = await connected();
  await openable(client, presentationId);
  const fields =
    "title,slides(objectId,pageElements(shape(text(textElements(textRun(content))))),slideProperties(notesPage(notesProperties(speakerNotesObjectId),pageElements(objectId,shape(text(textElements(textRun(content))))))))";
  const pres = await call(client, { url: `${SLIDES_API}/${presentationId}?fields=${encodeURIComponent(fields)}` });

  const slides = [];
  for (const [i, s] of (pres.slides || []).entries()) {
    onStep(`Reading slide ${i + 1} of ${pres.slides.length}`);
    const text = (s.pageElements || []).map((e) => textOf(e.shape)).filter(Boolean).join(" | ");
    const notesPage = s.slideProperties?.notesPage;
    const notesId = notesPage?.notesProperties?.speakerNotesObjectId;
    const notes = textOf(notesPage?.pageElements?.find((e) => e.objectId === notesId)?.shape);
    const thumb = await call(client, {
      url: `${SLIDES_API}/${presentationId}/pages/${s.objectId}/thumbnail?thumbnailProperties.thumbnailSize=LARGE&thumbnailProperties.mimeType=PNG`,
    });
    const png = await client.request({ url: thumb.contentUrl, responseType: "arraybuffer" });
    slides.push({ text, notes, image: Buffer.from(png.data).toString("base64") });
  }
  return { title: pres.title || "Untitled deck", slides };
}

module.exports = { presentationIdFromUrl, checkSource, importPptx, removeTemporary, readSourceDeck, MAX_SOURCE_SLIDES };
