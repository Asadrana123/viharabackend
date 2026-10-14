// services/adsLoop/creativeReview.js
//
// Gate 1, #creative-review:
//   - a reply in a creative's thread = change requests -> next version
//   - "Approve + post organically" / "Approve (ads only)" -> approved and
//     renamed AP-<core id> (the only name used in ads); the organic post is
//     scheduled through Zernio, the launch is proposed in #ads-weekly, the
//     creative joins the example library, and Claude reads the thread and
//     proposes design rules in it
//   - "Reject" -> retired, keeping its last name; the latest reply is the reason
//   - ✅ by an approver on a proposed rule -> queued for the Creative OS
//     (it is not used until a person records it in the repo)
//
// Approving and rejecting need an approver (SLACK_APPROVER_IDS).

const AdCreative = require("../../model/adsLoop/adCreativeModel");
const { CREATIVE_STATUS } = require("../../model/adsLoop/adCreativeModel");
const guard = require("./guardrails");
const slack = require("./slackBot");
const learning = require("./learningStore");
const { extractReviewRules } = require("./creativeAi");
const { reviseCreative, reviewImageUrls, rename } = require("./creativePipeline");
const { STAGES } = require("./creativeId");
const { scheduleOrganicPost } = require("./organicPublisher");
const { proposeLaunch } = require("./proposalService");

const ACCEPT_REACTIONS = new Set(["white_check_mark", "heavy_check_mark", "ballot_box_with_check"]);

async function humanReplies(channel, threadTs) {
    const botId = await slack.getBotUserId();
    const messages = await slack.getThreadReplies(channel, threadTs);
    return messages.filter((m) => m.ts !== threadTs && m.user && m.user !== botId && !m.bot_id && m.text);
}

async function threadText(channel, threadTs) {
    const botId = await slack.getBotUserId();
    const messages = await slack.getThreadReplies(channel, threadTs);
    return messages
        .filter((m) => m.text)
        .map((m) => `${m.user === botId || m.bot_id ? "Pipeline" : `Reviewer ${m.user}`}: ${m.text}`)
        .join("\n");
}

// ---------------------------------------------------------------------------
// Rules from the thread
// ---------------------------------------------------------------------------
async function proposeRulesFromThread(creative) {
    const { channel, threadTs } = creative.slack;
    const rules = await extractReviewRules({ coreId: creative.coreId, threadText: await threadText(channel, threadTs) });
    for (const text of rules) {
        const rule = await learning.proposeRule({ text, source: `review ${creative.coreId}` });
        if (!rule) continue;
        const posted = await slack.postMessage({
            channel,
            threadTs,
            text: `📏 Suggested design rule: *${text}*\nAn approver reacts ✅ to send it to the Creative OS rules queue. It is only used once someone records it there.`,
        });
        rule.slackChannel = posted.channel;
        rule.slackTs = posted.ts;
        await rule.save();
    }
    return rules.length;
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
async function handleApprove({ coreId, userId, postOrganically, triggerKey }) {
    guard.assertApprover(userId);
    const creative = await AdCreative.findOneAndUpdate(
        { coreId, status: CREATIVE_STATUS.IN_REVIEW },
        [
            {
                $set: {
                    status: CREATIVE_STATUS.APPROVED,
                    approvedBy: userId,
                    approvedAt: new Date(),
                    approvedVersion: "$version",
                    postOrganically,
                },
            },
        ],
        { new: true }
    ).lean();
    if (!creative) return;
    const { channel, threadTs } = creative.slack;
    const name = await rename(coreId, STAGES.AP, { by: userId, version: creative.version });

    await slack.replyInThread(
        channel,
        threadTs,
        `✅ *${name}* (v${creative.version}) approved by <@${userId}> after ${creative.revisionCount} revision round${creative.revisionCount === 1 ? "" : "s"}.`
    );

    await learning
        .addExample({
            coreId,
            label: "approved",
            attributes: creative.attributes,
            why: `Approved on v${creative.version} (${creative.revisionCount} rounds). ${creative.concept}`,
            imageUrl: reviewImageUrls(creative)[0],
            addedBy: userId,
        })
        .catch((e) => console.error("[adsLoop] library add failed:", e.message));

    if (postOrganically) {
        try {
            const { postId, scheduledFor } = await scheduleOrganicPost({ coreId, approvedBy: userId, triggerKey, channel });
            await slack.replyInThread(channel, threadTs, `📅 Organic post scheduled${scheduledFor ? ` for ${scheduledFor.slice(0, 16).replace("T", " ")} UTC` : ""} (Zernio post ${postId}).`);
        } catch (error) {
            await slack.replyInThread(channel, threadTs, `${error instanceof guard.GuardrailError ? "🛑" : "⚠️"} Organic post not scheduled: ${error.message}`);
        }
    }

    try {
        const p = await proposeLaunch(coreId);
        await slack.replyInThread(channel, threadTs, `Launch proposed in <#${p.slackChannel}> as ${p.proposalId}.`);
    } catch (error) {
        await slack.replyInThread(channel, threadTs, `⚠️ Could not propose the launch: ${error.message}`);
    }

    try {
        await proposeRulesFromThread(creative);
    } catch (error) {
        console.error(`[adsLoop] rule extraction for ${coreId} failed:`, error.message);
    }
}

async function handleReject({ coreId, userId }) {
    guard.assertApprover(userId);
    const creative = await AdCreative.findOne({ coreId, status: CREATIVE_STATUS.IN_REVIEW }).lean();
    if (!creative) return;
    const { channel, threadTs } = creative.slack;

    const replies = await humanReplies(channel, threadTs).catch(() => []);
    const reason = replies.length ? replies[replies.length - 1].text : "";

    const updated = await AdCreative.findOneAndUpdate(
        { coreId, status: CREATIVE_STATUS.IN_REVIEW },
        { $set: { status: CREATIVE_STATUS.RETIRED, rejectionReason: reason } },
        { new: true }
    ).lean();
    if (!updated) return;

    await learning
        .addExample({
            coreId,
            label: "rejected",
            attributes: creative.attributes,
            why: reason || "Rejected without a written reason",
            imageUrl: reviewImageUrls(creative)[0],
            addedBy: userId,
        })
        .catch((e) => console.error("[adsLoop] library add failed:", e.message));

    await slack.replyInThread(
        channel,
        threadTs,
        `❌ *${creative.name || coreId}* rejected by <@${userId}>.${reason ? ` Reason saved for the library: "${reason.slice(0, 200)}"` : " Tip: reply with the reason before rejecting, so the library learns from it."}`
    );
}

// ---------------------------------------------------------------------------
// Messages and reactions
// ---------------------------------------------------------------------------
/**
 * A human reply in a creative's review thread.
 * @returns {Promise<boolean>} true when it was a review thread
 */
async function handleThreadReply({ channel, threadTs, text, user }) {
    const creative = await AdCreative.findOne({ "slack.channel": channel, "slack.threadTs": threadTs }).lean();
    if (!creative) return false;
    const notes = String(text || "").trim();
    if (!notes) return true;

    if (creative.status === CREATIVE_STATUS.IN_REVIEW) {
        const updated = await reviseCreative({ coreId: creative.coreId, notes });
        if (updated) await slack.replyInThread(channel, threadTs, `🛠️ Got it <@${user}>, building v${updated.version}.`);
    } else if (creative.status === CREATIVE_STATUS.BUILDING) {
        await slack.replyInThread(channel, threadTs, `⏳ v${creative.version} is still being built. Send this again once it's posted.`);
    }
    return true;
}

/** ✅ on a suggested rule: queue it for the Creative OS. */
async function handleReaction({ channel, ts, reaction, user }) {
    if (!ACCEPT_REACTIONS.has(reaction)) return;
    if (!guard.isApprover(user)) return;
    const rule = await learning.endorseRuleByMessage({ channel, ts, userId: user });
    if (rule) await slack.addReaction(channel, ts, "inbox_tray").catch(() => {});
}

module.exports = { handleApprove, handleReject, handleThreadReply, handleReaction };
