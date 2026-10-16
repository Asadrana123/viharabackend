const mongoose = require("mongoose");

// One day's look at one landing page that gets visitors from Meta ads but few
// sign-ups: its numbers, and what the sign-up doctor found. Earlier diagnoses
// are shown to the agent so it can say what changed since.

const reasonSchema = new mongoose.Schema(
    {
        reason: { type: String, required: true },
        // ux | offer | message_match | tracking | technical | traffic_quality | form | trust | speed | other
        category: { type: String, default: "other" },
        confidence: { type: String, default: "medium" }, // high | medium | low
        evidence: { type: String, default: "" },
        suggestedFix: { type: String, default: "" },
        // Set when someone pressed "Fix this": the repair incident working on it.
        fixIncidentId: { type: String, default: "" },
        fixRequestedBy: { type: String, default: "" },
    },
    { _id: false }
);

const conversionDiagnosisSchema = new mongoose.Schema(
    {
        day: { type: String, required: true, index: true }, // YYYY-MM-DD the run happened (IST)
        pageKey: { type: String, required: true, index: true }, // origin + path, no query
        url: { type: String, required: true },
        // The page's funnel over the window, as shown to the agent.
        funnel: { type: mongoose.Schema.Types.Mixed, default: {} },
        status: { type: String, enum: ["running", "done", "failed"], default: "running" },
        headline: { type: String, default: "" },
        reasons: { type: [reasonSchema], default: [] },
        checked: { type: String, default: "" }, // what the agent looked at
        screenshots: { type: [{ caption: String, url: String }], default: [] },
        error: { type: String, default: "" },
        costUsd: { type: Number, default: 0 },
        slackChannel: { type: String, default: "" },
        slackThreadTs: { type: String, default: "" }, // the day's summary message
        slackTs: { type: String, default: "" }, // this page's reply in that thread
        detailsPostedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

conversionDiagnosisSchema.index({ pageKey: 1, day: -1 });

module.exports = mongoose.model("ConversionDiagnosis", conversionDiagnosisSchema);
