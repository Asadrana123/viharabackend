// services/slides/sourceImages.js
//
// Pictures of a restyled deck's source slides, kept on Cloudinary so the new
// deck can reuse parts of them (screenshots, photos): a slide picture is
// uploaded once per deck, and a crop of it is just a Cloudinary URL that
// Google Slides fetches. They stay for the deck's later changes too.
//
// Env: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
const cloudinary = require("cloudinary").v2;

const folderFor = (deckId) => `vihara-slides/decks/${deckId}`;
const publicId = (deckId, slideNo) => `${folderFor(deckId)}/source-${slideNo}`;

function configure() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

/**
 * Uploads a picture of every source slide (base64 PNGs, in order).
 * @returns {Promise<{ count: number, width: number, height: number }>} the pictures' size (all the same)
 */
async function uploadSourceSlides(deckId, images) {
  configure();
  let size = { width: 1600, height: 900 };
  // A few at a time: quick, without flooding Cloudinary.
  for (let i = 0; i < images.length; i += 4) {
    const batch = images.slice(i, i + 4).map((data, k) =>
      cloudinary.uploader.upload(`data:image/png;base64,${data}`, { public_id: `source-${i + k + 1}`, folder: folderFor(deckId), overwrite: true, resource_type: "image" })
    );
    const done = await Promise.all(batch);
    size = { width: done[0].width, height: done[0].height };
  }
  return { count: images.length, ...size };
}

/**
 * Public URL of part of a source slide picture.
 * @param {{ deckId: string, width: number, height: number }} src  from uploadSourceSlides
 * @param {{ slide: number, box: number[] }} im  slide is 1-based; box is [left, top, right, bottom] in 0-1
 */
function cropUrl(src, im) {
  const [x0, y0, x1, y1] = im.box;
  const px = (v, total) => Math.max(0, Math.min(total, Math.round(v * total)));
  const x = px(x0, src.width);
  const y = px(y0, src.height);
  return cloudinary.url(publicId(src.deckId, im.slide), {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    secure: true,
    format: "png",
    transformation: [{ crop: "crop", x, y, width: Math.max(1, px(x1, src.width) - x), height: Math.max(1, px(y1, src.height) - y) }],
  });
}

module.exports = { uploadSourceSlides, cropUrl };
