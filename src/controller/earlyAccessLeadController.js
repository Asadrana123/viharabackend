// controller/earlyAccessLeadController.js
const catchAsyncError = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");
const EarlyAccessLead = require("../model/earlyAccessLeadModel");
const { scheduleRegistrationCall } = require("../services/registrationCallService");
const { enrichPerson } = require("../services/fullenrichService");
const { syncEarlyAccessLead } = require("../services/brevoService");
const { getCallsForPhones, normalisePhone } = require("../services/vapiCallsService");

/**
 * POST /api/v1/early-access/register   (public)
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

  res.status(200).json({
    success: true,
    message: consent
      ? "Registered — Maya will call you shortly."
      : "Registered. (No calls — consent not given.)",
    call,
  });

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

      syncEarlyAccessLead({ fullName, email, phone, markets, dealSize })
        .catch((e) => console.error("[brevo-sync] failed:", e.message));
    } catch (e) {
      console.error("[early-access-save] persist failed:", e.message);
    }
  })();
});

/**
 * GET /api/v1/early-access?page=&limit=
 * Paginated list for the admin Early Access Leads tab. Each lead carries the
 * VAPI calls placed to its phone number (text-only, newest first). The call
 * lookup is best-effort — if VAPI is unreachable, `calls` is simply empty.
 */
const getAllEarlyAccessLeads = catchAsyncError(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const [leads, total] = await Promise.all([
    EarlyAccessLead.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    EarlyAccessLead.countDocuments(),
  ]);

  const phones = leads.map((l) => l.phone).filter(Boolean);
  const callsByPhone = await getCallsForPhones(phones);

  const leadsWithCalls = leads.map((lead) => ({
    ...lead,
    calls: callsByPhone[normalisePhone(lead.phone)] || [],
  }));

  res.status(200).json({
    success: true,
    leads: leadsWithCalls,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

module.exports = { registerAndCall, getAllEarlyAccessLeads };