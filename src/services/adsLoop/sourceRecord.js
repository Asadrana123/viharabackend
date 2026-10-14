// services/adsLoop/sourceRecord.js
//
// Reads the Creative OS record stored on a creative (adCreative.sourceRecord).
// The Creative OS job returns the PNG plus a record with every figure's source
// and whether a generated image was used. Its exact shape is set by the
// Creative OS repo; these helpers accept the likely field names until the
// integration is wired.

/**
 * True when the creative uses a generated (AI) image, e.g. a generated
 * background behind the real property photo. Meta's AI-generated label must
 * then be switched on at publish (ads and Instagram posts).
 */
function usesGeneratedImage(creative) {
    const r = creative?.sourceRecord;
    if (!r || typeof r !== "object") return false;
    if ([r.aiGenerated, r.generatedImage, r.usesGeneratedImage, r.isAiGenerated].some((v) => v === true)) return true;
    const images = Array.isArray(r.images) ? r.images : [];
    return images.some((img) => img && (img.generated === true || img.aiGenerated === true || /generated/i.test(String(img.kind || img.type || ""))));
}

module.exports = { usesGeneratedImage };
