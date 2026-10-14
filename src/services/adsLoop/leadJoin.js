// services/adsLoop/leadJoin.js
//
// Backend leads per core id per channel for one day, joined by utm_content.
// A lead is QUALIFIED when it has a phone number AND call or SMS consent.
//
// Channel from the lead's UTM source/medium:
//   utm_source=meta, utm_medium=paid  -> meta_ad
//   utm_source=facebook               -> fb_post (organic)
//   utm_source=instagram              -> ig_post (organic)
//
// Sources: property auction leads (/auction/:slug, last touch), buyer-list and
// new-deals leads (last touch), and landing-page leads (flat utm fields).

const PropertyLead = require("../../model/leads/propertyLeadModel");
const BuyerListLead = require("../../model/leads/buyerListLeadModel");
const NewDealsLead = require("../../model/leads/newDealsLeadModel");
const LandingPageLead = require("../../model/leads/landingPageLeadModel");
const { parseCoreId } = require("./creativeId");

function channelOf(source, medium) {
    const s = String(source || "").toLowerCase();
    const m = String(medium || "").toLowerCase();
    if (s === "facebook" && m === "organic") return "fb_post";
    if (s === "instagram" && m === "organic") return "ig_post";
    if (["meta", "facebook", "fb", "instagram", "ig"].includes(s)) return "meta_ad";
    return null;
}

const isQualified = (lead) => Boolean(String(lead.phone || "").trim()) && (lead.consent === true || lead.smsConsent === true);

// utm_content carries the core id (BB449-S01).
const CORE_ID_REGEX = /[A-Z0-9]{2,16}-[SC]\d{2}/i;

/**
 * Every lead source as [{ utm_source, utm_medium, utm_content, phone, consent, smsConsent }].
 * Only leads whose utm_content carries a core id, unless `anyContent`.
 */
async function leadsCreatedBetween(start, end, { anyContent = false } = {}) {
    const range = { createdAt: { $gte: start, $lt: end } };
    const touchQuery = anyContent ? range : { ...range, "lastTouch.utm_content": CORE_ID_REGEX };
    const landingQuery = anyContent ? range : { ...range, utm_content: CORE_ID_REGEX };
    const touchFields = "lastTouch phone consent smsConsent";

    const [property, buyerList, newDeals, landing] = await Promise.all([
        PropertyLead.find({ ...touchQuery, isQaTest: { $ne: true } }).select(touchFields).lean(),
        BuyerListLead.find(touchQuery).select(touchFields).lean(),
        NewDealsLead.find(touchQuery).select(touchFields).lean(),
        LandingPageLead.find(landingQuery).select("utm_source utm_medium utm_content phone").lean(),
    ]);

    const fromTouch = (l) => ({ ...l.lastTouch, phone: l.phone, consent: l.consent, smsConsent: l.smsConsent });
    return [...property.map(fromTouch), ...buyerList.map(fromTouch), ...newDeals.map(fromTouch), ...landing];
}

/**
 * @returns {Promise<Map<string, { coreId, channel, leads, qualifiedLeads }>>} keyed "BB449-S01|meta_ad"
 */
async function leadCountsBetween(start, end) {
    const out = new Map();
    for (const lead of await leadsCreatedBetween(start, end)) {
        const coreId = parseCoreId(lead.utm_content);
        const channel = channelOf(lead.utm_source, lead.utm_medium);
        if (!coreId || !channel) continue;
        const key = `${coreId}|${channel}`;
        const row = out.get(key) || { coreId, channel, leads: 0, qualifiedLeads: 0 };
        row.leads += 1;
        if (isQualified(lead)) row.qualifiedLeads += 1;
        out.set(key, row);
    }
    return out;
}

/** Sign-ups saved between start and end that came from a paid Meta ad (any utm_content). */
async function metaAdSignupsBetween(start, end) {
    const leads = await leadsCreatedBetween(start, end, { anyContent: true });
    return leads.filter((l) => channelOf(l.utm_source, l.utm_medium) === "meta_ad").length;
}

module.exports = { leadCountsBetween, metaAdSignupsBetween, isQualified, channelOf };
