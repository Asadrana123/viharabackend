// services/adsLoop/organicPublisher.js
//
// Organic posting through Zernio once a creative is approved with "Approve +
// post organically". Statics post one image (1:1 on Facebook, 4:5 on
// Instagram); carousels post every card in order. The Zernio post id is
// stored on the creative, so the daily pull can read its metrics by LT-ID.

const AdCreative = require("../../model/adsLoop/adCreativeModel");
const { CREATIVE_STATUS } = require("../../model/adsLoop/adCreativeModel");
const { getAdsLoopConfig } = require("../../config/adsLoop/adsLoopConfig");
const { executeWrite } = require("./guardrails");
const { createPost } = require("./zernioClient");
const { organicUrl } = require("./ltId");
const { assertCopyClean } = require("./creativePipeline");

const urlsOf = (assetUrls) => (assetUrls instanceof Map ? Object.fromEntries(assetUrls) : assetUrls || {});

function mediaFor(creative, ratioPreference) {
    const cards = creative.cards || [];
    return cards
        .map((c) => {
            const urls = urlsOf(c.assetUrls);
            return urls[ratioPreference] || urls["1x1"];
        })
        .filter(Boolean)
        .map((url) => ({ type: "image", url, altText: `${creative.copy?.headline || "Vihara auction"}` }));
}

/** The Zernio body for one creative (Facebook and/or Instagram). */
function buildPostBody(creative) {
    const config = getAdsLoopConfig();
    const { facebookAccountId, instagramAccountId } = config.zernio;
    const scheduledFor = new Date(Date.now() + config.organic.scheduleDelayHours * 3600 * 1000).toISOString();
    const text = (platform) =>
        `${creative.copy.primaryText}\n\n${organicUrl({ propertySlug: creative.propertySlug, ltId: creative.ltId, platform })}`;

    const platforms = [];
    if (facebookAccountId) {
        platforms.push({ platform: "facebook", accountId: facebookAccountId, customContent: text("facebook"), customMedia: mediaFor(creative, "1x1") });
    }
    if (instagramAccountId) {
        // Instagram captions don't make links clickable; the link still carries the LT-ID for anyone who copies it.
        platforms.push({ platform: "instagram", accountId: instagramAccountId, customContent: text("instagram"), customMedia: mediaFor(creative, "4x5") });
    }
    if (!platforms.length) throw new Error("Set ZERNIO_FACEBOOK_ACCOUNT_ID and/or ZERNIO_INSTAGRAM_ACCOUNT_ID to post organically");

    return {
        title: `${creative.ltId} organic`,
        content: creative.copy.primaryText,
        mediaItems: mediaFor(creative, "1x1"),
        platforms,
        scheduledFor,
    };
}

/**
 * Schedule the organic post for an approved creative.
 * @returns {Promise<{ postId: string, scheduledFor: string|null }>}
 */
async function scheduleOrganicPost({ ltId, approvedBy, triggerKey, channel }) {
    const creative = await AdCreative.findOne({ ltId }).lean();
    if (!creative) throw new Error(`${ltId} not found`);
    if (creative.zernioPostId) return { postId: creative.zernioPostId, scheduledFor: null };
    await assertCopyClean(creative);

    const body = buildPostBody(creative);
    const response = await executeWrite({
        action: "schedule_post",
        approvedBy,
        triggerKey,
        channel,
        ltId,
        request: body,
        // Same key on every retry, so Zernio never makes two posts for one creative.
        run: () => createPost(body, `post-${ltId}`),
    });

    const postId = response?.post?._id;
    if (!postId) throw new Error("Zernio did not return a post id");
    await AdCreative.updateOne(
        { ltId },
        {
            $set: {
                zernioPostId: postId,
                ...(creative.status === CREATIVE_STATUS.APPROVED ? { status: CREATIVE_STATUS.SCHEDULED } : {}),
            },
        }
    );
    return { postId, scheduledFor: body.scheduledFor };
}

module.exports = { scheduleOrganicPost, buildPostBody };
