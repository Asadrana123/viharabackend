// services/adsLoop/ltId.js
//
// The creative id (LT-ID) spec. Every creative keeps its LT-ID from planning
// through Meta and back:
//
//   concept        LT-0004
//   variant        LT-0004-a, LT-0004-b
//   carousel card  LT-0005-c1
//
//   Meta ad name   "LT-0004 | 123-main-st | hero-photo"
//   landing URL    ...?utm_source=meta&utm_medium=paid&utm_campaign=<slug>&utm_content=LT-0004
//   rendered file  LT-0004_static_1x1.png
//   Slack thread   first line "LT-0004 · 123 Main St · v2"

const { auctionPageUrl } = require("../../config/siteUrls");

const LT_PATTERN = /\b(LT-\d{4,}(?:-[a-z]\b)?)/i;

const formatConcept = (n) => `LT-${String(n).padStart(4, "0")}`;

/** "LT-0004-a" -> "LT-0004" */
const conceptOf = (ltId) => String(ltId).replace(/^(LT-\d{4,}).*$/i, "$1").toUpperCase();

/** LT-ID found in an ad name or any text, or null. Card suffixes resolve to their creative. */
function parseLtId(text) {
    const m = String(text || "").match(LT_PATTERN);
    if (!m) return null;
    const [concept, variant] = m[1].split(/-(?=[a-z]$)/i);
    return variant ? `${concept.toUpperCase()}-${variant.toLowerCase()}` : concept.toUpperCase();
}

/** Next variant letter after the existing ones ("LT-0004" + ["LT-0004-a"] -> "LT-0004-b"). */
function nextVariantId(concept, existingIds = []) {
    const used = new Set(
        existingIds.map((id) => String(id).match(/-([a-z])$/i)?.[1]?.toLowerCase()).filter(Boolean)
    );
    for (let c = 97; c <= 122; c++) {
        const letter = String.fromCharCode(c);
        if (!used.has(letter)) return `${conceptOf(concept)}-${letter}`;
    }
    throw new Error(`${concept} already has 26 variants; start a new concept instead`);
}

const cardId = (ltId, n) => `${ltId}-c${n}`;

const adName = (ltId, propertySlug, layout) => `${ltId} | ${propertySlug} | ${layout}`;

const fileName = (id, format, ratio) => `${id}_${format}_${ratio}`;

function landingUrl({ propertySlug, campaignSlug, ltId }) {
    const url = new URL(auctionPageUrl(propertySlug));
    url.searchParams.set("utm_source", "meta");
    url.searchParams.set("utm_medium", "paid");
    url.searchParams.set("utm_campaign", campaignSlug);
    url.searchParams.set("utm_content", ltId);
    return url.toString();
}

/** Organic posts link to the same page, tagged as organic. */
function organicUrl({ propertySlug, ltId, platform }) {
    const url = new URL(auctionPageUrl(propertySlug));
    url.searchParams.set("utm_source", platform);
    url.searchParams.set("utm_medium", "organic");
    url.searchParams.set("utm_content", ltId);
    return url.toString();
}

const threadTitle = (ltId, propertyName, version) => `${ltId} · ${propertyName} · v${version}`;

module.exports = {
    LT_PATTERN,
    formatConcept,
    conceptOf,
    parseLtId,
    nextVariantId,
    cardId,
    adName,
    fileName,
    landingUrl,
    organicUrl,
    threadTitle,
};
