// model/leads/phoneLookupModel.js
//
// What we know about a phone number before texting it: one row per number (phoneLookupService.js).
//   source "format": the free check only (libphonenumber-js): an impossible number, or one we don't pay to look up
//   source "twilio": Twilio Lookup's answer (line type: mobile / landline / VoIP …), about $0.008 per number
// One row per number, so a number is paid for once (refreshed after LOOKUP_KEEP_DAYS).
const mongoose = require("mongoose");

const phoneLookupSchema = new mongoose.Schema(
  {
    phoneE164: { type: String, required: true, unique: true, trim: true },
    source: { type: String, enum: ["format", "twilio"], required: true },
    valid: { type: Boolean, default: null }, // false = the number can't exist (or Twilio says it isn't valid)
    country: { type: String }, // "US", "CA", "IN" …
    lineType: { type: String }, // Twilio's line_type_intelligence.type: mobile, landline, fixedVoip, nonFixedVoip, tollFree …
    carrierName: { type: String },
    validationErrors: [{ type: String }], // Twilio's, e.g. TOO_SHORT
    errorCode: { type: Number }, // Twilio's line_type_intelligence.error_code, when it couldn't tell
    checkedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("phoneLookupModel", phoneLookupSchema);
