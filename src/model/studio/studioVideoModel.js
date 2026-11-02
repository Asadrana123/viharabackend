// model/studio/studioVideoModel.js
const mongoose = require("mongoose");

/**
 * A video in the Video Studio (vihara.ai/studio). The job itself lives in the Creative OS, which
 * sends its summary here; only the feedback is written here. Feedback is a person's words about a
 * video, kept as typed. It is not a gate decision: Gate A, Gate B and the cut are decided in the
 * Creative OS and only shown here.
 */

const feedbackSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    byName: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "userModel", required: true },
    at: { type: Date, default: Date.now },
    // When the Creative OS picked this up; empty until then.
    deliveredAt: { type: Date, default: null },
  },
  { _id: true }
);

const decisionSchema = new mongoose.Schema(
  {
    state: { type: String, default: "pending" },
    by: { type: String, default: null },
  },
  { _id: false }
);

const cutSchema = new mongoose.Schema(
  {
    // Where the file is in the private bucket. Never sent to a browser.
    key: { type: String, required: true },
    name: { type: String, required: true },
    sha256: { type: String, required: true },
    bytes: { type: Number, required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const studioVideoSchema = new mongoose.Schema(
  {
    // The fixed core id (D-023); the stage prefix changes, this never does.
    coreId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    propertyId: { type: String, required: true },
    videoId: { type: String, required: true },
    stage: { type: String, required: true },
    round: { type: Number, default: 0 },
    status: { type: String, required: true },
    gates: {
      plan: { type: decisionSchema, default: () => ({}) },
      clips: {
        total: { type: Number, default: 0 },
        approved: { type: Number, default: 0 },
      },
      cut: { type: decisionSchema, default: () => ({}) },
    },
    durationSeconds: { type: Number, default: null },
    lastBuildAt: { type: Date, default: null },
    syncedAt: { type: Date, default: Date.now },
    // The latest cut, for the Studio's player (services/studio/cutStorage.js).
    cut: { type: cutSchema, default: null },
    feedback: { type: [feedbackSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("StudioVideo", studioVideoSchema);
