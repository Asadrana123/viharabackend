// services/marketing/templateRenderer.js
//
// Turns an uploaded template (already checked by templateValidator) into a
// full HTML document ready for Puppeteer:
//   - text placeholders get the exact, HTML-escaped text,
//   - image placeholders get checked image URLs (or a transparent pixel),
//   - the page gets Inter, a fixed canvas size, and a Content-Security-Policy
//     that blocks every script, even if one slipped past the validator.
//
// The admin's HTML is placed inside our own document shell, so they can
// upload either a fragment or a full page.

const { CREATIVE_CONFIG, IMAGE_PROVIDERS } = require("../../config/marketing/creativeConfig");
const { TEXT_PLACEHOLDERS, ASSET_PLACEHOLDER_PREFIX } = require("../../config/marketing/templateConfig");
const { PLACEHOLDER_PATTERN } = require("./templateValidator");
const { escapeHtml, safeImageUrl } = require("./creativeTemplates");

const fontsCssUrl = CREATIVE_CONFIG.providers[IMAGE_PROVIDERS.HYBRID].fontsCssUrl;

const TRANSPARENT_PIXEL =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

// Stand-in photo for previews: a soft sky-to-lawn gradient.
const PREVIEW_IMAGE = `data:image/svg+xml;base64,${Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#9cc3f2"/><stop offset="0.62" stop-color="#dfe9f5"/>
    <stop offset="0.63" stop-color="#9bb783"/><stop offset="1" stop-color="#7f9d6a"/>
  </linearGradient></defs>
  <rect width="1080" height="1080" fill="url(#g)"/>
  <rect x="560" y="420" width="420" height="260" fill="#c9a27a"/>
  <polygon points="530,420 770,290 1010,420" fill="#6b4a33"/>
</svg>`
).toString("base64")}`;

const CSP = [
    "default-src 'none'",
    "img-src data: https:",
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com data:",
    "script-src 'none'",
].join("; ");

// Remove the admin's page shell; their <style> and content stay.
function stripDocumentShell(html) {
    return html
        .replace(/<!doctype[^>]*>/gi, "")
        .replace(/<\/?(html|head|body)\b[^>]*>/gi, "")
        .replace(/<title\b[\s\S]*?<\/title>/gi, "");
}

/**
 * @param {string} html
 * @param {object} values
 * @param {object} values.texts   { headline, secondaryHeadline, supportingCopy, cta }
 * @param {object} values.images  { background, photo, assets: { NAME: url } }
 */
function fillPlaceholders(html, { texts = {}, images = {} }) {
    return html.replace(PLACEHOLDER_PATTERN, (match, name) => {
        if (TEXT_PLACEHOLDERS.includes(name)) return escapeHtml(texts[name] || "");

        const url = name.startsWith(ASSET_PLACEHOLDER_PREFIX)
            ? images.assets?.[name.slice(ASSET_PLACEHOLDER_PREFIX.length)]
            : images[name];
        return safeImageUrl(url) || TRANSPARENT_PIXEL;
    });
}

/**
 * @param {string} templateHtml  one format's HTML from the template
 * @param {object} values
 * @param {object} values.texts
 * @param {object} values.images
 * @param {{ width: number, height: number }} values.size  final pixels
 * @returns {string} full HTML document
 */
function buildTemplateDocument(templateHtml, { texts, images, size }) {
    const body = fillPlaceholders(stripDocumentShell(templateHtml), { texts, images });
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<link rel="stylesheet" href="${escapeHtml(fontsCssUrl)}">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: ${size.width}px; height: ${size.height}px; overflow: hidden; }
  body { position: relative; font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

/** The https image URLs a filled template loads (for the renderer's network allowlist). */
function imageUrlsOf(images = {}) {
    return [images.background, images.photo, ...Object.values(images.assets || {})].filter(
        (u) => typeof u === "string" && u.startsWith("https://")
    );
}

module.exports = {
    buildTemplateDocument,
    imageUrlsOf,
    PREVIEW_IMAGE,
};
