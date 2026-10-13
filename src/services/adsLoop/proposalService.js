// services/adsLoop/proposalService.js
//
// #ads-weekly: every suggested change is a proposal with Go / Reject buttons.
//
//   refresh | vary | try   "Go" builds a new creative (it then goes through #creative-review)
//   launch                 "Go" creates campaign + ad set + ad on Meta through Zernio, PAUSED,
//                          with the Housing category; a second "Activate" click turns it on
//   budget                 "Go" changes an ad set's daily budget (+/-20%, once every 3 days)
//   pause                  "Go" pauses an ad
//
// Only approvers can press Go / Activate / Reject. Guardrail failures mark
// the proposal "blocked" and say why in its thread.

const { DateTime } = require("luxon");
const AdProposal = require("../../model/adsLoop/adProposalModel");
const AdCreative = require("../../model/adsLoop/adCreativeModel");
const productModel = require("../../model/property/productModel");
const { PROPOSAL_STATUS } = require("../../model/adsLoop/adProposalModel");
const { CREATIVE_STATUS } = require("../../model/adsLoop/adCreativeModel");
const { getAdsLoopConfig } = require("../../config/adsLoop/adsLoopConfig");
const { META_CTA } = require("../../config/adsLoop/attributeTags");
const guard = require("./guardrails");
const zernio = require("./zernioClient");
const slack = require("./slackBot");
const { adName, landingUrl } = require("./ltId");
const { startCreative, propertyLabel, assertCopyClean } = require("./creativePipeline");

const { blocks: B } = slack;
const CREATIVE_KINDS = ["refresh", "vary", "try"];

const isoWeek = (date = new Date()) => DateTime.fromJSDate(date).setZone("Asia/Kolkata").toFormat("kkkk-'W'WW");

// ---------------------------------------------------------------------------
// Create + post
// ---------------------------------------------------------------------------
async function createProposal({ kind, ltId = null, payload, week = isoWeek() }) {
    for (let attempt = 0; attempt < 5; attempt++) {
        const n = (await AdProposal.countDocuments({ week })) + 1 + attempt;
        const proposalId = `${week}-${String(n).padStart(2, "0")}`;
        try {
            return (await AdProposal.create({ proposalId, week, kind, ltId, payload })).toObject();
        } catch (error) {
            if (error?.code !== 11000) throw error;
        }
    }
    throw new Error("Could not create a proposal id");
}

function describe(p) {
    const x = p.payload || {};
    switch (p.kind) {
        case "launch":
            return `Launch *${p.ltId}* at *$${x.dailyBudget}/day*, ${x.locationLabel}, automatic placements, Housing category. Created PAUSED, then you activate it.`;
        case "budget":
            return `Change *${p.ltId}* daily budget from *$${x.fromDaily}* to *$${x.toDaily}*.`;
        case "pause":
            return `Pause *${p.ltId}*.`;
        default:
            return `${p.kind === "try" ? "Try a new creative" : `${p.kind === "vary" ? "Vary" : "Refresh"} *${x.baseLtId || p.ltId}*`} for *${x.propertyName || "the property"}*${
                x.attributes ? ` (${Object.entries(x.attributes).map(([k, v]) => `${k}: ${v}`).join(", ")})` : ""
            }.`;
    }
}

function proposalBlocks(p) {
    return [
        B.section(`*${p.proposalId} · ${p.kind}${p.ltId ? ` · ${p.ltId}` : ""}*\n${describe(p)}`),
        ...(p.payload?.rationale ? [B.context(`Why: ${p.payload.rationale}`)] : []),
        B.actions([
            B.button("Go", "proposal_go", p.proposalId, "primary"),
            B.button("Reject", "proposal_reject", p.proposalId, "danger"),
        ]),
    ];
}

async function postProposal(p) {
    const { adsWeeklyChannel } = getAdsLoopConfig().slack;
    const posted = await slack.postMessage({ channel: adsWeeklyChannel, text: `${p.proposalId} · ${p.kind}`, blocks: proposalBlocks(p) });
    await AdProposal.updateOne({ proposalId: p.proposalId }, { $set: { slackChannel: posted.channel, slackTs: posted.ts } });
    return { ...p, slackChannel: posted.channel, slackTs: posted.ts };
}

/** Replace the buttons with the outcome (or a "Try again" button). */
async function closeProposal(p, statusLine, { retry = false } = {}) {
    if (!p.slackTs) return;
    const blocks = [B.section(`*${p.proposalId} · ${p.kind}${p.ltId ? ` · ${p.ltId}` : ""}*\n${describe(p)}`), B.context(statusLine)];
    if (retry) {
        blocks.push(B.actions([B.button("Try again", "proposal_go", p.proposalId, "primary"), B.button("Reject", "proposal_reject", p.proposalId, "danger")]));
    }
    await slack
        .updateMessage({ channel: p.slackChannel, ts: p.slackTs, text: `${p.proposalId} · ${p.kind}`, blocks })
        .catch((e) => console.error("[adsLoop] proposal update failed:", e.message));
}

// ---------------------------------------------------------------------------
// Launch proposal (after creative approval)
// ---------------------------------------------------------------------------
const STATE_NAMES = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
    DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
    IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
    MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
    NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
    NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
    RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
    VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

/**
 * Housing-safe location: the property's city with a broad radius, else its
 * state, else the whole US. Never ZIP codes.
 */
async function resolveLocation(property) {
    const { cityRadiusMiles } = getAdsLoopConfig().ads;
    // Properties store the state either as "TX" or as "Texas".
    const abbr = String(property.state || "").trim().toUpperCase();
    const stateName = STATE_NAMES[abbr] || String(property.state || "").trim();
    const inState = (r) => (r.path || []).some((x) => x === stateName || x === abbr) || String(r.name).includes(stateName);

    try {
        if (property.city) {
            const cities = (await zernio.searchGeo(property.city, "city")).filter((r) => r.type === "city");
            const city = cities.find(inState);
            if (city) {
                return {
                    targeting: { cities: [{ key: city.id, radius: cityRadiusMiles, distanceUnit: "mile" }] },
                    locationLabel: `within ${cityRadiusMiles} mi of ${property.city}, ${property.state}`,
                };
            }
        }
        if (stateName) {
            const regions = (await zernio.searchGeo(stateName, "region")).filter((r) => r.type === "region");
            const region = regions.find((r) => r.name === stateName) || regions[0];
            if (region) return { targeting: { regions: [{ key: region.id }] }, locationLabel: `all of ${stateName}` };
        }
    } catch (error) {
        console.error("[adsLoop] location search failed, using the whole US:", error.message);
    }
    return { targeting: { countries: ["US"] }, locationLabel: "the whole US" };
}

/** Called when a creative is approved: proposes its launch in #ads-weekly. */
async function proposeLaunch(ltId) {
    const creative = await AdCreative.findOne({ ltId }).lean();
    const property = await productModel.findById(creative.property).lean();
    const { defaultDailyBudget } = getAdsLoopConfig().ads;
    const location = await resolveLocation(property);

    const p = await createProposal({
        kind: "launch",
        ltId,
        payload: {
            ltId,
            propertyName: propertyLabel(property),
            dailyBudget: defaultDailyBudget,
            targeting: location.targeting,
            locationLabel: location.locationLabel,
            rationale: `${ltId} was approved in #creative-review.`,
        },
    });
    return postProposal(p);
}

function launchBody(creative, payload) {
    const config = getAdsLoopConfig();
    const a = creative.attributes || {};
    const link = landingUrl({ propertySlug: creative.propertySlug, campaignSlug: config.ads.campaignSlug, ltId: creative.ltId });
    const name = adName(creative.ltId, creative.propertySlug, a.layout);
    const urls = (c) => (c.assetUrls instanceof Map ? Object.fromEntries(c.assetUrls) : c.assetUrls || {});

    const body = {
        accountId: config.zernio.adsAccountId,
        adAccountId: config.zernio.adAccountId,
        name,
        campaignName: `${config.ads.campaignSlug} | ${creative.ltId}`,
        adSetName: `${creative.ltId} | ${creative.propertySlug}`,
        adName: name,
        goal: config.ads.goal,
        budgetAmount: payload.dailyBudget,
        budgetType: "daily",
        // Campaign and ad set on, the ad itself held PAUSED until "Activate".
        status: "PAUSED",
        campaignStatus: "ACTIVE",
        adSetStatus: "ACTIVE",
        adStatus: "PAUSED",
        headline: creative.copy.headline,
        body: creative.copy.primaryText,
        callToAction: META_CTA[a.cta] || "LEARN_MORE",
        linkUrl: link,
        specialAdCategories: ["HOUSING"],
        specialAdCategoryCountry: ["US"],
        targeting: payload.targeting,
        advantageAudience: 0,
        ...(config.ads.pixelId ? { tracking: { pixelId: config.ads.pixelId } } : {}),
    };

    if (a.format === "carousel") {
        body.carouselCards = creative.cards.map((c) => ({ imageUrl: urls(c)["1x1"], headline: c.headline, description: c.description, linkUrl: link }));
    } else {
        body.imageUrl = urls(creative.cards[0])["1x1"];
    }
    return { body, link, name };
}

// ---------------------------------------------------------------------------
// Execution per kind
// ---------------------------------------------------------------------------
async function runCreativeProposal(p, { userId }) {
    const x = p.payload;
    const creative = await startCreative({
        propertyId: x.propertyId,
        parentLtId: p.kind === "try" ? null : x.baseLtId || p.ltId,
        brief: { kind: p.kind, rationale: x.rationale, attributes: x.attributes || null },
        proposalId: p.proposalId,
    });
    await AdProposal.updateOne({ proposalId: p.proposalId }, { $set: { status: PROPOSAL_STATUS.BUILT, ltId: creative.ltId } });
    return `🛠️ <@${userId}> said go: building *${creative.ltId}*. It will appear in <#${getAdsLoopConfig().slack.creativeReviewChannel}>.`;
}

async function runLaunch(p, { userId, triggerKey }) {
    const creative = await AdCreative.findOne({ ltId: p.ltId }).lean();
    if (!creative) throw new Error(`${p.ltId} not found`);
    if (![CREATIVE_STATUS.APPROVED, CREATIVE_STATUS.SCHEDULED].includes(creative.status)) {
        throw new guard.GuardrailError(`${p.ltId} is "${creative.status}"; only approved creatives can be launched.`);
    }
    if (creative.meta?.zernioAdId) throw new guard.GuardrailError(`${p.ltId} already has an ad (${creative.meta.adId}).`);
    await assertCopyClean(creative);

    // The ad starts paused, but count its budget now so activating it can't break the ceilings.
    await guard.checkSpendCeilings({ addDaily: p.payload.dailyBudget });
    const { body, link, name } = launchBody(creative, p.payload);
    guard.assertHousingCompliant(body);

    const response = await guard.executeWrite({
        action: "create_ad",
        approvedBy: userId,
        triggerKey,
        channel: p.slackChannel,
        proposalId: p.proposalId,
        ltId: p.ltId,
        request: body,
        run: () => zernio.createAd(body, `launch-${p.proposalId}`),
    });

    const ad = response?.ad || response?.ads?.[0];
    if (!ad) throw new Error("Zernio did not return the new ad");
    await AdCreative.updateOne(
        { ltId: p.ltId },
        {
            $set: {
                "meta.zernioAdId": ad._id,
                "meta.adId": ad.platformAdId,
                "meta.adSetId": ad.platformAdSetId,
                "meta.campaignId": ad.platformCampaignId,
                "meta.adName": name,
                "meta.dailyBudget": p.payload.dailyBudget,
                "meta.landingUrl": link,
                status: CREATIVE_STATUS.PAUSED,
            },
        }
    );
    await AdProposal.updateOne({ proposalId: p.proposalId }, { $set: { status: PROPOSAL_STATUS.APPROVED } });

    await slack.postMessage({
        channel: p.slackChannel,
        threadTs: p.slackTs,
        text: `${p.ltId} created PAUSED`,
        blocks: [
            B.section(`✅ *${p.ltId}* created on Meta, *PAUSED* (ad ${ad.platformAdId}, Housing category). Check it in Ads Manager, then activate.`),
            B.actions([B.button("Activate", "launch_activate", p.proposalId, "primary")]),
        ],
    });
    return `Created PAUSED by <@${userId}>. Waiting for "Activate".`;
}

async function runBudget(p, { userId, triggerKey }) {
    const creative = await AdCreative.findOne({ ltId: p.ltId }).lean();
    const adSetId = p.payload.adSetId || creative?.meta?.adSetId;
    if (!adSetId) throw new guard.GuardrailError(`${p.ltId} has no ad set on Meta yet.`);

    const adSet = await zernio.getAdSet(adSetId);
    guard.assertNotLearning(adSet);
    const currentDaily = guard.centsToDollars(adSet.daily_budget) ?? creative?.meta?.dailyBudget;
    const toDaily = Number(p.payload.toDaily);
    await guard.checkBudgetChange({ adSetId, currentDaily, newDaily: toDaily });
    if (creative?.status === CREATIVE_STATUS.LIVE) {
        await guard.checkSpendCeilings({ addDaily: toDaily, excludeLtId: p.ltId });
    }

    const request = { budget: { amount: toDaily, type: "daily" } };
    await guard.executeWrite({
        action: "update_budget",
        approvedBy: userId,
        triggerKey,
        channel: p.slackChannel,
        proposalId: p.proposalId,
        ltId: p.ltId,
        adSetId,
        request: { adSetId, ...request },
        run: () => zernio.updateAdSet(adSetId, request),
    });
    await AdCreative.updateOne({ ltId: p.ltId }, { $set: { "meta.dailyBudget": toDaily } });
    await AdProposal.updateOne({ proposalId: p.proposalId }, { $set: { status: PROPOSAL_STATUS.EXECUTED } });
    return `💰 Budget changed from $${currentDaily} to $${toDaily}/day by <@${userId}>.`;
}

async function runPause(p, { userId, triggerKey }) {
    const creative = await AdCreative.findOne({ ltId: p.ltId }).lean();
    const adId = creative?.meta?.zernioAdId || creative?.meta?.adId;
    if (!adId) throw new guard.GuardrailError(`${p.ltId} has no ad on Meta.`);

    await guard.executeWrite({
        action: "pause",
        approvedBy: userId,
        triggerKey,
        channel: p.slackChannel,
        proposalId: p.proposalId,
        ltId: p.ltId,
        adSetId: creative.meta.adSetId,
        request: { adId, status: "paused" },
        run: () => zernio.setAdStatus(adId, "paused"),
    });
    await AdCreative.updateOne({ ltId: p.ltId }, { $set: { status: CREATIVE_STATUS.PAUSED } });
    await AdProposal.updateOne({ proposalId: p.proposalId }, { $set: { status: PROPOSAL_STATUS.EXECUTED } });
    return `⏸️ Paused by <@${userId}>.`;
}

// ---------------------------------------------------------------------------
// Button handlers
// ---------------------------------------------------------------------------
async function failProposal(p, error) {
    const blocked = error instanceof guard.GuardrailError;
    const status = blocked ? PROPOSAL_STATUS.BLOCKED : PROPOSAL_STATUS.FAILED;
    await AdProposal.updateOne({ proposalId: p.proposalId }, { $set: { status, note: error.message } });
    await slack.replyInThread(p.slackChannel, p.slackTs, `${blocked ? "🛑 Blocked" : "⚠️ Failed"}: ${error.message}`);
    await closeProposal(p, `${blocked ? "🛑 Blocked" : "⚠️ Failed"}: ${error.message}`, { retry: true });
}

// A blocked or failed proposal can be tried again (e.g. after /adsloop resume).
const OPEN_STATUSES = [PROPOSAL_STATUS.PROPOSED, PROPOSAL_STATUS.BLOCKED, PROPOSAL_STATUS.FAILED];

/** "Go" on a proposal. */
async function handleGo({ proposalId, userId, triggerKey }) {
    guard.assertApprover(userId);
    // Lock: only one "Go" per proposal, even with double clicks.
    const p = await AdProposal.findOneAndUpdate(
        { proposalId, status: { $in: OPEN_STATUSES } },
        { $set: { status: PROPOSAL_STATUS.GO, decidedBy: userId, decidedAt: new Date(), note: "" } },
        { new: true }
    ).lean();
    if (!p) return;

    try {
        let line;
        if (CREATIVE_KINDS.includes(p.kind)) line = await runCreativeProposal(p, { userId });
        else if (p.kind === "launch") line = await runLaunch(p, { userId, triggerKey });
        else if (p.kind === "budget") line = await runBudget(p, { userId, triggerKey });
        else if (p.kind === "pause") line = await runPause(p, { userId, triggerKey });
        else throw new Error(`Unknown proposal kind ${p.kind}`);
        await slack.replyInThread(p.slackChannel, p.slackTs, line);
        await closeProposal(p, line);
    } catch (error) {
        await failProposal(p, error);
    }
}

async function handleReject({ proposalId, userId }) {
    guard.assertApprover(userId);
    const p = await AdProposal.findOneAndUpdate(
        { proposalId, status: { $in: OPEN_STATUSES } },
        { $set: { status: PROPOSAL_STATUS.REJECTED, decidedBy: userId, decidedAt: new Date() } },
        { new: true }
    ).lean();
    if (p) await closeProposal(p, `❌ Rejected by <@${userId}>.`);
}

/** "Activate" on a launch that was created PAUSED. */
async function handleActivate({ proposalId, userId, triggerKey }) {
    guard.assertApprover(userId);
    const p = await AdProposal.findOneAndUpdate(
        { proposalId, kind: "launch", status: PROPOSAL_STATUS.APPROVED, "payload.activating": { $ne: true } },
        { $set: { "payload.activating": true } },
        { new: true }
    ).lean();
    if (!p) return;

    try {
        const creative = await AdCreative.findOne({ ltId: p.ltId }).lean();
        await guard.checkSpendCeilings({ addDaily: creative.meta.dailyBudget || 0, excludeLtId: p.ltId });
        const adId = creative.meta.zernioAdId || creative.meta.adId;
        await guard.executeWrite({
            action: "activate",
            approvedBy: userId,
            triggerKey,
            channel: p.slackChannel,
            proposalId: p.proposalId,
            ltId: p.ltId,
            adSetId: creative.meta.adSetId,
            request: { adId, status: "active" },
            run: () => zernio.setAdStatus(adId, "active"),
        });
        await AdCreative.updateOne({ ltId: p.ltId }, { $set: { status: CREATIVE_STATUS.LIVE } });
        await AdProposal.updateOne({ proposalId }, { $set: { status: PROPOSAL_STATUS.EXECUTED } });
        await slack.replyInThread(p.slackChannel, p.slackTs, `🚀 *${p.ltId}* is live, activated by <@${userId}>.`);
    } catch (error) {
        await AdProposal.updateOne({ proposalId }, { $set: { "payload.activating": false, note: error.message } });
        await slack.replyInThread(p.slackChannel, p.slackTs, `${error instanceof guard.GuardrailError ? "🛑 Blocked" : "⚠️ Failed"}: ${error.message}`);
    }
}

module.exports = {
    isoWeek,
    createProposal,
    postProposal,
    proposeLaunch,
    handleGo,
    handleReject,
    handleActivate,
    launchBody,
};
