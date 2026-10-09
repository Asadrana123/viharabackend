// services/brand/brandKitService.js
//
// The current Brand Kit: what an admin saved, on top of the defaults.
// Used by the Brand Kit API and by the design agent.
const BrandKit = require("../../model/brand/brandKitModel");
const { BRAND_KIT_DEFAULTS } = require("../../config/brandKitDefaults");

const MESSAGING_FIELDS = ["tagline", "tone", "wordsToUse", "wordsToAvoid"];

// Saved values on top of the defaults, so a field never saved still has a value.
function mergeWithDefaults(saved) {
  const d = BRAND_KIT_DEFAULTS;
  const savedColors = saved?.colors ? Object.fromEntries(saved.colors) : {};
  return {
    logo: d.logo,
    colors: { ...d.colors, ...savedColors },
    fonts: {
      heading: saved?.fonts?.heading || d.fonts.heading,
      body: saved?.fonts?.body || d.fonts.body,
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
