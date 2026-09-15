const mongoose = require("mongoose");

/**
 * RB2B identified website visitors (Webhook integration).
 * One document per person — repeat visits upsert onto the same record,
 * incrementing visitCount and appending to capturedPages. Anonymous /
 * company-only payloads (no LinkedIn URL and no business email) always
 * create a new row, since there's no stable key to dedupe on.
 */
const capturedPageSchema = new mongoose.Schema(
  {
    url: { type: String, default: "" },
    referrer: { type: String, default: "" },
    tags: { type: String, default: "" },
    seenAt: { type: Date, default: null },
  },
  { _id: false }
);

const rb2bVisitorSchema = new mongoose.Schema(
  {
    // ── Identity ──────────────────────────────────────────────
    linkedinUrl: { type: String, default: "", trim: true, index: true },
    firstName: { type: String, default: "", trim: true },
    lastName: { type: String, default: "", trim: true },
    title: { type: String, default: "", trim: true },
    businessEmail: { type: String, default: "", trim: true, lowercase: true, index: true },

    // ── Company ───────────────────────────────────────────────
    companyName: { type: String, default: "", trim: true },
    website: { type: String, default: "", trim: true },
    industry: { type: String, default: "", trim: true },
    employeeCount: { type: String, default: "", trim: true },
    estimatedRevenue: { type: String, default: "", trim: true },

    // ── Location ──────────────────────────────────────────────
    city: { type: String, default: "", trim: true },
    state: { type: String, default: "", trim: true },
    zipcode: { type: String, default: "", trim: true },

    // ── Visit tracking ────────────────────────────────────────
    firstSeenAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: null },
    visitCount: { type: Number, default: 1 },

    // Latest-visit context (mirrors the newest capturedPages entry)
    referrer: { type: String, default: "" },
    capturedUrl: { type: String, default: "" },
    tags: { type: String, default: "" },

    // Full page history across visits
    capturedPages: { type: [capturedPageSchema], default: [] },

    // Last raw payload received — RB2B's fields are fixed, but keep it for audit.
    raw: { type: mongoose.Schema.Types.Mixed, default: null },

    source: { type: String, default: "rb2b" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("rb2bVisitorModel", rb2bVisitorSchema);