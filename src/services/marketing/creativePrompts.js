// services/marketing/creativePrompts.js
//
// Builds the image prompt for one planned ad image (creativePlanner spec).
// Two styles, chosen per provider in creativeConfig (promptStyle):
//   compact - short, direct instructions. FLUX follows these best.
//   master  - the designer's Vihara master prompt, adapted for automation.
//             GPT Image handles long, detailed prompts well.
//
// Rules shared by both styles (learned from the first test images):
//   - Every word on the image is in spec.texts, already checked in code.
//   - The AI never draws the logo. Cloudinary places the real logo file in
//     the top-left corner afterwards, so the prompt keeps that area empty.
//   - No words that invite UI drawing ("Stories", "profile bar", "app").
//   - No bare hex codes in the compact prompt (FLUX printed them as text).

const { PROMPT_STYLES } = require("../../config/marketing/creativeConfig");

// Visual idea per concept (from the master prompt's concept engine).
const CONCEPT_GUIDANCE = Object.freeze({
    "Price Tag": "A clean graphic price-tag device makes the headline the central visual message.",
    "Editorial Poster": "Large typography, strong hierarchy, few graphic elements, the property photo as the hero.",
    "Property Card": "A premium product-card presentation: the property in a rounded card with clear labels.",
});

// Roles of the input images, in the order they are sent to the provider.
const IMAGE_ROLES = Object.freeze({
    PHOTO: "photo",
    REFERENCE: "reference",
});

/**
 * Input images for one spec, in send order: property photo, then references.
 * The logo is not sent; it is overlaid by Cloudinary after generation.
 * @returns {Array<{ role: string, url: string }>}
 */
function collectInputImages(spec, maxImages) {
    const images = [];
    if (spec.photoUrl) images.push({ role: IMAGE_ROLES.PHOTO, url: spec.photoUrl });
    (spec.referenceUrls || []).forEach((url) => images.push({ role: IMAGE_ROLES.REFERENCE, url }));
    return images.slice(0, maxImages);
}

const quote = (text) => `"${String(text).replace(/"/g, "'")}"`;
const hasPhoto = (inputs) => inputs.some((i) => i.role === IMAGE_ROLES.PHOTO);
const isTall = (spec) => spec.format === "9:16";

function textLines(texts, { ctaStyle }) {
    const lines = [];
    if (texts.headline) lines.push(`Headline (largest text): ${quote(texts.headline)}`);
    if (texts.secondaryHeadline) lines.push(`Secondary line: ${quote(texts.secondaryHeadline)}`);
    if (texts.supportingCopy) lines.push(`Small supporting line: ${quote(texts.supportingCopy)}`);
    if (texts.cta) lines.push(`Button text: ${quote(texts.cta)}, ${ctaStyle}.`);
    return lines.join("\n");
}

function inputImageLines(inputs) {
    return inputs
        .map((img, i) => {
            const n = i + 1;
            return img.role === IMAGE_ROLES.PHOTO
                ? `Image ${n}: the real property photograph (locked asset).`
                : `Image ${n}: a design reference (layout and feel only).`;
        })
        .join("\n");
}

// Matches LOGO_PLACEMENT in creativeConfig (9:16 logo sits lower).
function logoAreaRule(spec) {
    const area = isTall(spec)
        ? "the upper-left area, from the top edge down to about one sixth of the height and about a quarter of the width"
        : "the top-left corner, about a quarter of the width and one eighth of the height";
    return `Keep ${area} as a clean, plain, empty space: the real brand logo is placed there afterwards. Do not draw any logo, emblem or wordmark anywhere. The word Vihara may appear only where it is part of the text lines above.`;
}

const FLAT_AD_RULE =
    "This is a flat advertisement graphic. Do not draw a phone, app screen, browser, social media interface, menu icons, progress bars or any on-screen controls.";

// ---------------------------------------------------------------------------
// Compact style (FLUX)
// ---------------------------------------------------------------------------
function buildCompactPrompt(spec, inputs) {
    const layout = [];
    if (!hasPhoto(inputs)) {
        layout.push("There is no property photo for this image. Make it a clean graphic card on a warm off-white background with the text as the hero. Do not draw any house or room.");
    }
    layout.push(
        isTall(spec)
            ? "Tall vertical poster composition designed for this shape, not a stretched square. Keep all text and the button in the middle area, with calm margins at the top and bottom."
            : "Balanced square poster composition."
    );

    const photoRule = hasPhoto(inputs)
        ? "\nThe property photo is the hero. Use it exactly as it is: only crop, resize, or place it in a rounded card with a thin border or soft shadow. Keep the house, sky, landscaping and lighting unchanged."
        : "";

    return [
        `A finished, premium real estate advertisement for Vihara, a US property marketplace, ${spec.size.generate.width}x${spec.size.generate.height}.`,
        `Style: modern, clean, editorial, high-trust, generous white space, clear hierarchy, sharp alignment. Audience: ${spec.audience}.`,
        `Concept: ${spec.concept}. ${CONCEPT_GUIDANCE[spec.concept] || ""}`.trim(),
        inputs.length ? `\nINPUT IMAGES\n${inputImageLines(inputs)}${photoRule}` : "",
        `\nTEXT ON THE IMAGE\nRender each line exactly as written, letter for letter, with the same numbers, capitals and punctuation. Show each line once. This is the only text on the image.\n${textLines(spec.texts, { ctaStyle: "in a rounded bright royal blue button with white letters" })}`,
        `\nLAYOUT\n${layout.join("\n")}\n${logoAreaRule(spec)}`,
        "\nCOLORS AND TYPE\nBright royal blue as the main accent, a small touch of deep red, near-black text, warm off-white and white backgrounds, soft gray for small text. Headline in a very heavy geometric sans-serif; other text in a clean regular sans-serif. Crisp, legible typography.",
        `\n${FLAT_AD_RULE} Keep it clean: no extra words, numbers, badges, icons, people, vehicles or watermarks.`,
    ]
        .filter(Boolean)
        .join("\n");
}

// ---------------------------------------------------------------------------
// Master style (GPT Image) - adapted from the designer's master prompt
// ---------------------------------------------------------------------------
function buildMasterPrompt(spec, inputs) {
    const withPhoto = hasPhoto(inputs);
    const hasReferences = inputs.some((i) => i.role === IMAGE_ROLES.REFERENCE);
    const { width, height } = spec.size.generate;

    const sections = [
        `You are Vihara AI's in-house creative generation engine. Turn the brief below into one production-ready real estate advertising creative that looks designed by a premium real estate performance-marketing creative team.

Answer this question visually: what is the strongest way to communicate this specific property opportunity to this audience while keeping Vihara's premium brand and the real property photograph intact?`,

        inputs.length ? `# INPUT IMAGES\n${inputImageLines(inputs)}` : "",

        `# CREATIVE BRIEF
Creative concept: ${spec.concept}. ${CONCEPT_GUIDANCE[spec.concept] || ""}
Creative objective: communicate a real property opportunity clearly within one to two seconds of viewing.
Target audience: ${spec.audience}.
Aspect ratio: ${spec.format}. Output size: ${width} x ${height}.`,

        `# TEXT ON THE CREATIVE (the only text allowed)
${textLines(spec.texts, { ctaStyle: "in a rounded Vihara blue button with white text, generous padding, optional white arrow icon" })}

Render every line exactly as written: same words, capitalization, punctuation, dollar signs, commas and numbers. Do not rewrite, shorten, correct, reorder or repeat any line. Do not add any other text: no taglines, labels, locations, prices, urgency ("Act now", "Limited time"), testimonials, ratings, statistics, badges or guarantees.`,

        hasReferences
            ? `# HOW TO USE THE REFERENCE IMAGES
They are design references, not assets to copy. Study their composition, hierarchy, spacing, typography scale, image placement, negative space, color relationships, card treatment and CTA placement, then create a new Vihara creative with the same design logic. Never copy their text, numbers, property, logos or watermarks.`
            : "",

        withPhoto
            ? `# THE PROPERTY PHOTO IS LOCKED
The property photograph is the source of truth. Do not redraw, regenerate, beautify, renovate or restyle the house. Do not change the architecture, roof, windows, doors, siding, landscaping, trees, driveway, sky, season, lighting or perspective, and do not add or remove rooms, people or vehicles. The photo may only be cropped, resized, positioned, masked, placed in a card or rounded rectangle, given a border or subtle shadow, or partly overlapped by graphic elements. Design around the photograph.`
            : `# NO PROPERTY PHOTO
This creative has no property photo. Make it a clean graphic composition where the text is the hero. Do not draw any house, room or property.`,

        `# LOGO
${logoAreaRule(spec)}`,

        `# VIHARA BRAND SYSTEM
Colors: primary blue (#1B4FD1), Vihara red (#D81E2C) as a small accent only, near black (#0A0A0A), warm off-white (#F0F0EF), white, muted gray (#6B7280). Color codes are styling instructions only; never write them on the creative.
Typography: headlines in Inter Black or a heavy geometric sans-serif, supporting text in Inter Regular, labels in Inter Medium or Semi Bold.
Feel: premium, modern, institutional, confident, clean, editorial, high-trust.
Avoid: cheap foreclosure aesthetics, generic real estate flyers, clutter, excessive icons, badges, gradients or shadows, stock-photo and discount-store looks.`,

        `# COMPOSITION
Hierarchy: 1. the main creative idea, 2. the headline, 3. the property image, 4. the price or dollar figure, 5. supporting facts, 6. the button. Use scale, whitespace, position and contrast; do not make everything equally prominent. Whitespace is intentional.
${isTall(spec)
    ? "Design specifically for a tall vertical 9:16 format. Recompose the hierarchy vertically; do not stretch or crop a square layout. Keep text and the button in the middle area with calm margins at the top and bottom."
    : "Use a balanced square 1:1 composition."}
${FLAT_AD_RULE}
When decoration conflicts with important information, remove the decoration. When styling conflicts with the property photo, protect the photo. When complexity conflicts with readability, choose readability.`,

        `# FINAL CHECK BEFORE RENDERING
Every text line appears exactly once and exactly as written. No extra text, numbers or symbols. No logo drawn and the logo area is clear. ${withPhoto ? "The property photo is unaltered. " : ""}No UI, phone or screenshot elements. No distorted objects, duplicate elements, malformed letters or watermarks.

Return only the finished creative.`,
    ];

    return sections.filter(Boolean).join("\n\n");
}

/**
 * @param {object} spec    creativePlanner spec
 * @param {Array<{ role: string }>} inputs  collectInputImages() result (same order as sent)
 * @param {string} [style] PROMPT_STYLES value
 * @returns {string}
 */
function buildCreativePrompt(spec, inputs, style = PROMPT_STYLES.COMPACT) {
    return style === PROMPT_STYLES.MASTER ? buildMasterPrompt(spec, inputs) : buildCompactPrompt(spec, inputs);
}

module.exports = {
    buildCreativePrompt,
    collectInputImages,
    IMAGE_ROLES,
};
