// model/studio/studioRunModel.js
const mongoose = require("mongoose");

/**
 * A new video started in the Video Studio. The work runs on the Creative OS server, which takes no
 * incoming calls, so a person's step waits here as a command until the server collects it. The
 * concepts, hooks, plan and price are the server's copy to show; the picks and Gate A are the
 * person's, under their name, and are recorded there.
 */

const commandSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["open", "pick", "gate", "frames", "generate", "remake", "clip", "build", "cut"], required: true },
    what: { type: String, default: null },
    choice: { type: String, default: null },
    decision: { type: String, default: null },
    words: { type: String, default: "" },
    // A cut revision's shots to make again (D-046).
    shots: { type: [String], default: undefined },
    byName: { type: String, required: true },
    at: { type: Date, default: Date.now },
    doneAt: { type: Date, default: null },
  },
  { _id: true }
);

const runSchema = new mongoose.Schema(
  {
    // Also the Creative OS's request id, in the form of a Slack ts.
    runId: { type: String, required: true, unique: true },
    propertyId: { type: String, required: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "userModel", required: true },
    requestedByName: { type: String, required: true },
    coreId: { type: String, default: null },
    state: { type: String, required: true },
    concepts: { type: [mongoose.Schema.Types.Mixed], default: [] },
    hooks: { type: [mongoose.Schema.Types.Mixed], default: [] },
    plan: { type: mongoose.Schema.Types.Mixed, default: null },
    // The image storyboard of a storyboard plan (D-046): one frame per shot, in order, and what drawing the rest costs.
    frames: { type: [mongoose.Schema.Types.Mixed], default: [] },
    framesPrice: { type: Number, default: 0 },
    clips: { type: [mongoose.Schema.Types.Mixed], default: [] },
    cut: { type: mongoose.Schema.Types.Mixed, default: null },
    spent: { type: Number, default: 0 },
    // Where the money went, item by item and by tool, as the server last reported it.
    costs: { type: mongoose.Schema.Types.Mixed, default: null },
    // The price of making the rejected clips again (D-046); null when none is rejected.
    remakePrice: { type: Number, default: null },
    // Files in the private bucket, by slot: animatic, clip-<ref>, cut. Keys never reach a browser.
    media: { type: mongoose.Schema.Types.Mixed, default: {} },
    error: { type: String, default: null },
    commands: { type: [commandSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("StudioRun", runSchema);
