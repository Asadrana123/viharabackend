// services/conversion/conversionService.js
//
// The sign-up doctor's daily run:
//   1. save today's Clarity numbers (Clarity only keeps 3 days for the API)
//   2. build each ad landing page's funnel (Meta → Clarity → our database)
//   3. pages with visitors but few sign-ups → the AI investigates each one
//   4. Slack: a short summary, and one short reply per page in its thread:
//      the likely reasons, each with a one-line fix and a 🔧 Fix button
//
// The doctor itself changes nothing. 🔧 Fix (approvers only) hands that reason
// to the repair agent, which makes the change on a branch and asks for Go in
// the same thread. 📋 Details posts the evidence and screenshots.

const { DateTime } = require("luxon");
const slack = require("../adsLoop/slackBot");
const guard = require("../adsLoop/guardrails");
const cloudinary = require("../shared/cloudinaryService");
const { getConversionConfig, missingConversionSettings } = require("../../config/conversion/conversionConfig");
const ConversionDiagnosis = require("../../model/conversion/conversionDiagnosisModel");
const { pullClarity } = require("./clarity");
const { buildPageFunnels, pageKey } = require("./pageFunnels");
const { diagnosePage } = require("./conversionAgent");

const { section, context, image, button, actions } = slack.blocks;
const pct = (r) => (r === null || r === undefined ? "n/a" : `${Math.round(r * 1000) / 10}%`);
const shortPath = (url) => new URL(url).pathname.replace(/\/+$/, "") || "/";
const CONFIDENCE = { high: "🔴", medium: "🟠", low: "⚪" };
// Reasons about who the ads reach are for people to change in Ads Manager, not code.
const fixable = (r) => r.category !== "traffic_quality";

/** "$97 · 29 views · 0 sign-ups (0%) · week before 20%" */
function numbersLine(p) {
    const signups = p.signupsSaved ?? p.metaRegistrations;
    const views = p.landingPageViews || p.linkClicks;
    const before = p.previousWeek?.signupRate;
    return [`$${Math.round(p.spend)}`, `${views} views`, `*${signups} sign-ups (${pct(p.signupRate)})*`, before !== null && before !== undefined ? `week before ${pct(before)}` : null]
        .filter(Boolean)
        .join(" · ");
}

function diagnosisBlocks(d) {
    const p = d.funnel;
    const id = String(d._id);
    const blocks = [section(`*<${d.url}|${shortPath(d.url)}>*  ${numbersLine(p)}\n${d.headline}`)];
    d.reasons.forEach((r, i) => {
        let text = `${CONFIDENCE[r.confidence] || "⚪"} *${r.reason}*\n→ ${r.suggestedFix}`;
        if (r.fixIncidentId) text += `\n_🔧 ${r.fixIncidentId} started by <@${r.fixRequestedBy}>_`;
        const block = section(text);
        if (!r.fixIncidentId && fixable(r)) block.accessory = button("🔧 Fix", "doctor_fix", `${id}:${i}`);
        blocks.push(block);
    });
    blocks.push(actions([button("📋 Details", "doctor_details", id)]));
    blocks.push(context(`🔴 high · 🟠 medium · ⚪ low confidence · 🔧 Fix makes the change on a test link first; nothing goes live without Go`));
    return blocks;
}

function detailBlocks(d) {
    const blocks = [section(`*Details for ${shortPath(d.url)}*`)];
    d.reasons.forEach((r, i) => blocks.push(section(`*${i + 1}. ${r.reason}*  _(${r.category.replace(/_/g, " ")})_\n${r.evidence}`)));
    for (const s of d.screenshots || []) if (s.url) blocks.push(image(s.url, s.caption));
    blocks.push(context(`Checked: ${d.checked || "n/a"} · cost $${(d.costUsd || 0).toFixed(2)}`));
    return blocks.slice(0, 50);
}

async function uploadScreenshots(shots) {
    if (!cloudinary.isConfigured()) return [];
    const folder = getConversionConfig().cloudinaryFolder;
    const out = [];
    for (const s of shots) {
        try {
            const url = await cloudinary.uploadImageFromUrl(`data:image/jpeg;base64,${s.buffer.toString("base64")}`, folder);
            out.push({ caption: s.caption, url });
        } catch (e) {
            console.warn(`[signup-doctor] screenshot upload failed: ${e.message}`);
        }
    }
    return out;
}

let running = null;

/**
 * @param {object} [opts]
 * @param {string} [opts.only]   a page link: investigate just this page, even if its numbers look fine
 * @returns {Promise<{flagged: number, done: number}>}
 */
function runSignupDoctor(opts = {}) {
    if (running) return running;
    running = run(opts).finally(() => (running = null));
    return running;
}

async function run({ only } = {}) {
    const config = getConversionConfig();
    const missing = missingConversionSettings(config).filter((m) => !m.includes("optional"));
    if (missing.length) throw new Error(`Sign-up doctor is missing settings: ${missing.join(", ")}`);
    const day = DateTime.now().setZone(config.scheduleTimeZone).toISODate();

    const clarity = await pullClarity().catch((e) => ({ error: e.message }));
    const funnels = await buildPageFunnels();
    const dates = `${DateTime.fromISO(funnels.window.since).toFormat("LLL d")}–${DateTime.fromISO(funnels.window.until).toFormat("LLL d")}`;
    let targets = funnels.flagged;
    if (only) {
        const page = funnels.pages.find((p) => p.key === pageKey(only));
        if (!page) {
            await slack.postMessage({ channel: config.slackChannel, text: `🩺 No ad sent people to ${only} in ${dates}, so there's nothing to diagnose.` });
            return { flagged: 0, done: 0 };
        }
        targets = [page];
    } else {
        // Sign-up fixes that went live: resolved once their page stops being flagged.
        await require("../repair/incidentService")
            .resolveSignupFixes(new Set(funnels.flagged.map((p) => p.key)))
            .catch((e) => console.warn(`[signup-doctor] resolving fixes: ${e.message}`));
    }

    const header = only
        ? `🩺 *Sign-up doctor* · ${shortPath(only)} · ${dates}`
        : targets.length
          ? `🩺 *Sign-up doctor* · ${dates} · ${targets.length} of ${funnels.pages.length} ad pages need attention`
          : `🩺 *Sign-up doctor* · ${dates} · all ${funnels.pages.length} ad pages converting normally ✅`;
    const lines = only ? [] : targets.map((p) => `• ${shortPath(p.url)}: ${numbersLine(p)}`);
    if (clarity?.error) lines.push(`_Clarity: ${clarity.error}_`);
    const summary = await slack.postMessage({ channel: config.slackChannel, text: header, blocks: [section([header, ...lines].join("\n"))] });

    let done = 0;
    for (const page of targets) {
        const doc = await ConversionDiagnosis.create({ day, pageKey: page.key, url: page.url, funnel: page, slackChannel: summary.channel, slackThreadTs: summary.ts });
        try {
            const result = await diagnosePage(page, funnels, { log: (m) => console.log(`[signup-doctor] ${shortPath(page.url)} ${m}`) });
            if (!result.ok) throw Object.assign(new Error(result.error), { usage: result.usage });
            Object.assign(doc, {
                status: "done",
                headline: result.headline,
                reasons: result.reasons,
                checked: result.checked,
                screenshots: await uploadScreenshots(result.screenshots),
                costUsd: result.usage.costUsd,
            });
            const reply = await slack.postMessage({ channel: summary.channel, threadTs: summary.ts, text: `${shortPath(page.url)}: ${result.headline}`, blocks: diagnosisBlocks(doc) });
            doc.slackTs = reply.ts;
            done += 1;
        } catch (error) {
            console.error(`[signup-doctor] ${page.url} failed:`, error.message);
            Object.assign(doc, { status: "failed", error: error.message, costUsd: error.usage?.costUsd || 0 });
            await slack.replyInThread(summary.channel, summary.ts, `⚠️ Couldn't finish ${shortPath(page.url)}: ${error.message}`);
        }
        await doc.save();
    }
    return { flagged: targets.length, done };
}

// ---------------------------------------------------------------------------
// Slack buttons
// ---------------------------------------------------------------------------
async function loadDiagnosis(id) {
    const d = /^[a-f0-9]{24}$/.test(String(id)) ? await ConversionDiagnosis.findById(id) : null;
    if (!d) throw new guard.GuardrailError("That sign-up doctor report no longer exists.");
    return d;
}

const refresh = (d) =>
    slack.updateMessage({ channel: d.slackChannel, ts: d.slackTs, text: `${shortPath(d.url)}: ${d.headline}`, blocks: diagnosisBlocks(d) }).catch((e) => console.warn(`[signup-doctor] Slack update: ${e.message}`));

/** 🔧 Fix: the repair agent takes this reason and replies in the thread with a test link and Go / Reject. */
async function handleFix({ value, userId }) {
    guard.assertApprover(userId);
    const [id, index] = String(value).split(":");
    const d = await loadDiagnosis(id);
    const r = d.reasons[Number(index)];
    if (!r) throw new guard.GuardrailError("That reason no longer exists.");
    if (!fixable(r)) throw new guard.GuardrailError("This one is about who the ads reach; change it in Ads Manager.");

    const repair = require("../repair/incidentService");
    const { incident, existing } = await repair.startSignupFix({
        key: `signup:${id}:${index}`,
        title: `${shortPath(d.url)}: ${r.reason}`.slice(0, 200),
        evidence: {
            source: `the sign-up doctor's report of ${d.day}; fix requested in Slack`,
            page: d.url,
            pageKey: d.pageKey,
            pageNumbers: `${d.funnel.window}: ${numbersLine(d.funnel).replace(/\*/g, "")}`,
            mainFinding: d.headline,
            reason: r.reason,
            details: r.evidence,
            suggestedFix: r.suggestedFix,
            otherReasons: d.reasons.filter((_, i) => i !== Number(index)).map((x) => x.reason),
        },
        slackChannel: d.slackChannel,
        slackThreadTs: d.slackThreadTs,
    });
    r.fixIncidentId = incident.incidentId;
    r.fixRequestedBy = userId;
    d.markModified("reasons");
    await d.save();
    await refresh(d);
    if (existing) await slack.replyInThread(d.slackChannel, d.slackThreadTs, `🔧 ${incident.incidentId} is already working on this.`);
}

/** 📋 Details: the evidence behind each reason, and the screenshots. */
async function handleDetails({ value }) {
    const d = await loadDiagnosis(value);
    // One copy is enough; a second press within the hour does nothing.
    if (d.detailsPostedAt && Date.now() - d.detailsPostedAt < 3600 * 1000) return;
    await slack.postMessage({ channel: d.slackChannel, threadTs: d.slackThreadTs, text: `Details for ${shortPath(d.url)}`, blocks: detailBlocks(d) });
    d.detailsPostedAt = new Date();
    await d.save();
}

/** Startup: a page cut off by a restart (e.g. the server ran out of memory) is marked failed, and its thread says so. */
async function recoverSignupDoctor() {
    const cut = await ConversionDiagnosis.find({ status: "running" });
    for (const d of cut) {
        await ConversionDiagnosis.updateOne({ _id: d._id }, { $set: { status: "failed", error: "The server restarted during the check." } });
        if (d.slackChannel && d.slackThreadTs) {
            await slack.replyInThread(d.slackChannel, d.slackThreadTs, `⚠️ Couldn't finish ${shortPath(d.url)}: the server restarted during the check. Run \`/adsloop why ${d.url}\` to try again.`);
        }
    }
}

module.exports = { runSignupDoctor, handleFix, handleDetails, recoverSignupDoctor };
