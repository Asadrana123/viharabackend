// jobs/gaReportJob.js
//
// Daily website report: pull yesterday's numbers from Google Analytics 4, add a short
// Claude-written summary, and post it to Slack.
// Schedule: every day at 4:00 PM IST. Google says a day's data is usually ready by
// 3:30 PM in the property's time zone (India time), so an earlier run could report
// a day that is still being processed.
//
// Env:
//   SLACK_GA_REPORT_WEBHOOK_URL   Incoming Webhook for the report channel
//   (plus GA_PROPERTY_ID and GA_SERVICE_ACCOUNT_JSON for the GA4 service,
//    and ANTHROPIC_API_KEY for the summary)

const cron = require("node-cron");
const { fetchGaReportData } = require("../services/analytics/gaInsightsService");
const { buildReportModel, buildSlackMessage, messageToText } = require("../services/analytics/gaReportFormatter");
const { summarizeGaReport } = require("../services/analytics/gaSummaryService");
const { postToSlack } = require("../services/shared/slackService");
const { getRepairConfig } = require("../config/repair/repairConfig");
const { runGaReportIssues } = require("../services/repair/incidentService");

const SCHEDULE = "0 16 * * *";
const TIMEZONE = "Asia/Kolkata";

let isRunning = false;

/**
 * Builds the report message. A failed summary does not stop the report.
 * @param {string} [day] - "YYYY-MM-DD" in India time; defaults to yesterday
 */
async function buildGaReport(day) {
    const data = await fetchGaReportData(day);
    const model = buildReportModel(data);

    let summary = "";
    try {
        summary = await summarizeGaReport(model);
    } catch (error) {
        console.warn("[gaReport] Summary failed, posting numbers only:", error.message);
    }
    return { model, message: buildSlackMessage(model, summary) };
}

async function runGaReport() {
    if (isRunning) {
        console.warn("[gaReport] Previous run still in progress — skipping this one.");
        return;
    }
    const webhookUrl = process.env.SLACK_GA_REPORT_WEBHOOK_URL;
    if (!webhookUrl) {
        console.warn("[gaReport] SLACK_GA_REPORT_WEBHOOK_URL not set — skipping.");
        return;
    }

    isRunning = true;
    try {
        const { model, message } = await buildGaReport();
        await postToSlack(webhookUrl, message);
        console.log(`[gaReport] Posted report for ${model.day}.`);

        // The report's technical problems go to the repair agent, as the Meta report's do.
        if (getRepairConfig().enabled) {
            runGaReportIssues(messageToText(message)).catch((e) => console.error("[gaReport] repair hand-off failed:", e.message));
        }
    } catch (error) {
        const detail = error.details || error.message;
        console.error("[gaReport] Run failed:", detail);
        // Tell the channel so a missing report doesn't go unnoticed.
        await postToSlack(webhookUrl, { text: `Website report failed: ${detail}` }).catch(() => {});
    } finally {
        isRunning = false;
    }
}

function startGaReportJob() {
    cron.schedule(SCHEDULE, runGaReport, { timezone: TIMEZONE });
    console.log("[gaReport] Daily website report scheduled (4:00 PM IST).");
}

module.exports = { startGaReportJob, runGaReport, buildGaReport };
