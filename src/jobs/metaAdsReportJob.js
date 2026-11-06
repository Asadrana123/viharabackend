// jobs/metaAdsReportJob.js
//
// Daily Meta Ads report: pull the last 7 days of ad performance from Meta, have Claude
// write the full analysis, then post a SHORT version to Slack: key numbers computed in code,
// plus what worked, what didn't work and action items (metaAdsShortReport.js).
// The full analysis is not posted but still goes to the repair agent: it looks for technical
// problems in it and closes a report incident once the report stops mentioning it, so it must
// never be given the short version. If the short version fails, the full analysis is posted.
// Schedule: every day at 9:00 AM IST.
//
// Env:
//   SLACK_META_ADS_WEBHOOK_URL   Incoming Webhook for the ads report channel
//   (plus the Meta + Anthropic vars used by the two services)

const cron = require("node-cron");
const { fetchLast7DaysAdInsights } = require("../services/marketing/metaAdsInsightsService");
const { analyzeMetaAds } = require("../services/marketing/metaAdsAnalystService");
const { keyNumbers, keyNumbersLine, condenseMetaReport, buildShortMessage } = require("../services/marketing/metaAdsShortReport");
const { postToSlack } = require("../services/shared/slackService");
const { getRepairConfig } = require("../config/repair/repairConfig");
const { runReportIssues } = require("../services/repair/incidentService");

const SCHEDULE = "0 9 * * *";
const TIMEZONE = "Asia/Kolkata";

let isRunning = false;

/**
 * Builds the Slack text (short, or the full analysis if shortening fails) and the full analysis.
 * @param {Array<object>} rows  non-empty insight rows
 */
async function buildMetaAdsReport(rows) {
    const numbers = keyNumbers(rows);
    const yesterday = numbers.day;
    const report = await analyzeMetaAds(rows);
    const keyLine = keyNumbersLine(numbers);
    try {
        const short = await condenseMetaReport(report, keyLine);
        return { report, yesterday, short: true, text: buildShortMessage(yesterday, keyLine, short) };
    } catch (error) {
        console.warn("[metaAdsReport] Short report failed, posting the full analysis:", error.message);
        return { report, yesterday, short: false, text: `📊 *Meta Ads daily report — ${yesterday}*\n\n${report}` };
    }
}

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

        const { report, text, yesterday } = await buildMetaAdsReport(rows);
        await postToSlack(webhookUrl, { text });
        console.log(`[metaAdsReport] Posted report for ${yesterday} (${rows.length} rows).`);

        // The report's technical action items (tracking, landing pages, links) go to the repair agent.
        // It gets the FULL analysis (see the note at the top).
        if (getRepairConfig().enabled) {
            runReportIssues(report).catch((e) => console.error("[metaAdsReport] repair hand-off failed:", e.message));
        }
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

module.exports = { startMetaAdsReportJob, runMetaAdsReport, buildMetaAdsReport };
