const mongoose = require("mongoose");

// One document per creative of the Meta Ads Loop (spec table `creatives`).
// The core id (BB449-S01) never changes and stays with the creative from
// planning through Meta and back, so every result row can be joined to it and
// its design attributes. The name (CR- / R1- / AP-BB449-S01) shows its review
// stage and changes at three events only: first post, each revision built
// from thread feedback, and Approve (services/adsLoop/creativeId.js).

const STAGE_PATTERN = /^(CR|R[1-9]\d?|AP)$/;

const CREATIVE_STATUS = Object.freeze({
    PLANNED: "planned",
    BUILDING: "building",
    IN_REVIEW: "in_review",
    APPROVED: "approved",
    SCHEDULED: "scheduled",
    LIVE: "live",
    PAUSED: "paused",
    RETIRED: "retired",
    FAILED: "failed",
});

// One carousel card (BB449-C01-c1 ...) or the single static image.
const cardSchema = new mongoose.Schema(
    {
        cardId: { type: String, required: true }, // "BB449-C01-c1", or the core id for a static
        headline: { type: String, default: "" },
        description: { type: String, default: "" },
        html: { type: String, default: "" },
        // ratio ("1x1", "4x5") -> public Cloudinary URL
        assetUrls: { type: Map, of: String, default: {} },
    },
    { _id: false }
);

const criticSchema = new mongoose.Schema(
    {
        score: { type: Number, default: null },
        passed: { type: Boolean, default: false },
        scores: { type: mongoose.Schema.Types.Mixed, default: null },
        notes: { type: [String], default: [] },
        ruleViolations: { type: [String], default: [] },
        autoRevised: { type: Boolean, default: false },
    },
    { _id: false }
);

// One rename (CR -> R1 -> ... -> AP).
const nameHistorySchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        stage: { type: String, required: true },
        version: { type: Number, default: null },
        at: { type: Date, default: Date.now },
        by: { type: String, default: "" }, // Slack user id, "" for the pipeline
    },
    { _id: false }
);

const adCreativeSchema = new mongoose.Schema(
    {
        coreId: { type: String, required: true, unique: true, trim: true },
        // Current name, e.g. "R1-BB449-S01"; "" until first posted for review.
        name: { type: String, default: "" },
        stage: { type: String, default: "", validate: (v) => v === "" || STAGE_PATTERN.test(v) },
        nameHistory: { type: [nameHistorySchema], default: [] },
        propertyCode: { type: String, default: "", index: true }, // "BB449"
        property: { type: mongoose.Schema.Types.ObjectId, ref: "productModel", required: true, index: true },
        propertySlug: { type: String, default: "" },
        parentCoreId: { type: String, default: null, index: true },
        // The Creative OS record for this creative, when it was built there: every
        // figure with its source, hook id, ICP, direction and the generated-image flag.
        // Supported percentages and dollar figures in it pass the copy policy check.
        sourceRecord: { type: mongoose.Schema.Types.Mixed, default: null },
        // format, layout, hook, photo_type, cta, text_density (config/adsLoop/attributeTags.js)
        attributes: { type: mongoose.Schema.Types.Mixed, required: true },
        status: { type: String, enum: Object.values(CREATIVE_STATUS), default: CREATIVE_STATUS.PLANNED, index: true },
        // The proposal ("go" in #ads-weekly) that asked for this creative, if any.
        proposalId: { type: String, default: null },
        // What the proposal asked for ({ kind, rationale, attributes }), and Claude's full plan.
        brief: { type: mongoose.Schema.Types.Mixed, default: null },
        plan: { type: mongoose.Schema.Types.Mixed, default: null },
        // The idea in one line, plus the ad copy outside the image.
        concept: { type: String, default: "" },
        copy: {
            headline: { type: String, default: "" },
            primaryText: { type: String, default: "" },
            overlayText: { type: String, default: "" },
        },
        // CSS shared by every card of the current version; each card holds its own HTML.
        css: { type: String, default: "" },
        cards: { type: [cardSchema], default: [] },
        // Flat ratio -> URL map for statics, card -> ratio -> URL for carousels (spec asset_urls).
        assetUrls: { type: mongoose.Schema.Types.Mixed, default: {} },
        cloudinaryFolder: { type: String, default: "" },
        version: { type: Number, default: 0 },
        revisionCount: { type: Number, default: 0 }, // review rounds before approval
        critic: { type: criticSchema, default: () => ({}) },
        // The reviewer's notes for the next version, and the history of all notes.
        pendingNotes: { type: String, default: "" },
        notesHistory: { type: [String], default: [] },
        rejectionReason: { type: String, default: "" },
        approvedBy: { type: String, default: null }, // Slack user id
        approvedAt: { type: Date, default: null },
        approvedVersion: { type: Number, default: null },
        postOrganically: { type: Boolean, default: false },
        // Slack review thread in #creative-review.
        slack: {
            channel: { type: String, default: "" },
            threadTs: { type: String, default: "" },
        },
        // Zernio / Meta ids once launched or posted.
        zernioPostId: { type: String, default: null, index: true },
        meta: {
            zernioAdId: { type: String, default: null },
            adId: { type: String, default: null, index: true }, // Meta platform ad id
            adSetId: { type: String, default: null },
            campaignId: { type: String, default: null },
            adName: { type: String, default: "" },
            dailyBudget: { type: Number, default: null },
            landingUrl: { type: String, default: "" },
        },
        error: { type: String, default: "" },
    },
    { timestamps: true }
);

adCreativeSchema.index({ "slack.threadTs": 1 });

const AdCreative = mongoose.model("adCreative", adCreativeSchema);
module.exports = AdCreative;
module.exports.CREATIVE_STATUS = CREATIVE_STATUS;
module.exports.STAGE_PATTERN = STAGE_PATTERN;
