// controller/earlyAccessLeadController.js
const catchAsyncError = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");
const EarlyAccessLead = require("../model/earlyAccessLeadModel");
const { scheduleRegistrationCall } = require("../services/registrationCallService");
const { enrichPerson } = require("../services/fullenrichService");
const { syncEarlyAccessLead } = require("../services/brevoService");

/**
 * POST /api/v1/early-access/register   (public)
 * Persists every early-access lead, then (only with consent) schedules the
 * Maya call — same 60s delay → call → no-answer retry flow as persona-1.
 */
const registerAndCall = catchAsyncError(async (req, res, next) => {
  const {
    fullName, email, phone, markets, dealSize,
    consent, consentText, consentTimestamp, eventId,
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
    scheduleRegistrationCall({
      fullName, email, phone,
      market: markets || "",
      dealSize: dealSize || "",
    }).catch((e) => console.error("[early-access-call] scheduling failed:", e.message));
    call = { attempted: true };
  } else {
    console.log(`[early-access] email-only (no consent): ${email}`);
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
      console.error("[early-access-enrich] enrichment failed:", e.message);
    }

    try {
      await EarlyAccessLead.create({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        markets: markets || "",
        dealSize: dealSize || "",
        consent: consent === true,
        consentText: consentText || "",
        consentTimestamp: consentTimestamp ? new Date(consentTimestamp) : null,
        eventId: eventId || "",
        enrichment,
      });

      // Sync to Brevo — adding the contact to the list triggers the
      // welcome + drip automation. Non-throwing; never blocks lead save.
      syncEarlyAccessLead({ fullName, email, phone, markets, dealSize })
        .catch((e) => console.error("[brevo-sync] failed:", e.message));
    } catch (e) {
      console.error("[early-access-save] persist failed:", e.message);
    }
  })();
});

/**
 * GET /api/v1/early-access?page=&limit=
 * Paginated list for the admin Early Access Leads tab.
 */
const getAllEarlyAccessLeads = catchAsyncError(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const [leads, total] = await Promise.all([
    EarlyAccessLead.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    EarlyAccessLead.countDocuments(),
  ]);

  res.status(200).json({
    success: true,
    leads,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

module.exports = { registerAndCall, getAllEarlyAccessLeads };
