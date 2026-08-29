// controller/norCalLeadController.js
const catchAsyncError = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");
const NorCalLead = require("../model/norCalLeadModel");

/**
 * POST /api/v1/nor-cal/register   (public)
 *
 * Store-only. Validates the payload and persists the lead. No call, no Brevo,
 * no enrichment. The unique email index is the dedup gate — a duplicate email
 * is rejected with 409 before anything else happens.
 */
const registerNorCalLead = catchAsyncError(async (req, res, next) => {
  const {
    fullName,
    email,
    phone,
    buyerType,
    market,
    timezone,
    consent,
    consentText,
    consentTimestamp,
    eventId,
  } = req.body;

  if (!fullName || !fullName.trim())
    return next(new ErrorHandler("fullName is required", 400));
  if (!email || !email.trim())
    return next(new ErrorHandler("email is required", 400));
  if (!phone || !phone.trim())
    return next(new ErrorHandler("phone is required", 400));

  try {
    const lead = await NorCalLead.create({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      buyerType: buyerType || "",
      market: market && market.trim() ? market.trim() : "Northern California",
      timezone: timezone || "",
      consent: consent === true,
      consentText: consentText || "",
      consentTimestamp: consentTimestamp ? new Date(consentTimestamp) : null,
      eventId: eventId || "",
    });

    return res.status(200).json({
      success: true,
      message: "Registered.",
      leadId: lead._id,
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return next(new ErrorHandler("This email is already registered.", 409));
    }
    throw err; // unexpected — let catchAsyncError surface it
  }
});

module.exports = { registerNorCalLead };
