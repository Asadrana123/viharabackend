// config/repair/repairConfig.js
//
// Settings for the repair agent: daily checks that find broken technical
// things (Meta tracking, ad landing pages), and the AI that fixes them in the
// website or backend code. Every fix waits for an approver's Go in Slack.
//
// Env:
//   REPAIR_AGENT_ENABLED      "true" to run the daily checks
//   REPAIR_GITHUB_TOKEN       fine-grained token with Contents + Pull requests (read/write)
//                             and Deployments (read) on BOTH repos below
//   REPAIR_WEBSITE_REPO       "owner/name" (default Asadrana123/vihara-new-website)
//   REPAIR_BACKEND_REPO       "owner/name" (default Asadrana123/viharabackend)
//   SLACK_REPAIR_CHANNEL_ID   Slack channel for incidents (default: #ads-weekly's id)
//   REPAIR_SITE_URL           live site (default https://www.vihara.ai)
//   REPAIR_AGENT_MAX_COST_USD most one fix attempt may cost (default 5)
// Also uses: META_ADS_ACCESS_TOKEN, META_AD_ACCOUNT_ID, META_PIXEL_ID,
// ANTHROPIC_API_KEY, SLACK_BOT_TOKEN, SLACK_APPROVER_IDS.

const num = (value, fallback) => {
    const n = Number(value);
    return value !== undefined && value !== "" && Number.isFinite(n) ? n : fallback;
};

function getRepairConfig() {
    const env = process.env;
    return {
        enabled: env.REPAIR_AGENT_ENABLED === "true",
        githubToken: env.REPAIR_GITHUB_TOKEN || "",
        repos: {
            website: env.REPAIR_WEBSITE_REPO || "Asadrana123/vihara-new-website",
            backend: env.REPAIR_BACKEND_REPO || "Asadrana123/viharabackend",
        },
        baseBranch: "main",
        slackChannel: env.SLACK_REPAIR_CHANNEL_ID || env.SLACK_ADS_WEEKLY_CHANNEL_ID || "",
        siteUrl: (env.REPAIR_SITE_URL || "https://www.vihara.ai").replace(/\/+$/, ""),
        meta: {
            token: env.META_ADS_ACCESS_TOKEN || "",
            adAccountId: env.META_AD_ACCOUNT_ID || "",
            pixelId: env.META_PIXEL_ID || "",
        },
        agent: {
            model: env.REPAIR_AGENT_MODEL || "claude-opus-5-5",
            effort: env.REPAIR_AGENT_EFFORT || "high",
            maxCostUsd: num(env.REPAIR_AGENT_MAX_COST_USD, 5),
        },
        // Before the 09:00 IST Meta Ads report, so problems show up first.
        schedule: "30 8 * * *",
        scheduleTimeZone: "Asia/Kolkata",
        accountTimeZone: env.ADS_LOOP_ACCOUNT_TZ || "America/Los_Angeles",
        thresholds: {
            // Registrations with no Lead since Lead last fired, before it counts as broken.
            regsWithoutLead: 2,
            // Meta-ad sign-ups in our database over 3 days with zero registrations at Meta.
            signupsWithoutRegs: 3,
            // Link clicks over 3 days before the page view rate is judged.
            minClicksForDropoff: 30,
            // Below this share of link clicks reaching a page view, visitors are being lost.
            minPageViewRate: 0.35,
            // Slower than this to answer is reported as slow.
            slowPageMs: 8000,
        },
    };
}

/** Settings the checks / agent can't run without. */
function missingRepairSettings(config = getRepairConfig()) {
    const missing = [];
    if (!config.meta.token) missing.push("META_ADS_ACCESS_TOKEN");
    if (!config.meta.adAccountId) missing.push("META_AD_ACCOUNT_ID");
    if (!config.slackChannel) missing.push("SLACK_REPAIR_CHANNEL_ID");
    if (!process.env.SLACK_BOT_TOKEN) missing.push("SLACK_BOT_TOKEN");
    if (!config.githubToken) missing.push("REPAIR_GITHUB_TOKEN");
    if (!process.env.ANTHROPIC_API_KEY) missing.push("ANTHROPIC_API_KEY");
    return missing;
}

module.exports = { getRepairConfig, missingRepairSettings };
