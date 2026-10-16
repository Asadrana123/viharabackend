// services/adsLoop/organicPublisher.js
//
// Organic posting through Zernio once a creative is approved with "Approve +
// post organically". Statics post one image (1:1 on Facebook, 4:5 on
// Instagram); carousels post every card in order. The Zernio post id is
// stored on the creative, so the daily pull can read its metrics by core id.

const AdCreative = require("../../model/adsLoop/adCreativeModel");
const { CREATIVE_STATUS } = require("../../model/adsLoop/adCreativeModel");
const { getAdsLoopConfig } = require("../../config/adsLoop/adsLoopConfig");
const { executeWrite } = require("./guardrails");
const { createPost } = require("./zernioClient");
const { organicUrl } = require("./creativeId");
const { assertCopyClean } = require("./creativePipeline");
const { usesGeneratedImage } = require("./sourceRecord");

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
        `${creative.copy.primaryText}\n\n${organicUrl({ propertySlug: creative.propertySlug, coreId: creative.coreId, platform })}`;

    const generated = usesGeneratedImage(creative);
    const platforms = [];
    // Zernio has no AI label for Facebook Page posts, so a creative with a
    // generated image is never posted there unlabeled.
    if (facebookAccountId && !generated) {
        platforms.push({ platform: "facebook", accountId: facebookAccountId, customContent: text("facebook"), customMedia: mediaFor(creative, "1x1") });
    }
    if (instagramAccountId) {
        // Instagram captions don't make links clickable; the link still carries the core id for anyone who copies it.
        platforms.push({
            platform: "instagram",
            accountId: instagramAccountId,
            customContent: text("instagram"),
            customMedia: mediaFor(creative, "4x5"),
            // Instagram's "AI info" label when the creative uses a generated image.
            ...(generated ? { platformSpecificData: { isAiGenerated: true } } : {}),
        });
    }
    if (!platforms.length) {
        throw new Error(
            generated && facebookAccountId
                ? "This creative uses a generated image and Facebook Page posts can't carry the AI label; connect Instagram to post it"
                : "Set ZERNIO_FACEBOOK_ACCOUNT_ID and/or ZERNIO_INSTAGRAM_ACCOUNT_ID to post organically"
        );
    }

    return {
        title: `${creative.coreId} organic`,
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
async function scheduleOrganicPost({ coreId, approvedBy, triggerKey, channel }) {
    const creative = await AdCreative.findOne({ coreId }).lean();
    if (!creative) throw new Error(`${coreId} not found`);
    if (creative.zernioPostId) return { postId: creative.zernioPostId, scheduledFor: null };
    await assertCopyClean(creative);

    const body = buildPostBody(creative);
    const response = await executeWrite({
        action: "schedule_post",
        approvedBy,
        triggerKey,
        channel,
        coreId,
        request: body,
        // Same key on every retry, so Zernio never makes two posts for one creative.
        run: () => createPost(body, `post-${coreId}`),
    });

    const postId = response?.post?._id;
    if (!postId) throw new Error("Zernio did not return a post id");
    await AdCreative.updateOne(
        { coreId },
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
