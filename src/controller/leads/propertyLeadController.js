// controller/propertyLeadController.js
//
// ONE controller for EVERY property auction landing page (/auction/:slug).
// Replaces the per-property controllers (georgiaStLeadController, …). The
// property is resolved from the URL slug, so nothing here is hardcoded per
// property — a new property works the moment it's uploaded and flagged
// isLandingPage in Manage Listings.
const catchAsyncError = require("../../middleware/catchAsyncError");
const ErrorHandler = require("../../utils/errorhandler");
const productModel = require("../../model/property/productModel");
const PropertyLead = require("../../model/leads/propertyLeadModel");
const { sanitizeFormAnswers, answersAsFields } = require("../../services/leads/formAnswers");
const { scheduleSignupCall } = require("../../services/calling/propertyCallScheduler");
const { enrichPerson } = require("../../services/shared/fullenrichService");
const { normalisePhone } = require("../../services/calling/vapiCallsService");
const { getEmailEventsForEmails } = require("../../services/integrations/emailEventsService");
const { getNotesForLeads } = require("../../services/leads/leadNotesService");
const { listView, scopeQuery, unlessSummary, listSelect, callsForList, shapeLeads } = require("../../services/leads/leadListView");
const { getVtextMessagesForPhones } = require("../../services/vtext/vtextLeadMessagesService");
const { maybeSendSignupQuoteText } = require("../../services/vtext/vtextAutoSignupService");
const { syncPropertyLead } = require("../../services/integrations/brevoService");
const { notifyNewLead } = require("../../services/shared/slackService");
const { onPropertyLeadSignup } = require("../../services/propertyEmail/propertyEmailService");
const { auctionPageUrl, listingPageUrl } = require("../../config/siteUrls");
const { touchesFrom, needsFinancingFrom, needsFinancingLabel, downPaymentFrom } = require("../../services/leads/buyBox");

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
    .select("_id slug productName street city state zipCode isLandingPage brevoListId emailSequenceEnabled startBid image features auctionStartDate auctionEndDate")
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
    fullName, phone, email, buyerType, needsFinancing, downPayment, timezone,
    consent, consentText, consentTimestamp, eventId, quotePrice,
    smsConsent, smsConsentText,
  } = req.body;
  // Extra questions added to the form in Admin → Landing Pages (services/leads/formAnswers.js).
  const extraAnswers = sanitizeFormAnswers(req.body.extraAnswers);

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

  // Buyer's quoted price. Stored only when a valid positive number is sent — the
  // client only sends it when the DB-bound slider was available. Never invented.
  const quoteNum = Number(quotePrice);
  const hasQuote = Number.isFinite(quoteNum) && quoteNum > 0;

  // SMS box is separate from the call consent and unchecked by default. Only a
  // literal `true` counts as opting in. Brevo's automation sends the texts.
  const smsOptedIn = smsConsent === true;

  // UTM first/last touch from the page (utm_content = the ad's LT-ID).
  const { firstTouch, lastTouch } = touchesFrom(req.body);

  // ── Create the lead — compound unique (propertySlug, phoneNormalized) gate ──
  let lead;
  try {
    lead = await PropertyLead.create({
      extraAnswers,
      propertySlug: slug,
      fullName: fullName.trim(),
      phone: phone.trim(),
      phoneNormalized,
      email: normalizedEmail,
      buyerType: buyerType || "",
      needsFinancing: needsFinancingFrom(needsFinancing),
      downPayment: downPaymentFrom(downPayment, needsFinancing),
      quotePrice: hasQuote ? quoteNum : null,
      timezone: timezone || "",
      consent: consent === true,
      consentText: consentText || "",
      consentTimestamp: consentTimestamp ? new Date(consentTimestamp) : null,
      smsConsent: smsOptedIn,
      smsConsentText: smsOptedIn ? String(smsConsentText || "") : "",
      smsConsentAt: smsOptedIn ? new Date() : null,
      eventId: eventId || "",
      source: `auction-${slug}`,
      firstTouch,
      lastTouch,
      isQaTest: req.isQaTest === true,
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return next(new ErrorHandler("This phone number is already registered.", 409));
    }
    throw err;
  }

  // ── Schedule the call (fire-and-forget, only with consent) ──────────────────
  // QA test leads never get a real call; the response says it was suppressed
  // so the QA agent can still check that consent WOULD have scheduled one.
  let call = { attempted: false };
  if (consent === true && lead.isQaTest) {
    call = { attempted: false, suppressedForQaTest: true };
  } else if (consent === true) {
    scheduleSignupCall({
      leadId: lead._id,
      propertySlug: slug,
      fullName: lead.fullName,
      phone: lead.phone,
      phoneNormalized: lead.phoneNormalized,
      timezone: lead.timezone,
      email: lead.email,
      buyerType: lead.buyerType,
      quotePrice: lead.quotePrice,
      needsFinancing: lead.needsFinancing,
      downPayment: lead.downPayment,
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
    ...(lead.isQaTest && { qaTest: { suppressed: [...(consent === true ? ["call"] : []), "slack", "enrichment", "brevo", "vtext"] } }),
  });

  // QA test leads stop here: no Slack post, paid enrichment, Brevo contact or text.
  if (lead.isQaTest) return;

  // ── Slack notification (fire-and-forget) ───────────────────────────────────
  notifyNewLead({
    leadType: "Property Auction",
    name: lead.fullName,
    email: lead.email,
    phone: lead.phone,
    consent: lead.consent,
    smsConsent: lead.smsConsent,
    source: lead.source, // `auction-${slug}`
    extraFields: [
      { label: "Property", value: property.city || property.productName || slug },
      { label: "Slug", value: slug },
      { label: "Buyer Type", value: lead.buyerType },
      { label: "Needs Financing", value: needsFinancingLabel(lead.needsFinancing) },
      ...(lead.downPayment ? [{ label: "Down Payment", value: lead.downPayment }] : []),
      { label: "Quote", value: hasQuote ? `$${quoteNum.toLocaleString("en-US")}` : "—" },
      ...answersAsFields(lead.extraAnswers),
    ],
  }).catch((e) => console.error(`[slack] property notify failed (${slug}):`, e.message));

  // E1 confirmation from the backend email sequence (only when it's on for
  // this property — see propertyEmailService). Never throws.
  onPropertyLeadSignup({ property, lead, callingNow: call.attempted === true });

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
      listId: property.brevoListId, // per-page Brevo list (null → shared default)
      listingUrl: listingPageUrl(slug), // LISTING_URL for the Brevo SMS text
      smsOptIn: lead.smsConsent,
      smsOptInAt: lead.smsConsentAt,
      smsOptInUrl: auctionPageUrl(slug),
    }).catch((e) => console.error(`[brevo-sync:${slug}] failed:`, e.message));

    // Vtext's own automated signup text — independent of and in addition to
    // the Brevo sync above, off by default (VTEXT_AUTO_SIGNUP_TEXT_ENABLED).
    // See vtextAutoSignupService.js's header for the full design.
    maybeSendSignupQuoteText({ lead, property });
  })();
});

// Most deals one finder sign-up can follow at once.
const FINDER_MAX_DEALS = 5;

/**
 * POST /api/v1/property-lead/finder/register   (public)
 *
 * The website's deal finder (/find): ONE person following SEVERAL deals.
 *   - One lead per deal, stamped source `finder-<slug>`, so each shows in its own
 *     Property Leads tab and gets that deal's own E1 + sale emails.
 *   - ONE Maya call, for the first deal they picked that's new for them, and ONE
 *     Slack post listing every deal. The other leads are never dialled (the call
 *     sweep only picks up leads whose signup call already ran).
 *   - A deal they already signed up for is skipped, not an error (`already`).
 */
const registerForDeals = catchAsyncError(async (req, res, next) => {
  const picked = Array.isArray(req.body.propertySlugs) ? req.body.propertySlugs : [];
  const slugs = [...new Set(picked.map((s) => String(s || "").trim().toLowerCase()).filter(Boolean))].slice(0, FINDER_MAX_DEALS);
  if (!slugs.length) return next(new ErrorHandler("Pick at least one deal", 400));

  const {
    fullName, phone, email, needsFinancing, downPayment, timezone,
    consent, consentText, consentTimestamp, eventId, smsConsent, smsConsentText,
  } = req.body;
  const extraAnswers = sanitizeFormAnswers(req.body.extraAnswers);

  if (!fullName || !fullName.trim())
    return next(new ErrorHandler("fullName is required", 400));
  if (!email || !email.trim())
    return next(new ErrorHandler("email is required", 400));
  if (!phone || !phone.trim())
    return next(new ErrorHandler("phone is required", 400));

  const phoneNormalized = normalisePhone(phone);
  if (!phoneNormalized)
    return next(new ErrorHandler("Enter a valid phone number", 400));

  // Published landing properties only (same rule as /:slug/register), in the order they were picked.
  const products = await productModel
    .find({ slug: { $in: slugs }, isLandingPage: true })
    .select("_id slug productName street city state zipCode isLandingPage brevoListId emailSequenceEnabled startBid image features auctionStartDate auctionEndDate")
    .lean();
  const properties = slugs.map((s) => products.find((p) => p.slug === s)).filter(Boolean);
  if (!properties.length)
    return next(new ErrorHandler("These deals aren't open any more", 404));

  const smsOptedIn = smsConsent === true;
  const { firstTouch, lastTouch } = touchesFrom(req.body);
  const isQaTest = req.isQaTest === true;

  // ── One lead per deal — the (propertySlug, phoneNormalized) index skips repeats ──
  const created = []; // [{ lead, property }]
  const already = [];
  for (const property of properties) {
    try {
      const lead = await PropertyLead.create({
        extraAnswers,
        propertySlug: property.slug,
        fullName: fullName.trim(),
        phone: phone.trim(),
        phoneNormalized,
        email: email.trim().toLowerCase(),
        needsFinancing: needsFinancingFrom(needsFinancing),
        downPayment: downPaymentFrom(downPayment, needsFinancing),
        quotePrice: null,
        timezone: timezone || "",
        consent: consent === true,
        consentText: consentText || "",
        consentTimestamp: consentTimestamp ? new Date(consentTimestamp) : null,
        smsConsent: smsOptedIn,
        smsConsentText: smsOptedIn ? String(smsConsentText || "") : "",
        smsConsentAt: smsOptedIn ? new Date() : null,
        eventId: eventId || "",
        source: `finder-${property.slug}`,
        firstTouch,
        lastTouch,
        isQaTest,
      });
      created.push({ lead, property });
    } catch (err) {
      if (err && err.code === 11000) {
        already.push(property.slug);
        continue;
      }
      throw err;
    }
  }

  // ── ONE call: the first deal that's new for them (only with consent) ────────
  const first = created[0];
  let call = { attempted: false };
  if (first && consent === true && isQaTest) {
    call = { attempted: false, suppressedForQaTest: true };
  } else if (first && consent === true) {
    const { lead } = first;
    scheduleSignupCall({
      leadId: lead._id,
      propertySlug: lead.propertySlug,
      fullName: lead.fullName,
      phone: lead.phone,
      phoneNormalized: lead.phoneNormalized,
      timezone: lead.timezone,
      email: lead.email,
      buyerType: lead.buyerType,
      quotePrice: lead.quotePrice,
      needsFinancing: lead.needsFinancing,
      downPayment: lead.downPayment,
    }).catch((e) => console.error(`[property-call:finder:${lead.propertySlug}] scheduling failed:`, e.message));
    call = { attempted: true, propertySlug: lead.propertySlug };
  }

  res.status(200).json({
    success: true,
    created: created.map((c) => c.property.slug),
    already,
    call,
    ...(isQaTest && { qaTest: { suppressed: [...(consent === true ? ["call"] : []), "slack", "enrichment", "brevo"] } }),
  });

  // QA test leads (and a sign-up with nothing new) stop here.
  if (isQaTest || !created.length) return;

  const dealName = (p) => [p.street || p.productName || p.slug, p.city].filter(Boolean).join(", ");
  notifyNewLead({
    leadType: "Deal Finder",
    name: first.lead.fullName,
    email: first.lead.email,
    phone: first.lead.phone,
    consent: first.lead.consent,
    smsConsent: first.lead.smsConsent,
    source: "finder",
    extraFields: [
      { label: "Deals", value: created.map((c) => dealName(c.property)).join("; ") },
      ...(already.length ? [{ label: "Already following", value: already.join(", ") }] : []),
      { label: "Needs Financing", value: needsFinancingLabel(first.lead.needsFinancing) },
      ...(first.lead.downPayment ? [{ label: "Down Payment", value: first.lead.downPayment }] : []),
      ...answersAsFields(first.lead.extraAnswers),
    ],
  }).catch((e) => console.error("[slack] finder notify failed:", e.message));

  // ONE E1, for the first deal, listing the others ("You're also following");
  // the other deals only get their lead record. Never throws.
  created.forEach(({ lead, property }, i) =>
    onPropertyLeadSignup({
      property,
      lead,
      callingNow: i === 0 && call.attempted === true,
      otherDeals: i === 0 ? created.slice(1).map((c) => c.property) : [],
      sendEmail: i === 0,
    })
  );

  // ── Enrich once for all the leads, then Brevo-sync each ─────────────────────
  (async () => {
    try {
      const enrichment = await enrichPerson({
        fullName: first.lead.fullName,
        email: first.lead.email || undefined,
        phone: first.lead.phoneNormalized,
      });
      if (enrichment) {
        await PropertyLead.updateMany({ _id: { $in: created.map((c) => c.lead._id) } }, { $set: { enrichment } });
      }
    } catch (e) {
      console.error("[property-enrich:finder] enrichment failed:", e.message);
    }

    created.forEach(({ lead, property }) => {
      syncPropertyLead({
        email: lead.email,
        fullName: lead.fullName,
        phone: lead.phoneNormalized,
        leadSource: `${property.slug}-finder`,
        registeringAs: lead.buyerType,
        propertyName: property.city || property.productName || property.slug,
        listId: property.brevoListId,
        listingUrl: listingPageUrl(property.slug),
        smsOptIn: lead.smsConsent,
        smsOptInAt: lead.smsConsentAt,
        smsOptInUrl: auctionPageUrl(property.slug),
      }).catch((e) => console.error(`[brevo-sync:finder:${property.slug}] failed:`, e.message));
    });
  })();
});

/**
 * GET /api/v1/property-lead/:slug?page=&limit=   (admin)
 * Paginated leads for ONE property, for the Property Leads tab. Each lead is
 * enriched with its VAPI calls / email events / notes (best-effort).
 */
const getLeadsByProperty = catchAsyncError(async (req, res, next) => {
  const slug = String(req.params.slug || "").trim().toLowerCase();
  if (!slug) return next(new ErrorHandler("Property slug is required", 400));

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const view = listView(req); // ?view=summary (light rows) / ?id= (one lead, full)
  if (view.badId) return res.status(400).json({ success: false, message: "Invalid id" });

  const query = { propertySlug: slug, fullName: { $not: TEST_NAME_REGEX }, isQaTest: { $ne: true } };
  const [leads, total] = await Promise.all([
    PropertyLead.find(scopeQuery(view, query)).select(listSelect(view)).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    PropertyLead.countDocuments(scopeQuery(view, query)),
  ]);

  const phones = leads.map((l) => l.phone).filter(Boolean);
  const emailAddresses = leads.map((l) => l.email).filter(Boolean);
  const leadIds = leads.map((l) => l._id);

  const [messagesByPhone, callsFor, eventsByEmail, notesByLead] = await Promise.all([
    getVtextMessagesForPhones(unlessSummary(view, phones)),
    callsForList(view, phones),
    getEmailEventsForEmails(unlessSummary(view, emailAddresses)),
    getNotesForLeads(LEAD_NOTE_TYPE, unlessSummary(view, leadIds)),
  ]);

  const leadsWithCalls = leads.map((lead) => ({
    ...lead,
    ...callsFor(lead.phone),
    emails: eventsByEmail[String(lead.email || "").toLowerCase()] || [],
    notes: notesByLead[String(lead._id)] || [],
    messages: messagesByPhone[normalisePhone(lead.phone)] || [],
  }));

  res.status(200).json({
    success: true,
    leads: shapeLeads(view, leadsWithCalls),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

module.exports = { registerAndCall, registerForDeals, getLeadsByProperty };
