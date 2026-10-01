// model/sendify/sendifyConversationModel.js
//
// A thread = one (contact, line) pair — the unit the recipient actually sees
// as "a conversation." Lines are sticky per contact per channel (see
// sendifyRouter in a later phase), so a contact talking to the same line
// twice reuses this same document. The admin UI's merged per-contact
// timeline is a query across all of a contact's conversations/messages, not
// a separate model.
const mongoose = require("mongoose");

const sendifyConversationSchema = new mongoose.Schema(
  {
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: "sendifyContactModel", required: true, index: true },
    lineId: { type: mongoose.Schema.Types.ObjectId, ref: "sendifyLineModel", required: true, index: true },
    channelType: { type: String, required: true },

    contactPhone: { type: String }, // snapshot for list views
    lineAddress: { type: String }, // snapshot for list views

    status: { type: String, enum: ["open", "needs-reply", "closed", "archived"], default: "open" },
    lastMessageAt: { type: Date, index: true },
    lastMessagePreview: { type: String },
    lastDirection: { type: String, enum: ["in", "out"] },
    unreadCount: { type: Number, default: 0 },
    counts: {
      inbound: { type: Number, default: 0 },
      outbound: { type: Number, default: 0 },
    },
    firstOutboundAt: { type: Date },
    firstInboundAt: { type: Date }, // set on first inbound reply — makes the thread "warm"

    lineRetired: { type: Boolean, default: false }, // set when its line gets quarantined/retired
    assignedAdminId: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true }
);

sendifyConversationSchema.index({ contactId: 1, lineId: 1 }, { unique: true });
sendifyConversationSchema.index({ status: 1, lastMessageAt: -1 });
sendifyConversationSchema.index({ lineId: 1, lastMessageAt: -1 });

module.exports = mongoose.model("sendifyConversationModel", sendifyConversationSchema);
