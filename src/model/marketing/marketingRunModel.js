const mongoose = require("mongoose");
const {
    BUYER_TYPE_VALUES,
    RUN_STATUS,
    RUN_STATUS_VALUES,
    CHANNEL_VALUES,
    LINE_SOURCES,
    LINE_SOURCE_VALUES,
    IMAGE_FORMATS,
    IMAGE_JOB_STATUS,
    IMAGE_JOB_STATUS_VALUES,
} = require("../../config/marketing/marketingConstants");

// One document per engine run on a property. Runs are versioned per property
// (1, 2, 3 ...). A re-run always creates a new version, and an approved run
// can never be modified.

// A compliance problem found on a line.
const flagSchema = new mongoose.Schema(
    {
        rule: { type: String, required: true },
        message: { type: String, default: "" },
        match: { type: String, default: "" },
    },
    { _id: false }
);

// One piece of copy (a headline, an email subject, an SMS, ...).
// Kept flat so any line can be edited by its _id.
const lineSchema = new mongoose.Schema({
    channel: {
        type: String,
        enum: CHANNEL_VALUES,
        required: true,
    },
    // Matrix cell key for Meta lines ("flippers__product-aware"), "" otherwise.
    cellKey: {
        type: String,
        default: "",
    },
    // Creative / section inside the channel: "staticA", "carousel", "hero", "launchEmail" ...
    group: {
        type: String,
        required: true,
    },
    // Field inside the group: "headline", "primaryText", "card1", "subject" ...
    field: {
        type: String,
        required: true,
    },
    label: {
        type: String,
        default: "",
    },
    text: {
        type: String,
        default: "",
    },
    source: {
        type: String,
        enum: LINE_SOURCE_VALUES,
        default: LINE_SOURCES.AI,
    },
    // Why the line is a [NEEDS INPUT: ...] placeholder, "" when it is real copy.
    placeholderReason: {
        type: String,
        default: "",
    },
    // Compliance warnings. On AI lines these never survive (the line becomes a
    // placeholder); on manual edits they are shown as warnings.
    flags: {
        type: [flagSchema],
        default: [],
    },
    regenerated: {
        type: Boolean,
        default: false,
    },
    editedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "userModel",
        default: null,
    },
    editedAt: {
        type: Date,
        default: null,
    },
});

// One buildable persona x awareness cell.
const cellSchema = new mongoose.Schema(
    {
        key: { type: String, required: true },
        personaId: { type: String, required: true },
        personaLabel: { type: String, default: "" },
        stageId: { type: String, required: true },
        stageLabel: { type: String, default: "" },
        stageOrder: { type: Number, default: 0 },
        audience: { type: String, default: "" },
        cta: { type: String, default: "" },
    },
    { _id: false }
);

const skippedCellSchema = new mongoose.Schema(
    {
        key: { type: String, required: true },
        personaLabel: { type: String, default: "" },
        stageLabel: { type: String, default: "" },
        reason: { type: String, default: "" },
    },
    { _id: false }
);

// Rendered ad images (build step 4). One per cell x slot x format; a
// regenerated image replaces the old one for the same slot.
const imageSchema = new mongoose.Schema(
    {
        cellKey: { type: String, required: true },
        // Creative slot from creativeConfig CREATIVE_SLOTS: "staticA", "carousel:card1" ...
        kind: { type: String, required: true },
        format: { type: String, enum: IMAGE_FORMATS, required: true },
        url: { type: String, required: true },
        // Cloudinary public id, kept so a replaced image can be cleaned up.
        publicId: { type: String, default: "" },
        provider: { type: String, default: "" },
        providerModel: { type: String, default: "" },
        // The exact on-image text used. The review screen marks the image as
        // outdated when the copy changes after it was made.
        textSnapshot: { type: String, default: "" },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "userModel", default: null },
        createdAt: { type: Date, default: Date.now },
    },
    { _id: false }
);

// A slot that could not be made during an image job.
const imageProblemSchema = new mongoose.Schema(
    {
        slot: { type: String, required: true }, // "carousel:card4 (1:1)"
        message: { type: String, default: "" },
    },
    { _id: false }
);

// Image generation state for one cell. One entry per cell; starting again
// replaces it.
const imageJobSchema = new mongoose.Schema(
    {
        cellKey: { type: String, required: true },
        status: { type: String, enum: IMAGE_JOB_STATUS_VALUES, default: IMAGE_JOB_STATUS.RUNNING },
        total: { type: Number, default: 0 },
        completed: { type: Number, default: 0 },
        failed: { type: Number, default: 0 },
        // Named "problems" because "errors" is reserved by Mongoose.
        problems: { type: [imageProblemSchema], default: [] },
        startedBy: { type: mongoose.Schema.Types.ObjectId, ref: "userModel", default: null },
        startedAt: { type: Date, default: Date.now },
        finishedAt: { type: Date, default: null },
    },
    { _id: false }
);

const marketingRunSchema = new mongoose.Schema(
    {
        property: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "productModel",
            required: true,
            index: true,
        },
        version: {
            type: Number,
            required: true,
            min: 1,
        },
        status: {
            type: String,
            enum: RUN_STATUS_VALUES,
            default: RUN_STATUS.RUNNING,
        },
        buyerType: {
            type: String,
            enum: BUYER_TYPE_VALUES,
            required: true,
        },
        progress: {
            stage: { type: String, default: "queued" },
            completed: { type: Number, default: 0 },
            total: { type: Number, default: 0 },
        },
        // Snapshot of the verification gate output for this run.
        gate: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        brief: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        cells: {
            type: [cellSchema],
            default: [],
        },
        skippedCells: {
            type: [skippedCellSchema],
            default: [],
        },
        lines: {
            type: [lineSchema],
            default: [],
        },
        images: {
            type: [imageSchema],
            default: [],
        },
        imageJobs: {
            type: [imageJobSchema],
            default: [],
        },
        error: {
            type: String,
            default: "",
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "userModel",
            required: true,
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "userModel",
            default: null,
        },
        approvedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

// One version number per property.
marketingRunSchema.index({ property: 1, version: 1 }, { unique: true });

// An approved run is frozen. The save that approves it is allowed; any later
// change is rejected so an approved asset set is never overwritten.
marketingRunSchema.pre("save", function (next) {
    if (!this.isNew && this.status === RUN_STATUS.APPROVED && !this.isModified("status") && this.isModified()) {
        return next(new Error("This run is approved and can no longer be changed"));
    }
    next();
});

module.exports = mongoose.model("marketingRun", marketingRunSchema);
