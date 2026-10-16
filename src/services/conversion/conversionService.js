// services/conversion/conversionService.js
//
// The sign-up doctor's daily run:
//   1. save today's Clarity numbers (Clarity only keeps 3 days for the API)
//   2. build each ad landing page's funnel (Meta → Clarity → our database)
//   3. pages with visitors but few sign-ups → the AI investigates each one
//   4. Slack: a summary message, and one thread reply per page with the
//      likely reasons, evidence, suggested fixes and screenshots
// Report only: nothing is changed anywhere.

const { DateTime } = require("luxon");
const slack = require("../adsLoop/slackBot");
const cloudinary = require("../shared/cloudinaryService");
const { getConversionConfig, missingConversionSettings } = require("../../config/conversion/conversionConfig");
const ConversionDiagnosis = require("../../model/conversion/conversionDiagnosisModel");
const { pullClarity } = require("./clarity");
const { buildPageFunnels, pageKey } = require("./pageFunnels");
const { diagnosePage } = require("./conversionAgent");

const { section, context, image } = slack.blocks;
const pct = (r) => (r === null || r === undefined ? "n/a" : `${(r * 100).toFixed(1)}%`);
const money = (n) => `$${Math.round(n)}`;
const shortPath = (url) => {
    const u = new URL(url);
    return u.pathname.replace(/\/+$/, "") || "/";
};
const CONFIDENCE = { high: "🔴 High", medium: "🟠 Medium", low: "⚪ Low" };

function funnelLine(p) {
    const signups = p.signupsSaved ?? p.metaRegistrations;
    return [
        `${money(p.spend)} spent`,
        `${p.linkClicks} clicks`,
        `${p.landingPageViews} page views (${pct(p.clickToViewRate)} of clicks)`,
        p.claritySessions !== null && p.claritySessions !== undefined ? `${p.claritySessions} Clarity sessions` : null,
        `*${signups} sign-ups (${pct(p.signupRate)})*`,
        `Meta counted ${p.metaRegistrations} registrations`,
        p.previousWeek ? `week before: ${p.previousWeek.signups} sign-ups (${pct(p.previousWeek.signupRate)})` : null,
    ]
        .filter(Boolean)
        .join(" · ");
}

function diagnosisBlocks(p, d) {
    const blocks = [section(`*<${p.url}|${shortPath(p.url)}>*\n${d.headline}`), context(funnelLine(p))];
    d.reasons.forEach((r, i) => {
        blocks.push(
            section(
                `*${i + 1}. ${r.reason}*  ${CONFIDENCE[r.confidence] || r.confidence} · _${r.category.replace(/_/g, " ")}_\n` +
                    `${r.evidence}${r.suggestedFix ? `\n*Fix:* ${r.suggestedFix}` : ""}`
            )
        );
    });
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
    const channel = config.slackChannel;
    const day = DateTime.now().setZone(config.scheduleTimeZone).toISODate();

    const clarity = await pullClarity().catch((e) => ({ error: e.message }));
    const funnels = await buildPageFunnels();
    let targets = funnels.flagged;
    if (only) {
        const key = pageKey(only);
        const page = funnels.pages.find((p) => p.key === key);
        if (!page) {
            await slack.postMessage({ channel, text: `🩺 No ad sent people to ${only} between ${funnels.window.since} and ${funnels.window.until}, so there's nothing to diagnose.` });
            return { flagged: 0, done: 0 };
        }
        targets = [page];
    }

    const header = only
        ? `🩺 *Sign-up doctor* · looking into ${shortPath(only)} (${funnels.window.since} to ${funnels.window.until})`
        : targets.length
          ? `🩺 *Sign-up doctor* · ${funnels.window.since} to ${funnels.window.until}: ${targets.length} of ${funnels.pages.length} ad landing pages get visitors but few sign-ups. Reasons in the thread.`
          : `🩺 *Sign-up doctor* · ${funnels.window.since} to ${funnels.window.until}: all ${funnels.pages.length} ad landing pages are converting normally.`;
    const lines = targets.map((p) => `• <${p.url}|${shortPath(p.url)}>: ${funnelLine(p)}`);
    if (clarity?.skipped || clarity?.error) lines.push(`_Clarity: ${clarity.skipped || clarity.error}_`);
    const { ts } = await slack.postMessage({ channel, text: header, blocks: [section(header), ...(lines.length ? [section(lines.join("\n"))] : [])] });

    let done = 0;
    for (const page of targets) {
        const doc = await ConversionDiagnosis.create({ day, pageKey: page.key, url: page.url, funnel: page });
        try {
            const result = await diagnosePage(page, funnels, { log: (m) => console.log(`[signup-doctor] ${shortPath(page.url)} ${m}`) });
            if (!result.ok) throw Object.assign(new Error(result.error), { usage: result.usage });
            const screenshots = await uploadScreenshots(result.screenshots);
            Object.assign(doc, {
                status: "done",
                headline: result.headline,
                reasons: result.reasons,
                checked: result.checked,
                screenshots,
                costUsd: result.usage.costUsd,
            });
            const reply = await slack.postMessage({ channel, threadTs: ts, text: `${shortPath(page.url)}: ${result.headline}`, blocks: diagnosisBlocks(page, doc) });
            doc.slackTs = reply.ts;
            done += 1;
        } catch (error) {
            console.error(`[signup-doctor] ${page.url} failed:`, error.message);
            Object.assign(doc, { status: "failed", error: error.message, costUsd: error.usage?.costUsd || 0 });
            await slack.replyInThread(channel, ts, `⚠️ Couldn't finish ${shortPath(page.url)}: ${error.message}`);
        }
        await doc.save();
    }
    return { flagged: targets.length, done };
}

module.exports = { runSignupDoctor };
