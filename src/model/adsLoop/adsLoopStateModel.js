const mongoose = require("mongoose");

// One document (key "default") with the loop's running state: the kill
// switch, the core id counter, the last handled Slack message per channel (for
// replay after a restart) and the last heartbeat / pull times.

const adsLoopStateSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true, default: "default" },
        killSwitch: {
            on: { type: Boolean, default: false },
            by: { type: String, default: "" },
            at: { type: Date, default: null },
            reason: { type: String, default: "" },
        },
        // channel id -> last handled message ts
        lastHandledTs: { type: Map, of: String, default: {} },
        lastHeartbeatAt: { type: Date, default: null },
        lastPullAt: { type: Date, default: null },
        lastPullSummary: { type: String, default: "" },
        lastWeeklyAt: { type: Date, default: null },
        lastStaleAlertAt: { type: Date, default: null },
    },
    { timestamps: true }
);

module.exports = mongoose.model("adsLoopState", adsLoopStateSchema);
