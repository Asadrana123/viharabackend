// services/adsLoop/leadJoin.js
//
// Backend leads per LT-ID per channel for one day, joined by utm_content.
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
const { parseLtId } = require("./ltId");

function channelOf(source, medium) {
    const s = String(source || "").toLowerCase();
    const m = String(medium || "").toLowerCase();
    if (s === "facebook" && m === "organic") return "fb_post";
    if (s === "instagram" && m === "organic") return "ig_post";
    if (["meta", "facebook", "fb", "instagram", "ig"].includes(s)) return "meta_ad";
    return null;
}

const isQualified = (lead) => Boolean(String(lead.phone || "").trim()) && (lead.consent === true || lead.smsConsent === true);

const LT_REGEX = /LT-\d{4,}/i;

/** Every lead source as [{ utm_source, utm_medium, utm_content, phone, consent, smsConsent }]. */
async function leadsCreatedBetween(start, end) {
    const range = { createdAt: { $gte: start, $lt: end } };
    const touchQuery = { ...range, "lastTouch.utm_content": LT_REGEX };
    const touchFields = "lastTouch phone consent smsConsent";

    const [property, buyerList, newDeals, landing] = await Promise.all([
        PropertyLead.find({ ...touchQuery, isQaTest: { $ne: true } }).select(touchFields).lean(),
        BuyerListLead.find(touchQuery).select(touchFields).lean(),
        NewDealsLead.find(touchQuery).select(touchFields).lean(),
        LandingPageLead.find({ ...range, utm_content: LT_REGEX }).select("utm_source utm_medium utm_content phone").lean(),
    ]);

    const fromTouch = (l) => ({ ...l.lastTouch, phone: l.phone, consent: l.consent, smsConsent: l.smsConsent });
    return [...property.map(fromTouch), ...buyerList.map(fromTouch), ...newDeals.map(fromTouch), ...landing];
}

/**
 * @returns {Promise<Map<string, { ltId, channel, leads, qualifiedLeads }>>} keyed "LT-0004|meta_ad"
 */
async function leadCountsBetween(start, end) {
    const out = new Map();
    for (const lead of await leadsCreatedBetween(start, end)) {
        const ltId = parseLtId(lead.utm_content);
        const channel = channelOf(lead.utm_source, lead.utm_medium);
        if (!ltId || !channel) continue;
        const key = `${ltId}|${channel}`;
        const row = out.get(key) || { ltId, channel, leads: 0, qualifiedLeads: 0 };
        row.leads += 1;
        if (isQualified(lead)) row.qualifiedLeads += 1;
        out.set(key, row);
    }
    return out;
}

module.exports = { leadCountsBetween, isQualified, channelOf };
