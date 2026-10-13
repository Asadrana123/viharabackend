// services/brand/brandKitService.js
//
// The current Brand Kit: what an admin saved, on top of the defaults.
// Used by the Brand Kit API and by the design agent.
const BrandKit = require("../../model/brand/brandKitModel");
const { BRAND_KIT_DEFAULTS, ALLOWED_FONTS, COLOR_FIELDS } = require("../../config/brandKitDefaults");

// A saved font that's no longer allowed falls back to the default.
const pickFont = (saved, fallback) => (ALLOWED_FONTS.includes(saved) ? saved : fallback);

const MESSAGING_FIELDS = ["tagline", "tone", "wordsToUse", "wordsToAvoid"];

// Saved values on top of the defaults, so a field never saved still has a value.
function mergeWithDefaults(saved) {
  const d = BRAND_KIT_DEFAULTS;
  // Only colours that are still part of the Brand Kit.
  const savedColors = saved?.colors ? Object.fromEntries([...saved.colors].filter(([k]) => COLOR_FIELDS[k])) : {};
  return {
    logo: d.logo,
    colors: { ...d.colors, ...savedColors },
    fonts: {
      display: pickFont(saved?.fonts?.display, d.fonts.display),
      heading: pickFont(saved?.fonts?.heading, d.fonts.heading),
      body: pickFont(saved?.fonts?.body, d.fonts.body),
    },
    radius: saved?.radius ?? d.radius,
    messaging: Object.fromEntries(
      MESSAGING_FIELDS.map((f) => [f, saved?.messaging?.[f] ?? d.messaging[f]])
    ),
    updatedAt: saved?.updatedAt || null,
    updatedByName: saved?.updatedByName || "",
  };
}

async function getCurrentBrandKit() {
  return mergeWithDefaults(await BrandKit.findOne({ key: "default" }));
}

module.exports = { MESSAGING_FIELDS, mergeWithDefaults, getCurrentBrandKit };
