// services/marketing/templateValidator.js
//
// Checks an uploaded template's HTML before it can be saved. Pure code: no
// database, no network. A template holds layout and styling only, so:
//   - no scripts, event handlers, frames, forms, links or outside resources
//     (images only through placeholders or inline data: images),
//   - only known placeholders, and {{headline}} is required,
//   - image placeholders only where an image goes (src="..." or url(...)),
//   - fixed words in the layout are checked for numbers and compliance terms.
//     These are warnings by default (the designer has the final say); see
//     TEMPLATE_CONTENT_RULE_MODE in templateConfig.
//
// Rendering adds its own guards (Content-Security-Policy and a network
// allowlist); this validator is the first line.

const { checkLine } = require("./complianceChecker");
const { BUYER_TYPES } = require("../../config/marketing/marketingConstants");
const {
    TEXT_PLACEHOLDERS,
    IMAGE_PLACEHOLDERS,
    ASSET_PLACEHOLDER_PREFIX,
    MAX_TEMPLATE_PHOTOS,
    photoIndexOf,
    REQUIRED_PLACEHOLDERS,
    TEMPLATE_LIMITS,
    TEMPLATE_CONTENT_RULES,
    TEMPLATE_CONTENT_RULE_MODE,
} = require("../../config/marketing/templateConfig");

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z]+(?:\.[a-zA-Z0-9_-]+)?)\s*\}\}/g;

// [pattern, message] - any match rejects the template.
const FORBIDDEN = Object.freeze([
    [/<\s*script\b/i, "Scripts are not allowed"],
    [/\son[a-z]+\s*=/i, "Event handler attributes (onclick, onload ...) are not allowed"],
    [/javascript\s*:/i, "javascript: links are not allowed"],
    [/<\s*(iframe|frame|frameset|object|embed|applet|portal)\b/i, "Frames and embedded objects are not allowed"],
    [/<\s*(form|input|button|textarea|select)\b/i, "Forms and inputs are not allowed"],
    [/<\s*(link|meta|base)\b/i, "link, meta and base tags are not allowed (fonts are added automatically)"],
    [/<\s*(svg|math)\b/i, "Inline SVG and MathML are not allowed"],
    [/<\s*(video|audio|source|track)\b/i, "Video and audio are not allowed"],
    [/@import/i, "@import is not allowed (Inter is loaded automatically)"],
    [/\bhref\s*=/i, "Links (href) are not allowed"],
    [/\bsrcset\s*=/i, "srcset is not allowed; use src with a placeholder"],
    [/expression\s*\(/i, "CSS expressions are not allowed"],
]);

// Inline images allowed in src / url(): raster data: images only.
const DATA_IMAGE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i;

const isImagePlaceholder = (name) =>
    IMAGE_PLACEHOLDERS.includes(name) || name.startsWith(ASSET_PLACEHOLDER_PREFIX) || photoIndexOf(name) !== null;

function decodeEntities(text) {
    return text
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** The words a viewer would see that are not placeholders. */
function fixedText(html) {
    return decodeEntities(
        html
            .replace(/<!--[\s\S]*?-->/g, " ")
            .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]*>/g, " ")
            .replace(PLACEHOLDER_PATTERN, " ")
    )
        .replace(/\s+/g, " ")
        .trim();
}

/** Every src="..." and url(...) value must be a single image placeholder or a data: image. */
function checkResourceValues(html, errors) {
    const values = [];
    html.replace(/\bsrc\s*=\s*(["']?)([^"'\s>]*)\1/gi, (_, __, v) => values.push(v));
    html.replace(/url\(\s*(["']?)([^"')]*)\1\s*\)/gi, (_, __, v) => values.push(v));

    values.forEach((raw) => {
        const value = raw.trim();
        const placeholder = value.match(/^\{\{\s*([a-zA-Z]+(?:\.[a-zA-Z0-9_-]+)?)\s*\}\}$/);
        if (placeholder) {
            if (!isImagePlaceholder(placeholder[1])) {
                errors.push(`{{${placeholder[1]}}} is text and can't be used as an image`);
            }
            return;
        }
        if (!DATA_IMAGE.test(value)) {
            errors.push(`Images must use {{background}}, {{photo}} or {{asset.NAME}} (found "${value.slice(0, 60)}")`);
        }
    });
}

/**
 * @param {string} html
 * @param {object} [opts]
 * @param {string[]} [opts.assetNames]  names of images uploaded with the template
 * @param {string} [opts.contentMode]  TEMPLATE_CONTENT_RULES value (default from config)
 * @returns {{ ok: boolean, errors: string[], warnings: string[], usesBackground: boolean, usesPhoto: boolean, photoCount: number }}
 *   errors block saving; warnings are shown but never block.
 */
function validateTemplateHtml(html, { assetNames = [], contentMode = TEMPLATE_CONTENT_RULE_MODE } = {}) {
    const errors = [];
    const contentIssues = [];

    if (typeof html !== "string" || !html.trim()) {
        return { ok: false, errors: ["HTML is empty"], warnings: [], usesBackground: false, usesPhoto: false, photoCount: 0 };
    }
    if (Buffer.byteLength(html, "utf8") > TEMPLATE_LIMITS.maxHtmlBytes) {
        errors.push(`HTML must be ${Math.round(TEMPLATE_LIMITS.maxHtmlBytes / 1024)} KB or smaller`);
    }

    FORBIDDEN.forEach(([pattern, message]) => {
        if (pattern.test(html)) errors.push(message);
    });

    // Placeholders
    const used = new Set();
    const knownAssets = new Set(assetNames);
    let photoCount = 0;
    for (const m of html.matchAll(PLACEHOLDER_PATTERN)) {
        const name = m[1];
        used.add(name);
        const photoIndex = photoIndexOf(name);
        if (photoIndex !== null) {
            if (photoIndex < 1 || photoIndex > MAX_TEMPLATE_PHOTOS) {
                errors.push(`{{${name}}}: photos go from {{photo.1}} to {{photo.${MAX_TEMPLATE_PHOTOS}}}`);
            } else {
                photoCount = Math.max(photoCount, photoIndex);
            }
        } else if (name.startsWith(ASSET_PLACEHOLDER_PREFIX)) {
            const assetName = name.slice(ASSET_PLACEHOLDER_PREFIX.length);
            if (!knownAssets.has(assetName)) errors.push(`{{${name}}} has no uploaded image named "${assetName}"`);
        } else if (!TEXT_PLACEHOLDERS.includes(name) && !IMAGE_PLACEHOLDERS.includes(name)) {
            errors.push(`Unknown placeholder {{${name}}}`);
        }
    }
    REQUIRED_PLACEHOLDERS.forEach((name) => {
        if (!used.has(name)) errors.push(`{{${name}}} is required`);
    });

    // Image placeholders only inside src / url(); every src / url() is safe.
    const stripped = html
        .replace(/\bsrc\s*=\s*(["']?)[^"'\s>]*\1/gi, "")
        .replace(/url\(\s*(["']?)[^"')]*\1\s*\)/gi, "");
    for (const m of stripped.matchAll(PLACEHOLDER_PATTERN)) {
        if (isImagePlaceholder(m[1])) errors.push(`{{${m[1]}}} must be used as src="..." or url(...)`);
    }
    checkResourceValues(html, errors);

    // Fixed words: numbers and compliance terms (strictest audience).
    if (contentMode !== TEMPLATE_CONTENT_RULES.OFF) {
        const text = fixedText(html);
        if (/\d/.test(text)) {
            contentIssues.push("Fixed text contains numbers. They will be the same on every property.");
        }
        checkLine(text, {
            buyerType: BUYER_TYPES.OWNER_OCCUPANT,
            financingTermsConfirmed: false,
            allowedDollarAmounts: [],
        }).forEach((flag) => contentIssues.push(`Fixed text: ${flag.label} ("${flag.match}")`));
    }

    const block = contentMode === TEMPLATE_CONTENT_RULES.BLOCK;
    const allErrors = block ? [...errors, ...contentIssues] : errors;

    return {
        ok: allErrors.length === 0,
        errors: [...new Set(allErrors)],
        warnings: block ? [] : [...new Set(contentIssues)],
        usesBackground: used.has("background"),
        usesPhoto: photoCount > 0,
        photoCount,
    };
}

module.exports = { validateTemplateHtml, fixedText, PLACEHOLDER_PATTERN };
