// controller/metaCapiController.js
const catchAsyncError = require("../middleware/catchAsyncError");
const Errorhandler = require("../utils/errorhandler");
const { sendEvent } = require("../services/metaCapiService");

// POST /api/capi/track
// Receives the browser Pixel's shared event_id + user data, forwards the
// identical event to Meta server-side for deduplication.
exports.trackEvent = catchAsyncError(async (req, res, next) => {
  const { event_name, event_id, event_source_url, market, market_status, flips_per_year, email, phone, fbp, fbc } = req.body;

  if (!event_name) {
    return next(new Errorhandler("event_name is required", 400));
  }

  const result = await sendEvent({
    eventName: event_name,
    eventId: event_id,
    eventSourceUrl: event_source_url,
    userData: {
      email,
      phone,
      clientIpAddress: req.ip,
      clientUserAgent: req.headers["user-agent"],
      fbp,
      fbc,
    },
    customData: { market, market_status, flips_per_year },
  });

  // Tracking must never break the user flow — always ack the browser.
  return res.status(200).json({ success: result.success });
});