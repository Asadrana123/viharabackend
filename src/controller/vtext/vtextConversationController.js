// controller/vtext/vtextConversationController.js
const catchAsyncError = require("../../middleware/catchAsyncError");
const VtextConversation = require("../../model/vtext/vtextConversationModel");
const VtextMessage = require("../../model/vtext/vtextMessageModel");
const VtextContact = require("../../model/vtext/vtextContactModel");
const Product = require("../../model/property/productModel");
const mongoose = require("mongoose");
const { publishEvent } = require("../../services/vtext/vtextEventsBus");

// Contact fields the admin UI needs on every conversation payload (list, thread, mark-read).
const CONTACT_FIELDS = "name phoneE164 optOut.isOptedOut followUp.status followUp.step starred.isStarred starred.byAdminName";

// Property fields the inbox pill and picker show.
const PROPERTY_FIELDS = "street city state slug productName";

/** GET /api/v1/vtext/conversations?status=&lineId=&q=&unread=true&starred=true&propertyId=<id>|none&cursor=&limit= */
const listConversations = catchAsyncError(async (req, res) => {
  const { status, lineId, q, unread, starred, propertyId, cursor, limit } = req.query;
  const pageSize = Math.min(100, Math.max(1, Number(limit) || 30));

  const filter = {};
  if (status) filter.status = status;
  if (lineId) filter.lineId = lineId;
  if (unread === "true") filter.unreadCount = { $gt: 0 };
  if (propertyId === "none") {
    filter.propertyId = null; // matches conversations with no property set
  } else if (propertyId) {
    if (!mongoose.Types.ObjectId.isValid(propertyId)) return res.status(400).json({ success: false, message: "Invalid property id" });
    filter.propertyId = propertyId;
  }
  if (cursor) filter.lastMessageAt = { $lt: new Date(cursor) };

  // Search and the Starred filter are both contact fields, so resolve matching contact ids first
  // (conversations don't store the name or the star).
  const contactFilter = {};
  if (q) {
    // Name is escaped: q is plain text, and a crafted pattern could hang the server.
    contactFilter.$or = [{ phoneE164: new RegExp(String(q).replace(/\D/g, ""), "i") }, { name: new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }];
  }
  if (starred === "true") contactFilter["starred.isStarred"] = true;
  if (Object.keys(contactFilter).length) {
    const matchingContacts = await VtextContact.find(contactFilter).select("_id");
    filter.contactId = { $in: matchingContacts.map((c) => c._id) };
  }

  const conversations = await VtextConversation.find(filter)
    .sort({ lastMessageAt: -1 })
    .limit(pageSize + 1)
    .populate("contactId", CONTACT_FIELDS)
    .populate("propertyId", PROPERTY_FIELDS)
    .lean();

  const hasMore = conversations.length > pageSize;
  const page = conversations.slice(0, pageSize);
  const nextCursor = hasMore ? page[page.length - 1].lastMessageAt?.toISOString() : null;

  // Total across the whole inbox (ignores the other filters) for the "Unread (n)" chip.
  const unreadTotal = await VtextConversation.countDocuments({ unreadCount: { $gt: 0 } });
  // Same for the "Starred (n)" chip: conversations whose person is starred.
  const starredContacts = await VtextContact.find({ "starred.isStarred": true }).select("_id").lean();
  const starredTotal = starredContacts.length
    ? await VtextConversation.countDocuments({ contactId: { $in: starredContacts.map((c) => c._id) } })
    : 0;

  return res.status(200).json({ success: true, conversations: page, nextCursor, unreadTotal, starredTotal });
});

/** GET /api/v1/vtext/conversations/:id/messages?limit= */
const getConversationMessages = catchAsyncError(async (req, res) => {
  const conversation = await VtextConversation.findById(req.params.id).populate("contactId", CONTACT_FIELDS).populate("propertyId", PROPERTY_FIELDS);
  if (!conversation) return res.status(404).json({ success: false, message: "Conversation not found" });

  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  // ?scope=contact: every text with this person, across all lines. One person can have an iMessage thread and an SMS
  // thread (the SMS fallback runs on a different line), and the admin should read them as one conversation.
  const filter = req.query.scope === "contact" ? { contactId: conversation.contactId._id } : { conversationId: conversation._id };
  const messages = await VtextMessage.find(filter).sort({ createdAt: 1 }).limit(limit);

  return res.status(200).json({ success: true, conversation, messages });
});

/** PATCH /api/v1/vtext/conversations/:id — body: { status?, markRead?, markUnread?, needsHuman? } */
const updateConversation = catchAsyncError(async (req, res) => {
  const { status, markRead, markUnread, needsHuman } = req.body;
  if (markRead && markUnread) {
    return res.status(400).json({ success: false, message: "Send either markRead or markUnread, not both" });
  }

  const update = {};
  if (status) update.status = status;
  if (markRead) update.unreadCount = 0;
  if (typeof needsHuman === "boolean") update.needsHuman = needsHuman; // "Mark handled" sends false
  // Mark unread raises the count to at least 1 and leaves a higher real count alone.
  const mongoUpdate = markUnread ? { ...(Object.keys(update).length ? { $set: update } : {}), $max: { unreadCount: 1 } } : update;

  const conversation = await VtextConversation.findByIdAndUpdate(req.params.id, mongoUpdate, { new: true }).populate("contactId", CONTACT_FIELDS).populate("propertyId", PROPERTY_FIELDS);
  if (!conversation) return res.status(404).json({ success: false, message: "Conversation not found" });

  if (markRead) {
    await VtextMessage.updateMany({ conversationId: conversation._id, direction: "in", readAt: null }, { $set: { readAt: new Date() } });
  }

  if (markRead || markUnread) {
    // Lets other open admin inboxes refresh their unread dots.
    publishEvent({ type: "conversation.updated", conversationId: String(conversation._id), unreadCount: conversation.unreadCount });
  }

  return res.status(200).json({ success: true, conversation });
});

/** GET /api/v1/vtext/conversations/properties — the properties that have at least one conversation, for the inbox picker. */
const listConversationProperties = catchAsyncError(async (req, res) => {
  const counts = await VtextConversation.aggregate([
    { $match: { propertyId: { $exists: true, $ne: null } } },
    { $group: { _id: "$propertyId", count: { $sum: 1 } } },
  ]);
  const products = await Product.find({ _id: { $in: counts.map((c) => c._id) } })
    .select(PROPERTY_FIELDS)
    .lean();
  const countById = new Map(counts.map((c) => [String(c._id), c.count]));
  const properties = products
    .map((p) => ({ ...p, count: countById.get(String(p._id)) }))
    .sort((a, b) => String(a.street || "").localeCompare(String(b.street || "")));
  const noPropertyCount = await VtextConversation.countDocuments({ propertyId: null });
  return res.status(200).json({ success: true, properties, noPropertyCount });
});

module.exports = { listConversationProperties, listConversations, getConversationMessages, updateConversation };
