// controller/voiceCallbackController.js

const catchAsyncError = require("../../middleware/catchAsyncError");
const ErrorHandler = require("../../utils/errorhandler");
const CallbackRequest = require("../../model/calling/callbackRequestModel");
const { createCallbackRequest } = require("../../services/calling/voiceCallbackService");
const { saveEndOfCallReport } = require("../../services/calling/callLogService");
const { runFindListingsTool } = require("../../services/calling/listingSearchService");

const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET;
const { safeEqual } = require("../../utils/safeEqual");

console.log("[cb-debug] voiceCallbackController loaded. secret set?", !!VAPI_WEBHOOK_SECRET);

// ── Webhook authorization ─────────────────────────────────────────────────────
// VAPI can carry the shared secret in different places depending on how the
// assistant/tool server is configured, and the custom HTTP header does not
// always get forwarded. So we accept the secret from ANY of these channels:
//   • header  x-vapi-secret       (per-tool server.secret / assistant header)
//   • header  x-vapi-signature    (some setups send it under this name)
//   • query   ?secret=...         (most reliable — a query string is always sent)
// A genuine mismatch (or nothing at all when a secret IS configured) still 401s.

function extractProvidedSecret(req) {
  return (
    req.headers["x-vapi-secret"] ||
    req.headers["x-vapi-signature"] ||
    (req.query && req.query.secret) ||
    ""
  );
}

function isAuthorized(req) {
  // No secret configured → refuse. An open webhook would let anyone post fake
  // call results or schedule callbacks.
  if (!VAPI_WEBHOOK_SECRET) return false;
  const provided = String(extractProvidedSecret(req) || "").trim();
  return safeEqual(provided, VAPI_WEBHOOK_SECRET);
}

function parseArgs(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try { return JSON.parse(raw); } catch (_e) { return {}; }
}

// Tools this webhook answers. Anything else in a tool-calls message is ignored.
const KNOWN_TOOLS = new Set(["scheduleCallback", "findListings"]);

function extractToolCalls(message = {}) {
  const out = [];
  const list = message.toolCalls || message.toolCallList || [];
  for (const tc of list) {
    const fn = tc.function || tc;
    if (fn && KNOWN_TOOLS.has(fn.name)) {
      out.push({ name: fn.name, id: tc.id || tc.toolCallId, args: parseArgs(fn.arguments) });
    }
  }
  const legacy = message.functionCall;
  if (legacy && KNOWN_TOOLS.has(legacy.name)) {
    out.push({ name: legacy.name, id: message.toolCallId, args: parseArgs(legacy.parameters || legacy.arguments) });
  }
  return out;
}

// findListings → a short spoken-ready list of live homes. Never throws: a failed
// search becomes a line Maya can say instead of a webhook error.
async function answerFindListings(args) {
  const started = Date.now();
  try {
    const text = await runFindListingsTool(args);
    console.log(`[listings] findListings answered in ${Date.now() - started}ms | filters: ${Object.keys(args || {}).join(",") || "(none)"}`);
    return text;
  } catch (err) {
    console.error("[listings] findListings FAILED:", err.message);
    return "The listing search isn't working right this second. Don't guess at listings. Tell the caller you can't pull them up right now and offer to book a call with the team (scheduleCallback) to go through them.";
  }
}

const handleVapiWebhook = catchAsyncError(async (req, res, next) => {
  // ── DEBUG: prove VAPI reached this handler ──────────────────────────────────
  console.log("[cb-debug] === WEBHOOK HIT ===");
  console.log(
    "[cb-debug] auth →",
    "hdr x-vapi-secret?", !!req.headers["x-vapi-secret"],
    "| hdr x-vapi-signature?", !!req.headers["x-vapi-signature"],
    "| query secret?", !!(req.query && req.query.secret),
    "| header keys:", Object.keys(req.headers).join(",")
  );
  // Type only: the message itself holds names, numbers and transcripts.
  console.log("[cb-debug] message.type =", req.body?.message?.type);

  if (!isAuthorized(req)) {
    console.log("[cb-debug] AUTH FAILED → 401 (no matching secret in header or query)");
    return next(new ErrorHandler("Invalid webhook secret", 401));
  }

  const message = req.body?.message || {};
  const type = message.type;

  // ── End-of-call report → save to the memory store ───────────────────────────
  // Fired once when a call finishes. Persist it and ack. Never throw back to
  // VAPI — a failed save must not turn into a webhook error/retry storm.
  if (type === "end-of-call-report") {
    try {
      const saved = await saveEndOfCallReport(message);
      console.log(
        "[cb-debug] SAVED call log", String(saved?._id),
        "| endedReason", saved?.endedReason
      );
    } catch (err) {
      console.error("[cb-debug] saveEndOfCallReport FAILED:", err.message, err.stack);
    }
    return res.status(200).json({ received: true });
  }

  if (type !== "tool-calls" && type !== "function-call") {
    console.log("[cb-debug] non-actionable type, acking:", type);
    return res.status(200).json({ received: true });
  }

  const toolCalls = extractToolCalls(message);
  console.log("[cb-debug] tool calls found:", toolCalls.map((t) => t.name).join(",") || 0);

  if (toolCalls.length === 0) {
    console.log("[cb-debug] no known tool in message. keys on message:", Object.keys(message));
    return res.status(200).json({ received: true });
  }

  const call = message.call || {};
  const customer = call.customer || {};
  const metadata = call.metadata || {};
  console.log("[cb-debug] call", call.id || "(no id)", "| metadata keys:", Object.keys(metadata).join(","));

  const results = [];
  for (const tc of toolCalls) {
    if (tc.name === "findListings") {
      results.push({ toolCallId: tc.id, result: await answerFindListings(tc.args) });
      continue;
    }
    try {
      const { callback, spokenReply } = await createCallbackRequest({
        phone: tc.args.phone || customer.number || metadata.phone,
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
      console.log("[cb-debug] SAVED callback", String(callback._id), "callAt", callback.callAt);
      results.push({ toolCallId: tc.id, result: spokenReply });
    } catch (err) {
      console.error("[cb-debug] createCallbackRequest FAILED:", err.message, err.stack);
      results.push({
        toolCallId: tc.id,
        result: "I couldn't schedule that callback. Could you tell me again when you'd like me to call?",
      });
    }
  }

  console.log("[cb-debug] returning results:", results.length);
  return res.status(200).json({ results });
});

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
      page, limit, total,
      pages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  });
});

const cancelCallback = catchAsyncError(async (req, res, next) => {
  const updated = await CallbackRequest.findOneAndUpdate(
    { _id: req.params.id, status: "pending" },
    { $set: { status: "cancelled", nextCallAt: null } },
    { new: true }
  ).lean();
  if (!updated) return next(new ErrorHandler("Callback not found or no longer pending", 404));
  res.status(200).json({ success: true, callback: updated });
});

module.exports = { handleVapiWebhook, listCallbacks, cancelCallback };
