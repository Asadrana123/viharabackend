// controller/earlyAccessLeadController.js
const catchAsyncError = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");
const EarlyAccessLead = require("../model/earlyAccessLeadModel");
const { scheduleEarlyAccessSignupCall } = require("../services/earlyAccessCallScheduler");
const { enrichPerson } = require("../services/fullenrichService");
const { syncEarlyAccessLead } = require("../services/brevoService");
const { getCallsForPhones, normalisePhone } = require("../services/vapiCallsService");

/**
 * POST /api/v1/early-access/register   (public)
 *
 * Flow (order matters):
 *   1. Validate + normalize phone.
 *   2. Create the lead — the unique email index is the dedup gate. A duplicate
 *      email is rejected here (409) before any call is scheduled.
 *   3. Schedule the Maya call (fire-and-forget, only with consent). This runs
 *      the 2-in-60s burst and, on no-answer, starts the daily 1:32 PM callback
 *      loop that continues until the lead picks up.
 *   4. Respond.
 *   5. Enrich + Brevo sync in the background; update the lead in place.
 */
const registerAndCall = catchAsyncError(async (req, res, next) => {
  const {
    fullName, email, phone, markets, dealSize, timezone,
    consent, consentText, consentTimestamp, eventId,
  } = req.body;

  if (!fullName || !fullName.trim())
    return next(new ErrorHandler("fullName is required", 400));
  if (!email || !email.trim())
    return next(new ErrorHandler("email is required", 400));
  if (!phone || !phone.trim())
    return next(new ErrorHandler("phone is required", 400));

  const normalizedEmail = email.trim().toLowerCase();
  const phoneNormalized = normalisePhone(phone); // canonical E.164 for dedup + calling
  if (!phoneNormalized)
    return next(new ErrorHandler("Enter a valid phone number", 400));

  // ── 1. Create the lead up front — dedup gate via the unique email index ──
  let lead;
  try {
    lead = await EarlyAccessLead.create({
      fullName: fullName.trim(),
      email: normalizedEmail,
      phone: phone.trim(),          // raw, as entered (for display)
      phoneNormalized,              // canonical, for the scheduler's dedup + dispatch
      markets: markets || "",
      dealSize: dealSize || "",
      timezone: timezone || "",
      consent: consent === true,
      consentText: consentText || "",
      consentTimestamp: consentTimestamp ? new Date(consentTimestamp) : null,
      eventId: eventId || "",
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return next(new ErrorHandler("This email is already registered.", 409));
    }
    throw err; // unexpected — let catchAsyncError surface it
  }

  // ── 2. Schedule the call (fire-and-forget, only with consent) ───────────
  let call = { attempted: false };
  if (consent === true) {
    scheduleEarlyAccessSignupCall({
      leadId: lead._id,
      fullName: lead.fullName,
      email: lead.email,
      phone: lead.phone,
      phoneNormalized: lead.phoneNormalized,
      timezone: lead.timezone,
      market: lead.markets,
      dealSize: lead.dealSize,
    }).catch((e) => console.error("[early-access-call] scheduling failed:", e.message));
    call = { attempted: true };
  } else {
    console.log(`[early-access] email-only (no consent): ${lead.email}`);
  }

  // ── 3. Respond ──────────────────────────────────────────────────────────
  res.status(200).json({
    success: true,
    message: consent
      ? "Registered — Maya will call you shortly."
      : "Registered. (No calls — consent not given.)",
    call,
  });

  // ── 4. Enrich + Brevo sync in the background; update the lead in place ───
  (async () => {
    let enrichment = null;
    try {
      enrichment = await enrichPerson({ fullName: lead.fullName, email: lead.email });
    } catch (e) {
      console.error("[early-access-enrich] enrichment failed:", e.message);
    }

    try {
      if (enrichment) {
        await EarlyAccessLead.updateOne({ _id: lead._id }, { $set: { enrichment } });
      }
      syncEarlyAccessLead({
        fullName: lead.fullName,
        email: lead.email,
        phone: lead.phone,
        markets: lead.markets,
        dealSize: lead.dealSize,
      }).catch((e) => console.error("[brevo-sync] failed:", e.message));
    } catch (e) {
      console.error("[early-access-save] update failed:", e.message);
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
