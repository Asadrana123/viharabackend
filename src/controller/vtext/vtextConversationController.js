// controller/vtext/vtextConversationController.js
const catchAsyncError = require("../../middleware/catchAsyncError");
const VtextConversation = require("../../model/vtext/vtextConversationModel");
const VtextMessage = require("../../model/vtext/vtextMessageModel");
const VtextContact = require("../../model/vtext/vtextContactModel");
const { publishEvent } = require("../../services/vtext/vtextEventsBus");

// Contact fields the admin UI needs on every conversation payload (list, thread, mark-read).
const CONTACT_FIELDS = "name phoneE164 optOut.isOptedOut followUp.status followUp.step";

/** GET /api/v1/vtext/conversations?status=&lineId=&q=&unread=true&cursor=&limit= */
const listConversations = catchAsyncError(async (req, res) => {
  const { status, lineId, q, unread, cursor, limit } = req.query;
  const pageSize = Math.min(100, Math.max(1, Number(limit) || 30));

  const filter = {};
  if (status) filter.status = status;
  if (lineId) filter.lineId = lineId;
  if (unread === "true") filter.unreadCount = { $gt: 0 };
  if (cursor) filter.lastMessageAt = { $lt: new Date(cursor) };

  if (q) {
    // Search by contact phone — resolve matching contact ids first (conversations don't store a searchable name).
    const matchingContacts = await VtextContact.find({
      $or: [{ phoneE164: new RegExp(q.replace(/\D/g, ""), "i") }, { name: new RegExp(q, "i") }],
    }).select("_id");
    filter.contactId = { $in: matchingContacts.map((c) => c._id) };
  }

  const conversations = await VtextConversation.find(filter)
    .sort({ lastMessageAt: -1 })
    .limit(pageSize + 1)
    .populate("contactId", CONTACT_FIELDS)
    .lean();

  const hasMore = conversations.length > pageSize;
  const page = conversations.slice(0, pageSize);
  const nextCursor = hasMore ? page[page.length - 1].lastMessageAt?.toISOString() : null;

  // Total across the whole inbox (ignores the other filters) for the "Unread (n)" chip.
  const unreadTotal = await VtextConversation.countDocuments({ unreadCount: { $gt: 0 } });

  return res.status(200).json({ success: true, conversations: page, nextCursor, unreadTotal });
});

/** GET /api/v1/vtext/conversations/:id/messages?limit= */
const getConversationMessages = catchAsyncError(async (req, res) => {
  const conversation = await VtextConversation.findById(req.params.id).populate("contactId", CONTACT_FIELDS);
  if (!conversation) return res.status(404).json({ success: false, message: "Conversation not found" });

  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  const messages = await VtextMessage.find({ conversationId: conversation._id }).sort({ createdAt: 1 }).limit(limit);

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

  const conversation = await VtextConversation.findByIdAndUpdate(req.params.id, mongoUpdate, { new: true }).populate("contactId", CONTACT_FIELDS);
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

module.exports = { listConversations, getConversationMessages, updateConversation };
