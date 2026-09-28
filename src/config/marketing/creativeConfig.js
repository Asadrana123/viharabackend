// config/marketing/creativeConfig.js
//
// Settings for ad image generation (PRD Step 6).
//
// The image provider only draws. Every word and number on an image comes from
// the run's copy lines and the brief's exact strings (creativePlanner.js), so
// the image always says the same thing as the ad, landing page and email.
//
// Switching providers: set MARKETING_IMAGE_PROVIDER (or `provider` below) to a
// name registered in services/marketing/creativeProviders.js.

const IMAGE_PROVIDERS = Object.freeze({
    BFL: "bfl",
    OPENAI: "openai",
});

// How the image prompt is written (services/marketing/creativePrompts.js).
//   compact - short, direct instructions (FLUX follows these best)
//   master  - the designer's full Vihara master prompt (GPT Image)
const PROMPT_STYLES = Object.freeze({
    COMPACT: "compact",
    MASTER: "master",
});

const CREATIVE_CONFIG = Object.freeze({
    provider: process.env.MARKETING_IMAGE_PROVIDER || IMAGE_PROVIDERS.BFL,

    providers: Object.freeze({
        [IMAGE_PROVIDERS.BFL]: Object.freeze({
            // "flux-2-pro"  = fast default (about 10 seconds per image).
            // "flux-2-flex" = best text rendering, slower and more expensive.
            model: "flux-2-pro",
            promptStyle: PROMPT_STYLES.COMPACT,
            // Property photo + designer references, all in one request.
            maxInputImages: 8,
            outputFormat: "png",
            safetyTolerance: 2,
        }),
        [IMAGE_PROVIDERS.OPENAI]: Object.freeze({
            // "gpt-image-2.5-sunburst" = best image fidelity and reference-image
            //                            preservation (slower).
            // "gpt-image-2.5-flare"    = faster, cheaper, slightly lower fidelity.
            model: "gpt-image-2.5-sunburst",
            promptStyle: PROMPT_STYLES.MASTER,
            baseUrl: "https://api.openai.com/v1",
            // Property photo + designer references, all in one request.
            maxInputImages: 8,
            // low | medium | high | auto (2.5 models also accept xhigh | max)
            quality: "high",
            // png | jpeg | webp
            outputFormat: "png",
            // Image generation at high quality can take a minute or more.
            requestTimeoutMs: 180000,
            // Downloading each input image before it is sent.
            downloadTimeoutMs: 30000,
        }),
    }),

    // Images generated at the same time for one ad set.
    concurrency: 2,

    cloudinaryFolder: "marketing-engine/creatives",

    // The real Vihara logo is never drawn by the AI. Cloudinary places the
    // actual logo file on every image after it is made, so it is always exact.
    // Upload the logo (transparent PNG) to Cloudinary once and set its public
    // id, e.g. "vihara/brand/logo". Empty = images are stored without a logo.
    logoPublicId: process.env.VIHARA_LOGO_PUBLIC_ID || "",
});

// Where the logo goes on each format, in final pixels (top-left corner).
// The prompt keeps this area empty. 9:16 sits lower so the Stories profile
// bar doesn't cover it.
const LOGO_PLACEMENT = Object.freeze({
    "1:1": Object.freeze({ width: 220, x: 56, y: 56 }),
    "9:16": Object.freeze({ width: 240, x: 64, y: 250 }),
});

// generate: size asked from the provider (FLUX needs multiples of 16).
// final:    size stored in Cloudinary and handed to the Meta team.
const IMAGE_SIZES = Object.freeze({
    "1:1": Object.freeze({
        generate: { width: 1088, height: 1088 },
        final: { width: 1080, height: 1080 },
    }),
    "9:16": Object.freeze({
        generate: { width: 1088, height: 1936 },
        final: { width: 1080, height: 1920 },
    }),
});

// Vihara brand system (from the designer's master prompt).
const BRAND = Object.freeze({
    colors: Object.freeze({
        primaryBlue: "#1B4FD1",
        red: "#D81E2C",
        nearBlack: "#0A0A0A",
        offWhite: "#F0F0EF",
        white: "#FFFFFF",
        mutedGray: "#6B7280",
    }),
    fonts: Object.freeze({
        headline: "Inter Black",
        body: "Inter Regular",
        label: "Inter Semi Bold",
    }),
});

// One entry per image made for each ad set (matrix cell).
//
//   kind              - stored on the image; unique per slot
//   group             - the copy group its text lines come from
//   concept           - the visual idea given to the provider
//   requiresValueGap  - never made when the value gap is Blocked
//   photoIndex        - which property photo to use (0 = main photo). When the
//                       property has no photo at that index, the image is drawn
//                       as a graphic card with no photo (PRD: no fake photos).
//   showCta           - the button text (cell CTA) appears on the image
//   formats           - keys of IMAGE_SIZES
//   texts             - on-image text, by role:
//                         { string: "valueGapLine" } exact brief string
//                         { line: "card1" }          the cell's copy line in `group`
//                       required: the slot is skipped if that text is missing,
//                       still a placeholder, or has a compliance warning.
const BOTH_FORMATS = Object.freeze(["1:1", "9:16"]);

const CREATIVE_SLOTS = Object.freeze([
    {
        kind: "staticA",
        group: "staticA",
        label: "Static A (value gap)",
        concept: "Price Tag",
        requiresValueGap: true,
        photoIndex: 0,
        showCta: true,
        formats: BOTH_FORMATS,
        texts: {
            headline: { string: "valueGapLine", required: true },
            secondaryHeadline: { string: "priceLine" },
            supportingCopy: { string: "specsLine" },
        },
    },
    {
        kind: "staticB",
        group: "staticB",
        label: "Static B (reassurance)",
        concept: "Editorial Poster",
        photoIndex: 0,
        showCta: true,
        formats: BOTH_FORMATS,
        texts: {
            headline: { line: "headline", required: true },
            secondaryHeadline: { string: "specsLine" },
            supportingCopy: { string: "cityState" },
        },
    },
    {
        kind: "carousel:card1",
        group: "carousel",
        label: "Carousel card 1 (hero photo)",
        concept: "Property Card",
        photoIndex: 0,
        formats: BOTH_FORMATS,
        texts: {
            headline: { line: "card1", required: true },
            secondaryHeadline: { string: "cityState" },
        },
    },
    {
        kind: "carousel:card2",
        group: "carousel",
        label: "Carousel card 2 (property facts)",
        concept: "Property Card",
        photoIndex: 1,
        formats: BOTH_FORMATS,
        texts: {
            headline: { line: "card2", required: true },
            supportingCopy: { string: "specsLine" },
        },
    },
    {
        kind: "carousel:card3",
        group: "carousel",
        label: "Carousel card 3 (location or features)",
        concept: "Property Card",
        photoIndex: 2,
        formats: BOTH_FORMATS,
        texts: {
            headline: { line: "card3", required: true },
            supportingCopy: { string: "cityState" },
        },
    },
    {
        kind: "carousel:card4",
        group: "carousel",
        label: "Carousel card 4 (value gap)",
        concept: "Property Card",
        requiresValueGap: true,
        photoIndex: null,
        formats: BOTH_FORMATS,
        texts: {
            headline: { string: "valueGapLine", required: true },
            secondaryHeadline: { string: "priceLine" },
            supportingCopy: { string: "estimateLine" },
        },
    },
    {
        kind: "carousel:card5",
        group: "carousel",
        label: "Carousel card 5 (call to action)",
        concept: "Property Card",
        photoIndex: 0,
        showCta: true,
        formats: BOTH_FORMATS,
        texts: {
            headline: { line: "card5", required: true },
            secondaryHeadline: { string: "auctionDateLine" },
        },
    },
]);

// Designer reference creatives (public URLs, e.g. Cloudinary) per copy group.
// Style guides only: the provider copies their layout and feel, never their text.
const REFERENCE_IMAGES = Object.freeze({
    staticA: [],
    staticB: [],
    carousel: [],
});

module.exports = {
    IMAGE_PROVIDERS,
    PROMPT_STYLES,
    CREATIVE_CONFIG,
    LOGO_PLACEMENT,
    IMAGE_SIZES,
    BRAND,
    CREATIVE_SLOTS,
    REFERENCE_IMAGES,
};
