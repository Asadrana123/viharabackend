// controller/newDealsLeadController.js
//
// /new-deals — "A new deal just landed." Buy-box sign-ups from the static deal
// spotlight. Same tracking rules as /buyer-list (Brevo written before the 200,
// browser pixels only after it, Meta CAPI with the same event_id) plus the
// NorCal-style call flow: with consent, Maya calls within a minute and retries
// daily until pickup; asking for an advisor transfers the call live.
// After the Brevo contact is saved, the welcome email (template 189) goes out
// once per person — see "New Deals page: welcome email (dev doc)".
const catchAsyncError = require("../../middleware/catchAsyncError");
const ErrorHandler = require("../../utils/errorhandler");
const NewDealsLead = require("../../model/leads/newDealsLeadModel");
const { normalisePhone, getCallsForPhones } = require("../../services/calling/vapiCallsService");
const { syncNewDealsLead, sendNewDealsWelcomeEmail } = require("../../services/integrations/brevoService");
const { sendEvent } = require("../../services/integrations/metaCapiService");
const { notifyNewLead } = require("../../services/shared/slackService");
const { getEmailEventsForEmails } = require("../../services/integrations/emailEventsService");
const { getNotesForLeads } = require("../../services/leads/leadNotesService");
const { listView, scopeQuery, unlessSummary, shapeLeads } = require("../../services/leads/leadListView");
const { scheduleNewDealsSignupCall } = require("../../services/calling/newDealsCallScheduler");
const { newDealsPageUrl } = require("../../config/siteUrls");
const { NEW_DEALS, findDeal, dealLabel } = require("../../config/newDeals");
const Product = require("../../model/property/productModel");
const TEST_NAME_FIELDS = ["fullName", "firstName"];
const {
  str,
  isValidEmail,
  marketList,
  touchesFrom,
  buildBuyBox,
  attributionFrom,
  clientIp,
  isProductionPageUrl,
  withTimeout,
  stateName,
  labelList,
  priceRangeText,
  splitName,
} = require("../../services/leads/buyBox");

// /new-deals property types (mixed-use instead of land).
const PROPERTY_TYPES = ["sfr", "condo", "mf_2_4", "mf_5_plus", "mixed_use"];
const CONTACT_PREFERENCES = ["email", "text", "call"];

// States with spotlight inventory. ENV: NEW_DEALS_ACTIVE_MARKETS="MD,MI,LA"
const activeMarkets = () => marketList(process.env.NEW_DEALS_ACTIVE_MARKETS, "MD,MI,LA");

const BREVO_TIMEOUT_MS = 8000;
const TEST_NAME_REGEX = /\btest\b/i;
const LEAD_NOTE_TYPE = "newDeals"; // matches leadNoteModel.LEAD_TYPES

// This page's tier rule (from the designer handoff): an advisor request in an
// active market counts as Tier A; Tier B only needs a strategy.
// "Maryland, Michigan, Baltimore" — states then cities, as the buyer picked them.
const marketsText = (box = {}) => [...(box.states || []).map(stateName), ...(box.cities || [])].join(", ");

// "Baltimore, MD" / "$65,900" for a spotlight deal id.
const dealParts = (id) => {
  const d = findDeal(id);
  return d ? { market: `${d.city}, ${d.state}`, price: `$${d.price.toLocaleString("en-US")}` } : null;
};

/**
 * Welcome email (template 189) — once per person. Claims the lead atomically
 * (welcomeEmailSentAt null → now) so two quick submits can't both send; if
 * Brevo still fails after its 3 attempts the claim is released, so the next
 * sign-up from the same person tries again.
 */
async function sendWelcomeOnce(lead) {
  const claimed = await NewDealsLead.findOneAndUpdate(
    { _id: lead._id, welcomeEmailSentAt: null },
    { $set: { welcomeEmailSentAt: new Date() } },
    { new: true }
  ).lean();
  if (!claimed) return; // already sent (or being sent) for this person

  const box = claimed.buyBox || {};
  const deal = dealParts(claimed.dealInterest);
  const result = await sendNewDealsWelcomeEmail({
    email: claimed.email,
    name: claimed.fullName || claimed.firstName,
    params: {
      FIRSTNAME: claimed.firstName,
      STRATEGY: labelList("strategy", box.strategy),
      MARKETS: marketsText(box),
      PRICE_RANGE: priceRangeText(box),
      CONDITION: labelList("condition", box.condition),
      FINANCING: labelList("financing", box.financing),
      CONTACT_PREF: claimed.contactPreference || "",
      ADVISOR_CALL: claimed.advisorCallRequested === true,
      DEAL_MARKET: deal ? deal.market : "",
      DEAL_PRICE: deal ? deal.price : "",
    },
  });

  await NewDealsLead.updateOne(
    { _id: claimed._id },
    result.success
      ? { $set: { welcomeEmailMessageId: result.messageId || "", welcomeEmailError: "" } }
      : { $set: { welcomeEmailSentAt: null, welcomeEmailError: result.error || "send failed" } }
  );
}

const computeTier = (box, advisor) => {
  const markets = activeMarkets();
  const inMarket = box.states.some((s) => markets.includes(s));
  const fastMoney = box.financing === "cash" || box.financing === "hard_money";
  const volume = box.deals_12mo === "2_5" || box.deals_12mo === "6_plus";
  if (inMarket && ((fastMoney && volume) || advisor)) return "A";
  if (inMarket && box.strategy.length) return "B";
  return "C";
};

/**
 * POST /api/v1/new-deals/register   (public)
 *
 *   1. Honeypot filled → pretend success, store nothing.
 *   2. Validate + sanitize; recompute match range and tier server-side.
 *   3. Dedupe by email OR phone (update, keep the original first touch).
 *   4. Brevo write (awaited) → 200. The page fires its pixels only after this.
 *   5. Meta CAPI (same event_id), Slack, and — with consent — Maya's call.
 */
const registerNewDealsLead = catchAsyncError(async (req, res, next) => {
  const body = req.body || {};

  // Bots fill the hidden "company_website" field; real users never see it.
  if (str(body.honeypot, 200)) {
    console.warn(`[new-deals] honeypot hit from ${clientIp(req) || "unknown ip"} — discarded.`);
    return res.status(200).json({ success: true });
  }

  // The form sends a full name; first_name is still accepted from older pages.
  const fullName = (str(body.full_name, 120) || str(body.first_name, 80)).replace(/\s+/g, " ");
  const { firstName, lastName } = splitName(fullName);
  const email = str(body.email, 200).toLowerCase();
  const phone = str(body.phone, 40);
  const eventId = str(body.event_id, 100);

  if (!firstName) return next(new ErrorHandler("full_name is required", 400));
  if (!isValidEmail(email)) return next(new ErrorHandler("Enter a valid email address", 400));
  const phoneNormalized = normalisePhone(phone);
  if (!phoneNormalized || phoneNormalized.replace(/\D/g, "").length < 10)
    return next(new ErrorHandler("Enter a valid phone number", 400));
  if (!eventId) return next(new ErrorHandler("event_id is required", 400));

  const now = new Date();
  const buyBox = buildBuyBox(body.buy_box, PROPERTY_TYPES);
  const advisorCallRequested = body.advisor_call_requested === true;
  const tier = computeTier(buyBox, advisorCallRequested);
  const consent = body.contact_consent === true;
  const dealInterest = findDeal(str(body.deal_interest, 40)) ? str(body.deal_interest, 40) : "";
  const contactPreference = CONTACT_PREFERENCES.includes(body.contact_preference) ? body.contact_preference : "";

  const { firstTouch, lastTouch } = touchesFrom(body, now);
  const attribution = attributionFrom(body.attribution, ["variant", "market_param"]);
  const pageUrl = str(body.page_url, 2000);
  const submittedAt = body.submitted_at ? new Date(body.submitted_at) : now;

  const fields = {
    fullName,
    firstName,
    lastName,
    email,
    phone,
    phoneNormalized,
    buyBox,
    tier,
    dealInterest,
    contactPreference,
    advisorCallRequested,
    consent,
    consentText: consent ? str(body.contact_consent_text, 1000) : "",
    consentVersion: consent ? str(body.contact_consent_version, 60) : "",
    consentTimestamp: consent ? now : null,
    timezone: str(body.timezone, 60),
    lastTouch,
    attribution,
    pageUrl,
    fbp: str(body.fbp, 200),
    fbc: str(body.fbc, 500),
    eventId,
    submittedAt: Number.isNaN(submittedAt.getTime()) ? now : submittedAt,
  };

  // ── Dedupe by email OR phone (email match wins) ───────────────────────────
  const updateExisting = (doc) =>
    NewDealsLead.findByIdAndUpdate(
      doc._id,
      {
        $set: { ...fields, ...(doc.firstTouch && doc.firstTouch.utm_source ? {} : { firstTouch }) },
        $inc: { submissions: 1 },
      },
      { new: true }
    );

  let lead;
  let updated = false;
  const existing =
    (await NewDealsLead.findOne({ email })) ||
    (await NewDealsLead.findOne({ phoneNormalized }).sort({ createdAt: 1 }));
  if (existing) {
    lead = await updateExisting(existing);
    updated = true;
  } else {
    try {
      lead = await NewDealsLead.create({ ...fields, firstTouch });
    } catch (err) {
      if (!(err && err.code === 11000)) throw err;
      const doc = await NewDealsLead.findOne({ email });
      if (!doc) throw err;
      lead = await updateExisting(doc);
      updated = true;
    }
  }

  // ── CRM write (Brevo) before the 200 ──────────────────────────────────────
  const brevo = await withTimeout(
    syncNewDealsLead({
      ...lead.toObject(),
      smsOptInUrl: newDealsPageUrl(),
      marketsText: marketsText(lead.buyBox),
      dealText: dealParts(lead.dealInterest)?.market || "",
    }),
    BREVO_TIMEOUT_MS,
    { success: false, error: "Brevo timeout" }
  ).catch((e) => ({ success: false, error: e.message }));

  await NewDealsLead.updateOne(
    { _id: lead._id },
    { $set: { brevoSynced: brevo.success === true, brevoError: brevo.success ? "" : String(brevo.error || "") } }
  ).catch((e) => console.error("[new-deals] brevo status save failed:", e.message));

  res.status(200).json({ success: true, leadId: lead._id, tier: lead.tier, updated, call: consent });

  // ── After the 200 ─────────────────────────────────────────────────────────
  const plain = lead.toObject();

  // Welcome email — after the contact save above, once per person.
  sendWelcomeOnce(plain).catch((e) => console.error("[new-deals] welcome email failed:", e.message));

  // Maya's signup call (+ daily retries) — only with consent.
  if (consent) {
    scheduleNewDealsSignupCall(plain).catch((e) => console.error("[new-deals-call] scheduling failed:", e.message));
  } else {
    console.log(`[new-deals] no-consent sign-up — not calling ${lead.phoneNormalized}`);
  }

  if (isProductionPageUrl(pageUrl)) {
    sendEvent({
      eventName: "CompleteRegistration",
      eventId,
      eventSourceUrl: pageUrl,
      userData: {
        email: lead.email,
        phone: lead.phoneNormalized,
        clientIpAddress: clientIp(req),
        clientUserAgent: req.headers["user-agent"],
        fbp: lead.fbp || undefined,
        fbc: lead.fbc || undefined,
      },
      // Buy-box answers never go to ad platforms — tier category only.
      customData: { content_category: `buyer_list_tier_${lead.tier}`, content_name: "new-deals" },
    }).catch((e) => console.error("[new-deals] Meta CAPI failed:", e.message));
  }

  // Same Slack channel as the NorCal sign-ups (SLACK_LEADS_WEBHOOK_URL).
  notifyNewLead({
    leadType: updated ? "New Deals (updated)" : "New Deals",
    name: lead.fullName || lead.firstName,
    email: lead.email,
    phone: lead.phone,
    consent: lead.consent,
    source: `new-deals · ${lead.firstTouch?.utm_source || "direct"}`,
    extraFields: [
      { label: "Tier", value: lead.tier },
      { label: "Deal", value: dealLabel(lead.dealInterest) || "—" },
      { label: "States", value: buyBox.states.join(", ") || "—" },
      { label: "Price", value: `${buyBox.price_min} – ${buyBox.price_max === null ? "3M+" : buyBox.price_max}` },
      { label: "Reach By", value: lead.contactPreference || "—" },
    ],
  }).catch((e) => console.error("[slack] new-deals notify failed:", e.message));
});

/**
 * GET /api/v1/new-deals?page=&limit=&tier=   (admin)
 * Paginated New Deals leads with their Maya calls, email events and notes.
 */
const getAllNewDealsLeads = catchAsyncError(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const view = listView(req); // ?view=summary (light rows) / ?id= (one lead, full)
  if (view.badId) return res.status(400).json({ success: false, message: "Invalid id" });

  const query = { $and: TEST_NAME_FIELDS.map((f) => ({ [f]: { $not: TEST_NAME_REGEX } })) };
  if (["A", "B", "C"].includes(req.query.tier)) query.tier = req.query.tier;

  const [leads, total] = await Promise.all([
    NewDealsLead.find(scopeQuery(view, query)).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    NewDealsLead.countDocuments(scopeQuery(view, query)),
  ]);

  const [callsByPhone, eventsByEmail, notesByLead] = await Promise.all([
    getCallsForPhones(leads.map((l) => l.phone).filter(Boolean)),
    getEmailEventsForEmails(unlessSummary(view, leads.map((l) => l.email).filter(Boolean))),
    getNotesForLeads(LEAD_NOTE_TYPE, unlessSummary(view, leads.map((l) => l._id))),
  ]);

  res.status(200).json({
    success: true,
    leads: shapeLeads(view, leads.map((lead) => ({
      ...lead,
      fullName: lead.fullName || lead.firstName,
      dealInterestLabel: dealLabel(lead.dealInterest),
      calls: callsByPhone[normalisePhone(lead.phone)] || [],
      emails: eventsByEmail[String(lead.email || "").toLowerCase()] || [],
      notes: notesByLead[String(lead._id)] || [],
    }))),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// Public listing fields only — the deal cards on /new-deals.
const DEAL_FIELDS = "slug street city state zipCode image otherImages beds baths squareFootage propertyType yearBuilt";
const DEALS_CACHE_MS = 5 * 60 * 1000;
let dealsCache = { at: 0, deals: null };

/**
 * GET /api/v1/new-deals/deals   (public)
 *
 * The spotlight deals (config/newDeals.js) joined to their properties by slug:
 * address, photos, beds/baths/sqft, type. Price, area and "best for" stay from
 * the config (they're what Maya quotes). A deal whose property is missing comes
 * back without `property`, and the page shows it as before.
 */
const getNewDealsSpotlight = catchAsyncError(async (req, res) => {
  if (!dealsCache.deals || Date.now() - dealsCache.at > DEALS_CACHE_MS) {
    const products = await Product.find({ slug: { $in: NEW_DEALS.map((d) => d.slug).filter(Boolean) } })
      .select(DEAL_FIELDS)
      .lean();
    const bySlug = new Map(products.map((p) => [p.slug, p]));

    const deals = NEW_DEALS.map((d) => {
      const p = bySlug.get(d.slug);
      if (!p) return { id: d.id };
      const photos = [p.image, ...(p.otherImages || [])].filter(Boolean);
      return {
        id: d.id,
        property: {
          slug: p.slug,
          street: p.street || "",
          city: p.city || "",
          state: p.state || "",
          zipCode: p.zipCode || "",
          beds: p.beds ?? null,
          baths: p.baths ?? null,
          squareFootage: p.squareFootage ?? null,
          propertyType: p.propertyType || "",
          yearBuilt: p.yearBuilt ?? null,
          image: photos[0] || "",
          photoCount: photos.length,
        },
      };
    });
    dealsCache = { at: Date.now(), deals };
  }

  res.set("Cache-Control", "public, max-age=300");
  res.status(200).json({ success: true, deals: dealsCache.deals });
});

module.exports = { registerNewDealsLead, getAllNewDealsLeads, getNewDealsSpotlight };
