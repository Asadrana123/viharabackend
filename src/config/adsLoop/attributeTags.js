// config/adsLoop/attributeTags.js
//
// The fixed design-attribute tags of the Meta Ads Loop. Claude picks values
// from these lists when it plans a creative; it can never invent new ones, so
// weekly analysis can group results reliably. A person adds new values here.

const ATTRIBUTE_TAGS = Object.freeze({
    format: ["static", "carousel"],
    layout: ["hero-photo", "split", "price-led", "map", "collage"],
    hook: ["price", "location", "auction-date", "urgency", "feature"],
    photo_type: ["exterior", "interior", "aerial", "street"],
    cta: ["learn-more", "register", "view-listing"],
    text_density: ["low", "medium", "high"],
});

const ATTRIBUTE_KEYS = Object.freeze(Object.keys(ATTRIBUTE_TAGS));

// Meta call-to-action button for each cta tag.
const META_CTA = Object.freeze({
    "learn-more": "LEARN_MORE",
    register: "SIGN_UP",
    "view-listing": "LEARN_MORE",
});

/**
 * Keep only known keys with allowed values.
 * @returns {{ attributes: object, problems: string[] }}
 */
function validateAttributes(input = {}) {
    const attributes = {};
    const problems = [];
    for (const key of ATTRIBUTE_KEYS) {
        const value = input?.[key];
        if (ATTRIBUTE_TAGS[key].includes(value)) attributes[key] = value;
        else problems.push(`${key} must be one of ${ATTRIBUTE_TAGS[key].join(", ")} (got "${value ?? ""}")`);
    }
    return { attributes, problems };
}

module.exports = { ATTRIBUTE_TAGS, ATTRIBUTE_KEYS, META_CTA, validateAttributes };
