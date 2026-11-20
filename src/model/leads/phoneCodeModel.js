// model/leads/phoneCodeModel.js
//
// The 6-digit code texted with a /deal sign-up's deal sheet link (services/dealSheet/phoneCodeService.js).
// One row per send: the newest unexpired row for a lead is the one that counts. Only a hash of the code is kept.
// Rows delete themselves two days after they're made.
const mongoose = require("mongoose");

const phoneCodeSchema = new mongoose.Schema(
  {
    leadId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    phone: { type: String, required: true }, // E.164, where the code was sent
    // The lead that already has this number for the deal ("Change number" to a registered number):
    // the code confirms that lead instead.
    existingLeadId: { type: mongoose.Schema.Types.ObjectId, default: null },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    verifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

phoneCodeSchema.index({ phone: 1, createdAt: -1 });
phoneCodeSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2 * 24 * 60 * 60 });

module.exports = mongoose.model("phoneCode", phoneCodeSchema);
