// services/adsLoop/creativeRender.js
//
// Claude's HTML/CSS -> PNG -> public Cloudinary URL.
//
// The HTML goes inside our own page shell: Brand Kit colours as CSS
// variables, Inter, a fixed canvas size, and a Content-Security-Policy that
// blocks every script. Image placeholders ({{photo.N}}, {{logo}}) are filled
// with checked URLs, and the renderer only lets the page load those exact
// URLs plus Google Fonts. Files are uploaded under an unguessable folder:
//   ads-loop/<core id>/<random>/BB449-S01_static_1x1_v1.png

const crypto = require("crypto");
const cloudinary = require("cloudinary").v2;
const { renderHtmlToPng } = require("../marketing/htmlRenderer");
const { CREATIVE_CONFIG, IMAGE_PROVIDERS } = require("../../config/marketing/creativeConfig");
const { getAdsLoopConfig } = require("../../config/adsLoop/adsLoopConfig");
const { getCurrentBrandKit } = require("../brand/brandKitService");
const { escapeHtml, safeImageUrl } = require("../marketing/creativeTemplates");
const { fileName } = require("./creativeId");

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const fontsCssUrl = CREATIVE_CONFIG.providers[IMAGE_PROVIDERS.HYBRID].fontsCssUrl;

const CSP = [
    "default-src 'none'",
    "img-src data: https:",
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com data:",
    "script-src 'none'",
].join("; ");

const TRANSPARENT_PIXEL =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/** Remove anything that is not plain markup: scripts, handlers, frames, page shell, other URLs. */
function sanitize(html) {
    return String(html || "")
        .replace(/<!doctype[^>]*>/gi, "")
        .replace(/<\/?(html|head|body|meta|link|base)\b[^>]*>/gi, "")
        .replace(/<(script|iframe|object|embed|form|title)\b[\s\S]*?<\/\1\s*>/gi, "")
        .replace(/<(script|iframe|object|embed|form)\b[^>]*\/?>/gi, "")
        .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
        .replace(/javascript:/gi, "");
}

function fillImages(text, { photos, logo }) {
    return text.replace(/\{\{\s*(photo\.(\d+)|logo)\s*\}\}/g, (m, name, n) => {
        if (name === "logo") return safeImageUrl(logo) || TRANSPARENT_PIXEL;
        const url = photos.length ? photos[(Number(n) - 1) % photos.length] : null;
        return safeImageUrl(url) || TRANSPARENT_PIXEL;
    });
}

async function brandCssVars() {
    const kit = await getCurrentBrandKit();
    const vars = Object.entries(kit.colors).map(([k, v]) => `--brand-${k}: ${v};`);
    vars.push(`--brand-radius: ${Number(kit.radius) || 8}px;`);
    return vars.join(" ");
}

async function buildDocument({ css, canvas, size, photos, logo }) {
    const body = fillImages(sanitize(canvas), { photos, logo });
    const style = fillImages(String(css || "").replace(/<\/style/gi, ""), { photos, logo });
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<link rel="stylesheet" href="${escapeHtml(fontsCssUrl)}">
<style>
  :root { ${await brandCssVars()} --canvas-w: ${size.width}px; --canvas-h: ${size.height}px; }
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: ${size.width}px; height: ${size.height}px; overflow: hidden; }
  body { position: relative; font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  img { max-width: none; }
</style>
<style>${style}</style>
</head>
<body>
${body}
</body>
</html>`;
}

/** ads-loop/<core id>/<random>: keyed by the core id, still unguessable. */
const newFolder = (coreId) =>
    `${getAdsLoopConfig().creative.cloudinaryFolder}/${coreId}/${crypto.randomBytes(12).toString("hex")}`;

async function uploadPng(png, folder, name) {
    const upload = await cloudinary.uploader.upload(`data:image/png;base64,${png.toString("base64")}`, {
        public_id: `${folder}/${name}`,
        overwrite: true,
        invalidate: true,
        resource_type: "image",
    });
    return upload.secure_url;
}

/**
 * Render every canvas at every size it needs and upload the PNGs.
 *
 * @param {object} p
 * @param {string} p.coreId
 * @param {"static"|"carousel"} p.format
 * @param {{ css: string, canvases: string[] }} p.build
 * @param {string[]} p.photos         photo URLs in placeholder order
 * @param {string} p.folder           Cloudinary folder of this creative
 * @param {number} p.version          added to file names so every version keeps its own URL
 * @param {string[]} p.cardIds        BB449-C01-c1 ... (carousels) or [coreId] (statics)
 * @returns {Promise<Array<{ cardId: string, assetUrls: object }>>}
 */
async function renderAndUpload({ coreId, format, build, photos, folder, version, cardIds }) {
    const { ratios, carouselRatio } = getAdsLoopConfig().creative;
    const logo = CREATIVE_CONFIG.logoUrl;
    const allowedUrls = [...photos, logo].filter((u) => typeof u === "string" && u.startsWith("https://"));
    const useRatios = format === "carousel" ? [carouselRatio] : Object.keys(ratios);

    const out = [];
    for (let i = 0; i < build.canvases.length; i++) {
        const id = cardIds[i] || coreId;
        const assetUrls = {};
        for (const ratio of useRatios) {
            const size = ratios[ratio];
            const html = await buildDocument({ css: build.css, canvas: build.canvases[i], size, photos, logo });
            const png = await renderHtmlToPng(html, size, { allowedUrls });
            assetUrls[ratio] = await uploadPng(png, folder, `${fileName(id, format, ratio)}_v${version}`);
        }
        out.push({ cardId: id, assetUrls });
    }
    return out;
}

module.exports = { renderAndUpload, newFolder, sanitize, buildDocument };
