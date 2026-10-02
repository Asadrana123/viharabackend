// jobs/metaAdsReportJob.js
//
// Daily Meta Ads report: pull the last 7 days of ad performance from Meta,
// have Claude analyse it, and post the summary + suggested actions to Slack.
// Schedule: every day at 9:00 AM IST.
//
// Env:
//   SLACK_META_ADS_WEBHOOK_URL   Incoming Webhook for the ads report channel
//   (plus the Meta + Anthropic vars used by the two services)

const cron = require("node-cron");
const { fetchLast7DaysAdInsights } = require("../services/marketing/metaAdsInsightsService");
const { analyzeMetaAds } = require("../services/marketing/metaAdsAnalystService");
const { postToSlack } = require("../services/shared/slackService");

const SCHEDULE = "0 9 * * *";
const TIMEZONE = "Asia/Kolkata";

let isRunning = false;

async function runMetaAdsReport() {
    if (isRunning) {
        console.warn("[metaAdsReport] Previous run still in progress — skipping this one.");
        return;
    }
    const webhookUrl = process.env.SLACK_META_ADS_WEBHOOK_URL;
    if (!webhookUrl) {
        console.warn("[metaAdsReport] SLACK_META_ADS_WEBHOOK_URL not set — skipping.");
        return;
    }

    isRunning = true;
    try {
        const rows = await fetchLast7DaysAdInsights();
        if (!rows.length) {
            await postToSlack(webhookUrl, { text: "📊 *Meta Ads daily report*\nNo ad delivery in the last 7 days." });
            return;
        }

        const yesterday = rows[rows.length - 1].date;
        const report = await analyzeMetaAds(rows);
        await postToSlack(webhookUrl, { text: `📊 *Meta Ads daily report — ${yesterday}*\n\n${report}` });
        console.log(`[metaAdsReport] Posted report for ${yesterday} (${rows.length} rows).`);
    } catch (error) {
        const detail = error.response?.data?.error?.message || error.message;
        console.error("[metaAdsReport] Run failed:", detail);
        // Tell the channel so a missing report doesn't go unnoticed.
        await postToSlack(webhookUrl, { text: `⚠️ Meta Ads daily report failed: ${detail}` }).catch(() => {});
    } finally {
        isRunning = false;
    }
}

function startMetaAdsReportJob() {
    cron.schedule(SCHEDULE, runMetaAdsReport, { timezone: TIMEZONE });
    console.log("[metaAdsReport] Daily Meta Ads report scheduled (9:00 AM IST).");
}

module.exports = { startMetaAdsReportJob, runMetaAdsReport };
