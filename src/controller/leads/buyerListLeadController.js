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

// ── Allowed buy-box values (must match OPTIONS in the page's landing.config) ──
const STRATEGIES = ["flip", "rent", "brrrr", "wholesale", "home"];
const PROPERTY_TYPES = ["sfr", "condo", "mf_2_4", "mf_5_plus", "land"];
const CONDITIONS = ["turnkey", "light_rehab", "heavy_rehab", "any"];
const FINANCING = ["cash", "hard_money", "mortgage", "not_sure"];
const DEALS_12MO = ["1", "2_5", "6_plus"];
const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
  "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM",
  "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA",
  "WV", "WI", "WY",
];

// States with current inventory (drives the tier). ENV: BUYER_LIST_ACTIVE_MARKETS="CA,NY"
const activeMarkets = () =>
  String(process.env.BUYER_LIST_ACTIVE_MARKETS || "CA,NY")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

const TOUCH_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"];
const MAX_PRICE = 3000000;
const BREVO_TIMEOUT_MS = 8000;
const TEST_NAME_REGEX = /\btest\b/i;

// ── sanitizers ──────────────────────────────────────────────────────────────
const str = (v, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const pickList = (v, allowed) =>
  Array.isArray(v) ? [...new Set(v.map((x) => String(x)).filter((x) => allowed.includes(x)))] : [];
const pickOne = (v, allowed) => (allowed.includes(String(v)) ? String(v) : "");
const toPrice = (v) => {
  const n = Number(v);
  return v !== null && v !== "" && Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), MAX_PRICE) : null;
};

const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// Same tolerance rule the page shows: +/-$10K under $100K, +/-$20K at $100K+.
const tolerance = (n) => (n < 100000 ? 10000 : 20000);

const cleanTouch = (t) => {
  if (!t || typeof t !== "object") return null;
  const out = {};
  TOUCH_KEYS.forEach((k) => {
    out[k] = str(t[k], 500);
  });
  const ts = t.ts ? new Date(t.ts) : null;
  out.ts = ts && !Number.isNaN(ts.getTime()) ? ts : null;
  return out;
};

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

const buildBuyBox = (raw = {}) => {
  let priceMin = toPrice(raw.price_min);
  let priceMax = toPrice(raw.price_max); // null = no upper limit ($3M+)
  if (priceMin === null) priceMin = 0;
  if (priceMax !== null && priceMax < priceMin) [priceMin, priceMax] = [priceMax, priceMin];
  if (priceMax !== null && priceMax >= MAX_PRICE) priceMax = null;

  return {
    strategy: pickList(raw.strategy, STRATEGIES),
    property_type: pickList(raw.property_type, PROPERTY_TYPES),
    states: pickList(Array.isArray(raw.states) ? raw.states.map((s) => String(s).toUpperCase()) : [], US_STATES),
    cities: Array.isArray(raw.cities)
      ? [...new Set(raw.cities.map((c) => str(c, 80)).filter(Boolean))].slice(0, 25)
      : [],
    price_min: priceMin,
    price_max: priceMax,
    match_min: Math.max(0, priceMin - tolerance(priceMin)),
    match_max: priceMax === null ? null : priceMax + tolerance(priceMax),
    condition: pickOne(raw.condition, CONDITIONS),
    financing: pickOne(raw.financing, FINANCING),
    deals_12mo: pickOne(raw.deals_12mo, DEALS_12MO),
  };
};

// Real client IP behind the proxy (first X-Forwarded-For hop), for Meta CAPI.
const clientIp = (req) => {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req.ip || undefined;
};

// Only production page URLs reach Meta (mirrors capi.service.js on the client),
// so localhost / preview test sign-ups never pollute the pixel.
const isProductionPageUrl = (url) => {
  try {
    return ["vihara.ai", "www.vihara.ai"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
};

// Resolve within `ms`, never rejecting — the 200 must not hang on Brevo.
const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve({ success: false, error: "Brevo timeout" }), ms)),
  ]);

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

  const buyBox = buildBuyBox(body.buy_box);
  const tier = computeTier(buyBox);

  const submittedAt = body.submitted_at ? new Date(body.submitted_at) : new Date();
  const now = new Date();
  const smsConsent = body.sms_consent === true;

  // Touches. Storage-blocked browsers send no first_touch → fall back to last.
  const lastTouch = cleanTouch(body.last_touch) || { utm_source: "direct", ts: now };
  if (!lastTouch.utm_source) lastTouch.utm_source = "direct";
  const firstTouch = cleanTouch(body.first_touch) || lastTouch;
  if (!firstTouch.utm_source) firstTouch.utm_source = "direct";

  const rawAttribution = body.attribution && typeof body.attribution === "object" ? body.attribution : {};
  const attribution = {};
  [...TOUCH_KEYS, "variant", "type"].forEach((k) => {
    attribution[k] = str(rawAttribution[k], 500);
  });

  const pageUrl = str(body.page_url, 2000);

  const fields = {
    firstName,
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
    BREVO_TIMEOUT_MS
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
    name: lead.firstName,
    email: lead.email,
    phone: lead.phone,
    consent: lead.smsConsent,
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

  const query = { firstName: { $not: TEST_NAME_REGEX } };
  if (["A", "B", "C"].includes(req.query.tier)) query.tier = req.query.tier;

  const [leads, total] = await Promise.all([
    BuyerListLead.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    BuyerListLead.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    leads,
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
