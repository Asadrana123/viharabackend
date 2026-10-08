// controller/adminAsk/adminAskController.js
//
// Admin global search + "Ask AI".
//   GET    /api/v1/admin-ask/search?q=            instant search across every collection
//   POST   /api/v1/admin-ask/ask                  { question, conversationId? } -> answer
//   GET    /api/v1/admin-ask/conversations        this admin's recent chats
//   GET    /api/v1/admin-ask/conversations/:id    one chat's question/answer turns
//   DELETE /api/v1/admin-ask/conversations/:id
const Anthropic = require("@anthropic-ai/sdk");
const mongoose = require("mongoose");
const catchAsyncError = require("../../middleware/catchAsyncError");
const Errorhandler = require("../../utils/errorhandler");
const Conversation = require("../../model/adminAsk/adminAskConversationModel");
const { searchAll, AskQueryError } = require("../../services/adminAsk/askQueryService");
const { askQuestion, MODEL } = require("../../services/adminAsk/askAgentService");

const MAX_QUESTION_CHARS = 2000;
// Every follow-up resends the whole chat, so very long chats get slow and
// costly. Past these limits the admin is asked to start a new chat.
const MAX_TURNS = 40;
const MAX_HISTORY_CHARS = 1500000;

exports.globalSearch = catchAsyncError(async (req, res, next) => {
  try {
    const result = await searchAll(req.query.q);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    if (err instanceof AskQueryError) return next(new Errorhandler(err.message, 400));
    throw err;
  }
});

exports.ask = catchAsyncError(async (req, res, next) => {
  const question = String(req.body.question || "").trim();
  const { conversationId } = req.body;
  if (!question) return next(new Errorhandler("Please enter a question", 400));
  if (question.length > MAX_QUESTION_CHARS) {
    return next(new Errorhandler(`Questions can be at most ${MAX_QUESTION_CHARS} characters`, 400));
  }

  let conversation;
  if (conversationId) {
    if (!mongoose.Types.ObjectId.isValid(conversationId)) return next(new Errorhandler("Conversation not found", 404));
    conversation = await Conversation.findOne({ _id: conversationId, adminId: req.user._id });
    if (!conversation) return next(new Errorhandler("Conversation not found", 404));
    if (conversation.turns.length >= MAX_TURNS || conversation.messagesJson.length >= MAX_HISTORY_CHARS) {
      return next(new Errorhandler("This chat is getting long. Please start a new chat to keep answers fast.", 409));
    }
  } else {
    conversation = new Conversation({ adminId: req.user._id, title: question.slice(0, 80) });
  }

  let result;
  try {
    result = await askQuestion({ history: JSON.parse(conversation.messagesJson), question });
  } catch (err) {
    // Nothing is saved on failure, so the stored history stays valid.
    console.error("[admin-ask] ask failed:", err);
    if (err instanceof Anthropic.RateLimitError) {
      return next(new Errorhandler("The AI service is busy right now. Please try again in a minute.", 429));
    }
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      return next(new Errorhandler("The AI service key is invalid or missing. Check ANTHROPIC_API_KEY on the server.", 500));
    }
    if (err instanceof Anthropic.BadRequestError) {
      // Usually server setup (key / workspace) — retrying won't help, so say why.
      return next(new Errorhandler(`The AI service rejected the request: ${err.error?.error?.message || err.message}`, 502));
    }
    if (err instanceof Anthropic.APIError) {
      return next(new Errorhandler("The AI service returned an error. Please try again.", 502));
    }
    return next(new Errorhandler(err.message || "Ask AI failed", 500));
  }

  conversation.messagesJson = JSON.stringify(result.messages);
  conversation.turns.push({
    question,
    answer: result.answer,
    toolCalls: result.toolCalls,
  });
  for (const [k, v] of Object.entries(result.usage)) {
    conversation.usage[k] = (conversation.usage[k] || 0) + v;
  }
  await conversation.save();

  console.log(
    `[admin-ask] ${req.user.email} model=${MODEL} tools=${result.toolCalls} ` +
      `in=${result.usage.inputTokens} cacheRead=${result.usage.cacheReadTokens} out=${result.usage.outputTokens}`
  );

  res.status(200).json({
    success: true,
    conversationId: conversation._id,
    title: conversation.title,
    turn: conversation.turns[conversation.turns.length - 1],
  });
});

exports.listConversations = catchAsyncError(async (req, res) => {
  const conversations = await Conversation.find({ adminId: req.user._id })
    .select("title updatedAt createdAt")
    .sort({ updatedAt: -1 })
    .limit(30)
    .lean();
  res.status(200).json({ success: true, conversations });
});

exports.getConversation = catchAsyncError(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return next(new Errorhandler("Conversation not found", 404));
  const conversation = await Conversation.findOne({ _id: req.params.id, adminId: req.user._id })
    .select("title turns updatedAt")
    .lean();
  if (!conversation) return next(new Errorhandler("Conversation not found", 404));
  res.status(200).json({ success: true, conversation });
});

exports.deleteConversation = catchAsyncError(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return next(new Errorhandler("Conversation not found", 404));
  const deleted = await Conversation.findOneAndDelete({ _id: req.params.id, adminId: req.user._id });
  if (!deleted) return next(new Errorhandler("Conversation not found", 404));
  res.status(200).json({ success: true });
});
