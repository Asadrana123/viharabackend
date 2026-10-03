// controller/newDealsLeadController.js
//
// /new-deals — "A new deal just landed." Buy-box sign-ups from the static deal
// spotlight. Same tracking rules as /buyer-list (Brevo written before the 200,
// browser pixels only after it, Meta CAPI with the same event_id) plus the
// NorCal-style call flow: with consent, Maya calls within a minute and retries
// daily until pickup; asking for an advisor transfers the call live.
const catchAsyncError = require("../../middleware/catchAsyncError");
const ErrorHandler = require("../../utils/errorhandler");
const NewDealsLead = require("../../model/leads/newDealsLeadModel");
const { normalisePhone, getCallsForPhones } = require("../../services/calling/vapiCallsService");
const { syncNewDealsLead } = require("../../services/integrations/brevoService");
const { sendEvent } = require("../../services/integrations/metaCapiService");
const { notifyNewLead } = require("../../services/shared/slackService");
const { getEmailEventsForEmails } = require("../../services/integrations/emailEventsService");
const { getNotesForLeads } = require("../../services/leads/leadNotesService");
const { scheduleNewDealsSignupCall } = require("../../services/calling/newDealsCallScheduler");
const { newDealsPageUrl } = require("../../config/siteUrls");
const { findDeal, dealLabel } = require("../../config/newDeals");
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

  const firstName = str(body.first_name, 80);
  const email = str(body.email, 200).toLowerCase();
  const phone = str(body.phone, 40);
  const eventId = str(body.event_id, 100);

  if (!firstName) return next(new ErrorHandler("first_name is required", 400));
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
    firstName,
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
    syncNewDealsLead({ ...lead.toObject(), smsOptInUrl: newDealsPageUrl() }),
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
    name: lead.firstName,
    email: lead.email,
    phone: lead.phone,
    consent: lead.consent,
    source: `new-deals · ${lead.firstTouch?.utm_source || "direct"}`,
    extraFields: [
      { label: "Tier", value: lead.tier },
      { label: "Advisor Call", value: lead.advisorCallRequested ? "✅ Requested" : "No" },
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

  const query = { firstName: { $not: TEST_NAME_REGEX } };
  if (["A", "B", "C"].includes(req.query.tier)) query.tier = req.query.tier;

  const [leads, total] = await Promise.all([
    NewDealsLead.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    NewDealsLead.countDocuments(query),
  ]);

  const [callsByPhone, eventsByEmail, notesByLead] = await Promise.all([
    getCallsForPhones(leads.map((l) => l.phone).filter(Boolean)),
    getEmailEventsForEmails(leads.map((l) => l.email).filter(Boolean)),
    getNotesForLeads(LEAD_NOTE_TYPE, leads.map((l) => l._id)),
  ]);

  res.status(200).json({
    success: true,
    leads: leads.map((lead) => ({
      ...lead,
      fullName: lead.firstName,
      dealInterestLabel: dealLabel(lead.dealInterest),
      calls: callsByPhone[normalisePhone(lead.phone)] || [],
      emails: eventsByEmail[String(lead.email || "").toLowerCase()] || [],
      notes: notesByLead[String(lead._id)] || [],
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

module.exports = { registerNewDealsLead, getAllNewDealsLeads };
