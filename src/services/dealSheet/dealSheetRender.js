// services/dealSheet/dealSheetRender.js
//
// Turns a deal sheet's data into the PDF and stores it on Cloudinary.
//
// The PDF is printed by headless Chromium on the WEBSITE (vihara-next app/api/deal-sheet/render, on Vercel), not
// here: Chrome inside this Render process hit the 512 MB plan limit and took the whole backend down (16 Oct 2026).
// The website route takes the data, loads the same template as vihara.ai/s/<token>, and returns the PDF bytes.
//
// ENV: DEAL_SHEET_RENDER_SECRET  shared with the website (required; without it nothing is rendered)
//      DEAL_SHEET_RENDER_URL     default <PUBLIC_SITE_URL>/api/deal-sheet/render
const axios = require("axios");
const cloudinary = require("cloudinary").v2;
const { getSiteUrl } = require("../../config/siteUrls");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const renderUrl = () => process.env.DEAL_SHEET_RENDER_URL || `${getSiteUrl()}/api/deal-sheet/render`;

/** The PDF bytes for this sheet. Throws with a readable reason. */
async function renderPdf(sheet, { timeoutMs = 55000 } = {}) {
  const secret = process.env.DEAL_SHEET_RENDER_SECRET;
  if (!secret) throw new Error("DEAL_SHEET_RENDER_SECRET is not set");
  const res = await axios.post(renderUrl(), { sheet }, {
    headers: { "x-deal-sheet-secret": secret, "Content-Type": "application/json" },
    responseType: "arraybuffer",
    timeout: timeoutMs,
    validateStatus: () => true,
  });
  const buf = Buffer.from(res.data || []);
  if (res.status !== 200) throw new Error(`render returned ${res.status}: ${buf.toString("utf8").slice(0, 200)}`);
  if (buf.length < 1000 || buf.slice(0, 4).toString() !== "%PDF") throw new Error("render did not return a PDF");
  return buf;
}

/** Upload the PDF; returns its https URL. Stored as a raw file (Cloudinary blocks PDF delivery as images by default). */
async function storePdf(buf, { token, version }) {
  const result = await cloudinary.uploader.upload(`data:application/pdf;base64,${buf.toString("base64")}`, {
    resource_type: "raw",
    folder: "vihara/deal-sheets",
    public_id: `${token}-v${version}.pdf`,
    overwrite: true,
  });
  return result.secure_url;
}

module.exports = { renderPdf, storePdf };
