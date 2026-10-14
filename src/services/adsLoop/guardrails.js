// services/adsLoop/guardrails.js
//
// Guardrails enforced in code, never left to Claude's judgment:
//   - approver allow-list by Slack user id
//   - kill switch (a Slack command stops all writes until a person turns it back on)
//   - budget changes: at most +/-20% per ad set, at most once every 3 days
//   - no edits to ad sets still in the learning phase
//   - daily and monthly spend ceilings
//   - every campaign created with the Housing special ad category
//   - copy policy check: no preferred-buyer language, no guaranteed returns,
//     no misleading price claims
//
// executeWrite() is the only way the loop writes to Zernio: it checks the
// approver and kill switch, claims the triggering Slack message (so a replay
// can never repeat a write), runs the call and records it in the change log.

const { DateTime } = require("luxon");
const AdChangeLog = require("../../model/adsLoop/adChangeLogModel");
const AdCreative = require("../../model/adsLoop/adCreativeModel");
const AdResult = require("../../model/adsLoop/adResultModel");
const ProcessedSlackMessage = require("../../model/adsLoop/processedSlackMessageModel");
const { CREATIVE_STATUS } = require("../../model/adsLoop/adCreativeModel");
const { getAdsLoopConfig } = require("../../config/adsLoop/adsLoopConfig");
const { checkLine } = require("../marketing/complianceChecker");
const { isKillSwitchOn } = require("./loopState");

class GuardrailError extends Error {
    constructor(message) {
        super(message);
        this.name = "GuardrailError";
    }
}

// ---------------------------------------------------------------------------
// Who and when
// ---------------------------------------------------------------------------
const isApprover = (slackUserId) => getAdsLoopConfig().slack.approverIds.includes(slackUserId);

function assertApprover(slackUserId) {
    if (!getAdsLoopConfig().slack.approverIds.length) {
        throw new GuardrailError("No approvers are set yet (SLACK_APPROVER_IDS is empty), so nothing can be approved.");
    }
    if (!isApprover(slackUserId)) throw new GuardrailError(`<@${slackUserId}> is not on the approver list.`);
}

async function assertWritesAllowed() {
    if (await isKillSwitchOn()) {
        throw new GuardrailError("The kill switch is on: all writes are stopped. Run `/adsloop resume` to turn writes back on.");
    }
}

/**
 * Claim a Slack message / action once. Returns false when it was already
 * handled (a retry or a replay), so the caller skips it.
 */
async function claimOnce(key, channel = "") {
    try {
        await ProcessedSlackMessage.create({ key, channel: channel || "-", handledAt: new Date() });
        return true;
    } catch (error) {
        if (error?.code === 11000) return false;
        throw error;
    }
}

// ---------------------------------------------------------------------------
// Budget and spend
// ---------------------------------------------------------------------------
/** Meta returns budgets in cents as strings; Zernio takes whole dollars. */
const centsToDollars = (v) => (v === undefined || v === null || v === "" ? null : Number(v) / 100);

async function checkBudgetChange({ adSetId, currentDaily, newDaily }) {
    const { maxBudgetChangePct, budgetChangeCooldownDays } = getAdsLoopConfig().guardrails;
    if (!(currentDaily > 0)) throw new GuardrailError(`Ad set ${adSetId} has no daily budget to change from.`);

    const pct = ((newDaily - currentDaily) / currentDaily) * 100;
    if (Math.abs(pct) > maxBudgetChangePct + 1e-9) {
        throw new GuardrailError(
            `Budget change of ${pct.toFixed(1)}% is over the ${maxBudgetChangePct}% limit (from $${currentDaily} to $${newDaily}).`
        );
    }

    const since = new Date(Date.now() - budgetChangeCooldownDays * 24 * 3600 * 1000);
    const recent = await AdChangeLog.findOne({ action: "update_budget", adSetId, ok: true, executedAt: { $gte: since } })
        .sort({ executedAt: -1 })
        .lean();
    if (recent) {
        throw new GuardrailError(
            `Ad set ${adSetId} budget was changed on ${recent.executedAt.toISOString().slice(0, 10)}; the next change is allowed after ${budgetChangeCooldownDays} days.`
        );
    }
}

function assertNotLearning(adSet) {
    const status = adSet?.learning_stage_info?.status;
    if (status === "LEARNING") {
        throw new GuardrailError(`Ad set ${adSet.id || ""} is still in the learning phase, so it can't be edited yet.`);
    }
}

/** Daily budget of every loop ad that is running now. */
async function runningDailyBudget({ excludeCoreId } = {}) {
    const live = await AdCreative.find({
        status: CREATIVE_STATUS.LIVE,
        "meta.dailyBudget": { $gt: 0 },
        ...(excludeCoreId ? { coreId: { $ne: excludeCoreId } } : {}),
    })
        .select("meta.dailyBudget")
        .lean();
    return live.reduce((sum, c) => sum + (c.meta.dailyBudget || 0), 0);
}

/**
 * Would the loop's spend stay under both ceilings if `addDaily` more per day
 * started now (and `excludeCoreId`'s budget were replaced)?
 */
async function checkSpendCeilings({ addDaily = 0, excludeCoreId } = {}) {
    const config = getAdsLoopConfig();
    const { dailySpendCeiling, monthlySpendCeiling } = config.guardrails;

    const daily = (await runningDailyBudget({ excludeCoreId })) + addDaily;
    if (daily > dailySpendCeiling + 1e-9) {
        throw new GuardrailError(`This would bring daily budgets to $${daily.toFixed(2)}, over the $${dailySpendCeiling} daily ceiling.`);
    }

    const now = DateTime.now().setZone(config.accountTimeZone);
    const monthStart = now.startOf("month").toISODate();
    const spent = await AdResult.aggregate([
        { $match: { channel: "meta_ad", date: { $gte: monthStart } } },
        { $group: { _id: null, spend: { $sum: { $ifNull: ["$spend", 0] } } } },
    ]);
    const spentSoFar = spent[0]?.spend || 0;
    const daysLeft = Math.ceil(now.endOf("month").diff(now, "days").days);
    const projected = spentSoFar + daily * daysLeft;
    if (projected > monthlySpendCeiling + 1e-9) {
        throw new GuardrailError(
            `This month would reach about $${projected.toFixed(0)} ($${spentSoFar.toFixed(0)} spent + $${daily.toFixed(2)}/day for ${daysLeft} days), over the $${monthlySpendCeiling} monthly ceiling.`
        );
    }
    return { daily, projected };
}

// ---------------------------------------------------------------------------
// Housing special ad category
// ---------------------------------------------------------------------------
const FORBIDDEN_TARGETING_KEYS = ["ageMin", "ageMax", "genders", "zips", "zipCodes", "postalCodes", "age_min", "age_max"];

/** Throws unless the create body declares HOUSING and has no age/gender/ZIP targeting. */
function assertHousingCompliant(body) {
    if (!Array.isArray(body.specialAdCategories) || !body.specialAdCategories.includes("HOUSING")) {
        throw new GuardrailError("Every property campaign must be created with the HOUSING special ad category.");
    }
    const scopes = [body, body.targeting || {}];
    for (const scope of scopes) {
        const bad = FORBIDDEN_TARGETING_KEYS.find((k) => scope[k] !== undefined);
        if (bad) throw new GuardrailError(`Housing ads can't target by ${bad}.`);
    }
    const { cityRadiusMiles } = getAdsLoopConfig().ads;
    const cities = [...(body.cities || []), ...(body.targeting?.cities || [])];
    if (cities.some((c) => !(c.radius >= Math.min(15, cityRadiusMiles)))) {
        throw new GuardrailError("Housing ads need a broad location radius (15 miles or more around each city).");
    }
    if (body.rawTargeting) throw new GuardrailError("Raw targeting is not allowed on housing ads.");
}

// ---------------------------------------------------------------------------
// Copy policy (QA)
// ---------------------------------------------------------------------------
/** Dollar amounts that may appear in copy: the property's real numbers. */
function allowedDollarAmounts(property) {
    return [property?.startBid, property?.reservePrice, property?.currentBid, property?.investmentData?.valuation?.ViharaValue]
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0);
}

const PERCENT_RE = /(\d+(?:\.\d+)?)\s*%/g;
const MONEY_RE = /\$\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|m|thousand|million)?\b/gi;
const MONEY_UNIT = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6 };

/**
 * Supported figures from the creative's Creative OS record. The record lists
 * every figure with its source; only those may appear besides the property's
 * own numbers. Accepts { figures: [{ text: "12%" } | { kind: "percent", value: 12 }
 * | "$525K" ...] }.
 * @returns {{ percents: number[], dollars: number[] }}
 */
function recordFigures(record) {
    const percents = [];
    const dollars = [];
    for (const f of Array.isArray(record?.figures) ? record.figures : []) {
        if (f && typeof f === "object" && Number.isFinite(Number(f.value)) && f.kind) {
            if (/percent/i.test(f.kind)) percents.push(Number(f.value));
            else if (/dollar|usd|money|price/i.test(f.kind)) dollars.push(Math.round(Number(f.value)));
            continue;
        }
        const text = typeof f === "string" ? f : String(f?.text ?? f?.display ?? "");
        for (const m of text.matchAll(PERCENT_RE)) percents.push(Number(m[1]));
        for (const m of text.matchAll(MONEY_RE)) {
            dollars.push(Math.round(Number(m[1].replace(/,/g, "")) * (MONEY_UNIT[(m[2] || "").toLowerCase()] || 1)));
        }
    }
    return { percents, dollars };
}

/** True when the text has numeric percentages and every one is a supported figure. */
function percentsAllSupported(text, supported) {
    const found = [...String(text).matchAll(PERCENT_RE)].map((m) => Number(m[1]));
    if (!found.length) return false; // "per cent" wording without a number stays refused
    return found.every((p) => supported.some((s) => Math.abs(s - p) < 0.051));
}

/**
 * @param {string[]} texts  every piece of copy (headline, primary text, on-image text, card text)
 * @param {object} property
 * @param {object} [record]  the creative's Creative OS record: its supported
 *   percentages and dollar figures are allowed; everything else is still refused,
 *   and guaranteed returns and Fair Housing words are always refused
 * @returns {string[]} readable problems, [] when clean
 */
function copyPolicyProblems(texts, property, record = null) {
    const figures = recordFigures(record);
    const ctx = { allowedDollarAmounts: [...allowedDollarAmounts(property), ...figures.dollars] };
    const problems = [];
    for (const text of texts.filter(Boolean)) {
        for (const flag of checkLine(text, ctx)) {
            if (flag.rule === "no-percentages" && percentsAllSupported(text, figures.percents)) continue;
            problems.push(`${flag.label}: "${flag.match}" in "${text.slice(0, 80)}"`);
        }
    }
    return [...new Set(problems)];
}

// ---------------------------------------------------------------------------
// The write gate
// ---------------------------------------------------------------------------
/**
 * @param {object} p
 * @param {string} p.action        schedule_post | create_ad | update_budget | pause | activate
 * @param {string} p.approvedBy    Slack user id
 * @param {string} p.triggerKey    unique id of the Slack message / click that asked for it
 * @param {object} p.request       what is sent (stored in the change log)
 * @param {Function} p.run         async () => response
 */
async function executeWrite({ action, approvedBy, triggerKey, channel, proposalId = null, coreId = null, adSetId = null, request, run }) {
    assertApprover(approvedBy);
    await assertWritesAllowed();

    if (!(await claimOnce(`write:${action}:${triggerKey}`, channel))) {
        throw new GuardrailError("This was already done (the same Slack action can't run twice).");
    }

    const base = { proposalId, coreId, action, adSetId, request, approvedBy, triggerKey, executedAt: new Date() };
    try {
        const response = await run();
        await AdChangeLog.create({ ...base, response, ok: true });
        return response;
    } catch (error) {
        await AdChangeLog.create({ ...base, response: { error: error.message, data: error.data || null }, ok: false }).catch(() => {});
        throw error;
    }
}

module.exports = {
    GuardrailError,
    isApprover,
    assertApprover,
    assertWritesAllowed,
    claimOnce,
    centsToDollars,
    checkBudgetChange,
    assertNotLearning,
    checkSpendCeilings,
    assertHousingCompliant,
    copyPolicyProblems,
    recordFigures,
    executeWrite,
};
