// controller/leadCallController.js
const catchAsyncError = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");
const { dispatchRegistrationCall } = require("../services/leadCallService");

/**
 * POST /api/v1/lead/register   (public)
 * Body: { fullName, email, phone, market, city, state, flipsPerYear,
 *         consent, consentText, consentTimestamp, marketLive, eventId }
 *
 * Consent gate (LEGAL): only place an automated/AI call when consent === true.
 * Without consent the lead is still accepted (email-only) — no call.
 */
const registerAndCall = catchAsyncError(async (req, res, next) => {
  const {
    fullName, email, phone, market, city, state,
    flipsPerYear, consent,
  } = req.body;

  if (!fullName || !fullName.trim())
    return next(new ErrorHandler("fullName is required", 400));
  if (!email || !email.trim())
    return next(new ErrorHandler("email is required", 400));
  if (!phone || !phone.trim())
    return next(new ErrorHandler("phone is required", 400));

  // TODO (persistence): save the lead — market, flipsPerYear, consent,
  // consentText, consentTimestamp, IP, marketLive — into your landing-lead
  // model (or merge with landingPageLeadRoutes). Calling works without this.

  let call = { attempted: false };
  if (consent === true) {
    // Fire-and-forget so the form response is instant; the call rings within seconds.
    dispatchRegistrationCall({ fullName, email, phone, city, state, flipsPerYear })
      .then((r) => console.log("[lead-call]", fullName, r))
      .catch((e) => console.error("[lead-call] failed:", e.message));
    call = { attempted: true };
  } else {
    console.log(`[lead] email-only (no consent): ${email}`);
  }

  res.status(200).json({
    success: true,
    message: consent
      ? "Registered — Maya is calling you now."
      : "Registered. (No calls — consent not given.)",
    call,
  });
});

module.exports = { registerAndCall };
