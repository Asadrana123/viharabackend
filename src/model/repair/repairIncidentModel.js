const mongoose = require("mongoose");

// One broken technical thing the daily checks or the daily Meta Ads report
// found (Meta tracking, an ad's landing page), and what the repair agent did
// about it. Nothing the agent changes goes live unless an approver pressed Go in Slack.

const INCIDENT_KINDS = Object.freeze([
    "lead_event_missing", // Meta gets registrations but no Lead
    "registration_event_missing", // our database has Meta-ad sign-ups, Meta has none
    "page_down", // an ad's landing page errors, redirects away, or its property is gone
    "page_slow",
    "page_dropoff", // ad clicks that never become page views
    "report_issue", // a technical action item from the daily Meta Ads report
    "signup_issue", // a sign-up doctor reason someone pressed "Fix this" on in Slack
]);

const INCIDENT_STATUS = Object.freeze({
    OPEN: "open", // found, not worked on yet
    FIXING: "fixing", // the agent is working on it
    AWAITING_APPROVAL: "awaiting_approval", // a fix is on a branch, waiting for Go
    NEEDS_MANUAL: "needs_manual", // the cause is outside the code (GTM, Meta settings)
    MERGED: "merged", // Go pressed, fix is live; waiting for the next check to confirm
    REJECTED: "rejected", // an approver rejected the fix
    FAILED: "failed", // the agent couldn't produce a fix
    RESOLVED: "resolved", // the check passes again
});

const changeSchema = new mongoose.Schema(
    {
        repo: { type: String, required: true }, // "website" | "backend"
        repoName: { type: String, required: true }, // owner/name
        branch: { type: String, required: true },
        commitSha: { type: String, default: "" },
        files: { type: [String], default: [] },
        previewState: { type: String, default: "" }, // website only: pending | success | failure
        previewUrl: { type: String, default: "" },
        prNumber: { type: Number, default: null },
        mergeSha: { type: String, default: "" },
    },
    { _id: false }
);

const repairIncidentSchema = new mongoose.Schema(
    {
        incidentId: { type: String, required: true, unique: true }, // "R-20261014-01"
        // Same problem, same key: "lead_event_missing", "page_down:https://…".
        key: { type: String, required: true },
        // true until resolved; only one active incident per key.
        active: { type: Boolean, default: true },
        kind: { type: String, enum: INCIDENT_KINDS, required: true },
        title: { type: String, required: true },
        evidence: { type: mongoose.Schema.Types.Mixed, default: {} },
        status: { type: String, enum: Object.values(INCIDENT_STATUS), default: INCIDENT_STATUS.OPEN, index: true },
        firstSeenAt: { type: Date, default: Date.now },
        lastSeenAt: { type: Date, default: Date.now },
        resolvedAt: { type: Date, default: null },
        attempts: { type: Number, default: 0 },
        // The agent's findings, in plain words.
        cause: { type: String, default: "" },
        fixSummary: { type: String, default: "" },
        manualSteps: { type: String, default: "" },
        changes: { type: [changeSchema], default: [] },
        costUsd: { type: Number, default: 0 },
        decidedBy: { type: String, default: null }, // Slack user id
        decidedAt: { type: Date, default: null },
        mergedAt: { type: Date, default: null },
        note: { type: String, default: "" },
        slackChannel: { type: String, default: "" },
        slackTs: { type: String, default: "" },
        // Set when the incident lives inside another thread (a sign-up doctor report).
        slackThreadTs: { type: String, default: "" },
        // "✏️ Change" requests on a proposed fix, oldest first. The next attempt
        // gets the latest one with the fix it was about.
        feedback: {
            type: [
                new mongoose.Schema(
                    {
                        by: String, // Slack user id
                        text: String,
                        at: { type: Date, default: Date.now },
                        previousCause: String,
                        previousFix: String,
                        previousDiff: String,
                        previousManualSteps: String,
                    },
                    { _id: false }
                ),
            ],
            default: [],
        },
    },
    { timestamps: true }
);

repairIncidentSchema.index({ key: 1 }, { unique: true, partialFilterExpression: { active: true }, name: "one_active_per_key" });

module.exports = mongoose.model("repairIncident", repairIncidentSchema);
module.exports.INCIDENT_KINDS = INCIDENT_KINDS;
module.exports.INCIDENT_STATUS = INCIDENT_STATUS;
