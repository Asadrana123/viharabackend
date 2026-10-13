// services/adsLoop/creativeAi.js
//
// The Claude steps of the creative pipeline:
//   planCreative      picks the design attributes (fixed tag lists only), the idea and the ad copy
//   buildCreative     writes the HTML/CSS for the canvas (rendered to PNG by htmlRenderer)
//   critiqueCreative  vision critic: scores the PNG at feed and thumbnail size against a fixed rubric
//   extractReviewRules  reads an approved review thread and proposes design rules
//
// Each call gets the Brand Kit, the active design rules and (for plan/build)
// 3-5 example-library images that match the planned attributes.

const { DateTime } = require("luxon");
const { ATTRIBUTE_TAGS, ATTRIBUTE_KEYS } = require("../../config/adsLoop/attributeTags");
const { getAdsLoopConfig } = require("../../config/adsLoop/adsLoopConfig");
const { getCurrentBrandKit } = require("../brand/brandKitService");
const { claudeJson, textBlock, imageBlock } = require("./claudeJson");
const { activeRulesText, pickExamples, describeExample } = require("./learningStore");

const MAX_PHOTOS_SHOWN = 6;

// ---------------------------------------------------------------------------
// Inputs shared by every step
// ---------------------------------------------------------------------------
function propertyPhotos(property) {
    return [property.image, ...(property.otherImages || [])].filter((u) => typeof u === "string" && u.startsWith("https://"));
}

const money = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? `$${Math.round(Number(n)).toLocaleString("en-US")}` : null);

function dateText(d, zone = "America/Los_Angeles") {
    if (!d) return null;
    const dt = DateTime.fromJSDate(new Date(d)).setZone(zone);
    return dt.isValid ? dt.toFormat("ccc, LLL d") : null;
}

/** The only facts Claude may put on an ad. Nothing else is allowed. */
function propertyFacts(property) {
    const facts = {
        name: property.productName,
        address: [property.street, property.city, property.state].filter(Boolean).join(", "),
        city: property.city || null,
        state: property.state || null,
        propertyType: property.propertyType || null,
        beds: property.beds ?? null,
        baths: property.baths ?? null,
        squareFootage: property.squareFootage ?? null,
        startingBid: money(property.startBid),
        auctionStarts: dateText(property.auctionStartDate),
        auctionEnds: dateText(property.auctionEndDate),
        auctionFormat: property.onlineOrInPerson || null,
    };
    return Object.fromEntries(Object.entries(facts).filter(([, v]) => v !== null && v !== undefined && v !== ""));
}

async function brandText() {
    const kit = await getCurrentBrandKit();
    const colors = Object.entries(kit.colors).map(([k, v]) => `--brand-${k}: ${v}`).join("; ");
    return [
        `Colours (CSS variables already defined on :root): ${colors}`,
        `Font: Inter only (already loaded; weights 400-900, no italics). Corner radius: ${kit.radius}px (--brand-radius).`,
        `Logo: ${kit.logo.rules} Use <img class="logo" src="{{logo}}"> exactly when the layout shows the logo.`,
        `Tone: ${kit.messaging.tone} Words to use: ${kit.messaging.wordsToUse}. Never use: ${kit.messaging.wordsToAvoid}.`,
    ].join("\n");
}

async function exampleBlocks(attributes) {
    const examples = await pickExamples(attributes);
    if (!examples.length) return [textBlock("Example library: empty so far.")];
    const blocks = [textBlock(`Example library (${examples.length} images that match the planned attributes):`)];
    for (const e of examples) {
        blocks.push(textBlock(describeExample(e)), imageBlock(e.imageUrl));
    }
    return blocks;
}

const HOUSING_RULES = `Meta Housing special ad category and Fair Housing rules (hard requirements):
- Never describe who the home suits or who should buy it (families, kids, couples, singles, retirees, students, any religion, nationality, disability or other group). Describe the property, not the buyer.
- No "safe", "exclusive" or similar neighbourhood claims.
- No guaranteed returns, appreciation, "risk-free" or profit claims. No percentages.
- Only dollar amounts that appear in the property facts. Never invent prices, savings or values.
- No em dashes.`;

// ---------------------------------------------------------------------------
// 1. Plan
// ---------------------------------------------------------------------------
const attributeSchema = {
    type: "object",
    properties: Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, { type: "string", enum: ATTRIBUTE_TAGS[k] }])),
    required: ATTRIBUTE_KEYS,
    additionalProperties: false,
};

const PLAN_SCHEMA = {
    type: "object",
    properties: {
        attributes: attributeSchema,
        concept: { type: "string", description: "The idea in one sentence." },
        headline: { type: "string", description: "Meta headline under the image, max 40 characters." },
        primaryText: { type: "string", description: "Meta primary text above the image, max 300 characters." },
        overlayText: { type: "string", description: "All words on the image (statics), or the cover card's words (carousels)." },
        photoIndexes: { type: "array", items: { type: "integer" }, description: "Which property photos to use, best first (0-based)." },
        cards: {
            type: "array",
            description: "Carousel only (2-10 cards): one entry per card. Empty for statics.",
            items: {
                type: "object",
                properties: {
                    headline: { type: "string", description: "Card headline under the card image, max 40 characters." },
                    description: { type: "string", description: "Card description, max 60 characters." },
                    overlayText: { type: "string", description: "Words on this card's image." },
                    photoIndex: { type: "integer" },
                },
                required: ["headline", "description", "overlayText", "photoIndex"],
                additionalProperties: false,
            },
        },
    },
    required: ["attributes", "concept", "headline", "primaryText", "overlayText", "photoIndexes", "cards"],
    additionalProperties: false,
};

/**
 * @param {object} p
 * @param {object} p.property
 * @param {object} [p.brief]        what the proposal asked for ({ kind, rationale, attributes, ... })
 * @param {object} [p.base]         the creative this one varies / refreshes
 * @returns {Promise<object>} plan matching PLAN_SCHEMA
 */
async function planCreative({ property, brief = null, base = null }) {
    const photos = propertyPhotos(property).slice(0, MAX_PHOTOS_SHOWN);
    const seedAttributes = brief?.attributes || base?.attributes || {};
    const { maxCarouselCards, minCarouselCards } = getAdsLoopConfig().creative;

    const system = `You plan Meta (Facebook/Instagram) ad creatives for Vihara (vihara.ai), a US real estate auction platform. Your plan is built as an HTML/CSS ad and reviewed by the team before anything goes live.

Choose attribute tags only from the allowed lists. Plan copy that fits the chosen text_density (low: up to 6 words on the image, medium: up to 12, high: up to 20). A carousel has ${minCarouselCards}-${maxCarouselCards} cards; a static has no cards.

${HOUSING_RULES}`;

    const content = [
        textBlock(`Property facts (the only facts you may use):\n${JSON.stringify(propertyFacts(property), null, 1)}`),
        textBlock(`Brand Kit:\n${await brandText()}`),
        textBlock(`Design rules (design-rules.md), follow every one:\n${await activeRulesText()}`),
        ...(await exampleBlocks(seedAttributes)),
        textBlock(`Property photos (${photos.length}), in index order:`),
        ...photos.flatMap((url, i) => [textBlock(`Photo ${i}`), imageBlock(url)]),
        textBlock(
            [
                brief ? `What the team asked for (${brief.kind}): ${brief.rationale || ""}\nRequested attributes: ${JSON.stringify(brief.attributes || {})}` : "",
                base
                    ? `This is a ${brief?.kind === "refresh" ? "refresh" : "variant"} of ${base.ltId}: attributes ${JSON.stringify(base.attributes)}, headline "${base.copy?.headline}", overlay "${base.copy?.overlayText}". ${brief?.kind === "refresh" ? "Keep the idea, make it look new." : "Change what the brief asks to test and keep the rest."}`
                    : "",
                "Plan the creative.",
            ]
                .filter(Boolean)
                .join("\n\n")
        ),
    ];

    const plan = await claudeJson({ system, content, schema: PLAN_SCHEMA, effort: "high", maxTokens: 16000 });
    const clampIndex = (i) => (Number.isInteger(i) && i >= 0 && i < photos.length ? i : 0);
    plan.photoIndexes = (plan.photoIndexes || []).map(clampIndex);
    plan.cards = plan.attributes.format === "carousel" ? (plan.cards || []).slice(0, maxCarouselCards) : [];
    plan.cards.forEach((c) => (c.photoIndex = clampIndex(c.photoIndex)));
    if (plan.attributes.format === "carousel" && plan.cards.length < minCarouselCards) {
        throw new Error(`The plan has ${plan.cards.length} carousel cards; at least ${minCarouselCards} are needed`);
    }
    return plan;
}

// ---------------------------------------------------------------------------
// 2. Build (HTML/CSS)
// ---------------------------------------------------------------------------
const BUILD_SCHEMA = {
    type: "object",
    properties: {
        css: { type: "string", description: "CSS shared by every canvas." },
        canvases: {
            type: "array",
            description: "One body HTML per image: one for a static, one per card for a carousel, in card order.",
            items: { type: "string" },
        },
        headline: { type: "string", description: "Meta headline under the image: the plan's, unless the feedback asks to change it." },
        primaryText: { type: "string", description: "Meta primary text: the plan's, unless the feedback asks to change it." },
        changes: { type: "string", description: "What changed from the previous version (revisions only), one sentence." },
    },
    required: ["css", "canvases", "headline", "primaryText", "changes"],
    additionalProperties: false,
};

/**
 * @param {object} p
 * @param {object} p.property
 * @param {object} p.plan
 * @param {string[]} p.photoUrls        photos in the plan's order (photo.1, photo.2 ...)
 * @param {object} [p.revision]         { notes, previousImageUrls, previousCss, previousCanvases }
 * @returns {Promise<{ css: string, canvases: string[], changes: string }>}
 */
async function buildCreative({ property, plan, photoUrls, revision = null }) {
    const { ratios } = getAdsLoopConfig().creative;
    const sizes = Object.entries(ratios).map(([r, s]) => `${r} = ${s.width}x${s.height}px`).join(", ");
    const isCarousel = plan.attributes.format === "carousel";

    const system = `You build Meta ad images for Vihara as HTML and CSS. Each canvas is rendered by headless Chrome at a fixed size and screenshotted.

Technical rules:
- Write only the body content of each canvas plus one shared CSS string. No <html>, <head>, <script>, event handlers, iframes, forms or external CSS. No JavaScript at all.
- The body is exactly the canvas: width var(--canvas-w), height var(--canvas-h). The same HTML is rendered at ${isCarousel ? "1x1 only" : `every size (${sizes})`}, so lay it out with flexbox/grid and percentages, never fixed pixel heights that only fit one size.
- Images: only the placeholders {{photo.1}}, {{photo.2}} ... (in that order) and {{logo}}. Use them as <img src="{{photo.1}}"> or background-image: url('{{photo.1}}'). Never any other URL.
- Text must be live HTML text (not in images), Inter, at least 34px for the smallest line on a 1080px canvas, with strong contrast (use a scrim/gradient over photos).
- Keep important text and the logo inside the safe zone: 6% padding on every side; on 4x5 keep the bottom 14% free of key text.
- Use only the words in the plan (or the feedback). Do not add claims, prices or dates that are not in the plan or the property facts.

${HOUSING_RULES}`;

    const content = [
        textBlock(`Property facts:\n${JSON.stringify(propertyFacts(property), null, 1)}`),
        textBlock(`Brand Kit:\n${await brandText()}`),
        textBlock(`Design rules (design-rules.md), follow every one:\n${await activeRulesText()}`),
        ...(await exampleBlocks(plan.attributes)),
        textBlock(`Photos available as placeholders:`),
        ...photoUrls.flatMap((url, i) => [textBlock(`{{photo.${i + 1}}}`), imageBlock(url)]),
        textBlock(
            `The plan:\n${JSON.stringify(
                {
                    attributes: plan.attributes,
                    concept: plan.concept,
                    headline: plan.headline,
                    primaryText: plan.primaryText,
                    overlayText: plan.overlayText,
                    cards: isCarousel ? plan.cards.map((c) => ({ overlayText: c.overlayText, photo: `{{photo.${c.photoIndex + 1}}}` })) : undefined,
                },
                null,
                1
            )}`
        ),
    ];

    if (revision) {
        content.push(textBlock("Previous version (rendered):"));
        for (const url of revision.previousImageUrls || []) content.push(imageBlock(url));
        content.push(
            textBlock(
                `Previous headline: ${revision.previousHeadline || plan.headline}\nPrevious primary text: ${revision.previousPrimaryText || plan.primaryText}\n\nPrevious CSS:\n${revision.previousCss || ""}\n\nPrevious canvases:\n${(revision.previousCanvases || []).join("\n\n----\n\n")}`
            ),
            textBlock(`Make a new version that fixes this feedback, and keep what was not criticised:\n${revision.notes}`)
        );
    } else {
        content.push(textBlock(`Build the ${isCarousel ? `${plan.cards.length} carousel cards` : "static ad"}.`));
    }

    const out = await claudeJson({ system, content, schema: BUILD_SCHEMA, effort: "high", maxTokens: 64000 });
    const expected = isCarousel ? plan.cards.length : 1;
    if (!Array.isArray(out.canvases) || out.canvases.length !== expected) {
        throw new Error(`The build returned ${out.canvases?.length || 0} canvases; ${expected} expected`);
    }
    return out;
}

// ---------------------------------------------------------------------------
// 3. Vision critic
// ---------------------------------------------------------------------------
const RUBRIC = ["hierarchy", "legibility", "brand_match", "text_density", "safe_zones", "housing_copy"];

const CRITIC_SCHEMA = {
    type: "object",
    properties: {
        scores: {
            type: "object",
            properties: Object.fromEntries(RUBRIC.map((k) => [k, { type: "integer", description: "0-10" }])),
            required: RUBRIC,
            additionalProperties: false,
        },
        overall: { type: "integer", description: "0-10" },
        housingCompliant: { type: "boolean" },
        ruleViolations: { type: "array", items: { type: "string" }, description: "Design rules this creative breaks, quoted." },
        notes: { type: "array", items: { type: "string" }, description: "Specific, actionable fixes, most important first." },
    },
    required: ["scores", "overall", "housingCompliant", "ruleViolations", "notes"],
    additionalProperties: false,
};

/** Cloudinary resize in the URL: the same image at thumbnail size. */
const thumbnailUrl = (url, width = 160) => String(url).replace("/upload/", `/upload/w_${width},c_scale/`);

/**
 * @param {object} p
 * @param {string[]} p.imageUrls   feed-size images (the 1x1 of each canvas, plus 4x5 for statics)
 * @returns {Promise<object>} CRITIC_SCHEMA answer plus { passed }
 */
async function critiqueCreative({ property, plan, imageUrls }) {
    const { criticThreshold } = getAdsLoopConfig().creative;

    const system = `You are a strict senior art director reviewing a Meta ad for Vihara before the team sees it. Score each rubric item 0-10:
- hierarchy: one clear focal point, obvious reading order
- legibility: every word readable at feed size AND at thumbnail size
- brand_match: Brand Kit colours, Inter, logo used correctly
- text_density: matches the planned text_density; less is better
- safe_zones: nothing important cut off or crowding the edges; 4x5 bottom area clear
- housing_copy: Fair Housing / Meta Housing rules (10 = fully compliant, 0 = clear violation)
"overall" is your judgement, not an average: a single serious problem caps it. Be specific in notes ("raise the price to 72px"), not general.

${HOUSING_RULES}`;

    const content = [
        textBlock(`Brand Kit:\n${await brandText()}`),
        textBlock(`Design rules (design-rules.md):\n${await activeRulesText()}`),
        textBlock(`Planned attributes: ${JSON.stringify(plan.attributes)}\nConcept: ${plan.concept}\nProperty facts: ${JSON.stringify(propertyFacts(property))}`),
    ];
    imageUrls.forEach((url, i) => {
        content.push(textBlock(`Image ${i + 1} at feed size:`), imageBlock(url), textBlock(`Image ${i + 1} at thumbnail size:`), imageBlock(thumbnailUrl(url)));
    });
    content.push(textBlock("Review it."));

    const review = await claudeJson({ system, content, schema: CRITIC_SCHEMA, effort: "high", maxTokens: 16000 });
    return { ...review, passed: review.overall >= criticThreshold && review.housingCompliant && !review.ruleViolations.length };
}

// ---------------------------------------------------------------------------
// 4. Rules from an approved review thread
// ---------------------------------------------------------------------------
const RULES_SCHEMA = {
    type: "object",
    properties: {
        rules: {
            type: "array",
            items: { type: "string" },
            description: "0-3 new short, testable design rules. Empty when the thread teaches nothing general.",
        },
    },
    required: ["rules"],
    additionalProperties: false,
};

async function extractReviewRules({ ltId, threadText }) {
    const system = `You turn creative review feedback into design rules for future Vihara ads. A good rule is short, testable on any creative and general (not about this one property), for example "Price text >= 64px on a 1080 canvas." or "Max 12 words of overlay text on statics.". Do not repeat an existing rule. Propose nothing if the feedback was specific to this creative.`;
    const content = [
        textBlock(`Existing rules:\n${await activeRulesText()}`),
        textBlock(`Review thread for ${ltId} (oldest first):\n${threadText}`),
    ];
    const out = await claudeJson({ system, content, schema: RULES_SCHEMA, effort: "medium", maxTokens: 8000 });
    return (out.rules || []).map((r) => String(r).trim()).filter(Boolean).slice(0, 3);
}

module.exports = {
    propertyPhotos,
    propertyFacts,
    planCreative,
    buildCreative,
    critiqueCreative,
    extractReviewRules,
    thumbnailUrl,
    RUBRIC,
};
