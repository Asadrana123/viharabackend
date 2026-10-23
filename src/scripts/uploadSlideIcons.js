// scripts/uploadSlideIcons.js
//
// Uploads the Slides agent's icons (config/slideIcons.js) to Cloudinary, once.
// Each icon is Phosphor's SVG in one weight, made solid black so the colour can be
// set in the URL (see iconUrl). Icons already on Cloudinary are skipped, so
// re-running after adding names only uploads the new ones.
//
//   node src/scripts/uploadSlideIcons.js          (the weight in use, ICON_WEIGHT)
//   node src/scripts/uploadSlideIcons.js bold     (another weight)
//
// Env: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
require("dotenv").config();
const axios = require("axios");
const cloudinary = require("cloudinary").v2;
const { ICON_NAMES, ICON_WEIGHT, PHOSPHOR_VERSION, folderFor } = require("../config/slideIcons");

const WEIGHT = process.argv[2] || ICON_WEIGHT;
const ICON_FOLDER = folderFor(WEIGHT);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const svgUrl = (name) => `https://unpkg.com/@phosphor-icons/core@${PHOSPHOR_VERSION}/assets/${WEIGHT}/${name}-${WEIGHT}.svg`;

async function existing() {
  const ids = new Set();
  let next;
  do {
    const res = await cloudinary.api.resources({ type: "upload", prefix: `${ICON_FOLDER}/`, max_results: 500, next_cursor: next });
    res.resources.forEach((r) => ids.add(r.public_id));
    next = res.next_cursor;
  } while (next);
  return ids;
}

(async () => {
  const have = await existing();
  const todo = ICON_NAMES.filter((n) => !have.has(`${ICON_FOLDER}/${n}`));
  console.log(`${WEIGHT}: ${ICON_NAMES.length} icons, ${have.size} already uploaded, ${todo.length} to upload`);

  const failed = [];
  for (const name of todo) {
    try {
      const { data: svg } = await axios.get(svgUrl(name), { responseType: "text" });
      const solid = svg.replace(/currentColor/g, "#000000");
      await cloudinary.uploader.upload(`data:image/svg+xml;base64,${Buffer.from(solid).toString("base64")}`, {
        public_id: name,
        folder: ICON_FOLDER,
        overwrite: false,
        resource_type: "image",
      });
      process.stdout.write(".");
    } catch (e) {
      failed.push(`${name} (${e.response?.status || e.message})`);
    }
  }
  console.log(`\ndone. ${failed.length ? `Failed: ${failed.join(", ")}` : "No failures."}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
