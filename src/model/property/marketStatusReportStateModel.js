const mongoose = require("mongoose");

// One document (key "default"): what the daily property status check saw last time, so
// the Slack summary is only posted when something changed (services/property/statusReportRules.js).

const marketStatusReportStateSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true, default: "default" },
        // The not-for-sale list in the last summary posted.
        notForSaleKey: { type: String, default: "" },
        // Properties that failed in the last check (posted or not).
        lastFailedIds: { type: [String], default: [] },
        // Properties whose repeated failure was in the last summary posted.
        postedFailedIds: { type: [String], default: [] },
        lastPostedAt: { type: Date, default: null },
        lastCheckAt: { type: Date, default: null },
    },
    { timestamps: true }
);

module.exports = mongoose.model("marketStatusReportState", marketStatusReportStateSchema);
