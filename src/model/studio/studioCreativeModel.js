// model/studio/studioCreativeModel.js
const mongoose = require("mongoose");

/**
 * Statics made in the Studio (vihara.ai/studio/creatives). As a StudioRun for a video: the work runs on the Creative
 * OS server, which takes no incoming calls, so a person's step waits here as a command until the server collects it
 * (POST /studio/creatives/poll). The angles and creatives are the server's copy to show; the picks, hooks and decisions
 * are the person's, under their name, and are recorded there.
 */

const commandSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["open", "view", "retry", "hook", "make", "write", "decide", "revise", "photos", "price"], required: true },
    data: { type: mongoose.Schema.Types.Mixed, default: undefined },
    byName: { type: String, required: true },
    at: { type: Date, default: Date.now },
    doneAt: { type: Date, default: null },
  },
  { _id: true }
);

const creativeSchema = new mongoose.Schema(
  {
    // Also the Creative OS's request id, in the form of a Slack ts.
    creativeId: { type: String, required: true, unique: true },
    propertyId: { type: String, required: true },
    format: { type: String, enum: ["static", "carousel"], required: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "userModel", required: true },
    requestedByName: { type: String, required: true },
    // Who the creatives are for, chosen by the editor ({ icpId, stage, label }), as D-057 for video.
    buyer: { type: mongoose.Schema.Types.Mixed, required: true },
    idea: { type: String, default: null },
    // queued: waiting for the server; waiting: photos or a new price to check first; angles (a static); writing and
    // options (a carousel: Claude writes, the editor picks); making; review; failed.
    state: { type: String, required: true },
    angles: { type: [mongoose.Schema.Types.Mixed], default: [] },
    // A carousel's options as Claude wrote and the Creative OS checked them, and the editor's ideas for it (D-059).
    options: { type: [mongoose.Schema.Types.Mixed], default: [] },
    ideas: { type: [mongoose.Schema.Types.Mixed], default: [] },
    creatives: { type: [mongoose.Schema.Types.Mixed], default: [] },
    // The property's photos nobody has checked yet (D-056) and its new price waiting for a person (D-058).
    unchecked: { type: [mongoose.Schema.Types.Mixed], default: [] },
    usablePhotos: { type: Number, default: 0 },
    priceChange: { type: [mongoose.Schema.Types.Mixed], default: [] },
    spent: { type: Number, default: 0 },
    limit: { type: Number, default: null },
    error: { type: String, default: null },
    // The last step that was refused, in the editor's words; cleared by their next step.
    notice: { type: String, default: null },
    // Claude's last answer on a revision ({ creativeId, text }): what it changed, or its question.
    answer: { type: mongoose.Schema.Types.Mixed, default: null },
    notes: { type: [String], default: [] },
    // Pictures in the private bucket, by slot (slide-<creative>-NN, photo-<id>). Keys never reach a browser.
    media: { type: mongoose.Schema.Types.Mixed, default: {} },
    commands: { type: [commandSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("StudioCreative", creativeSchema);
