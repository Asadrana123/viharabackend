// config/marketing/marketingConstants.js
//
// Shared enums for the Property Marketing Engine. Models, services and the
// controller all read from here so a value is only ever spelled once.

const BUYER_TYPES = Object.freeze({
    INVESTOR: "investor",
    OWNER_OCCUPANT: "owner-occupant",
    RETAIL: "retail",
});
const BUYER_TYPE_VALUES = Object.freeze(Object.values(BUYER_TYPES));

// Keys the web research agent (build step 3) may write to the Enrichment record.
const ENRICHMENT_KEYS = Object.freeze([
    "neighborhood",
    "transit",
    "amenities",
    "priceTrend",
    "comps",
    "growthSignals",
]);

// Research items below this confidence are treated as unverifiable (Blocked).
const MIN_RESEARCH_CONFIDENCE = 0.6;

const GATE_BINS = Object.freeze({
    VERIFIED: "verified",
    RESEARCHED: "researched",
    BLOCKED: "blocked",
});

const RUN_STATUS = Object.freeze({
    RUNNING: "running",
    READY: "ready",
    FAILED: "failed",
    APPROVED: "approved",
});
const RUN_STATUS_VALUES = Object.freeze(Object.values(RUN_STATUS));

// A run still "running" after this long was cut off (e.g. a server restart).
const RUN_STALE_AFTER_MS = 15 * 60 * 1000;

const CHANNELS = Object.freeze({
    META: "meta",
    LANDING_PAGE: "landingPage",
    EMAIL: "email",
    SMS: "sms",
});
const CHANNEL_VALUES = Object.freeze(Object.values(CHANNELS));

// Where a line's current text came from.
const LINE_SOURCES = Object.freeze({
    AI: "ai",
    MANUAL: "manual",
    PLACEHOLDER: "placeholder",
});
const LINE_SOURCE_VALUES = Object.freeze(Object.values(LINE_SOURCES));

const IMAGE_FORMATS = Object.freeze(["1:1", "9:16"]);

module.exports = {
    BUYER_TYPES,
    BUYER_TYPE_VALUES,
    ENRICHMENT_KEYS,
    MIN_RESEARCH_CONFIDENCE,
    GATE_BINS,
    RUN_STATUS,
    RUN_STATUS_VALUES,
    RUN_STALE_AFTER_MS,
    CHANNELS,
    CHANNEL_VALUES,
    LINE_SOURCES,
    LINE_SOURCE_VALUES,
    IMAGE_FORMATS,
};
