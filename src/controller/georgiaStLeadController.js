// controller/georgiaStLeadController.js
const catchAsyncError = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");
const GeorgiaStLead = require("../model/georgiaStLeadModel");
const { scheduleGeorgiaStSignupCall } = require("../services/georgiaStCallScheduler");
const { enrichPerson } = require("../services/fullenrichService");
const { getCallsForPhones, normalisePhone } = require("../services/vapiCallsService");
const { getEmailEventsForEmails } = require("../services/emailEventsService");
const { getNotesForLeads } = require("../services/leadNotesService");

// Discriminator stamped on each note so notes never bleed across lead types.
const LEAD_NOTE_TYPE = "georgiaSt";
const { syncPropertyLead } = require("../services/brevoService");
// NOTE ON BREVO: early access syncs to its dedicated buyer list
// (BREVO_EARLY_ACCESS_LIST_ID). These are single-property auction registrants, so
// they should NOT land in that list. If you want them in Brevo, add a dedicated
// list id + a syncGeorgiaStLead() in brevoService and call it in the background
// block below (fire-and-forget), same shape as syncEarlyAccessLead. Left out on
// purpose rather than polluting the early-access list.

/**
 * POST /api/v1/georgia-st/register   (public)
 *
 * Flow (order matters):
 *   1. Validate + normalize phone (email is OPTIONAL on this page).
 *   2. Create the lead — the unique phoneNormalized index is the dedup gate.
 *      A duplicate phone is rejected here (409) before any call is scheduled.
 *   3. Schedule the Maya call for THIS property (fire-and-forget, only with
 *      consent) — the 2-in-60s burst + daily callback loop.
 *   4. Respond.
 *   5. Enrich in the background; update the lead in place.
 */
const registerAndCall = catchAsyncError(async (req, res, next) => {
  const {
    fullName, phone, email, buyerType, timezone,
    consent, consentText, consentTimestamp, eventId,
  } = req.body;

  if (!fullName || !fullName.trim())
    return next(new ErrorHandler("fullName is required", 400));
  if (!email || !email.trim())
    return next(new ErrorHandler("email is required", 400));
  if (!phone || !phone.trim())
    return next(new ErrorHandler("phone is required", 400));

  const phoneNormalized = normalisePhone(phone); // canonical E.164 for dedup + calling
  if (!phoneNormalized)
    return next(new ErrorHandler("Enter a valid phone number", 400));

  const normalizedEmail = email.trim().toLowerCase();

  // ── 1. Create the lead up front — dedup gate via the unique phone index ──
  let lead;
  try {
    lead = await GeorgiaStLead.create({
      fullName: fullName.trim(),
      phone: phone.trim(),          // raw, as entered (for display)
      phoneNormalized,              // canonical, unique dedup gate
      email: normalizedEmail,
      buyerType: buyerType || "",
      timezone: timezone || "",
      consent: consent === true,
      consentText: consentText || "",
      consentTimestamp: consentTimestamp ? new Date(consentTimestamp) : null,
      eventId: eventId || "",
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return next(new ErrorHandler("This phone number is already registered.", 409));
    }
    throw err; // unexpected — let catchAsyncError surface it
  }

  // ── 2. Schedule the call (fire-and-forget, only with consent) ───────────
  let call = { attempted: false };
  if (consent === true) {
    scheduleGeorgiaStSignupCall({
      leadId: lead._id,
      fullName: lead.fullName,
      phone: lead.phone,
      phoneNormalized: lead.phoneNormalized,
      timezone: lead.timezone,
      email: lead.email,
      buyerType: lead.buyerType,
    }).catch((e) => console.error("[georgia-st-call] scheduling failed:", e.message));
    call = { attempted: true };
  } else {
    console.log(`[georgia-st] no-consent registration: ${lead.phoneNormalized}`);
  }

  // ── 3. Respond ──────────────────────────────────────────────────────────
  res.status(200).json({
    success: true,
    message: consent
      ? "Registered — Maya will call you shortly."
      : "Registered. (No calls — consent not given.)",
    call,
  });

  // ── 4. Enrich in the background; update the lead in place ───────────────
 // ── 4. Enrich + Brevo sync in the background; update the lead in place ───
  (async () => {
    try {
      const enrichment = await enrichPerson({
        fullName: lead.fullName,
        email: lead.email || undefined,
        phone: lead.phoneNormalized,
      });
      if (enrichment) {
        await GeorgiaStLead.updateOne({ _id: lead._id }, { $set: { enrichment } });
      }
    } catch (e) {
      console.error("[georgia-st-enrich] enrichment failed:", e.message);
    }

    // Brevo upsert → "Nurture - Property Leads" (list 12). Independent of
    // enrichment; adding the contact to the list starts the email sequence.
    syncPropertyLead({
      email: lead.email,
      fullName: lead.fullName,
      phone: lead.phoneNormalized,     // E.164 → Brevo SMS
      leadSource: "bigbear-lp",
      registeringAs: lead.buyerType,   // exact page label (Cash investor / …)
      propertyName: "Big Bear Lake",
    }).catch((e) => console.error("[brevo-sync] georgia-st failed:", e.message));
  })();
});

/**
 * GET /api/v1/georgia-st?page=&limit=
 * Paginated list for the admin Georgia St Leads tab. Each lead carries the VAPI
 * calls placed to its number (text-only, newest first). Best-effort — if VAPI is
 * unreachable, `calls` is simply empty.
 */
const getAllGeorgiaStLeads = catchAsyncError(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const [leads, total] = await Promise.all([
    GeorgiaStLead.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    GeorgiaStLead.countDocuments(),
  ]);

  const phones = leads.map((l) => l.phone).filter(Boolean);
  const emailAddresses = leads.map((l) => l.email).filter(Boolean);
  const leadIds = leads.map((l) => l._id);

  const [callsByPhone, eventsByEmail, notesByLead] = await Promise.all([
    getCallsForPhones(phones),
    getEmailEventsForEmails(emailAddresses),
    getNotesForLeads(LEAD_NOTE_TYPE, leadIds),
  ]);

  const leadsWithCalls = leads.map((lead) => ({
    ...lead,
    calls: callsByPhone[normalisePhone(lead.phone)] || [],
    emails: eventsByEmail[String(lead.email || "").toLowerCase()] || [],
    notes: notesByLead[String(lead._id)] || [],
  }));

  res.status(200).json({
    success: true,
    leads: leadsWithCalls,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

module.exports = { registerAndCall, getAllGeorgiaStLeads };
