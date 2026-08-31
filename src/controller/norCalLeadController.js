// controller/norCalLeadController.js
const catchAsyncError = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");
const NorCalLead = require("../model/norCalLeadModel");
const { scheduleNorCalSignupCall } = require("../services/norCalCallScheduler");
const { enrichPerson } = require("../services/fullenrichService");
const { getCallsForPhones, normalisePhone } = require("../services/vapiCallsService");
const { getEmailEventsForEmails } = require("../services/emailEventsService");
const { getNotesForLeads } = require("../services/leadNotesService");
const { getMessagesForPhones } = require("../services/sendblueService");
const { syncNorCalLead } = require("../services/brevoService");

// Note discriminator for NorCal leads (matches leadNoteModel.LEAD_TYPES + the
// stop-calling controller's model map).
const LEAD_NOTE_TYPE = "norcal";

// Whole-word "test" (case-insensitive) → hidden from this tab (Test Leads only).
const TEST_NAME_REGEX = /\btest\b/i;

/**
 * POST /api/v1/nor-cal/register   (public)
 *
 * Flow (order matters):
 *   1. Validate the payload + normalize the phone to canonical E.164.
 *   2. Create the lead — the unique email index is the dedup gate (409 on dup)
 *      before any call is scheduled.
 *   3. Schedule Maya's signup call (fire-and-forget, only with consent) — the
 *      2-in-60s burst + daily callback loop.
 *   4. Respond.
 *   5. Enrich (FullEnrich) + Brevo-sync in the background; update the lead in place.
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

  const phoneNormalized = normalisePhone(phone); // canonical E.164 for calling + reporting
  if (!phoneNormalized)
    return next(new ErrorHandler("Enter a valid phone number", 400));

  const normalizedMarket =
    market && market.trim() ? market.trim() : "Northern California";

  // ── 1. Create the lead up front — unique email index is the dedup gate ──
  let lead;
  try {
    lead = await NorCalLead.create({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),          // raw, as entered (for display)
      phoneNormalized,              // canonical E.164 for calling
      buyerType: buyerType || "",
      market: normalizedMarket,
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

  // ── 2. Schedule the signup call (fire-and-forget, only with consent) ──
  let call = { attempted: false };
  if (consent === true) {
    scheduleNorCalSignupCall({
      leadId: lead._id,
      fullName: lead.fullName,
      email: lead.email,
      phone: lead.phone,
      phoneNormalized: lead.phoneNormalized,
      timezone: lead.timezone,
      market: lead.market,
      buyerType: lead.buyerType,
    }).catch((e) => console.error("[nor-cal-call] scheduling failed:", e.message));
    call = { attempted: true };
  } else {
    console.log(`[nor-cal] no-consent registration: ${lead.phoneNormalized}`);
  }

  // ── 3. Respond ──
  res.status(200).json({
    success: true,
    message: consent
      ? "Registered — Maya will call you shortly."
      : "Registered. (No calls — consent not given.)",
    leadId: lead._id,
    call,
  });

  // ── 4. Enrich + Brevo sync in the background; update the lead in place ──
  (async () => {
    try {
      const enrichment = await enrichPerson({
        fullName: lead.fullName,
        email: lead.email || undefined,
        phone: lead.phoneNormalized,
      });
      if (enrichment) {
        await NorCalLead.updateOne({ _id: lead._id }, { $set: { enrichment } });
      }
    } catch (e) {
      console.error("[nor-cal-enrich] enrichment failed:", e.message);
    }

    // Brevo upsert → dedicated NorCal list (BREVO_NORCAL_LIST_ID). Independent of
    // enrichment; adding the contact to the list starts its email sequence.
    syncNorCalLead({
      email: lead.email,
      fullName: lead.fullName,
      phone: lead.phoneNormalized,   // E.164 → Brevo SMS
      market: lead.market,
      registeringAs: lead.buyerType, // exact page label
      leadSource: "norcal-lp",
    }).catch((e) => console.error("[brevo-sync] nor-cal failed:", e.message));
  })();
});

/**
 * GET /api/v1/nor-cal?page=&limit=   (admin)
 *
 * Paginated Northern California early-access leads for the NorCal Leads tab.
 * Each lead is enriched (best-effort) with its VAPI calls / email events /
 * advisor notes / iMessages, exactly like the property + market lead tabs, so
 * the admin component renders the same way. Whole-word "test" names are hidden
 * (they live in Test Leads).
 */
const getAllNorCalLeads = catchAsyncError(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const query = { fullName: { $not: TEST_NAME_REGEX } };
  const [leads, total] = await Promise.all([
    NorCalLead.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    NorCalLead.countDocuments(query),
  ]);

  const phones = leads.map((l) => l.phone).filter(Boolean);
  const emailAddresses = leads.map((l) => l.email).filter(Boolean);
  const leadIds = leads.map((l) => l._id);

  const [callsByPhone, eventsByEmail, notesByLead, messagesByPhone] = await Promise.all([
    getCallsForPhones(phones),
    getEmailEventsForEmails(emailAddresses),
    getNotesForLeads(LEAD_NOTE_TYPE, leadIds),
    getMessagesForPhones(phones),
  ]);

  const leadsWithCalls = leads.map((lead) => ({
    ...lead,
    calls: callsByPhone[normalisePhone(lead.phone)] || [],
    emails: eventsByEmail[String(lead.email || "").toLowerCase()] || [],
    notes: notesByLead[String(lead._id)] || [],
    messages: messagesByPhone[normalisePhone(lead.phone)] || [],
  }));

  res.status(200).json({
    success: true,
    leads: leadsWithCalls,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

module.exports = { registerNorCalLead, getAllNorCalLeads };
