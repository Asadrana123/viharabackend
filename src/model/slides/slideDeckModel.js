// model/slides/slideDeckModel.js
//
// One deck an admin asked the Slides agent for: what they asked, the plan
// Claude wrote, and the Google Slides file it became.
const mongoose = require("mongoose");

const slideDeckSchema = new mongoose.Schema(
  {
    topic: { type: String, required: true, trim: true, maxlength: 300 },
    audience: { type: String, default: "", trim: true, maxlength: 300 },
    notes: { type: String, default: "", maxlength: 30000 },
    slideCount: { type: Number, required: true, min: 3, max: 20 },

    status: { type: String, enum: ["working", "ready", "failed"], default: "working", index: true },
    step: { type: String, default: "" }, // plain-language progress shown to the admin
    error: { type: String, default: "" },

    title: { type: String, default: "" },
    plan: { type: mongoose.Schema.Types.Mixed, default: null }, // slides as Claude wrote them
    presentationId: { type: String, default: "" },
    url: { type: String, default: "" },
    // Set when the deck restyles an existing deck (a Google Slides link or an uploaded .pptx).
    source: {
      kind: { type: String, enum: ["google", "pptx"] },
      presentationId: { type: String, default: "" },
      url: { type: String, default: "" },
      title: { type: String, default: "" },
      temporary: { type: Boolean, default: false }, // an uploaded .pptx converted for reading; deleted once read
    },

    // Pictures of the source slides on Cloudinary (services/slides/sourceImages), for crops of screenshots and photos.
    sourceImages: {
      count: { type: Number, default: 0 },
      width: { type: Number, default: 0 },
      height: { type: Number, default: 0 },
    },

    // Google's id for each slide in `plan`, in the same order, so a change can replace just those slides.
    slideIds: { type: [String], default: [] },

    // Changes the admin asked for after the deck was made, oldest first.
    revisions: [
      {
        instruction: { type: String, required: true, maxlength: 2000 },
        status: { type: String, enum: ["working", "done", "failed"], default: "working" },
        changedSlides: { type: [Number], default: [] }, // 1-based numbers in the new deck
        removedCount: { type: Number, default: 0 },
        error: { type: String, default: "" },
        byName: { type: String, default: "" },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    usage: {
      inputTokens: { type: Number, default: 0 },
      outputTokens: { type: Number, default: 0 },
    },

    requestedById: { type: mongoose.Schema.Types.ObjectId },
    requestedByName: { type: String, default: "", trim: true },
    requestedByEmail: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("slideDeckModel", slideDeckSchema);
