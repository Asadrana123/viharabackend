const mongoose = require("mongoose");
const { ENRICHMENT_KEYS } = require("../../config/marketing/marketingConstants");

// Web research for one property (PRD Step 1). Kept physically separate from
// productModel so a web figure can never flow into the value gap. The gate
// reads it as Researched context only.

const enrichmentItemSchema = new mongoose.Schema(
    {
        key: {
            type: String,
            enum: ENRICHMENT_KEYS,
            required: true,
        },
        value: {
            type: mongoose.Schema.Types.Mixed,
            required: true,
        },
        sourceUrl: {
            type: String,
            required: true,
            trim: true,
        },
        confidence: {
            type: Number,
            min: 0,
            max: 1,
            required: true,
        },
        gatheredAt: {
            type: Date,
            default: Date.now,
        },
    },
    { _id: false }
);

// A key the research agent looked for but could not find reliably.
const enrichmentGapSchema = new mongoose.Schema(
    {
        key: {
            type: String,
            enum: ENRICHMENT_KEYS,
            required: true,
        },
        reason: {
            type: String,
            default: "",
        },
        recordedAt: {
            type: Date,
            default: Date.now,
        },
    },
    { _id: false }
);

const enrichmentSchema = new mongoose.Schema(
    {
        property: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "productModel",
            required: true,
            unique: true,
        },
        items: {
            type: [enrichmentItemSchema],
            default: [],
        },
        gaps: {
            type: [enrichmentGapSchema],
            default: [],
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("marketingEnrichment", enrichmentSchema);
