const mongoose = require("mongoose");

// Where the registrant came from: UTM first/last touch plus the Meta ids (services/leads/buyBox.js
// REGISTRATION_TOUCH_KEYS). Saved on new registrations from 9 Nov 2026; older ones have none.
const registrationTouchSchema = new mongoose.Schema(
  {
    utm_source: { type: String, default: "", trim: true },
    utm_medium: { type: String, default: "", trim: true },
    utm_campaign: { type: String, default: "", trim: true },
    utm_term: { type: String, default: "", trim: true },
    utm_content: { type: String, default: "", trim: true },
    gclid: { type: String, default: "", trim: true },
    fbclid: { type: String, default: "", trim: true },
    ad_id: { type: String, default: "", trim: true },
    adset_id: { type: String, default: "", trim: true },
    campaign_id: { type: String, default: "", trim: true },
    ts: { type: Date, default: null },
  },
  { _id: false }
);

const registrationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "userModel",
    required: true
  },
  auctionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "productModel",
    required: true
  },
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  mobilePhone: {
    type: String,
    required: true
  },
  address: {
    type: String,
    default: null
  },
  buyerType: {
    type: String,
    enum: ["Cash investor", "Owner-occupant", "Fix and flip", "Buy and hold"],
    required: true
  },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending"
  },

  // ============================================
  // REALTOR AFFILIATE ATTRIBUTION  (Req 4, Req 5)
  // Stamped when a buyer registers via a realtor showcase journey
  // (/:slug -> property -> Register for Auction). Defaults keep every
  // existing and direct (non-referred) registration unaffected.
  // realtorId is the authoritative per-registration attribution that the
  // realtor dashboard reads.
  // ============================================
  realtorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "realtorModel",
    default: null
  },
  showcaseSlug: {
    type: String,
    default: null
  },
  attributionSource: {
    type: String,
    enum: ["realtor_showcase", "direct"],
    default: "direct"
  },
  attributedAt: {
    type: Date,
    default: null
  },

  // Canonical +1XXXXXXXXXX form of mobilePhone, so Vtext can find this registration by phone.
  phoneNormalized: { type: String, default: "", trim: true },
  // SMS box on the registration form (unchecked by default). Only a literal true counts.
  smsConsent: { type: Boolean, default: false },
  smsConsentText: { type: String, default: "" },
  smsConsentAt: { type: Date, default: null },

  // UTM + Meta ad ids of the visit (first and last touch). null on registrations made before 9 Nov 2026.
  firstTouch: { type: registrationTouchSchema, default: null },
  lastTouch: { type: registrationTouchSchema, default: null },

  submittedAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

registrationSchema.index({ phoneNormalized: 1 });

module.exports = mongoose.model("AuctionRegistration", registrationSchema);
