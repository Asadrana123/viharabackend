// config/marketing/copySpecConfig.js
//
// The shape of every piece of copy the engine writes. The same spec drives
// the Gemini prompt (which JSON keys to return, length guidance) and the
// lines saved on the MarketingRun, so the two can never drift apart.
//
//   requiresValueGap - never written when the value gap is Blocked; the line
//                      becomes a [NEEDS INPUT: ...] placeholder instead.

const { CHANNELS } = require("./marketingConstants");

const metaFields = [
    { field: "headline", label: "Headline", maxChars: 40 },
    { field: "primaryText", label: "Primary text", maxChars: 250 },
    { field: "description", label: "Description", maxChars: 30 },
];

// Meta: written once per buildable matrix cell.
const META_GROUPS = Object.freeze([
    {
        group: "staticA",
        label: "Static A (value gap)",
        angle: "The value gap in dollars is the hero message.",
        requiresValueGap: true,
        fields: metaFields,
    },
    {
        group: "staticB",
        label: "Static B (reassurance)",
        angle: "Reassurance and the property itself: verified facts, location, what the buyer gets.",
        fields: metaFields,
    },
    {
        group: "carousel",
        label: "Carousel (5 cards)",
        angle: "A 5-card story: hero photo, facts, location or features, value gap, call to action.",
        fields: [
            ...metaFields,
            { field: "card1", label: "Card 1 (hero photo)", maxChars: 60 },
            { field: "card2", label: "Card 2 (property facts)", maxChars: 60 },
            { field: "card3", label: "Card 3 (location or features)", maxChars: 60 },
            { field: "card4", label: "Card 4 (value gap)", maxChars: 60, requiresValueGap: true },
            { field: "card5", label: "Card 5 (call to action)", maxChars: 60 },
        ],
    },
]);

// Landing page: copy blocks only (pages already exist).
const LANDING_PAGE_GROUPS = Object.freeze([
    {
        group: "hero",
        label: "Hero",
        fields: [
            { field: "headline", label: "Headline", maxChars: 70 },
            { field: "subheadline", label: "Subheadline", maxChars: 160 },
        ],
    },
    { group: "propertyFacts", label: "Property facts", fields: [{ field: "body", label: "Body", maxChars: 500 }] },
    {
        group: "valueGap",
        label: "Value gap explanation",
        requiresValueGap: true,
        fields: [{ field: "body", label: "Body", maxChars: 400 }],
    },
    { group: "visuals", label: "Visuals section", fields: [{ field: "caption", label: "Caption", maxChars: 160 }] },
    { group: "howItWorks", label: "How it works", fields: [{ field: "body", label: "Body", maxChars: 600 }] },
    { group: "trust", label: "Trust section", fields: [{ field: "body", label: "Body", maxChars: 400 }] },
    {
        group: "faq",
        label: "FAQs",
        fields: [
            { field: "q1", label: "Question 1", maxChars: 120 },
            { field: "a1", label: "Answer 1", maxChars: 350 },
            { field: "q2", label: "Question 2", maxChars: 120 },
            { field: "a2", label: "Answer 2", maxChars: 350 },
            { field: "q3", label: "Question 3", maxChars: 120 },
            { field: "a3", label: "Answer 3", maxChars: 350 },
        ],
    },
    { group: "finalCta", label: "Final call to action", fields: [{ field: "headline", label: "Headline", maxChars: 80 }] },
]);

const EMAIL_GROUPS = Object.freeze([
    {
        group: "launchEmail",
        label: "Launch email",
        fields: [
            { field: "subject", label: "Subject", maxChars: 60 },
            { field: "preview", label: "Preview text", maxChars: 90 },
            { field: "body", label: "Body", maxChars: 1200 },
        ],
    },
]);

const SMS_GROUPS = Object.freeze([
    {
        group: "smsNudge",
        label: "SMS nudge (registered, not progressed)",
        fields: [{ field: "text", label: "Message", maxChars: 160 }],
    },
]);

const CHANNEL_GROUPS = Object.freeze({
    [CHANNELS.META]: META_GROUPS,
    [CHANNELS.LANDING_PAGE]: LANDING_PAGE_GROUPS,
    [CHANNELS.EMAIL]: EMAIL_GROUPS,
    [CHANNELS.SMS]: SMS_GROUPS,
});

// Message emphasis per awareness stage (prompt guidance only).
const STAGE_GUIDANCE = Object.freeze({
    "unaware": "Pattern interrupt. Do not assume they know property auctions exist. Lead with the photo and a surprising verified fact.",
    "problem-aware": "Speak to the difficulty of finding good property at a fair price. Show this property as a concrete option.",
    "solution-aware": "They know buying at auction is an option. Show why this specific property is worth a look.",
    "product-aware": "They know Vihara. Lead with the verified value gap in dollars and the key facts.",
    "most-aware": "Ready to act. Lead with the auction date and a direct call to action.",
});

// Persona angle (prompt guidance only). Targeting stays broad; only the message changes.
const PERSONA_GUIDANCE = Object.freeze({
    "flippers": "Cares about purchase price, repair scope and resale upside.",
    "first-time-investor": "New to property investing. Plain language, explain simply, build confidence.",
    "serial-investor": "Experienced. Wants the numbers fast and a smooth repeatable process.",
    "buy-and-hold": "Cares about long-term holding and monthly rent.",
    "institutional": "Wants verified numbers, scale and a clean process. No hype.",
    "developers": "Cares about the lot, zoning and what can be built or rebuilt.",
    "home-owner": "Wants a place to live. Talk about the home itself: space, rooms, location, value.",
});

module.exports = {
    META_GROUPS,
    LANDING_PAGE_GROUPS,
    EMAIL_GROUPS,
    SMS_GROUPS,
    CHANNEL_GROUPS,
    STAGE_GUIDANCE,
    PERSONA_GUIDANCE,
};
