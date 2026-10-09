// model/vtext/vtextConversationModel.js
//
// A thread = one (contact, line) pair — the unit the recipient actually sees
// as "a conversation." Lines are sticky per contact per channel (see
// vtextRouter in a later phase), so a contact talking to the same line
// twice reuses this same document. The admin UI's merged per-contact
// timeline is a query across all of a contact's conversations/messages, not
// a separate model.
const mongoose = require("mongoose");

const vtextConversationSchema = new mongoose.Schema(
  {
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: "vtextContactModel", required: true, index: true },
    lineId: { type: mongoose.Schema.Types.ObjectId, ref: "vtextLineModel", required: true, index: true },
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

    // The property this thread is currently about: the latest one a text was sent for, or the one
    // the contact signed up through. Drives the property pill and the inbox property filter.
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: "productModel", index: true },

    // The AI told the customer "a team member will follow up" (draftReplyWorker.js). Cleared when an
    // admin replies by hand, or with "Mark handled" in the Inbox.
    needsHuman: { type: Boolean, default: false },

    lineRetired: { type: Boolean, default: false }, // set when its line gets quarantined/retired
    assignedAdminId: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true }
);

vtextConversationSchema.index({ contactId: 1, lineId: 1 }, { unique: true });
vtextConversationSchema.index({ status: 1, lastMessageAt: -1 });
vtextConversationSchema.index({ lineId: 1, lastMessageAt: -1 });
// Serves the inbox "Unread" filter and its count without scanning read conversations.
vtextConversationSchema.index({ lastMessageAt: -1 }, { partialFilterExpression: { unreadCount: { $gt: 0 } } });

// Collection name pinned to its pre-rename value so the Sendify->Vtext
// rename does not orphan any data already stored in Mongo.
module.exports = mongoose.model("vtextConversationModel", vtextConversationSchema, "sendifyconversationmodels");
