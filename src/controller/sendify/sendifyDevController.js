// controller/sendify/sendifyDevController.js
//
// Temporary Phase 1 endpoint (sendify-infra.md §9): calls the channel adapter
// SYNCHRONOUSLY, no queue — proves the model relationships and the compliance
// gate work before the real queue exists. Gets removed in Phase 2 once
// POST /messages (queued, routed) replaces it.
const catchAsyncError = require("../../middleware/catchAsyncError");
const SendifyLine = require("../../model/sendify/sendifyLineModel");
const SendifyContact = require("../../model/sendify/sendifyContactModel");
const SendifyConversation = require("../../model/sendify/sendifyConversationModel");
const SendifyMessage = require("../../model/sendify/sendifyMessageModel");
const { getAdapter } = require("../../services/sendify/channels/registry");
const { canSend } = require("../../services/sendify/sendifyComplianceService");
const { toUsSmsNumber } = require("../../utils/usPhone");

function normalizeAddress(raw) {
  if (typeof raw !== "string") return null;
  if (raw.includes("@")) return raw.trim().toLowerCase(); // Apple ID email
  return toUsSmsNumber(raw); // phone number -> E.164 or null
}

/**
 * POST /api/v1/sendify/dev/send-direct
 * Body: { to, body, lineId }
 */
const sendDirect = catchAsyncError(async (req, res) => {
  const { to: rawTo, body, lineId } = req.body;

  if (!rawTo || !body || !lineId) {
    return res.status(400).json({ success: false, message: "to, body and lineId are required" });
  }

  const to = normalizeAddress(rawTo);
  if (!to) {
    return res.status(400).json({ success: false, message: "to is not a valid US phone number or email address" });
  }

  const line = await SendifyLine.findById(lineId).select("+credentials.iv +credentials.tag +credentials.ciphertext");
  if (!line) {
    return res.status(404).json({ success: false, message: "Line not found" });
  }

  let contact = await SendifyContact.findOne({ phoneE164: to });
  if (!contact) {
    const isEmail = to.includes("@");
    contact = await SendifyContact.create({
      phoneE164: to, // used as the contact key regardless of channel for now — revisited if iMessage-by-email contacts need their own key shape
      email: isEmail ? to : undefined,
      source: "admin",
    });
  }

  const complianceResult = canSend(contact, { isReplyToInbound: false });

  const message = await SendifyMessage.create({
    direction: "out",
    contactId: contact._id,
    lineId: line._id,
    channelType: line.channelType,
    body,
    status: complianceResult.allowed ? "sending" : "blocked",
    origin: { kind: "manual", sentBy: { adminId: req.user?._id, adminName: req.user?.name } },
    error: complianceResult.allowed ? undefined : { kind: complianceResult.errorKind, message: complianceResult.reason },
  });

  if (!complianceResult.allowed) {
    return res.status(200).json({ success: true, blocked: true, reason: complianceResult.reason, message });
  }

  const conversation = await SendifyConversation.findOneAndUpdate(
    { contactId: contact._id, lineId: line._id },
    {
      $setOnInsert: { channelType: line.channelType, contactPhone: to, lineAddress: line.address, firstOutboundAt: new Date() },
      $set: { lastMessageAt: new Date(), lastMessagePreview: body.slice(0, 120), lastDirection: "out" },
      $inc: { "counts.outbound": 1 },
    },
    { upsert: true, new: true }
  );

  message.conversationId = conversation._id;

  try {
    const adapter = getAdapter(line.channelType);
    const result = await adapter.send({ line, to, body, clientMessageId: String(message._id) });
    message.status = "accepted";
    message.provider = { messageId: result.providerMessageId };
    message.sentAt = new Date();
    await message.save();
    contact.lastOutboundAt = new Date();
    await contact.save();
    return res.status(200).json({ success: true, message, providerMessageId: result.providerMessageId });
  } catch (err) {
    message.status = "failed";
    message.error = { kind: err.kind || "transient", code: err.code, message: err.message };
    message.failedAt = new Date();
    await message.save();
    return res.status(502).json({ success: false, message: "Send failed", error: message.error, messageId: message._id });
  }
});

module.exports = { sendDirect };
