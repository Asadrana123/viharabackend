// services/adsLoop/slackHandlers.js
//
// Everything that arrives from Slack, after the route checked its signature:
//   events        thread replies (#creative-review notes, "go" in #ads-weekly) and ✅ reactions
//   interactions  Approve / Reject / Go / Activate buttons (and the repair agent's buttons)
//   /adsloop      stop | resume | status | build <property slug> | retry <core id> | pull | weekly | repair | why [page]
//
// Every message / reaction / click is claimed once (processedSlackMessages)
// before it is handled, so Slack retries and restart replays never act twice.
// On startup, replayMissed() reads the review and proposal threads for
// replies and ✅ that arrived while the server was down.

const axios = require("axios");
const productModel = require("../../model/property/productModel");
const AdCreative = require("../../model/adsLoop/adCreativeModel");
const AdProposal = require("../../model/adsLoop/adProposalModel");
const DesignRule = require("../../model/adsLoop/designRuleModel");
const { CREATIVE_STATUS } = require("../../model/adsLoop/adCreativeModel");
const { PROPOSAL_STATUS } = require("../../model/adsLoop/adProposalModel");
const { RULE_STATUS } = require("../../model/adsLoop/designRuleModel");
const { getAdsLoopConfig, missingSettings } = require("../../config/adsLoop/adsLoopConfig");
const guard = require("./guardrails");
const slack = require("./slackBot");
const review = require("./creativeReview");
const proposals = require("./proposalService");
const { startCreative, retryCreative } = require("./creativePipeline");
const { parseCoreId } = require("./creativeId");
const { getState, setKillSwitch, setLastHandledTs, getLastHandledTs } = require("./loopState");
const repair = require("../repair/incidentService");

const REPLAY_FALLBACK_S = 24 * 3600;

const ourChannels = () => {
    const { creativeReviewChannel, adsWeeklyChannel } = getAdsLoopConfig().slack;
    return new Set([creativeReviewChannel, adsWeeklyChannel].filter(Boolean));
};

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
/** A human message. Only thread replies matter. */
async function handleMessage({ channel, ts, threadTs, text, user }) {
    const { creativeReviewChannel, adsWeeklyChannel } = getAdsLoopConfig().slack;
    if (!threadTs || threadTs === ts) return;
    if (!(await guard.claimOnce(`msg:${channel}:${ts}`, channel))) return;

    try {
        if (channel === creativeReviewChannel) {
            await review.handleThreadReply({ channel, threadTs, text, user });
        } else if (channel === adsWeeklyChannel) {
            // Typing "go" or "reject" in a proposal's thread works like the buttons.
            const word = String(text || "").trim().toLowerCase().replace(/[.!]+$/, "");
            if (!["go", "reject"].includes(word)) return;
            const p = await AdProposal.findOne({ slackChannel: channel, slackTs: threadTs }).lean();
            if (!p) return;
            if (!guard.isApprover(user)) {
                await slack.replyInThread(channel, threadTs, `<@${user}> is not on the approver list.`);
                return;
            }
            if (word === "go") await proposals.handleGo({ proposalId: p.proposalId, userId: user, triggerKey: `msg:${ts}` });
            else await proposals.handleReject({ proposalId: p.proposalId, userId: user });
        }
    } finally {
        await setLastHandledTs(channel, ts).catch(() => {});
    }
}

async function handleEvent(event) {
    if (!event || !ourChannels().has(event.channel || event.item?.channel)) return;
    const botId = await slack.getBotUserId().catch(() => null);

    if (event.type === "message") {
        if (event.bot_id || event.user === botId || !event.user) return;
        if (event.subtype && event.subtype !== "thread_broadcast") return;
        await handleMessage({ channel: event.channel, ts: event.ts, threadTs: event.thread_ts, text: event.text, user: event.user });
    } else if (event.type === "reaction_added" && event.item?.type === "message") {
        const { channel, ts } = event.item;
        if (!(await guard.claimOnce(`react:${channel}:${ts}:${event.user}:${event.reaction}`, channel))) return;
        await review.handleReaction({ channel, ts, reaction: event.reaction, user: event.user });
    }
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
async function respondEphemeral(responseUrl, text) {
    if (!responseUrl) return;
    await axios.post(responseUrl, { response_type: "ephemeral", replace_original: false, text }, { timeout: 10000 }).catch(() => {});
}

const ACTIONS = {
    creative_approve_post: (v, ctx) => review.handleApprove({ coreId: v, userId: ctx.userId, postOrganically: true, triggerKey: ctx.triggerKey }),
    creative_approve: (v, ctx) => review.handleApprove({ coreId: v, userId: ctx.userId, postOrganically: false, triggerKey: ctx.triggerKey }),
    creative_reject: (v, ctx) => review.handleReject({ coreId: v, userId: ctx.userId }),
    proposal_go: (v, ctx) => proposals.handleGo({ proposalId: v, userId: ctx.userId, triggerKey: ctx.triggerKey }),
    proposal_reject: (v, ctx) => proposals.handleReject({ proposalId: v, userId: ctx.userId }),
    launch_activate: (v, ctx) => proposals.handleActivate({ proposalId: v, userId: ctx.userId, triggerKey: ctx.triggerKey }),
    // Repair agent (same Slack app)
    repair_go: (v, ctx) => repair.handleGo({ incidentId: v, userId: ctx.userId }),
    repair_reject: (v, ctx) => repair.handleReject({ incidentId: v, userId: ctx.userId }),
    repair_retry: (v, ctx) => repair.handleRetry({ incidentId: v, userId: ctx.userId }),
    repair_recheck: (v, ctx) => repair.handleRecheck({ incidentId: v, userId: ctx.userId }),
    // Sign-up doctor
    doctor_fix: (v, ctx) => require("../conversion/conversionService").handleFix({ value: v, userId: ctx.userId }),
    doctor_details: (v, ctx) => require("../conversion/conversionService").handleDetails({ value: v, userId: ctx.userId }),
};

async function handleInteraction(payload) {
    if (payload?.type !== "block_actions") return;
    const userId = payload.user?.id;
    for (const action of payload.actions || []) {
        const run = ACTIONS[action.action_id];
        if (!run) continue;
        const triggerKey = `${action.action_id}:${action.value}:${action.action_ts}`;
        if (!(await guard.claimOnce(`click:${triggerKey}`, payload.channel?.id))) continue;
        try {
            await run(action.value, { userId, triggerKey });
        } catch (error) {
            console.error(`[adsLoop] ${action.action_id} failed:`, error.message);
            await respondEphemeral(payload.response_url, `${error instanceof guard.GuardrailError ? "🛑" : "⚠️"} ${error.message}`);
        }
    }
}

// ---------------------------------------------------------------------------
// /adsloop command
// ---------------------------------------------------------------------------
const HELP = [
    "`/adsloop status` · loop health, kill switch, last pull",
    "`/adsloop stop [reason]` · kill switch: stop all writes to Meta/Zernio",
    "`/adsloop resume` · turn writes back on (approvers only)",
    "`/adsloop build <property slug> [static|carousel]` · build a new creative for a property (approvers only)",
    "`/adsloop retry <core id>` · retry a failed build (approvers only)",
    "`/adsloop pull` · run the daily metrics pull now (approvers only)",
    "`/adsloop weekly` · post the weekly list now (approvers only)",
    "`/adsloop repair` · run the repair agent's tracking and landing page checks now (approvers only)",
    "`/adsloop why [page link]` · sign-up doctor: why ad landing pages get visitors but few sign-ups (one page, or all)",
].join("\n");

async function statusText() {
    const state = await getState();
    const missing = missingSettings();
    const counts = await AdCreative.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]);
    return [
        `*Kill switch:* ${state.killSwitch?.on ? `🛑 ON since ${state.killSwitch.at?.toISOString?.() || state.killSwitch.at} by <@${state.killSwitch.by}>${state.killSwitch.reason ? ` (${state.killSwitch.reason})` : ""}` : "off (writes allowed)"}`,
        `*Last pull:* ${state.lastPullSummary || "never"}`,
        `*Last heartbeat:* ${state.lastHeartbeatAt ? new Date(state.lastHeartbeatAt).toISOString() : "never"}`,
        `*Creatives:* ${counts.map((c) => `${c._id} ${c.n}`).join(", ") || "none"}`,
        `*Approvers:* ${getAdsLoopConfig().slack.approverIds.map((id) => `<@${id}>`).join(", ") || "none set"}`,
        missing.length ? `*Missing settings:* ${missing.join(", ")}` : "",
    ]
        .filter(Boolean)
        .join("\n");
}

/**
 * A property slug as typed in Slack: strips code formatting (`...`), quotes,
 * Slack link brackets (<url|text>) and takes the last part of a pasted page
 * link (https://www.vihara.ai/auction/<slug>).
 */
function cleanSlug(raw) {
    let s = String(raw || "").trim();
    s = s.replace(/^<([^|>]+)(\|[^>]*)?>$/, "$1"); // <https://...|text> -> https://...
    s = s.replace(/[`'"*_​]/g, "").trim();
    s = s.split(/[?#]/)[0].replace(/\/+$/, "");
    if (s.includes("/")) s = s.split("/").pop();
    return s.toLowerCase();
}

/** @returns {Promise<string>} the reply shown to the person who typed the command */
async function handleCommand({ text, userId, runInBackground }) {
    const [sub = "help", ...rest] = String(text || "").trim().split(/\s+/);
    const arg = rest.join(" ");

    switch (sub.toLowerCase()) {
        case "stop":
            // Anyone may stop writes; turning them back on needs an approver.
            await setKillSwitch(true, { by: userId, reason: arg });
            await slack.postMessage({ channel: getAdsLoopConfig().slack.adsWeeklyChannel, text: `🛑 Kill switch ON by <@${userId}>${arg ? `: ${arg}` : ""}. No writes to Meta/Zernio until \`/adsloop resume\`.` }).catch(() => {});
            return "🛑 Kill switch is ON. All writes are stopped.";
        case "resume":
            guard.assertApprover(userId);
            await setKillSwitch(false, { by: userId });
            await slack.postMessage({ channel: getAdsLoopConfig().slack.adsWeeklyChannel, text: `✅ Kill switch off, <@${userId}> turned writes back on.` }).catch(() => {});
            return "✅ Writes are back on.";
        case "status":
            return statusText();
        case "build": {
            guard.assertApprover(userId);
            // "/adsloop build <slug> [static|carousel]"
            const words = arg.split(/\s+/).filter(Boolean);
            const last = cleanSlug(words[words.length - 1] || "");
            const format = ["static", "carousel"].includes(last) ? last : "static";
            if (["static", "carousel"].includes(last)) words.pop();
            const slug = cleanSlug(words.join(" "));
            if (!slug) return "Add the property: `/adsloop build <property slug or auction page link> [static|carousel]`.";
            const property = await productModel.findOne({ slug }).select("_id slug").lean();
            if (!property) return `No property with slug "${slug}". Copy it from the auction page link (the part after /auction/).`;
            const creative = await startCreative({ propertyId: property._id, format });
            return `🛠️ Building *${creative.coreId}* (${format}) for ${property.slug}. It will appear in <#${getAdsLoopConfig().slack.creativeReviewChannel}> as CR-${creative.coreId}.`;
        }
        case "retry": {
            guard.assertApprover(userId);
            // Accepts the core id or any stage name (CR-BB449-S01).
            const updated = await retryCreative(parseCoreId(arg.replace(/[`'"*_]/g, "")) || arg.trim().toUpperCase());
            return updated ? `🛠️ Retrying ${updated.coreId} v${updated.version}.` : `${arg} is not a failed build.`;
        }
        case "pull":
            guard.assertApprover(userId);
            runInBackground(() => require("./dailyPull").runDailyPull());
            return "Running the daily pull now; the result goes to #ads-weekly if anything needs attention.";
        case "weekly":
            guard.assertApprover(userId);
            runInBackground(() => require("./weeklyAnalysis").runWeeklyAnalysis());
            return "Building the weekly list now; it will be posted in #ads-weekly.";
        case "repair":
            guard.assertApprover(userId);
            runInBackground(() => repair.runChecks());
            return "Running the repair checks now; anything broken is posted to the repair channel.";
        case "why": {
            // Report only, so anyone may ask; it costs a few dollars of AI per page.
            const link = arg.trim().replace(/^<([^|>]+)(\|[^>]*)?>$/, "$1");
            if (link && !/^https?:\/\//.test(link)) return "Paste the full page link: `/adsloop why https://www.vihara.ai/auction/<slug>`";
            runInBackground(() => require("../conversion/conversionService").runSignupDoctor({ only: link || undefined }));
            return link
                ? `🩺 Looking into ${link} now; the reasons will be posted in the sign-up doctor channel in a few minutes.`
                : "🩺 Checking every ad landing page now; pages with few sign-ups will be posted in the sign-up doctor channel.";
        }
        default:
            return HELP;
    }
}

// ---------------------------------------------------------------------------
// Replay after a restart
// ---------------------------------------------------------------------------
async function replayThread(channel, threadTs, since, botId) {
    const replies = await slack.getThreadReplies(channel, threadTs);
    for (const m of replies) {
        if (m.ts === threadTs || Number(m.ts) <= Number(since)) continue;
        if (m.bot_id || !m.user || m.user === botId) continue;
        await handleMessage({ channel, ts: m.ts, threadTs, text: m.text, user: m.user });
    }
}

/** Handle thread replies and ✅ reactions that arrived while the server was down. */
async function replayMissed() {
    const { creativeReviewChannel, adsWeeklyChannel, botToken } = getAdsLoopConfig().slack;
    if (!botToken) return;
    const botId = await slack.getBotUserId();
    const fallback = String(Date.now() / 1000 - REPLAY_FALLBACK_S);

    const reviewSince = (await getLastHandledTs(creativeReviewChannel)) || fallback;
    const inReview = await AdCreative.find({ status: CREATIVE_STATUS.IN_REVIEW, "slack.threadTs": { $ne: "" } }).select("slack").lean();
    for (const c of inReview) {
        await replayThread(c.slack.channel, c.slack.threadTs, reviewSince, botId).catch((e) => console.error("[adsLoop] replay:", e.message));
    }

    const weeklySince = (await getLastHandledTs(adsWeeklyChannel)) || fallback;
    const open = await AdProposal.find({ status: PROPOSAL_STATUS.PROPOSED, slackTs: { $ne: "" } }).select("slackChannel slackTs").lean();
    for (const p of open) {
        await replayThread(p.slackChannel, p.slackTs, weeklySince, botId).catch((e) => console.error("[adsLoop] replay:", e.message));
    }

    const rules = await DesignRule.find({ status: RULE_STATUS.PROPOSED, slackTs: { $ne: "" } }).select("slackChannel slackTs").lean();
    for (const r of rules) {
        try {
            for (const reaction of await slack.getReactions(r.slackChannel, r.slackTs)) {
                for (const user of reaction.users || []) {
                    if (!(await guard.claimOnce(`react:${r.slackChannel}:${r.slackTs}:${user}:${reaction.name}`, r.slackChannel))) continue;
                    await review.handleReaction({ channel: r.slackChannel, ts: r.slackTs, reaction: reaction.name, user });
                }
            }
        } catch (error) {
            console.error("[adsLoop] rule replay:", error.message);
        }
    }
}

module.exports = { handleEvent, handleInteraction, handleCommand, replayMissed, statusText, cleanSlug };
