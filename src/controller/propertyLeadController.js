// controller/propertyLeadController.js
//
// ONE controller for EVERY property auction landing page (/auction/:slug).
// Replaces the per-property controllers (georgiaStLeadController, …). The
// property is resolved from the URL slug, so nothing here is hardcoded per
// property — a new property works the moment it's uploaded and flagged
// isLandingPage in Manage Listings.
const catchAsyncError = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");
const productModel = require("../model/productModel");
const PropertyLead = require("../model/propertyLeadModel");
const { scheduleSignupCall } = require("../services/propertyCallScheduler");
const { enrichPerson } = require("../services/fullenrichService");
const { getCallsForPhones, normalisePhone } = require("../services/vapiCallsService");
const { getEmailEventsForEmails } = require("../services/emailEventsService");
const { getNotesForLeads } = require("../services/leadNotesService");
const { getMessagesForPhones } = require("../services/sendblueService");
const { syncPropertyLead } = require("../services/brevoService");

// Single note discriminator for all property-auction leads. Lead ids are unique,
// so one type is enough to keep notes from bleeding into other lead systems.
const LEAD_NOTE_TYPE = "property";

// Whole-word "test" (case-insensitive) → hidden from this tab (Test Leads only).
const TEST_NAME_REGEX = /\btest\b/i;

// Resolve a published landing property by slug, or throw the right error.
async function resolveLandingProperty(slug, next) {
  if (!slug || !slug.trim()) {
    next(new ErrorHandler("Property slug is required", 400));
    return null;
  }
  const product = await productModel
    .findOne({ slug: slug.trim().toLowerCase() })
    .select("_id slug productName street city state isLandingPage")
    .lean();
  if (!product) {
    next(new ErrorHandler("Property not found", 404));
    return null;
  }
  if (!product.isLandingPage) {
    next(new ErrorHandler("This property's landing page is not published", 403));
    return null;
  }
  return product;
}

/**
 * POST /api/v1/property-lead/:slug/register   (public)
 *
 *   1. Resolve the property by slug (must exist + be a published landing page).
 *   2. Validate + normalize phone (email required, same as the old pages).
 *   3. Create the lead stamped with propertySlug — the compound unique index
 *      { propertySlug, phoneNormalized } is the dedup gate (409 on duplicate).
 *   4. Schedule Maya's call for THIS property (fire-and-forget, only with consent).
 *   5. Respond, then enrich + Brevo-sync in the background.
 */
const registerAndCall = catchAsyncError(async (req, res, next) => {
  const slug = String(req.params.slug || "").trim().toLowerCase();
  const property = await resolveLandingProperty(slug, next);
  if (!property) return; // resolveLandingProperty already called next(err)

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

  const phoneNormalized = normalisePhone(phone);
  if (!phoneNormalized)
    return next(new ErrorHandler("Enter a valid phone number", 400));

  const normalizedEmail = email.trim().toLowerCase();

  // ── Create the lead — compound unique (propertySlug, phoneNormalized) gate ──
  let lead;
  try {
    lead = await PropertyLead.create({
      propertySlug: slug,
      fullName: fullName.trim(),
      phone: phone.trim(),
      phoneNormalized,
      email: normalizedEmail,
      buyerType: buyerType || "",
      timezone: timezone || "",
      consent: consent === true,
      consentText: consentText || "",
      consentTimestamp: consentTimestamp ? new Date(consentTimestamp) : null,
      eventId: eventId || "",
      source: `auction-${slug}`,
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return next(new ErrorHandler("This phone number is already registered.", 409));
    }
    throw err;
  }

  // ── Schedule the call (fire-and-forget, only with consent) ──────────────────
  let call = { attempted: false };
  if (consent === true) {
    scheduleSignupCall({
      leadId: lead._id,
      propertySlug: slug,
      fullName: lead.fullName,
      phone: lead.phone,
      phoneNormalized: lead.phoneNormalized,
      timezone: lead.timezone,
      email: lead.email,
      buyerType: lead.buyerType,
    }).catch((e) => console.error(`[property-call:${slug}] scheduling failed:`, e.message));
    call = { attempted: true };
  } else {
    console.log(`[property-lead:${slug}] no-consent registration: ${lead.phoneNormalized}`);
  }

  // ── Respond ────────────────────────────────────────────────────────────────
  res.status(200).json({
    success: true,
    message: consent
      ? "Registered — Maya will call you shortly."
      : "Registered. (No calls — consent not given.)",
    call,
  });

  // ── Enrich + Brevo sync in the background; update the lead in place ─────────
  (async () => {
    try {
      const enrichment = await enrichPerson({
        fullName: lead.fullName,
        email: lead.email || undefined,
        phone: lead.phoneNormalized,
      });
      if (enrichment) {
        await PropertyLead.updateOne({ _id: lead._id }, { $set: { enrichment } });
      }
    } catch (e) {
      console.error(`[property-enrich:${slug}] enrichment failed:`, e.message);
    }

    // Brevo upsert → shared "Property Leads" list. propertyName/leadSource are
    // derived from the property document, not hardcoded.
    syncPropertyLead({
      email: lead.email,
      fullName: lead.fullName,
      phone: lead.phoneNormalized,
      leadSource: `${slug}-lp`,
      registeringAs: lead.buyerType,
      propertyName: property.city || property.productName || slug,
    }).catch((e) => console.error(`[brevo-sync:${slug}] failed:`, e.message));
  })();
});

/**
 * GET /api/v1/property-lead/:slug?page=&limit=   (admin)
 * Paginated leads for ONE property, for the Property Leads tab. Each lead is
 * enriched with its VAPI calls / email events / notes / iMessages (best-effort).
 */
const getLeadsByProperty = catchAsyncError(async (req, res, next) => {
  const slug = String(req.params.slug || "").trim().toLowerCase();
  if (!slug) return next(new ErrorHandler("Property slug is required", 400));

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const query = { propertySlug: slug, fullName: { $not: TEST_NAME_REGEX } };
  const [leads, total] = await Promise.all([
    PropertyLead.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    PropertyLead.countDocuments(query),
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

module.exports = { registerAndCall, getLeadsByProperty };
