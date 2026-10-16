// services/conversion/pageSignups.js
//
// Which collection each landing page saves its sign-ups in, and the sign-ups
// a page got over a date range. No names, emails or phone numbers leave here:
// the agent only sees counts, times, UTMs and which fields were filled.

const PropertyLead = require("../../model/leads/propertyLeadModel");
const EarlyAccessLead = require("../../model/leads/earlyAccessLeadModel");
const PartnerLead = require("../../model/leads/partnerLeadModel");
const NorCalLead = require("../../model/leads/norCalLeadModel");
const BuyerListLead = require("../../model/leads/buyerListLeadModel");
const NewDealsLead = require("../../model/leads/newDealsLeadModel");
const productModel = require("../../model/property/productModel");
const { channelOf } = require("../adsLoop/leadJoin");

// path → where its sign-ups go. /auction/:slug is matched separately.
const PAGES = {
    "/early-access": { model: EarlyAccessLead, label: "Early Access" },
    "/partner-page": { model: PartnerLead, label: "Partner Program" },
    "/northern-california-early-access": { model: NorCalLead, label: "Northern California" },
    "/buyer-list": { model: BuyerListLead, label: "Buyer List" },
    "/new-deals": { model: NewDealsLead, label: "New Deals" },
};

/** { label, model, filter, slug? } for a page link, or null if we don't know where it saves. */
function sourceFor(url) {
    const path = new URL(url).pathname.replace(/\/+$/, "") || "/";
    const slug = path.match(/^\/auction\/([^/]+)$/)?.[1];
    if (slug) {
        const s = decodeURIComponent(slug);
        return { label: `Property page (${s})`, model: PropertyLead, filter: { propertySlug: s, isQaTest: { $ne: true } }, slug: s };
    }
    const page = PAGES[path.toLowerCase()];
    return page ? { ...page, filter: {} } : null;
}

const touchOf = (lead) => lead.lastTouch || { utm_source: lead.utm_source, utm_medium: lead.utm_medium, utm_content: lead.utm_content };

/**
 * @returns {Promise<null | {source, total, fromMetaAds, byDay: {[date]: n}, recent: Array}>}
 */
async function signupsForPage(url, start, end) {
    const source = sourceFor(url);
    if (!source) return null;
    const leads = await source.model
        .find({ ...source.filter, createdAt: { $gte: start, $lt: end } })
        .select("createdAt lastTouch utm_source utm_medium utm_content phone email consent smsConsent buyerType needsFinancing quotePrice pageUrl")
        .sort({ createdAt: 1 })
        .lean();
    const byDay = {};
    let fromMetaAds = 0;
    const recent = leads.map((l) => {
        const day = l.createdAt.toISOString().slice(0, 10);
        byDay[day] = (byDay[day] || 0) + 1;
        const touch = touchOf(l) || {};
        const channel = channelOf(touch.utm_source, touch.utm_medium);
        if (channel === "meta_ad") fromMetaAds += 1;
        return {
            at: l.createdAt.toISOString().slice(0, 16),
            channel: channel || (touch.utm_source ? `${touch.utm_source}/${touch.utm_medium || ""}` : "no utm"),
            utmContent: touch.utm_content || "",
            gavePhone: Boolean(String(l.phone || "").trim()),
            callConsent: l.consent === true,
            smsConsent: l.smsConsent === true,
            ...(l.buyerType && { buyerType: l.buyerType }),
            ...(l.needsFinancing && { needsFinancing: l.needsFinancing }),
            ...(l.quotePrice != null && { quotedPrice: l.quotePrice }),
        };
    });
    return { source: source.label, total: leads.length, fromMetaAds, byDay, recent: recent.slice(-40) };
}

/** The property behind an /auction/:slug page: what a visitor is being asked to register for. */
async function propertyForPage(url) {
    const slug = sourceFor(url)?.slug;
    if (!slug) return null;
    const p = await productModel
        .findOne({ slug })
        .select("street city state status auctionStartDate auctionEndDate reservePrice auctionEventLabel slug")
        .lean();
    if (!p) return { slug, missing: true };
    return {
        address: `${p.street}, ${p.city}, ${p.state}`,
        status: p.status,
        auctionStart: p.auctionStartDate,
        auctionEnd: p.auctionEndDate,
        auctionEnded: p.auctionEndDate ? new Date(p.auctionEndDate) < new Date() : null,
        reservePrice: p.reservePrice,
        eventLabel: p.auctionEventLabel,
    };
}

module.exports = { sourceFor, signupsForPage, propertyForPage };
