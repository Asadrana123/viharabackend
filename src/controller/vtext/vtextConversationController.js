// controller/vtext/vtextConversationController.js
const catchAsyncError = require("../../middleware/catchAsyncError");
const VtextConversation = require("../../model/vtext/vtextConversationModel");
const VtextMessage = require("../../model/vtext/vtextMessageModel");
const VtextContact = require("../../model/vtext/vtextContactModel");

/** GET /api/v1/vtext/conversations?status=&lineId=&q=&cursor=&limit= */
const listConversations = catchAsyncError(async (req, res) => {
  const { status, lineId, q, cursor, limit } = req.query;
  const pageSize = Math.min(100, Math.max(1, Number(limit) || 30));

  const filter = {};
  if (status) filter.status = status;
  if (lineId) filter.lineId = lineId;
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
    .populate("contactId", "name phoneE164 optOut.isOptedOut followUp.status followUp.step")
    .lean();

  const hasMore = conversations.length > pageSize;
  const page = conversations.slice(0, pageSize);
  const nextCursor = hasMore ? page[page.length - 1].lastMessageAt?.toISOString() : null;

  return res.status(200).json({ success: true, conversations: page, nextCursor });
});

/** GET /api/v1/vtext/conversations/:id/messages?limit= */
const getConversationMessages = catchAsyncError(async (req, res) => {
  const conversation = await VtextConversation.findById(req.params.id);
  if (!conversation) return res.status(404).json({ success: false, message: "Conversation not found" });

  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  const messages = await VtextMessage.find({ conversationId: conversation._id }).sort({ createdAt: 1 }).limit(limit);

  return res.status(200).json({ success: true, conversation, messages });
});

/** PATCH /api/v1/vtext/conversations/:id — body: { status?, markRead? } */
const updateConversation = catchAsyncError(async (req, res) => {
  const { status, markRead } = req.body;
  const update = {};
  if (status) update.status = status;
  if (markRead) update.unreadCount = 0;

  const conversation = await VtextConversation.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!conversation) return res.status(404).json({ success: false, message: "Conversation not found" });

  if (markRead) {
    await VtextMessage.updateMany({ conversationId: conversation._id, direction: "in", readAt: null }, { $set: { readAt: new Date() } });
  }

  return res.status(200).json({ success: true, conversation });
});

module.exports = { listConversations, getConversationMessages, updateConversation };
