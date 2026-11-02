// model/studio/studioReadyModel.js
const mongoose = require("mongoose");

/** The properties a video can start from, as the Creative OS last checked them. One document. */
const rowSchema = new mongoose.Schema(
  {
    propertyId: { type: String, required: true },
    ready: { type: Boolean, required: true },
    photos: { type: Number, default: 0 },
    angle: { type: String, default: null },
    blockedBy: { type: String, default: null },
  },
  { _id: false }
);

const readySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    rows: { type: [rowSchema], default: [] },
    checkedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("StudioReady", readySchema);
