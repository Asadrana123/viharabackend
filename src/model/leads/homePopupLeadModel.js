const mongoose = require("mongoose");

/**
 * Home page popup leads — the short "Tell us about you" form on the home page
 * (opens after 5s on the page, or from the hero button).
 *
 * One record per email: a repeat submit updates the name / buyer type and
 * bumps `submissions`.
 */
const homePopupLeadSchema = new mongoose.Schema(
  {
    fullName: { type: String, default: "", trim: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, default: "", trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },

    // How they plan to pay.
    buyerType: { type: String, enum: ["cash", "financing", "not_sure"], required: true },

    // "auto" = popup opened by itself after 5s, "button" = they clicked the hero button.
    trigger: { type: String, enum: ["auto", "button"], default: "auto" },

    pageUrl: { type: String, default: "", trim: true },
    // UTM params of the visit (utm_source, utm_campaign, gclid, fbclid, …).
    attribution: { type: mongoose.Schema.Types.Mixed, default: {} },

    submittedAt: { type: Date, default: null },
    submissions: { type: Number, default: 1 },

    source: { type: String, default: "home-popup" },
  },
  { timestamps: true }
);

homePopupLeadSchema.index({ email: 1 }, { unique: true });
homePopupLeadSchema.index({ createdAt: -1 });

module.exports = mongoose.model("homePopupLead", homePopupLeadSchema);
