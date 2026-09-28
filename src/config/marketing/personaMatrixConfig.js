// config/marketing/personaMatrixConfig.js
//
// The PRD's "ICP x Awareness matrix" and "Strategic entry-point map" as data.
// matrixService reads this to decide which cells a property can support.
// Adding retail auctions later = filling PERSONAS_BY_BUYER_TYPE.retail.

const { BUYER_TYPES } = require("./marketingConstants");

// `requires` names a readiness check computed by the verification gate:
//   photos      - the property has at least one photo
//   valueGap    - the value gap is Verified
//   auctionDate - the auction end date is set and not in the past
const AWARENESS_STAGES = Object.freeze([
    {
        id: "unaware",
        label: "Unaware",
        order: 1,
        audience: "Cold prospecting",
        defaultCta: "Learn More",
        requires: ["photos"],
    },
    {
        id: "problem-aware",
        label: "Problem-Aware",
        order: 2,
        audience: "Cold prospecting",
        defaultCta: "Learn More",
        requires: [],
    },
    {
        id: "solution-aware",
        label: "Solution-Aware",
        order: 3,
        audience: "Cold prospecting / broad",
        defaultCta: "Learn More",
        requires: [],
    },
    {
        id: "product-aware",
        label: "Product-Aware",
        order: 4,
        audience: "Warm retargeting (visitors, video viewers)",
        defaultCta: "See the Deal",
        requires: ["valueGap"],
    },
    {
        id: "most-aware",
        label: "Most-Aware",
        order: 5,
        audience: "Warm retargeting (registered, engaged)",
        defaultCta: "Register to Bid",
        requires: ["auctionDate"],
    },
]);

// Human-readable reason shown when a stage is skipped for a missing input.
const REQUIREMENT_LABELS = Object.freeze({
    photos: "no property photos",
    valueGap: "value gap is not verified",
    auctionDate: "auction date is not set",
});

// entryStage = where the persona usually enters the funnel. They get creatives
// from that stage onward; earlier (beginner) stages are skipped.
const PERSONAS = Object.freeze({
    flippers: { id: "flippers", label: "Flippers / Uppers", entryStage: "solution-aware" },
    "first-time-investor": { id: "first-time-investor", label: "First-Time Investor", entryStage: "unaware" },
    "serial-investor": { id: "serial-investor", label: "Serial Investor", entryStage: "problem-aware" },
    "buy-and-hold": { id: "buy-and-hold", label: "Buy & Hold", entryStage: "problem-aware" },
    institutional: { id: "institutional", label: "Institutional Buyer", entryStage: "product-aware" },
    developers: { id: "developers", label: "Developers / Construction", entryStage: "solution-aware" },
    "home-owner": { id: "home-owner", label: "First-Time / Repeat Home Owner", entryStage: "unaware" },
});

// Buys to make money -> investor. Buys to live in -> owner-occupant.
// Retail personas are not defined in the PRD yet, so retail runs are refused.
const PERSONAS_BY_BUYER_TYPE = Object.freeze({
    [BUYER_TYPES.INVESTOR]: [
        "flippers",
        "first-time-investor",
        "serial-investor",
        "buy-and-hold",
        "institutional",
        "developers",
    ],
    [BUYER_TYPES.OWNER_OCCUPANT]: ["home-owner"],
    [BUYER_TYPES.RETAIL]: [],
});

// Owner-occupant funnels never say "Register to Bid".
const CTA_OVERRIDES_BY_BUYER_TYPE = Object.freeze({
    [BUYER_TYPES.OWNER_OCCUPANT]: { "Register to Bid": "See the Deal" },
    [BUYER_TYPES.RETAIL]: { "Register to Bid": "See the Deal" },
});

module.exports = {
    AWARENESS_STAGES,
    REQUIREMENT_LABELS,
    PERSONAS,
    PERSONAS_BY_BUYER_TYPE,
    CTA_OVERRIDES_BY_BUYER_TYPE,
};
