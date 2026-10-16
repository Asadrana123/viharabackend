// config/conversion/conversionConfig.js
//
// Settings for the sign-up doctor: every morning it finds landing pages that
// get visitors from Meta ads but few or no sign-ups, and has an AI agent dig
// into why (Meta, pixel / CAPI, Clarity, our database, the page in a real
// browser, the website code). It only reports; it never changes anything.
//
// Env:
//   SIGNUP_DOCTOR_ENABLED       "true" to run the daily diagnosis
//   CLARITY_API_TOKEN           Clarity → Settings → Data Export → Generate new API token
//   SLACK_SIGNUP_DOCTOR_CHANNEL_ID  Slack channel for reports (default: the repair channel)
//   SIGNUP_DOCTOR_MAX_COST_USD  most one page's investigation may cost (default 3)
//   SIGNUP_DOCTOR_MAX_PAGES     most pages investigated per day (default 5)
// Also uses: META_ADS_ACCESS_TOKEN, META_AD_ACCOUNT_ID, META_PIXEL_ID,
// ANTHROPIC_API_KEY, SLACK_BOT_TOKEN, REPAIR_GITHUB_TOKEN (read-only use).

const num = (value, fallback) => {
    const n = Number(value);
    return value !== undefined && value !== "" && Number.isFinite(n) ? n : fallback;
};

function getConversionConfig() {
    const env = process.env;
    return {
        enabled: env.SIGNUP_DOCTOR_ENABLED === "true",
        clarityToken: env.CLARITY_API_TOKEN || "",
        slackChannel: env.SLACK_SIGNUP_DOCTOR_CHANNEL_ID || env.SLACK_REPAIR_CHANNEL_ID || env.SLACK_ADS_WEEKLY_CHANNEL_ID || "",
        agent: {
            model: env.SIGNUP_DOCTOR_MODEL || "claude-opus-5-5",
            effort: env.SIGNUP_DOCTOR_EFFORT || "high",
            maxCostUsd: num(env.SIGNUP_DOCTOR_MAX_COST_USD, 3),
        },
        maxPagesPerDay: num(env.SIGNUP_DOCTOR_MAX_PAGES, 5),
        // Before the 08:30 repair checks and the 09:00 Meta Ads report.
        schedule: "45 7 * * *",
        scheduleTimeZone: "Asia/Kolkata",
        // Days of data a page is judged on (ending yesterday, ad account time zone).
        windowDays: 3,
        thresholds: {
            // A page needs at least this many landing page views (Meta) or Clarity
            // sessions in the window before its sign-up rate means anything.
            minVisits: 40,
            // Below this share of visits signing up, the page is investigated.
            minSignupRate: 0.03,
            // Ad spend in the window that alone makes zero sign-ups worth a look.
            minSpendForZero: 40,
        },
        cloudinaryFolder: "signup-doctor/screenshots",
    };
}

function missingConversionSettings(config = getConversionConfig()) {
    const missing = [];
    if (!process.env.META_ADS_ACCESS_TOKEN) missing.push("META_ADS_ACCESS_TOKEN");
    if (!process.env.META_AD_ACCOUNT_ID) missing.push("META_AD_ACCOUNT_ID");
    if (!process.env.ANTHROPIC_API_KEY) missing.push("ANTHROPIC_API_KEY");
    if (!process.env.SLACK_BOT_TOKEN) missing.push("SLACK_BOT_TOKEN");
    if (!config.slackChannel) missing.push("SLACK_SIGNUP_DOCTOR_CHANNEL_ID");
    // Optional: without these the agent works with less evidence.
    if (!config.clarityToken) missing.push("CLARITY_API_TOKEN (optional)");
    if (!process.env.REPAIR_GITHUB_TOKEN) missing.push("REPAIR_GITHUB_TOKEN (optional, for reading website code)");
    return missing;
}

module.exports = { getConversionConfig, missingConversionSettings };
