// controller/partnerLeadController.js
const catchAsyncError = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");
const PartnerLead = require("../model/partnerLeadModel");
const { schedulePartnerSignupCall } = require("../services/partnerCallScheduler");
const { enrichPerson } = require("../services/fullenrichService");
const { getCallsForPhones, normalisePhone } = require("../services/vapiCallsService");
const { getEmailEventsForEmails } = require("../services/emailEventsService");
const { getNotesForLeads } = require("../services/leadNotesService");
const { getMessagesForPhones } = require("../services/sendblueService");

// Discriminator stamped on each note so notes never bleed across lead types.
const LEAD_NOTE_TYPE = "partner";
// Whole-word "test" (case-insensitive). Partner names are split across firstName
// and lastName, so a lead is hidden if EITHER field matches. These surface only
// in the dedicated Test Leads tab.
const TEST_NAME_REGEX = /\btest\b/i;
const { syncPartnerLead } = require("../services/brevoService");

/**
 * POST /api/v1/partner/register   (public)
 *
 * Flow (order matters):
 *   1. Validate + normalize (email is the DEDUP GATE here, not phone).
 *   2. Create the lead — the unique email index rejects a duplicate (409) before
 *      any call is scheduled.
 *   3. Schedule the Maya activation call (fire-and-forget, only with consent) —
 *      the 2-in-60s burst + daily callback loop.
 *   4. Respond.
 *   5. Enrich + Brevo sync in the background; update the lead in place.
 */
const registerAndCall = catchAsyncError(async (req, res, next) => {
  const {
    firstName, lastName, email, phone, primaryMarket, persona, timezone,
    consent, consentText, consentTimestamp, eventId,
  } = req.body;

  if (!firstName || !firstName.trim())
    return next(new ErrorHandler("firstName is required", 400));
  if (!lastName || !lastName.trim())
    return next(new ErrorHandler("lastName is required", 400));
  if (!email || !email.trim())
    return next(new ErrorHandler("email is required", 400));
  if (!phone || !phone.trim())
    return next(new ErrorHandler("phone is required", 400));

  const phoneNormalized = normalisePhone(phone); // canonical E.164 for calling
  if (!phoneNormalized)
    return next(new ErrorHandler("Enter a valid phone number", 400));

  const normalizedEmail = email.trim().toLowerCase();

  // ── 1. Create the lead up front — dedup gate via the unique email index ──
  let lead;
  try {
    lead = await PartnerLead.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: normalizedEmail,       // canonical, unique dedup gate
      phone: phone.trim(),          // raw, as entered (for display)
      phoneNormalized,              // canonical, for dialing
      primaryMarket: (primaryMarket || "").trim(),
      persona: (persona || "").trim(),
      timezone: timezone || "",
      consent: consent === true,
      consentText: consentText || "",
      consentTimestamp: consentTimestamp ? new Date(consentTimestamp) : null,
      eventId: eventId || "",
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return next(new ErrorHandler("This email has already applied.", 409));
    }
    throw err; // unexpected — let catchAsyncError surface it
  }

  // ── 2. Schedule the call (fire-and-forget, only with consent) ───────────
  let call = { attempted: false };
  if (consent === true) {
    schedulePartnerSignupCall({
      leadId: lead._id,
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      phoneNormalized: lead.phoneNormalized,
      timezone: lead.timezone,
    }).catch((e) => console.error("[partner-call] scheduling failed:", e.message));
    call = { attempted: true };
  } else {
    console.log(`[partner] no-consent application: ${lead.email}`);
  }

  // ── 3. Respond ──────────────────────────────────────────────────────────
  res.status(200).json({
    success: true,
    message: consent
      ? "Application received — Maya will call you shortly."
      : "Application received. (No calls — consent not given.)",
    call,
  });

  // ── 4. Enrich + Brevo sync in the background; update the lead in place ───
  (async () => {
    const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ");

    try {
      const enrichment = await enrichPerson({
        fullName,
        email: lead.email || undefined,
        phone: lead.phoneNormalized,
      });
      if (enrichment) {
        await PartnerLead.updateOne({ _id: lead._id }, { $set: { enrichment } });
      }
    } catch (e) {
      console.error("[partner-enrich] enrichment failed:", e.message);
    }

    // Brevo upsert → dedicated Partner Program list (BREVO_PARTNER_LIST_ID).
    // Independent of enrichment; adding the contact to the list starts the
    // partner email sequence.
    syncPartnerLead({
      email: lead.email,
      firstName: lead.firstName,
      lastName: lead.lastName,
      phone: lead.phoneNormalized,   // E.164 → Brevo SMS
      primaryMarket: lead.primaryMarket,
      persona: lead.persona,         // exact page label
      leadSource: "partner-program",
    }).catch((e) => console.error("[brevo-sync] partner failed:", e.message));
  })();
});

/**
 * GET /api/v1/partner?page=&limit=
 * Paginated list for the admin Partner Leads tab. Each lead carries the VAPI calls
 * placed to its number (text-only, newest first). Best-effort — if VAPI is
 * unreachable, `calls` is simply empty.
 */
const getAllPartnerLeads = catchAsyncError(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const query = {
    firstName: { $not: TEST_NAME_REGEX },
    lastName: { $not: TEST_NAME_REGEX },
  };
  const [leads, total] = await Promise.all([
    PartnerLead.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    PartnerLead.countDocuments(query),
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

module.exports = { registerAndCall, getAllPartnerLeads };
