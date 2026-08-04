// controller/leadCallController.js
const catchAsyncError = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");
const PersonaLead = require("../model/personaLeadModel");
const { scheduleRegistrationCall } = require("../services/registrationCallService");
const { enrichPerson } = require("../services/fullenrichService");
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

  // ── 1. Call immediately (fire-and-forget, only with consent) ────────────
  let call = { attempted: false };
  if (consent === true) {
    scheduleRegistrationCall({ fullName, email, phone, city, state, buyerType, dealsClosed })
      .catch((e) => console.error("[lead-call] scheduling failed:", e.message));
    call = { attempted: true };
  } else {
    console.log(`[lead] email-only (no consent): ${email}`);
  }

  // ── 2. Respond instantly — enrich + save run in the background ──────────
  res.status(200).json({
    success: true,
    message: consent
      ? "Registered — Maya will call you shortly."
      : "Registered. (No calls — consent not given.)",
    call,
  });

  // ── 3. Enrich, then save. Save as-is if enrichment returns nothing ──────
  (async () => {
    let enrichment = null;
    try {
      enrichment = await enrichPerson({ fullName: fullName.trim(), email: email.trim() });
    } catch (e) {
      console.error("[lead-enrich] enrichment failed:", e.message);
    }

    try {
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
        enrichment,
      });
    } catch (e) {
      console.error("[lead-save] persist failed:", e.message);
    }
  })();
});

module.exports = { registerAndCall };