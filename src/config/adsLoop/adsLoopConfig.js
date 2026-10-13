// config/adsLoop/adsLoopConfig.js
//
// Settings for the Meta Ads Loop (Zernio + Claude + Slack approvals).
// Everything that limits spend or decides who may approve lives here and is
// enforced in code, never left to Claude's judgment.
//
// Env (see .env.example):
//   ADS_LOOP_ENABLED                  "true" to run the schedules (daily pull, weekly list, heartbeat)
//   ZERNIO_API_KEY                    Zernio API key (sk_...)
//   ZERNIO_ADS_ACCOUNT_ID             Zernio account id of the connected Meta ads account
//   ZERNIO_AD_ACCOUNT_ID              Meta ad account id ("act_...") of "Vihara New"
//   ZERNIO_FACEBOOK_ACCOUNT_ID        Zernio account id of the Facebook Page (organic posts)
//   ZERNIO_INSTAGRAM_ACCOUNT_ID       Zernio account id of the Instagram account (organic posts)
//   SLACK_BOT_TOKEN                   xoxb-... bot token of the Vihara Ads Loop Slack app
//   SLACK_SIGNING_SECRET              Signing secret of the same app
//   SLACK_CREATIVE_REVIEW_CHANNEL_ID  Channel id of #creative-review
//   SLACK_ADS_WEEKLY_CHANNEL_ID       Channel id of #ads-weekly
//   SLACK_APPROVER_IDS                Comma-separated Slack user ids allowed to approve (empty = nobody)
//   ADS_LOOP_DAILY_SPEND_CEILING      USD per day across all loop ads (default 50)
//   ADS_LOOP_MONTHLY_SPEND_CEILING    USD per calendar month (default 1000)

const num = (value, fallback) => {
    const n = Number(value);
    return value !== undefined && value !== "" && Number.isFinite(n) ? n : fallback;
};

const list = (value) =>
    String(value || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

function getAdsLoopConfig() {
    const env = process.env;
    return {
        enabled: env.ADS_LOOP_ENABLED === "true",

        zernio: {
            apiKey: env.ZERNIO_API_KEY || "",
            baseUrl: (env.ZERNIO_BASE_URL || "https://zernio.com/api").replace(/\/+$/, ""),
            adsAccountId: env.ZERNIO_ADS_ACCOUNT_ID || "",
            adAccountId: env.ZERNIO_AD_ACCOUNT_ID || "",
            facebookAccountId: env.ZERNIO_FACEBOOK_ACCOUNT_ID || "",
            instagramAccountId: env.ZERNIO_INSTAGRAM_ACCOUNT_ID || "",
            // Three tries in total, then the error is posted to the thread.
            maxAttempts: 3,
            timeoutMs: 120000,
        },

        slack: {
            botToken: env.SLACK_BOT_TOKEN || "",
            signingSecret: env.SLACK_SIGNING_SECRET || "",
            creativeReviewChannel: env.SLACK_CREATIVE_REVIEW_CHANNEL_ID || "",
            adsWeeklyChannel: env.SLACK_ADS_WEEKLY_CHANNEL_ID || "",
            approverIds: list(env.SLACK_APPROVER_IDS),
        },

        guardrails: {
            dailySpendCeiling: num(env.ADS_LOOP_DAILY_SPEND_CEILING, 50),
            monthlySpendCeiling: num(env.ADS_LOOP_MONTHLY_SPEND_CEILING, 1000),
            // Budget changes: at most +/-20% per ad set, at most once every 3 days.
            maxBudgetChangePct: 20,
            budgetChangeCooldownDays: 3,
        },

        ads: {
            // Daily budget a launch proposal starts with (the approver sees it before "go").
            defaultDailyBudget: num(env.ADS_LOOP_DEFAULT_DAILY_BUDGET, 10),
            goal: env.ADS_LOOP_AD_GOAL || "traffic",
            campaignSlug: env.ADS_LOOP_CAMPAIGN_SLUG || "vihara-auctions",
            // Housing category: no age/gender/ZIP targeting; cities need a broad radius.
            cityRadiusMiles: Math.max(15, num(env.ADS_LOOP_CITY_RADIUS_MILES, 25)),
            pixelId: env.META_PIXEL_ID || "",
        },

        organic: {
            // Approved creatives are scheduled this many hours ahead.
            scheduleDelayHours: num(env.ADS_LOOP_ORGANIC_DELAY_HOURS, 2),
        },

        creative: {
            model: env.ADS_LOOP_MODEL || "claude-opus-5-5",
            // Rendered sizes per format (file names use the ratio: LT-0004_static_1x1.png).
            ratios: {
                "1x1": { width: 1080, height: 1080 },
                "4x5": { width: 1080, height: 1350 },
            },
            carouselRatio: "1x1",
            minCarouselCards: 2,
            maxCarouselCards: 10,
            // Vision critic: below this score the build gets one automatic revision.
            criticThreshold: num(env.ADS_LOOP_CRITIC_THRESHOLD, 7),
            cloudinaryFolder: env.ADS_LOOP_CLOUDINARY_FOLDER || "ads-loop",
            // LT-0001..LT-0003 already exist from the laptop pipeline, so new ids start after them.
            firstLtNumber: num(env.ADS_LOOP_FIRST_LT_NUMBER, 4),
        },

        // Meta reports days in the ad account's time zone.
        accountTimeZone: env.ADS_LOOP_ACCOUNT_TZ || "America/Los_Angeles",
        scheduleTimeZone: "Asia/Kolkata",
        schedules: {
            dailyPull: "0 6 * * *", // 06:00 IST
            heartbeat: "30 6 * * *", // after the pull
            weeklyList: "0 9 * * 1", // Monday 09:00 IST
        },
        // Alert when the last heartbeat is older than this.
        heartbeatMaxAgeHours: 26,
    };
}

/** What is missing for each part of the loop, for the health check and clear errors. */
function missingSettings(config = getAdsLoopConfig()) {
    const missing = [];
    if (!config.zernio.apiKey) missing.push("ZERNIO_API_KEY");
    if (!config.zernio.adsAccountId) missing.push("ZERNIO_ADS_ACCOUNT_ID");
    if (!config.zernio.adAccountId) missing.push("ZERNIO_AD_ACCOUNT_ID");
    if (!config.slack.botToken) missing.push("SLACK_BOT_TOKEN");
    if (!config.slack.signingSecret) missing.push("SLACK_SIGNING_SECRET");
    if (!config.slack.creativeReviewChannel) missing.push("SLACK_CREATIVE_REVIEW_CHANNEL_ID");
    if (!config.slack.adsWeeklyChannel) missing.push("SLACK_ADS_WEEKLY_CHANNEL_ID");
    if (!config.slack.approverIds.length) missing.push("SLACK_APPROVER_IDS");
    return missing;
}

module.exports = { getAdsLoopConfig, missingSettings };
