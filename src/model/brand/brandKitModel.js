// model/brand/brandKitModel.js
//
// The one saved Brand Kit (key "default"). Holds only what an admin has
// changed; the controller fills the rest from config/brandKitDefaults.js.
// The logo is not stored: the logo image is fixed (see brandKitDefaults).
const mongoose = require("mongoose");

const brandKitSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    colors: { type: Map, of: String, default: {} },
    fonts: {
      heading: { type: String, trim: true },
      body: { type: String, trim: true },
    },
    radius: { type: Number, min: 0, max: 24 },
    messaging: {
      tagline: { type: String, trim: true, maxlength: 200 },
      tone: { type: String, trim: true, maxlength: 1000 },
      wordsToUse: { type: String, trim: true, maxlength: 500 },
      wordsToAvoid: { type: String, trim: true, maxlength: 500 },
    },
    updatedByName: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("brandKitModel", brandKitSchema);
