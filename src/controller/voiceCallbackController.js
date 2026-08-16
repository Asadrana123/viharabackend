// controller/voiceCallbackController.js
//
// Two responsibilities:
//   1. handleVapiWebhook — receives VAPI server messages. When Maya fires the
//      scheduleCallback tool mid-call, we book the callback and return the line
//      she should speak. All other event types are acknowledged and ignored.
//   2. listCallbacks / cancelCallback — admin endpoints for the dashboard tab.

const catchAsyncError = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");
const CallbackRequest = require("../model/callbackRequestModel");
const { createCallbackRequest } = require("../services/voiceCallbackService");

const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Tool arguments arrive either as an object or a JSON string — normalise both. */
function parseArgs(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch (_e) {
    return {};
  }
}

/**
 * Pull every scheduleCallback invocation out of a VAPI message, across the
 * shapes VAPI has used: `toolCalls`, `toolCallList`, and the legacy single
 * `functionCall`. Returns [{ id, args }].
 */
function extractCallbackToolCalls(message = {}) {
  const out = [];

  const list = message.toolCalls || message.toolCallList || [];
  for (const tc of list) {
    const fn = tc.function || tc;
    if (fn && fn.name === "scheduleCallback") {
      out.push({ id: tc.id || tc.toolCallId, args: parseArgs(fn.arguments) });
    }
  }

  // Legacy single function-call shape.
  const legacy = message.functionCall;
  if (legacy && legacy.name === "scheduleCallback") {
    out.push({ id: message.toolCallId, args: parseArgs(legacy.parameters || legacy.arguments) });
  }

  return out;
}

// ─── Webhook ────────────────────────────────────────────────────────────────

/**
 * POST /api/vapi/webhook   (called by VAPI, not the browser)
 * Verified with the shared secret VAPI sends as `x-vapi-secret`.
 */
const handleVapiWebhook = catchAsyncError(async (req, res, next) => {
  if (VAPI_WEBHOOK_SECRET) {
    const provided = req.headers["x-vapi-secret"];
    if (provided !== VAPI_WEBHOOK_SECRET) {
      return next(new ErrorHandler("Invalid webhook secret", 401));
    }
  }

  const message = req.body?.message || {};
  const type = message.type;

  // Only tool calls are actionable. Everything else (status-update,
  // end-of-call-report, etc.) is acknowledged so VAPI doesn't retry.
  if (type !== "tool-calls" && type !== "function-call") {
    return res.status(200).json({ received: true });
  }

  const toolCalls = extractCallbackToolCalls(message);
  if (toolCalls.length === 0) {
    return res.status(200).json({ received: true });
  }

  const call = message.call || {};
  const customer = call.customer || {};
  const metadata = call.metadata || {};

  const results = [];
  for (const tc of toolCalls) {
    try {
      const { spokenReply } = await createCallbackRequest({
        phone: tc.args.phone || customer.number, // caller's own number
        fullName: tc.args.fullName || customer.name || "",
        email: tc.args.email || "",
        propertyId: tc.args.propertyId || metadata.propertyId || null,
        source: metadata.source || "human-requested-callback",
        note: tc.args.note || "",
        timezone: tc.args.timezone || metadata.timezone || "",
        sourceCallId: call.id || "",
        delayMinutes: tc.args.delayMinutes,
        callAtISO: tc.args.callAtISO,
      });
      results.push({ toolCallId: tc.id, result: spokenReply });
    } catch (err) {
      // Never 500 back to VAPI on a bad arg — tell the model so it can recover
      // in-conversation ("I couldn't catch the time — when should I call back?").
      results.push({
        toolCallId: tc.id,
        result:
          "I couldn't schedule that callback. Could you tell me again when you'd like me to call?",
      });
      console.error("[callback] webhook create failed:", err.message);
    }
  }

  return res.status(200).json({ results });
});

// ─── Admin endpoints ────────────────────────────────────────────────────────

/**
 * GET /api/vapi/callbacks?status=&page=&limit=
 * Lists callbacks for the dashboard, newest-due first among pending.
 */
const listCallbacks = catchAsyncError(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const status = req.query.status;

  const query = {};
  if (status && ["pending", "connected", "cancelled", "failed"].includes(status)) {
    query.status = status;
  }

  const total = await CallbackRequest.countDocuments(query);
  const callbacks = await CallbackRequest.find(query)
    .sort({ status: 1, nextCallAt: 1, callAt: 1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  res.status(200).json({
    success: true,
    callbacks,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  });
});

/**
 * PATCH /api/vapi/callback/:id/cancel
 * Stops a pending callback (no-op if it already connected/cancelled).
 */
const cancelCallback = catchAsyncError(async (req, res, next) => {
  const updated = await CallbackRequest.findOneAndUpdate(
    { _id: req.params.id, status: "pending" },
    { $set: { status: "cancelled", nextCallAt: null } },
    { new: true }
  ).lean();

  if (!updated) {
    return next(new ErrorHandler("Callback not found or no longer pending", 404));
  }

  res.status(200).json({ success: true, callback: updated });
});

module.exports = {
  handleVapiWebhook,
  listCallbacks,
  cancelCallback,
};
