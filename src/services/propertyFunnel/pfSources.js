// services/propertyFunnel/pfSources.js
//
// Property Funnel: every database read, in one place. Returns plain rows; buildDataset.js turns them into
// the page's Dataset. This file is our version of the ADAPT block in Prajwal's server/build-dataset.ts.
//
// Leads per property (v1), agreed with Prajwal 9 Nov 2026:
//   - property page leads (/auction/<slug>, finder-<slug>): propertyLeadModel.propertySlug
//   - Facebook / Instagram instant forms: toorak.propertySlug, else the one property their ad is linked to
//   - the two older single-property collections (449 Georgia St, 401 Rensselaer Ave)
// New Deals, landing page, early access and the other funnels cover several homes and are left out
// (the tab says so).

const Product = require("../../model/property/productModel");
const AuctionRegistration = require("../../model/bidding/auctionRegistration");
const PropertyLead = require("../../model/leads/propertyLeadModel");
const FacebookFormLead = require("../../model/leads/facebookFormLeadModel");
const GeorgiaStLead = require("../../model/leads/georgiaStLeadModel");
const RensselaerAveLead = require("../../model/leads/rensselaerAveLeadModel");
const User = require("../../model/users/userModel");
const VtextContact = require("../../model/vtext/vtextContactModel");
const VtextMessage = require("../../model/vtext/vtextMessageModel");
const CallLog = require("../../model/calling/callLogModel");
const EmailEvent = require("../../model/integrations/emailEventModel");
const PfAd = require("../../model/propertyFunnel/pfAdModel");
const PfAdDay = require("../../model/propertyFunnel/pfAdDayModel");
const PfAdPropertyLink = require("../../model/propertyFunnel/pfAdPropertyLinkModel");
const PfAdSetStage = require("../../model/propertyFunnel/pfAdSetStageModel");
const PfGa4PageDay = require("../../model/propertyFunnel/pfGa4PageDayModel");
const PfClarityPageDay = require("../../model/propertyFunnel/pfClarityPageDayModel");
const PfBlogPost = require("../../model/propertyFunnel/pfBlogPostModel");
const PfSocialPost = require("../../model/propertyFunnel/pfSocialPostModel");
const PfPropertyLink = require("../../model/propertyFunnel/pfPropertyLinkModel");
const PfSyncRun = require("../../model/propertyFunnel/pfSyncRunModel");
const { toStatus, stateCode, toDate, phoneKey, emailKey, e164 } = require("./pfCore");

// The two properties that still have their own lead collections.
const GEORGIA_ST_SLUG = "449-georgia-st-big-bear-lake";
const RENSSELAER_AVE_SLUG = "401-rensselaer-ave-ogdensburg";

/** Registrations that count as "Registered" (Prajwal: pending and approved, never rejected). */
const COUNTED_REGISTRATION_STATUSES = ["pending", "approved"];

async function loadProperties() {
  const rows = await Product.find({ slug: { $nin: [null, ""] }, isTestProperty: { $ne: true } })
    .select("slug street city state status archived auctionStartDate startBid image")
    .lean();
  return rows.map((p) => {
    const sale = toDate(p.auctionStartDate);
    return {
      _id: String(p._id),
      id: p.slug,
      address: p.street || p.slug,
      city: p.city || "",
      state: stateCode(p.state),
      status: toStatus(p.status, p.archived),
      saleDate: sale, // Date or null; buildDataset turns it into a Pacific date
      startingBid: typeof p.startBid === "number" ? p.startBid : null,
      imageUrl: p.image || null,
    };
  });
}

async function loadRegistrations(since, productIdToSlug) {
  const rows = await AuctionRegistration.find({ status: { $in: COUNTED_REGISTRATION_STATUSES }, submittedAt: { $gte: since } })
    .select("auctionId userId email mobilePhone phoneNormalized submittedAt firstTouch")
    .lean();
  return rows
    .map((r) => ({
      propertyId: productIdToSlug.get(String(r.auctionId)) || null,
      at: r.submittedAt,
      userId: r.userId ? String(r.userId) : null,
      emailKey: emailKey(r.email),
      phoneKey: phoneKey(r.phoneNormalized || r.mobilePhone),
      utm: utmOf(r.firstTouch || {}), // saved on registrations from 9 Nov 2026; {} before
    }))
    .filter((r) => r.propertyId);
}

const utmOf = (t = {}) => ({
  utm_source: t.utm_source || "", utm_medium: t.utm_medium || "", utm_campaign: t.utm_campaign || "",
  utm_content: t.utm_content || "", utm_id: t.utm_id || "", ad_id: t.ad_id || "",
});

/** Every lead per property since `since`, in one shape. `kind` drives the source label and channel. */
async function loadLeads(since, adSingleProperty) {
  const created = { createdAt: { $gte: since }, isQaTest: { $ne: true } };
  const contact = "fullName phone phoneNormalized email createdAt";
  const [prop, fb, ga, rn] = await Promise.all([
    PropertyLead.find(created).select(`${contact} propertySlug source buyerType firstTouch`).lean(),
    FacebookFormLead.find(created).select(`${contact} adId isOrganic toorak purpose utm_source utm_medium utm_campaign utm_content`).lean(),
    GeorgiaStLead.find(created).select(`${contact} buyerType source`).lean(),
    RensselaerAveLead.find(created).select(`${contact} buyerType source`).lean(),
  ]);
  const base = (l) => ({
    id: String(l._id),
    createdAt: l.createdAt,
    name: l.fullName || "",
    phone: l.phoneNormalized || l.phone || null,
    email: l.email || null,
  });
  return [
    ...prop.map((l) => ({
      ...base(l), propertyId: l.propertySlug, kind: /^finder-/.test(l.source || "") ? "finder" : "property_page",
      utm: utmOf(l.firstTouch), adId: (l.firstTouch && l.firstTouch.ad_id) || null, buyerTypeRaw: l.buyerType,
      landingPath: (l.firstTouch && l.firstTouch.landing_path) || null, // first page of the visit (blog leads)
    })),
    ...fb.map((l) => ({
      ...base(l),
      propertyId: (l.toorak && l.toorak.propertySlug) || (l.adId && adSingleProperty.get(l.adId)) || null,
      kind: l.isOrganic ? "meta_form_organic" : "meta_form",
      utm: utmOf(l), adId: l.adId || null, buyerTypeRaw: l.purpose,
    })),
    ...ga.map((l) => ({ ...base(l), propertyId: GEORGIA_ST_SLUG, kind: "property_page", utm: {}, adId: null, buyerTypeRaw: l.buyerType })),
    ...rn.map((l) => ({ ...base(l), propertyId: RENSSELAER_AVE_SLUG, kind: "property_page", utm: {}, adId: null, buyerTypeRaw: l.buyerType })),
  ].filter((l) => l.propertyId);
}

/** Email keys (lowercased) of leads who have a Vihara account. */
async function loadSignedUpEmails(emails) {
  if (!emails.length) return new Set();
  const users = await User.find({ email: { $in: emails } }).collation({ locale: "en", strength: 2 }).select("email").lean();
  return new Set(users.map((u) => emailKey(u.email)));
}

/** Texts, calls and emails to these phones and emails: our own Vtext, Maya's call log and Brevo's events. */
async function loadContactHistory(phoneKeys, emails) {
  const phones = phoneKeys.map(e164).filter(Boolean);
  const contacts = phones.length ? await VtextContact.find({ phoneE164: { $in: phones } }).select("phoneE164 optOut").lean() : [];
  const [messages, calls, emailEvents] = await Promise.all([
    contacts.length
      ? VtextMessage.find({ contactId: { $in: contacts.map((c) => c._id) } }).select("contactId direction status createdAt sentAt origin").lean()
      : [],
    phones.length
      ? CallLog.find({ phone: { $in: [...phones, ...phoneKeys] } }).select("phone startedAt createdAt durationSeconds endedReason transcript").lean()
      : [],
    emails.length ? EmailEvent.find({ email: { $in: emails } }).select("email event subject messageId date").lean() : [],
  ]);
  return { contacts, messages, calls, emailEvents };
}

/** Everything the page needs for [minDate, today]. `since` = the first instant of minDate, Pacific. */
async function loadInputs({ since, minDate }) {
  const [properties, extraLinks, ads, adDays, adLinks, adSetStages, ga4Rows, clarityRows, blogPosts, socialPosts, syncRuns] = await Promise.all([
    loadProperties(),
    PfPropertyLink.find().sort({ sort: 1, label: 1 }).lean(),
    PfAd.find().lean(),
    PfAdDay.find({ date: { $gte: minDate } }).lean(),
    PfAdPropertyLink.find().lean(),
    PfAdSetStage.find().lean(),
    PfGa4PageDay.find({ date: { $gte: minDate } }).lean(),
    PfClarityPageDay.find({ date: { $gte: minDate } }).lean(),
    PfBlogPost.find().lean(),
    PfSocialPost.find({ publishedAt: { $gte: minDate } }).lean(),
    PfSyncRun.find().lean(),
  ]);
  const productIdToSlug = new Map(properties.map((p) => [p._id, p.id]));
  const adProps = new Map();
  for (const l of adLinks) adProps.set(l.adId, [...(adProps.get(l.adId) || []), l.propertyId]);
  const adSingleProperty = new Map([...adProps].filter(([, ids]) => ids.length === 1).map(([id, ids]) => [id, ids[0]]));

  const [registrations, leads] = await Promise.all([loadRegistrations(since, productIdToSlug), loadLeads(since, adSingleProperty)]);
  const phoneKeys = [...new Set(leads.map((l) => phoneKey(l.phone)).filter((k) => k.length === 10))];
  const emails = [...new Set(leads.map((l) => emailKey(l.email)).filter(Boolean))];
  const [signedUpEmails, history] = await Promise.all([loadSignedUpEmails(emails), loadContactHistory(phoneKeys, emails)]);

  return {
    properties, extraLinks, ads, adDays, adLinks, adSetStages, ga4Rows, clarityRows, blogPosts, socialPosts, syncRuns,
    registrations, leads, signedUpEmails, ...history,
  };
}

module.exports = { loadInputs, COUNTED_REGISTRATION_STATUSES, GEORGIA_ST_SLUG, RENSSELAER_AVE_SLUG };
