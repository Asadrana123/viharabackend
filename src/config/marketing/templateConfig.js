// config/marketing/templateConfig.js
//
// Rules for the ad template library. Admins upload an HTML template once and
// reuse it for any property. Templates hold layout and styling only; every
// word and number comes from the engine through placeholders.
//
// Placeholders a template may use:
//   {{headline}} {{secondaryHeadline}} {{supportingCopy}} {{cta}}  - exact text
//   {{background}}  - AI background image (hybrid provider)
//   {{photo}}       - the real property photo (same as {{photo.1}})
//   {{photo.N}}     - property photo number N (1 to MAX_TEMPLATE_PHOTOS); the
//                     admin picks which property photo fills each number
//   {{asset.NAME}}  - an image uploaded with the template (NAME = its name)

const TEMPLATE_STATUS = Object.freeze({
    ACTIVE: "active",
    ARCHIVED: "archived",
});
const TEMPLATE_STATUS_VALUES = Object.freeze(Object.values(TEMPLATE_STATUS));

// Template HTML is stored per format under these keys.
const TEMPLATE_FORMAT_KEYS = Object.freeze({
    "1:1": "square",
    "9:16": "tall",
});

const TEXT_PLACEHOLDERS = Object.freeze(["headline", "secondaryHeadline", "supportingCopy", "cta"]);
const IMAGE_PLACEHOLDERS = Object.freeze(["background", "photo"]);
const MAX_TEMPLATE_PHOTOS = 6;
const MAX_PHOTO_SLOT_LABEL_CHARS = 40;

/** "photo" -> 1, "photo.3" -> 3, anything else -> null. */
function photoIndexOf(name) {
    if (name === "photo") return 1;
    const m = /^photo\.(\d+)$/.exec(name);
    return m ? Number(m[1]) : null;
}
const ASSET_PLACEHOLDER_PREFIX = "asset.";
const REQUIRED_PLACEHOLDERS = Object.freeze(["headline"]);

// Wording checks on the template's own fixed words (numbers, compliance
// terms). The designer has the final say, so by default these only warn.
//   "warn"  - shown in the editor, never block saving (default)
//   "block" - the template can't be saved until they are fixed
//   "off"   - not checked at all
// Safety rules (scripts, outside links, SVG ...) always block.
const TEMPLATE_CONTENT_RULES = Object.freeze({ WARN: "warn", BLOCK: "block", OFF: "off" });
const TEMPLATE_CONTENT_RULE_MODE = process.env.TEMPLATE_CONTENT_RULES || TEMPLATE_CONTENT_RULES.WARN;

const TEMPLATE_LIMITS = Object.freeze({
    maxHtmlBytes: 100 * 1024,
    maxNameChars: 80,
    maxDescriptionChars: 300,
    maxAssets: 10,
    maxAssetBytes: 5 * 1024 * 1024,
});

// Uploaded template images. No SVG: it can carry scripts.
const ASSET_MIME_TYPES = Object.freeze(["image/png", "image/jpeg", "image/webp"]);
const ASSET_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,40}$/;
const TEMPLATE_ASSET_FOLDER = "marketing-engine/template-assets";
// Thumbnails shown in the template library (rendered with PREVIEW_TEXTS).
const TEMPLATE_PREVIEW_FOLDER = "marketing-engine/template-previews";

// The design the engine ships with (services/marketing/creativeTemplates.js).
// It is not stored in the database, can't be edited or archived, and is the
// default for every slot that has no uploaded default.
const BUILTIN_TEMPLATE = Object.freeze({
    id: "builtin-hero-fade",
    name: "Vihara hero fade (built-in)",
    description: "AI background with a white fade, exact text, price boxes and the blue button.",
});

// Text used for the template preview (never saved on a run).
const PREVIEW_TEXTS = Object.freeze({
    headline: "$62,000 below the Vihara estimate",
    secondaryHeadline: "Starting bid: $180,000",
    supportingCopy: "3 bed | 2 bath | 1,450 sq ft",
    cta: "See the Deal",
});

module.exports = {
    TEMPLATE_CONTENT_RULES,
    TEMPLATE_CONTENT_RULE_MODE,
    PREVIEW_TEXTS,
    TEMPLATE_STATUS,
    TEMPLATE_STATUS_VALUES,
    TEMPLATE_FORMAT_KEYS,
    TEXT_PLACEHOLDERS,
    IMAGE_PLACEHOLDERS,
    MAX_TEMPLATE_PHOTOS,
    MAX_PHOTO_SLOT_LABEL_CHARS,
    photoIndexOf,
    ASSET_PLACEHOLDER_PREFIX,
    REQUIRED_PLACEHOLDERS,
    TEMPLATE_LIMITS,
    ASSET_MIME_TYPES,
    ASSET_NAME_PATTERN,
    TEMPLATE_ASSET_FOLDER,
    TEMPLATE_PREVIEW_FOLDER,
    BUILTIN_TEMPLATE,
};
