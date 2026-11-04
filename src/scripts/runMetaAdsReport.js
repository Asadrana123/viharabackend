// scripts/runMetaAdsReport.js
//
// Dry run of the daily Meta Ads report: reads Meta, writes the full analysis and the short
// Slack version, and PRINTS them. It never posts to Slack and never calls the repair agent.
// Costs one Opus call (the analysis) and one Sonnet call (the short version).
//
// USAGE (run from the backend project root, where your .env lives):
//   node src/scripts/runMetaAdsReport.js          # the Slack post
//   node src/scripts/runMetaAdsReport.js --full   # also the full analysis the repair agent reads

require("dotenv").config();
const { fetchLast7DaysAdInsights } = require("../services/marketing/metaAdsInsightsService");
const { buildMetaAdsReport } = require("../jobs/metaAdsReportJob");

(async () => {
    const rows = await fetchLast7DaysAdInsights();
    if (!rows.length) return console.log("No ad delivery in the last 7 days.");
    const { report, text, short } = await buildMetaAdsReport(rows);
    console.log(`--- Slack post (${short ? "short" : "FULL, the short version failed"}, ${text.length} characters) ---\n${text}`);
    if (process.argv.includes("--full")) console.log(`\n--- Full analysis (repair agent, ${report.length} characters) ---\n${report}`);
})().catch((error) => {
    console.error("Report failed:", error.response?.data?.error?.message || error.message);
    process.exit(1);
});
