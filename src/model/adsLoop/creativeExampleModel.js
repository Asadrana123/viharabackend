const mongoose = require("mongoose");

// The example library (spec `library/`): rendered PNGs with a small sidecar.
// When a new creative is planned, a few matching examples are sent to Claude
// as images. This is the main way it picks up the team's visual taste.

const EXAMPLE_LABELS = Object.freeze(["approved", "rejected", "winner", "loser", "reference"]);

const creativeExampleSchema = new mongoose.Schema(
    {
        ltId: { type: String, default: null, index: true }, // null for outside "reference" ads
        label: { type: String, enum: EXAMPLE_LABELS, required: true, index: true },
        attributes: { type: mongoose.Schema.Types.Mixed, default: {} },
        // Why it was approved, the reviewer's reason for a rejection, or what to learn from a reference.
        why: { type: String, default: "" },
        imageUrl: { type: String, required: true },
        ctr: { type: Number, default: null },
        qualifiedLeads: { type: Number, default: null },
        costPerQualifiedLead: { type: Number, default: null },
        addedBy: { type: String, default: "" },
    },
    { timestamps: true }
);

// One label per creative ("winner" replaces "approved" when results come in).
creativeExampleSchema.index({ ltId: 1, label: 1 }, { unique: true, partialFilterExpression: { ltId: { $type: "string" } } });

module.exports = mongoose.model("creativeExample", creativeExampleSchema);
module.exports.EXAMPLE_LABELS = EXAMPLE_LABELS;
