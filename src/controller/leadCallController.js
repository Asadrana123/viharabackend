// controller/leadCallController.js
const catchAsyncError = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");
const PersonaLead = require("../model/personaLeadModel");
const { scheduleRegistrationCall } = require("../services/registrationCallService");

/**
 * POST /api/v1/lead/register   (public)
 * Persists every persona-1 lead, then (only with consent) schedules the
 * Maya call: 60s delay → call → retry after 60s if no answer.
 */
const registerAndCall = catchAsyncError(async (req, res, next) => {
 const {
    fullName, email, phone, market, city, state, buyerType, dealsClosed,
    consent, consentText, consentTimestamp, marketLive, eventId,
  } = req.body;

  if (!fullName || !fullName.trim())
    return next(new ErrorHandler("fullName is required", 400));
  if (!email || !email.trim())
    return next(new ErrorHandler("email is required", 400));
  if (!phone || !phone.trim())
    return next(new ErrorHandler("phone is required", 400));

  // Persist the lead so it shows in the admin Persona Leads tab.
  await PersonaLead.create({
    fullName: fullName.trim(),
    email: email.trim(),
    phone: phone.trim(),
    market: market || "",
    city: city || "",
    state: state || "",
    buyerType: buyerType || "",
    dealsClosed: dealsClosed || "",
    consent: consent === true,
    consentText: consentText || "",
    consentTimestamp: consentTimestamp ? new Date(consentTimestamp) : null,
    marketLive: marketLive === true,
    eventId: eventId || "",
  });

  let call = { attempted: false };
  if (consent === true) {
    // Fire-and-forget — response is instant; first call rings ~60s later.
    scheduleRegistrationCall({ fullName, email, phone, city, state, buyerType, dealsClosed })
      .catch((e) => console.error("[lead-call] scheduling failed:", e.message));
    call = { attempted: true };
  } else {
    console.log(`[lead] email-only (no consent): ${email}`);
  }

  res.status(200).json({
    success: true,
    message: consent
      ? "Registered — Maya will call you shortly."
      : "Registered. (No calls — consent not given.)",
    call,
  });
});

module.exports = { registerAndCall };