const mongoose = require("mongoose");

// One Clarity Data Export pull. Clarity only gives the last 1-3 days and allows
// 10 calls a day, so each morning's pull is kept here: the agent reads these
// instead of calling Clarity, and history builds up beyond 3 days.

const clarityDailySchema = new mongoose.Schema(
    {
        pulledAt: { type: Date, required: true, index: true },
        numOfDays: { type: Number, required: true },
        // The breakdown asked for, e.g. "URL" or "URL,Device".
        dimensions: { type: String, required: true },
        // Clarity's answer as-is: [{ metricName, information: [...] }]
        metrics: { type: mongoose.Schema.Types.Mixed, default: [] },
        error: { type: String, default: "" },
    },
    { timestamps: true }
);

module.exports = mongoose.model("ClarityDaily", clarityDailySchema);
