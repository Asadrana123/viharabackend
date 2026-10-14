// services/adsLoop/weeklyAnalysis.js
//
// Step 2 of the loop, every Monday 09:00 IST in #ads-weekly:
//   - training metrics (are review rounds falling? does the critic agree with people?)
//   - attribute-level performance over the last 6 weeks (which tags win)
//   - library labels from results: best creatives -> "winner", worst -> "loser"
//   - Claude's list of proposals (refresh / vary / try / budget / pause), each
//     with Go / Reject buttons, and performance rules to accept with ✅
//
// Claude only proposes. Budget proposals are re-checked by the guardrails
// when someone presses Go.

const { DateTime } = require("luxon");
const AdCreative = require("../../model/adsLoop/adCreativeModel");
const AdResult = require("../../model/adsLoop/adResultModel");
const productModel = require("../../model/property/productModel");
const { CREATIVE_STATUS } = require("../../model/adsLoop/adCreativeModel");
const { ATTRIBUTE_TAGS, ATTRIBUTE_KEYS } = require("../../config/adsLoop/attributeTags");
const { getAdsLoopConfig } = require("../../config/adsLoop/adsLoopConfig");
const { claudeJson, textBlock } = require("./claudeJson");
const learning = require("./learningStore");
const slack = require("./slackBot");
const { reviewImageUrls } = require("./creativePipeline");
const { createProposal, postProposal, isoWeek } = require("./proposalService");
const { updateState } = require("./loopState");

// Below this spend a creative is "not enough data" for winner/loser labels.
const MIN_SPEND_FOR_LABEL = 30;

const daysAgo = (zone, d) => DateTime.now().setZone(zone).minus({ days: d }).toISODate();

function median(values) {
    const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    if (!v.length) return null;
    const mid = Math.floor(v.length / 2);
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

const fmt = (x, d = 2) => (x === null || x === undefined ? "–" : Number(x).toFixed(d));

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------
async function totalsByCoreId(fromDate, toDate, channel = "meta_ad") {
    const rows = await AdResult.aggregate([
        { $match: { channel, date: { $gte: fromDate, $lte: toDate } } },
        {
            $group: {
                _id: "$coreId",
                spend: { $sum: { $ifNull: ["$spend", 0] } },
                impressions: { $sum: { $ifNull: ["$impressions", 0] } },
                clicks: { $sum: { $ifNull: ["$clicks", 0] } },
                leads: { $sum: { $ifNull: ["$leads", 0] } },
                qualifiedLeads: { $sum: { $ifNull: ["$qualifiedLeads", 0] } },
                days: { $sum: 1 },
            },
        },
    ]);
    return new Map(
        rows.map((r) => [
            r._id,
            {
                ...r,
                ctr: r.impressions ? (r.clicks / r.impressions) * 100 : null,
                cpql: r.qualifiedLeads ? r.spend / r.qualifiedLeads : null,
            },
        ])
    );
}

/** Spend, CTR and cost per qualified lead per attribute value. */
function attributePerformance(creatives, totals) {
    const out = {};
    for (const key of ATTRIBUTE_KEYS) {
        out[key] = {};
        for (const c of creatives) {
            const value = c.attributes?.[key];
            const t = totals.get(c.coreId);
            if (!value || !t) continue;
            const agg = (out[key][value] = out[key][value] || { creatives: 0, spend: 0, impressions: 0, clicks: 0, qualifiedLeads: 0 });
            agg.creatives += 1;
            agg.spend += t.spend;
            agg.impressions += t.impressions;
            agg.clicks += t.clicks;
            agg.qualifiedLeads += t.qualifiedLeads;
        }
        for (const agg of Object.values(out[key])) {
            agg.ctr = agg.impressions ? +((agg.clicks / agg.impressions) * 100).toFixed(2) : null;
            agg.cpql = agg.qualifiedLeads ? +(agg.spend / agg.qualifiedLeads).toFixed(2) : null;
            agg.spend = +agg.spend.toFixed(2);
        }
    }
    return out;
}

async function trainingMetrics(zone) {
    const weekAgo = new Date(Date.now() - 7 * 864e5);
    const twoWeeksAgo = new Date(Date.now() - 14 * 864e5);
    const decided = await AdCreative.find({ approvedAt: { $gte: twoWeeksAgo } }).select("revisionCount approvedAt").lean();
    const thisWeek = decided.filter((c) => c.approvedAt >= weekAgo);
    const lastWeek = decided.filter((c) => c.approvedAt < weekAgo);
    const avg = (list) => (list.length ? list.reduce((s, c) => s + c.revisionCount, 0) / list.length : null);

    // Critic vs human: did the critic's pass/fail on the final version match the decision?
    const judged = await AdCreative.find({
        updatedAt: { $gte: new Date(Date.now() - 30 * 864e5) },
        status: { $in: [CREATIVE_STATUS.APPROVED, CREATIVE_STATUS.SCHEDULED, CREATIVE_STATUS.LIVE, CREATIVE_STATUS.PAUSED, CREATIVE_STATUS.RETIRED] },
        "critic.score": { $ne: null },
    })
        .select("status critic.passed rejectionReason approvedAt")
        .lean();
    const agree = judged.filter((c) => (c.approvedAt ? c.critic.passed : !c.critic.passed)).length;

    // New creatives this month vs last month (median per creative).
    const monthAgo = new Date(Date.now() - 30 * 864e5);
    const twoMonthsAgo = new Date(Date.now() - 60 * 864e5);
    const totals = await totalsByCoreId(daysAgo(zone, 60), daysAgo(zone, 1));
    const cohort = async (from, to) => {
        const list = await AdCreative.find({ createdAt: { $gte: from, $lt: to } }).select("coreId").lean();
        const t = list.map((c) => totals.get(c.coreId)).filter(Boolean);
        return { ctr: median(t.map((x) => x.ctr)), cpql: median(t.map((x) => x.cpql)) };
    };
    const [recent, previous] = await Promise.all([cohort(monthAgo, new Date()), cohort(twoMonthsAgo, monthAgo)]);

    return {
        avgRevisionRoundsThisWeek: avg(thisWeek),
        avgRevisionRoundsLastWeek: avg(lastWeek),
        firstVersionApprovalShare: thisWeek.length ? thisWeek.filter((c) => c.revisionCount === 0).length / thisWeek.length : null,
        approvedThisWeek: thisWeek.length,
        criticAgreement: judged.length ? agree / judged.length : null,
        criticJudged: judged.length,
        medianCtrNew: recent.ctr,
        medianCtrPrevMonth: previous.ctr,
        medianCpqlNew: recent.cpql,
        medianCpqlPrevMonth: previous.cpql,
    };
}

/** Label the best and worst creatives with enough spend as winner / loser in the library. */
async function labelWinnersAndLosers(zone) {
    const totals = await totalsByCoreId(daysAgo(zone, 28), daysAgo(zone, 1));
    const ranked = [...totals.values()]
        .filter((t) => t.spend >= MIN_SPEND_FOR_LABEL)
        .map((t) => ({ ...t, score: t.cpql ?? (t.ctr ? 1000 / t.ctr : Infinity) }))
        .sort((a, b) => a.score - b.score);
    if (ranked.length < 3) return { winners: [], losers: [] };

    const cut = Math.max(1, Math.floor(ranked.length / 5));
    const winners = ranked.slice(0, cut);
    const losers = ranked.slice(-cut);
    for (const [label, list] of [["winner", winners], ["loser", losers]]) {
        for (const t of list) {
            const c = await AdCreative.findOne({ coreId: t._id }).lean();
            const imageUrl = c && reviewImageUrls(c)[0];
            if (!imageUrl) continue;
            await learning.addExample({
                coreId: t._id,
                label,
                attributes: c.attributes,
                why: `${label === "winner" ? "Top" : "Bottom"} 20% by cost per qualified lead over 4 weeks ($${fmt(t.spend)} spend).`,
                imageUrl,
                ctr: t.ctr === null ? null : +t.ctr.toFixed(2),
                qualifiedLeads: t.qualifiedLeads,
                costPerQualifiedLead: t.cpql === null ? null : +t.cpql.toFixed(2),
                addedBy: "weekly-analysis",
            });
        }
    }
    return { winners: winners.map((t) => t._id), losers: losers.map((t) => t._id) };
}

// ---------------------------------------------------------------------------
// Claude's list
// ---------------------------------------------------------------------------
const attributeOrEmpty = {
    type: "object",
    properties: Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, { type: "string", enum: ["", ...ATTRIBUTE_TAGS[k]] }])),
    required: ATTRIBUTE_KEYS,
    additionalProperties: false,
};

const WEEKLY_SCHEMA = {
    type: "object",
    properties: {
        summary: { type: "string", description: "Slack mrkdwn, under 1,500 characters." },
        proposals: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    kind: { type: "string", enum: ["refresh", "vary", "try", "budget", "pause"] },
                    coreId: { type: "string", description: "The creative this is about; \"\" for try." },
                    propertyId: { type: "string", description: "Property id for try (and refresh/vary); \"\" otherwise." },
                    attributes: { ...attributeOrEmpty, description: "Tags to use or test; \"\" = let the planner choose." },
                    toDaily: { type: "number", description: "New daily budget in USD for budget proposals; 0 otherwise." },
                    rationale: { type: "string", description: "One or two sentences citing the numbers." },
                },
                required: ["kind", "coreId", "propertyId", "attributes", "toDaily", "rationale"],
                additionalProperties: false,
            },
        },
        performanceRules: {
            type: "array",
            items: { type: "string" },
            description: "0-2 design rules the results support (short and testable).",
        },
    },
    required: ["summary", "proposals", "performanceRules"],
    additionalProperties: false,
};

async function gatherInput(zone) {
    const [last7, prev7, last42] = await Promise.all([
        totalsByCoreId(daysAgo(zone, 7), daysAgo(zone, 1)),
        totalsByCoreId(daysAgo(zone, 14), daysAgo(zone, 8)),
        totalsByCoreId(daysAgo(zone, 42), daysAgo(zone, 1)),
    ]);
    const creatives = await AdCreative.find({ status: { $nin: [CREATIVE_STATUS.FAILED] } })
        .select("coreId property propertySlug parentCoreId attributes status meta.dailyBudget meta.adSetId createdAt")
        .lean();
    const properties = await productModel
        .find({ status: "active", slug: { $exists: true, $ne: null }, $or: [{ auctionEndDate: null }, { auctionEndDate: { $gte: new Date() } }] })
        .select("productName street city state slug auctionStartDate auctionEndDate startBid")
        .limit(50)
        .lean();

    const creativeRows = creatives.map((c) => ({
        coreId: c.coreId,
        propertyId: String(c.property),
        parent: c.parentCoreId,
        status: c.status,
        attributes: c.attributes,
        dailyBudget: c.meta?.dailyBudget ?? null,
        hasAdSet: Boolean(c.meta?.adSetId),
        last7: last7.get(c.coreId) || null,
        prev7: prev7.get(c.coreId) || null,
        ageDays: Math.round((Date.now() - new Date(c.createdAt)) / 864e5),
    }));
    const propertyRows = properties.map((p) => ({
        propertyId: String(p._id),
        name: p.street || p.productName,
        city: `${p.city}, ${p.state}`,
        auctionEnds: p.auctionEndDate,
        creatives: creatives.filter((c) => String(c.property) === String(p._id)).map((c) => `${c.coreId} (${c.status})`),
    }));
    return { creativeRows, propertyRows, attributes: attributePerformance(creatives, last42) };
}

/** Keep only proposals the code can act on. */
async function validProposals(proposals, creativeRows, propertyRows) {
    const byLt = new Map(creativeRows.map((c) => [c.coreId, c]));
    const props = new Set(propertyRows.map((p) => p.propertyId));
    const out = [];
    for (const p of proposals) {
        const c = byLt.get(p.coreId);
        const attributes = Object.fromEntries(Object.entries(p.attributes || {}).filter(([, v]) => v));
        if (p.kind === "try" && props.has(p.propertyId)) {
            out.push({ kind: "try", coreId: null, payload: { propertyId: p.propertyId, attributes, rationale: p.rationale } });
        } else if (["refresh", "vary"].includes(p.kind) && c) {
            out.push({ kind: p.kind, coreId: c.coreId, payload: { propertyId: c.propertyId, baseCoreId: c.coreId, attributes, rationale: p.rationale } });
        } else if (p.kind === "budget" && c?.status === CREATIVE_STATUS.LIVE && c.hasAdSet && c.dailyBudget > 0 && p.toDaily > 0) {
            out.push({ kind: "budget", coreId: c.coreId, payload: { fromDaily: c.dailyBudget, toDaily: +p.toDaily.toFixed(2), rationale: p.rationale } });
        } else if (p.kind === "pause" && c && [CREATIVE_STATUS.LIVE].includes(c.status)) {
            out.push({ kind: "pause", coreId: c.coreId, payload: { rationale: p.rationale } });
        } else {
            console.warn("[adsLoop] weekly: skipped a proposal that can't be acted on:", JSON.stringify(p));
        }
    }
    // Property names for the Slack text.
    for (const p of out) {
        const prop = propertyRows.find((x) => x.propertyId === p.payload.propertyId);
        if (prop) p.payload.propertyName = prop.name;
    }
    return out;
}

function metricsText(m) {
    const pct = (x) => (x === null ? "–" : `${Math.round(x * 100)}%`);
    return [
        `*Training*`,
        `• Avg revision rounds: ${fmt(m.avgRevisionRoundsThisWeek, 1)} this week (last week ${fmt(m.avgRevisionRoundsLastWeek, 1)}), ${m.approvedThisWeek} approved`,
        `• Approved on first version: ${pct(m.firstVersionApprovalShare)}`,
        `• Critic agrees with reviewers: ${pct(m.criticAgreement)} of ${m.criticJudged}`,
        `• New creatives, median CTR ${fmt(m.medianCtrNew)}% (prev month ${fmt(m.medianCtrPrevMonth)}%), cost per qualified lead $${fmt(m.medianCpqlNew)} (prev $${fmt(m.medianCpqlPrevMonth)})`,
    ].join("\n");
}

let isRunning = false;

async function runWeeklyAnalysis() {
    if (isRunning) return "The weekly list is already running";
    isRunning = true;
    const config = getAdsLoopConfig();
    const channel = config.slack.adsWeeklyChannel;
    const zone = config.accountTimeZone;
    const week = isoWeek();
    try {
        const [metrics, labels, input] = await Promise.all([trainingMetrics(zone), labelWinnersAndLosers(zone), gatherInput(zone)]);

        const system = `You are the performance marketing lead for Vihara (vihara.ai), a US real estate auction platform. Meta ads send people to each property's auction page; the goal is qualified leads (phone + consent) at the lowest cost.

Write this week's list for #ads-weekly:
- refresh: same idea, new look, for a creative showing fatigue (CTR falling while frequency/spend continue)
- vary: test one attribute change on a working creative
- try: a new creative for a property that has none or whose creatives all lose; pick attributes to test what the attribute data suggests (or untested values)
- budget: change a LIVE creative's daily budget by at most 20% (more to winners, less to losers). Total loop spend is capped at $${config.guardrails.dailySpendCeiling}/day and $${config.guardrails.monthlySpendCeiling}/month.
- pause: a LIVE creative that clearly loses
Rules: use only the numbers given; treat little spend as not enough data; 3-8 proposals, most valuable first; ids must come from the data. Performance rules only when the attribute data clearly supports them.`;

        const content = [
            textBlock(`Week ${week}. Training metrics:\n${JSON.stringify(metrics)}`),
            textBlock(`Library labels just set: winners ${labels.winners.join(", ") || "none"}; losers ${labels.losers.join(", ") || "none"}.`),
            textBlock(`Creatives with last 7 days and previous 7 days (paid):\n${JSON.stringify(input.creativeRows)}`),
            textBlock(`Attribute performance, last 6 weeks (paid):\n${JSON.stringify(input.attributes)}`),
            textBlock(`Active properties with auction pages:\n${JSON.stringify(input.propertyRows)}`),
            textBlock(`Current design rules:\n${await learning.activeRulesText()}`),
        ];
        const answer = await claudeJson({ system, content, schema: WEEKLY_SCHEMA, effort: "high", maxTokens: 32000 });

        await slack.postMessage({ channel, text: `📋 *Ads weekly — ${week}*\n\n${answer.summary}\n\n${metricsText(metrics)}` });

        const proposals = await validProposals(answer.proposals || [], input.creativeRows, input.propertyRows);
        for (const p of proposals) {
            const created = await createProposal({ kind: p.kind, coreId: p.coreId, payload: p.payload, week });
            await postProposal(created);
        }

        for (const text of (answer.performanceRules || []).slice(0, 2)) {
            const rule = await learning.proposeRule({ text, source: `results ${week}` });
            if (!rule) continue;
            const posted = await slack.postMessage({
                channel,
                text: `📏 Suggested performance rule: *${text}*\nAn approver reacts ✅ to send it to the Creative OS rules queue. It is only used once someone records it there.`,
            });
            rule.slackChannel = posted.channel;
            rule.slackTs = posted.ts;
            await rule.save();
        }

        await updateState({ $set: { lastWeeklyAt: new Date() } });
        return `${proposals.length} proposals posted for ${week}`;
    } catch (error) {
        console.error("[adsLoop] weekly analysis failed:", error.message);
        await slack.postMessage({ channel, text: `⚠️ Weekly ads list failed: ${error.message}` }).catch(() => {});
        throw error;
    } finally {
        isRunning = false;
    }
}

module.exports = { runWeeklyAnalysis, trainingMetrics, attributePerformance };
