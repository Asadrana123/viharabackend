// services/adsLoop/creativeId.js
//
// Creative naming (Prajwal's review notes, 14 Oct 2026).
//
// Every creative has a CORE ID that never changes, and a STAGE PREFIX that
// changes as it moves through review. Every system matches on the core id.
//
//   core id    <property code>-<S|C><nn>     LV18753-S01, BB449-C02  (S static, C carousel)
//   name       <stage>-<core id>             CR-LV18753-S01 -> R1-LV18753-S01 -> AP-LV18753-S01
//     CR  first version posted to #creative-review
//     R1  built after the first round of review feedback (R2, R3 ...)
//     AP  an approver pressed Approve; the only name used in ads
//
//   Slack review post   current name only             R1-LV18753-S01
//   Meta ad name        AP name, hook, ICP, direction, format
//                       AP-LV18753-S01_HK-0006_fix-and-flip_editorial_static-4x5
//   utm_content         core id                       LV18753-S01
//   Cloudinary, DB keys core id
//   carousel card       <core id>-c<n>                BB449-C02-c1

const { auctionPageUrl } = require("../../config/siteUrls");

const STAGES = Object.freeze({ CR: "CR", AP: "AP" });

// From the review notes. Group 1 = stage, group 2 = core id.
const NAME_PATTERN = /(?<![A-Za-z0-9])(CR|R[1-9]\d?|AP)-([A-Z0-9]{2,16}-[SC]\d{2})(?!\d)/;
// A bare core id (utm_content, file names).
const CORE_PATTERN = /(?<![A-Za-z0-9])([A-Z0-9]{2,16}-[SC]\d{2})(?!\d)/;

const FORMAT_LETTER = Object.freeze({ static: "S", carousel: "C" });

/** "R1" after one round of feedback, "R2" after two ... */
const revisionStage = (round) => `R${round}`;

const nameOf = (stage, coreId) => `${stage}-${coreId}`;

/**
 * Stage + core id from an ad name ("AP-LV18753-S01_HK-0006_...").
 * @returns {{ stage: string, coreId: string } | null}
 */
function parseName(text) {
    const m = String(text || "").match(NAME_PATTERN);
    return m ? { stage: m[1], coreId: m[2] } : null;
}

/** Core id from a name or a bare core id (utm_content), or null. */
function parseCoreId(text) {
    const named = parseName(text);
    if (named) return named.coreId;
    const m = String(text || "").toUpperCase().match(CORE_PATTERN);
    return m ? m[1] : null;
}

/**
 * Base property code: initials of the first two words of the city plus the
 * street number. "18753 San Diego Blvd, Lathrup Village" -> LV18753,
 * "449 Georgia St, Big Bear Lake" -> BB449. One-word cities use two letters.
 */
function basePropertyCode(property) {
    const words = String(property.city || "").toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter(Boolean);
    const letters = words.length >= 2 ? words[0][0] + words[1][0] : (words[0] || "XX").slice(0, 2).padEnd(2, "X");
    const number = (String(property.street || "").match(/\d+/) || [""])[0].slice(0, 10);
    return `${letters}${number || "0"}`.slice(0, 16);
}

/** "BB449" + "static" + 2 -> "BB449-S02" */
const formatCoreId = (propertyCode, format, n) => `${propertyCode}-${FORMAT_LETTER[format] || "S"}${String(n).padStart(2, "0")}`;

const cardId = (coreId, n) => `${coreId}-c${n}`;

/**
 * Meta ad name: the AP name first, then hook, ICP, direction and format.
 * Parts come from the Creative OS record when there is one, otherwise from
 * the creative's attribute tags.
 */
function adName({ coreId, attributes = {}, sourceRecord = null, ratio }) {
    const r = sourceRecord || {};
    const parts = [
        nameOf(STAGES.AP, coreId),
        r.hookId || attributes.hook,
        r.icp,
        r.direction || attributes.layout,
        `${attributes.format || "static"}-${ratio}`,
    ];
    return parts
        .filter(Boolean)
        .map((p) => String(p).trim().replace(/\s+/g, "-").replace(/_/g, "-"))
        .join("_");
}

const fileName = (id, format, ratio) => `${id}_${format}_${ratio}`;

function landingUrl({ propertySlug, campaignSlug, coreId }) {
    const url = new URL(auctionPageUrl(propertySlug));
    url.searchParams.set("utm_source", "meta");
    url.searchParams.set("utm_medium", "paid");
    url.searchParams.set("utm_campaign", campaignSlug);
    url.searchParams.set("utm_content", coreId);
    return url.toString();
}

/** Organic posts link to the same page, tagged as organic. */
function organicUrl({ propertySlug, coreId, platform }) {
    const url = new URL(auctionPageUrl(propertySlug));
    url.searchParams.set("utm_source", platform);
    url.searchParams.set("utm_medium", "organic");
    url.searchParams.set("utm_content", coreId);
    return url.toString();
}

module.exports = {
    STAGES,
    NAME_PATTERN,
    CORE_PATTERN,
    FORMAT_LETTER,
    revisionStage,
    nameOf,
    parseName,
    parseCoreId,
    basePropertyCode,
    formatCoreId,
    cardId,
    adName,
    fileName,
    landingUrl,
    organicUrl,
};
