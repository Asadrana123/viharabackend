// model/emailEventModel.js
const mongoose = require("mongoose");

/**
 * Brevo email events (delivered / opened / click / bounce / ...) captured in
 * real time from the Brevo webhook. One document per event Brevo pushes us.
 *
 * This is the email analogue of the VAPI call records. The difference:
 *   • Calls are PULLED live from VAPI by phone (getCallsForPhones) — no DB store.
 *   • Email events are PUSHED here by Brevo and STORED, then joined onto each
 *     lead by the recipient's email address in the admin leads tabs.
 *
 * `email` (recipient, lowercased) is the join key back to every lead model
 * (earlyAccessLeadModel / georgiaStLeadModel / rensselaerAveLeadModel /
 * partnerLeadModel) — all of which store `email` lowercase, so the join is a
 * direct equality match with no normalization needed at read time.
 */
const emailEventSchema = new mongoose.Schema(
  {
    // Recipient — the join key to leads. Stored lowercase to match how every
    // lead model stores `email`.
    email: { type: String, required: true, trim: true, lowercase: true },

    // Raw Brevo event name, lowercased: "delivered" | "opened" | "click" |
    // "soft_bounce" | "hard_bounce" | "unsubscribe" | "spam" | "request" | ...
    // NOT enum-constrained on purpose — we never drop an event just because it's
    // a new/unknown type. The frontend maps it to a friendly label.
    event: { type: String, required: true, trim: true, lowercase: true },

    // Which email — the subject line Brevo reports (blank if the event type
    // doesn't include it).
    subject: { type: String, default: "", trim: true },

    // Brevo message id ("message-id"). Groups every event for one sent email
    // together, and lets us dedup webhook retries later if that ever surfaces.
    messageId: { type: String, default: "", trim: true },

    // Optional context Brevo includes on some events:
    tag:  { type: String, default: "", trim: true }, // automation / campaign tag
    link: { type: String, default: "", trim: true }, // clicked URL (click events)

    // When the event actually happened, per Brevo (its `date` / `ts`). Falls
    // back to now() if Brevo sends no timestamp.
    date: { type: Date, default: Date.now },

    // Full untouched webhook payload — kept for debugging and to absorb future
    // Brevo fields without a schema change. Never rendered to users.
    raw: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

// The only read path is the admin join: "all events for this recipient, newest
// first." This one compound index serves both the email-equality lookup and the
// date sort, so no separate single-field indexes are needed.
emailEventSchema.index({ email: 1, date: -1 });

module.exports = mongoose.model("emailEventModel", emailEventSchema);
