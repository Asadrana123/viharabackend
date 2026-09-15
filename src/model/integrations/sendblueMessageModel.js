// model/sendblueMessageModel.js
//
// One row per Sendblue text — inbound (webhook) and outbound (Maya's replies).
// Joined to a lead by phoneNormalized — the SAME canonical form the lead
// controllers use (normalisePhone(lead.phone)) — so a text lines up with whoever
// registered from that number.

const mongoose = require("mongoose");

const sendblueMessageSchema = new mongoose.Schema(
  {
    // 'inbound'  = lead → us (webhook)
    // 'outbound' = us → lead (Maya auto-reply)
    direction: {
      type: String,
      enum: ["inbound", "outbound"],
      required: true,
      index: true,
    },

    // The lead's number. In Sendblue's payload `number` is the end-user for BOTH
    // directions, so it is always the contact.
    phone: { type: String, default: "" },

    // Canonical join/group key — normalisePhone(contact). Matches the lead tabs.
    phoneNormalized: { type: String, default: "", index: true },

    content: { type: String, default: "" },
    mediaUrl: { type: String, default: "" },

    // "iMessage" | "SMS"  (payload.service)
    service: { type: String, default: "" },

    // Sendblue message status (RECEIVED / DELIVERED / SENT / ERROR / …).
    status: { type: String, default: "" },

    // Raw numbers kept for auditing / reply routing.
    fromNumber: { type: String, default: "" },
    toNumber: { type: String, default: "" },
    sendblueNumber: { type: String, default: "" }, // our line that handled it

    // Sendblue message handle — the idempotency key (Sendblue may deliver a
    // webhook more than once). NOT defaulted: left undefined when Sendblue
    // doesn't supply one, so the sparse-unique index below only guards real
    // handles and blank ones never collide.
    messageHandle: { type: String },

    // payload.opted_out — the contact has opted out of messaging.
    optedOut: { type: Boolean, default: false },

    // payload.date_sent — when Sendblue says the message was created.
    sentAt: { type: Date },

    // Full original payload / send response, for debugging.
    raw: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

// Fast per-lead conversation lookup, ordered by send time.
sendblueMessageSchema.index({ phoneNormalized: 1, sentAt: 1 });

// Dedup guard for retried webhooks. sparse so docs WITHOUT a handle are skipped.
sendblueMessageSchema.index({ messageHandle: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("SendblueMessage", sendblueMessageSchema);
