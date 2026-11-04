// services/marketing/marketingLeadsService.js
//
// Leads that actually reached us, for the Marketing Performance tab. Meta and Zernio say
// how many leads an ad got; this says how many we received, so the two can be compared.
//
//   Facebook form leads   from the facebookFormLeads collection. Each form submission keeps
//                         Meta's campaign id, so it matches a campaign exactly.
//   Website sign-ups      property, buyer-list, new-deals and landing-page leads, by the
//                         UTM of the visit that signed up (see websiteChannel):
//                           paid  = a Meta ad
//                           organic social = facebook / instagram / linkedin / youtube posts
//                         The ad links send utm_campaign as a short name, not Meta's campaign
//                         id, so website sign-ups are listed by utm_campaign, not forced
//                         into Meta's campaign rows.
//
// A lead is QUALIFIED when it has a phone number and call or SMS consent (same rule as the
// ads loop).

const FacebookFormLead = require("../../model/leads/facebookFormLeadModel");
const { leadsCreatedBetween, isQualified } = require("../adsLoop/leadJoin");

const META_SOURCES = new Set(["meta", "facebook", "fb", "instagram", "ig"]);
const SOCIAL_SOURCES = new Set([...META_SOURCES, "linkedin", "youtube", "yt"]);
const ORGANIC_MEDIUMS = new Set(["organic", "social", "post", "bio", "profile"]);
const SOURCE_LABEL = { fb: "facebook", ig: "instagram", yt: "youtube", meta: "facebook" };

/**
 * "paid" | "organic" | null for one website lead's UTM.
 * A social source with an organic medium (organic, social, post, bio) is organic; a Meta
 * source with any other medium (paid, paid_social, cpc, or none) is a Meta ad. Stricter than
 * leadJoin.channelOf, which counts "ig / organic" as an ad.
 */
function websiteChannel(lead) {
    const source = String(lead.utm_source || "").trim().toLowerCase();
    const medium = String(lead.utm_medium || "").trim().toLowerCase();
    if (!SOCIAL_SOURCES.has(source)) return null;
    if (ORGANIC_MEDIUMS.has(medium)) return "organic";
    return META_SOURCES.has(source) ? "paid" : "organic";
}

const inWindow = (date, start, end) => date && date >= start && date < end;

/**
 * Form submissions in [start, end). A person who sent two forms counts twice, like Meta does.
 * @returns {{ total, qualified, byCampaign: Map<string, {leads, qualified}> }}
 */
function countFormSubmissions(docs, start, end) {
    const out = { total: 0, qualified: 0, byCampaign: new Map() };
    for (const doc of docs) {
        const subs = doc.formSubmissions?.length
            ? doc.formSubmissions
            : [{ campaignId: doc.campaignId, isOrganic: doc.isOrganic, submittedAt: doc.createdAt }];
        const qualified = isQualified(doc);
        for (const sub of subs) {
            if (sub.isOrganic || !inWindow(new Date(sub.submittedAt || doc.createdAt), start, end)) continue;
            out.total += 1;
            if (qualified) out.qualified += 1;
            const id = String(sub.campaignId || "");
            const row = out.byCampaign.get(id) || { leads: 0, qualified: 0 };
            row.leads += 1;
            if (qualified) row.qualified += 1;
            out.byCampaign.set(id, row);
        }
    }
    return out;
}

/**
 * Website sign-ups from paid Meta ads and organic social posts.
 * @returns {{ paid: {total, qualified, byCampaign: Map<string, {leads, qualified}>}, organic: {total, qualified, bySource: Map<string, number>} }}
 */
function countWebsiteSignups(leads) {
    const paid = { total: 0, qualified: 0, byCampaign: new Map() };
    const organic = { total: 0, qualified: 0, bySource: new Map() };
    for (const lead of leads) {
        const channel = websiteChannel(lead);
        if (!channel) continue;
        const qualified = isQualified(lead);
        if (channel === "paid") {
            paid.total += 1;
            if (qualified) paid.qualified += 1;
            const name = String(lead.utm_campaign || "").trim() || "(no campaign tag)";
            const row = paid.byCampaign.get(name) || { leads: 0, qualified: 0 };
            row.leads += 1;
            if (qualified) row.qualified += 1;
            paid.byCampaign.set(name, row);
        } else {
            organic.total += 1;
            if (qualified) organic.qualified += 1;
            const source = String(lead.utm_source).toLowerCase();
            const label = SOURCE_LABEL[source] || source;
            organic.bySource.set(label, (organic.bySource.get(label) || 0) + 1);
        }
    }
    return { paid, organic };
}

/** All lead counts for one window [start, end). */
async function leadsReceivedBetween(start, end) {
    const [formDocs, websiteLeads] = await Promise.all([
        FacebookFormLead.find({
            isTest: { $ne: true },
            $or: [{ "formSubmissions.submittedAt": { $gte: start, $lt: end } }, { createdAt: { $gte: start, $lt: end } }],
        })
            .select("formSubmissions campaignId isOrganic createdAt phone consent smsConsent")
            .lean(),
        leadsCreatedBetween(start, end, { anyContent: true }),
    ]);
    return { form: countFormSubmissions(formDocs, start, end), website: countWebsiteSignups(websiteLeads) };
}

module.exports = { leadsReceivedBetween, countFormSubmissions, countWebsiteSignups, websiteChannel };
