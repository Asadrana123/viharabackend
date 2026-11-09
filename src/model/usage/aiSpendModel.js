// model/usage/aiSpendModel.js
const mongoose = require("mongoose");

/**
 * One paid AI call: what it was for (feature), which tool and model ran it, what it cost and its tokens.
 *
 * Two sources write here:
 *   - this backend, on every Claude and Gemini call (services/usage/spendRecorder.js), as the call finishes;
 *   - the Creative OS server, which pushes its own spend (Claude runs for hook scout, LinkedIn, videos ...,
 *     and treg generations: Kling, Seedance, HeyGen, MiniMax, Gemini images) with its own id (extId),
 *     so a push sent twice is stored once.
 *
 * usd is null when the call was paid for but its price is not known (a model with no price on file, or a
 * Claude run stopped at its time limit before it reported its cost). The admin page counts those apart, so
 * the total never looks complete when it is not.
 */
const aiSpendSchema = new mongoose.Schema(
  {
    at: { type: Date, required: true, index: true },
    // backend | creative-os
    source: { type: String, required: true, enum: ["backend", "creative-os"] },
    // A stable key such as "ga-report" or "video"; labels live in services/usage/features.js.
    feature: { type: String, required: true, index: true },
    // Who is billed: anthropic, google, treg.
    provider: { type: String, default: "" },
    // The plain name shown on the page: "Claude Opus 5.5", "Kling", "MiniMax".
    tool: { type: String, default: "" },
    model: { type: String, default: "" },
    usd: { type: Number, default: null },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    cacheReadTokens: { type: Number, default: 0 },
    cacheWriteTokens: { type: Number, default: 0 },
    // What this item was, in a few words ("Voiceover line", "Writing the hooks").
    what: { type: String, default: "" },
    // Who started it, when known.
    by: { type: String, default: "" },
    // What it belongs to: a video's core id, a property, a run id.
    ref: { type: String, default: "" },
    // The Creative OS's own id for the item; unique, so a repeated push is stored once.
    extId: { type: String },
  },
  { timestamps: true }
);

aiSpendSchema.index({ extId: 1 }, { unique: true, partialFilterExpression: { extId: { $type: "string" } } });
aiSpendSchema.index({ feature: 1, at: -1 });

/** The last balance a provider reported (treg's prepaid balance), as the Creative OS read it. */
const aiBalanceSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true, unique: true },
    usd: { type: Number, default: null },
    at: { type: Date, required: true },
    // anthropic-credits-out: the feature that was refused for want of credits.
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

const AiSpend = mongoose.models.AiSpend || mongoose.model("AiSpend", aiSpendSchema);
const AiBalance = mongoose.models.AiBalance || mongoose.model("AiBalance", aiBalanceSchema);

module.exports = { AiSpend, AiBalance };
