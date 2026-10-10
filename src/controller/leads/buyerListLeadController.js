// controller/buyerListLeadController.js
//
// /buyer-list — "Your buy box. Our deal flow." (see "Buyer List — Tracking Spec
// for Developers"). Brevo is the CRM source of truth; ad platforms only get a
// conversion signal, and only once the record is stored.
const catchAsyncError = require("../../middleware/catchAsyncError");
const ErrorHandler = require("../../utils/errorhandler");
const BuyerListLead = require("../../model/leads/buyerListLeadModel");
const { normalisePhone } = require("../../services/calling/vapiCallsService");
const { syncBuyerListLead } = require("../../services/integrations/brevoService");
const { sendEvent } = require("../../services/integrations/metaCapiService");
const { notifyNewLead } = require("../../services/shared/slackService");
const { buyerListPageUrl } = require("../../config/siteUrls");
const { getCallsForPhones } = require("../../services/calling/vapiCallsService");
const { getEmailEventsForEmails } = require("../../services/integrations/emailEventsService");
const { getNotesForLeads } = require("../../services/leads/leadNotesService");
const { listView, scopeQuery, unlessSummary, shapeLeads } = require("../../services/leads/leadListView");
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
  splitName,
} = require("../../services/leads/buyBox");

// /buyer-list property types (the /new-deals page swaps land for mixed-use).
const PROPERTY_TYPES = ["sfr", "condo", "mf_2_4", "mf_5_plus", "land"];

// States with current inventory (drives the tier). ENV: BUYER_LIST_ACTIVE_MARKETS="CA,NY"
const activeMarkets = () => marketList(process.env.BUYER_LIST_ACTIVE_MARKETS, "CA,NY");

const BREVO_TIMEOUT_MS = 8000;
const TEST_NAME_REGEX = /test/i;
// Note discriminator (matches leadNoteModel.LEAD_TYPES).
const LEAD_NOTE_TYPE = "buyerList";

// Tier is recomputed here from what the buyer told us (never who they are),
// so a tampered client value can't change it. Mirrors tier() on the page.
const computeTier = (box) => {
  const markets = activeMarkets();
  const inMarket = box.states.some((s) => markets.includes(s));
  const fastMoney = box.financing === "cash" || box.financing === "hard_money";
  const volume = box.deals_12mo === "2_5" || box.deals_12mo === "6_plus";
  if (inMarket && fastMoney && volume) return "A";
  if (inMarket && box.strategy.length && box.property_type.length) return "B";
  return "C";
};

/**
 * POST /api/v1/buyer-list/register   (public)
 *
 * Order (per spec):
 *   1. Validate + sanitize; recompute match range and tier server-side.
 *   2. Dedupe by email OR phone. New → create. Existing → update the buy box,
 *      contact, last touch and attribution, KEEP the original first touch.
 *   3. Write the CRM record (Brevo) — awaited, so the 200 means "stored".
 *   4. Respond 200. The page fires its browser pixels only after this.
 *   5. Server-side Meta CAPI CompleteRegistration with the SAME event_id
 *      (dedupes with the browser pixel), plus Slack.
 */
const registerBuyerListLead = catchAsyncError(async (req, res, next) => {
  const body = req.body || {};

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

  const buyBox = buildBuyBox(body.buy_box, PROPERTY_TYPES);
  const tier = computeTier(buyBox);

  const submittedAt = body.submitted_at ? new Date(body.submitted_at) : new Date();
  const now = new Date();
  const smsConsent = body.sms_consent === true;

  const { firstTouch, lastTouch } = touchesFrom(body, now);
  const attribution = attributionFrom(body.attribution, ["variant", "type"]);

  const pageUrl = str(body.page_url, 2000);

  const fields = {
    fullName,
    firstName,
    lastName,
    email,
    phone,
    phoneNormalized,
    buyBox,
    tier,
    lastTouch,
    attribution,
    pageUrl,
    fbp: str(body.fbp, 200),
    fbc: str(body.fbc, 500),
    smsConsent,
    smsConsentText: smsConsent ? str(body.sms_consent_text, 1000) : "",
    smsConsentVersion: smsConsent ? str(body.sms_consent_version, 60) : "",
    smsConsentAt: smsConsent ? now : null,
    eventId,
    submittedAt: Number.isNaN(submittedAt.getTime()) ? now : submittedAt,
  };

  // ── 2. Dedupe by email OR phone (email match wins) ─────────────────────────
  const findExisting = async () =>
    (await BuyerListLead.findOne({ email })) ||
    (await BuyerListLead.findOne({ phoneNormalized }).sort({ createdAt: 1 }));

  const updateExisting = (doc) =>
    BuyerListLead.findByIdAndUpdate(
      doc._id,
      {
        $set: {
          ...fields,
          // Keep the original first touch; only backfill a record that has none.
          ...(doc.firstTouch && doc.firstTouch.utm_source ? {} : { firstTouch }),
        },
        $inc: { submissions: 1 },
      },
      { new: true }
    );

  let lead;
  let updated = false;
  const existing = await findExisting();
  if (existing) {
    lead = await updateExisting(existing);
    updated = true;
  } else {
    try {
      lead = await BuyerListLead.create({ ...fields, firstTouch });
    } catch (err) {
      if (!(err && err.code === 11000)) throw err;
      // Raced with a concurrent submit for the same email — update instead.
      const doc = await BuyerListLead.findOne({ email });
      if (!doc) throw err;
      lead = await updateExisting(doc);
      updated = true;
    }
  }

  // ── 3. CRM write (Brevo) before the 200 ────────────────────────────────────
  const brevo = await withTimeout(
    syncBuyerListLead({ ...lead.toObject(), smsOptInUrl: buyerListPageUrl() }),
    BREVO_TIMEOUT_MS,
    { success: false, error: "Brevo timeout" }
  ).catch((e) => ({ success: false, error: e.message }));

  await BuyerListLead.updateOne(
    { _id: lead._id },
    { $set: { brevoSynced: brevo.success === true, brevoError: brevo.success ? "" : String(brevo.error || "") } }
  ).catch((e) => console.error("[buyer-list] brevo status save failed:", e.message));

  // ── 4. Respond ─────────────────────────────────────────────────────────────
  res.status(200).json({
    success: true,
    leadId: lead._id,
    tier: lead.tier,
    updated,
  });

  // ── 5a. Meta Conversions API (server copy of the browser pixel event) ──────
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
      customData: { content_category: `buyer_list_tier_${lead.tier}`, content_name: "buyer_list" },
    }).catch((e) => console.error("[buyer-list] Meta CAPI failed:", e.message));
  }

  // ── 5b. OpenAI Conversions API ─────────────────────────────────────────────
  // Hook: send the registration event with the SAME event_id here once the
  // OpenAI ads conversions API credentials are issued (attribution.utm_source
  // === "chatgpt").

  // ── 5c. Slack ──────────────────────────────────────────────────────────────
  notifyNewLead({
    leadType: updated ? "Buyer List (updated)" : "Buyer List",
    name: lead.fullName || lead.firstName,
    email: lead.email,
    phone: lead.phone,
    smsConsent: lead.smsConsent,
    source: `buyer-list · ${lead.firstTouch?.utm_source || "direct"}`,
    extraFields: [
      { label: "Tier", value: lead.tier },
      { label: "States", value: buyBox.states.join(", ") || "—" },
      { label: "Strategy", value: buyBox.strategy.join(", ") || "—" },
      { label: "Price", value: `${buyBox.price_min} – ${buyBox.price_max === null ? "3M+" : buyBox.price_max}` },
      { label: "Financing", value: buyBox.financing || "—" },
      { label: "Campaign", value: lead.lastTouch?.utm_campaign || "—" },
    ],
  }).catch((e) => console.error("[slack] buyer-list notify failed:", e.message));
});

/**
 * GET /api/v1/buyer-list?page=&limit=&tier=   (admin)
 * Paginated Buyer List leads, newest first. Whole-word "test" names hidden.
 */
const getAllBuyerListLeads = catchAsyncError(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const view = listView(req); // ?view=summary (light rows) / ?id= (one lead, full)
  if (view.badId) return res.status(400).json({ success: false, message: "Invalid id" });

  const query = { fullName: { $not: TEST_NAME_REGEX }, firstName: { $not: TEST_NAME_REGEX } };
  if (["A", "B", "C"].includes(req.query.tier)) query.tier = req.query.tier;

  const [leads, total] = await Promise.all([
    BuyerListLead.find(scopeQuery(view, query)).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    BuyerListLead.countDocuments(scopeQuery(view, query)),
  ]);

  // Same per-lead extras as the other Leads tabs (calls by phone, email events,
  // advisor notes) so the shared admin list/detail renders identically.
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
      calls: callsByPhone[normalisePhone(lead.phone)] || [],
      emails: eventsByEmail[String(lead.email || "").toLowerCase()] || [],
      notes: notesByLead[String(lead._id)] || [],
    }))),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

/**
 * GET /api/v1/buyer-list/google-offline?days=7   (admin)
 *
 * Weekly Google Ads offline-conversion upload: Tier A buyers that arrived with
 * a gclid, as the Google Ads import CSV. Conversion name from
 * BUYER_LIST_GOOGLE_CONVERSION_NAME.
 */
const exportGoogleOfflineConversions = catchAsyncError(async (req, res) => {
  const days = Math.min(90, Math.max(1, parseInt(req.query.days) || 7));
  const since = new Date(Date.now() - days * 864e5);
  const conversionName = process.env.BUYER_LIST_GOOGLE_CONVERSION_NAME || "Buyer List Tier A";

  const leads = await BuyerListLead.find({
    tier: "A",
    updatedAt: { $gte: since },
    $or: [{ "firstTouch.gclid": { $nin: ["", null] } }, { "lastTouch.gclid": { $nin: ["", null] } }],
  })
    .select("firstTouch lastTouch submittedAt createdAt")
    .lean();

  // Google Ads expects "yyyy-mm-dd hh:mm:ss+0000".
  const fmtTime = (d) => new Date(d).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "+0000");
  const csvCell = (v) => `"${String(v).replace(/"/g, '""')}"`;

  const rows = [["Google Click ID", "Conversion Name", "Conversion Time"].map(csvCell).join(",")];
  leads.forEach((l) => {
    const gclid = l.firstTouch?.gclid || l.lastTouch?.gclid;
    rows.push([gclid, conversionName, fmtTime(l.submittedAt || l.createdAt)].map(csvCell).join(","));
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="buyer-list-tier-a-${days}d.csv"`);
  res.status(200).send(rows.join("\n"));
});

module.exports = { registerBuyerListLead, getAllBuyerListLeads, exportGoogleOfflineConversions };
