// model/property/sellingModel.js
//
// "Sell your property" form (/sell_properties). The website also emails each submission through
// web3forms; this copy is what Vtext reads (phone + SMS consent) to send the Sell text.
// Before 6 Nov 2026 the website didn't post here at all and the old enums no longer matched the
// form's options, so the answers are now stored as plain strings, exactly as chosen.
const mongoose = require("mongoose");

const sellerFormSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, default: "", trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phoneNumber: { type: String, required: true, trim: true }, // as typed
    // Canonical +1XXXXXXXXXX form, so Vtext can find this lead by phone ("" when not a US number).
    phoneNormalized: { type: String, default: "", trim: true },
    propertyAddress: { type: String, default: "", trim: true },
    city: { type: String, default: "", trim: true },
    state: { type: String, default: "", trim: true },
    zip: { type: String, default: "", trim: true },
    propertyCondition: { type: String, default: "" },
    propertyType: { type: String, default: "" },
    numberOfProperties: { type: String, default: "" },
    propertyMarketHistory: { type: String, default: "" },
    propertyOccupancy: { type: String, default: "" },
    mortgageExist: { type: String, default: "" },
    mortgageRange: { type: String, default: "" },
    minDesiredPrice: { type: Number, default: null },
    maxDesiredPrice: { type: Number, default: null },
    relationshipWithProperty: { type: String, default: "" },
    sellingTime: { type: String, default: "" },

    // ── SMS consent (separate, unchecked-by-default box on the form) ─────────
    smsConsent: { type: Boolean, default: false },
    smsConsentText: { type: String, default: "" },
    smsConsentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

sellerFormSchema.index({ phoneNormalized: 1 });

module.exports = mongoose.model("SellerForm", sellerFormSchema);
