// scripts/runGaReport.js
//
// Dry run of the daily website report: reads GA4, builds the report and PRINTS it.
// It never posts to Slack.
//
// USAGE (run from the backend project root, where your .env lives):
//   node src/scripts/runGaReport.js                  # yesterday, with the Claude summary
//   node src/scripts/runGaReport.js 2026-10-07       # a specific day (India time)
//   node src/scripts/runGaReport.js --no-summary     # skip the Claude call
//   node src/scripts/runGaReport.js --json           # also print the figures the summary reads

require("dotenv").config();
const { fetchGaReportData } = require("../services/analytics/gaInsightsService");
const { buildReportModel, buildSlackMessage, messageToText } = require("../services/analytics/gaReportFormatter");
const { summarizeGaReport } = require("../services/analytics/gaSummaryService");

const args = process.argv.slice(2);
const day = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

(async () => {
    const data = await fetchGaReportData(day);
    const model = buildReportModel(data);

    let summary = "";
    if (!args.includes("--no-summary")) {
        try {
            summary = await summarizeGaReport(model);
        } catch (error) {
            console.warn("Summary failed, printing numbers only:", error.message);
        }
    }

    console.log(messageToText(buildSlackMessage(model, summary)));
    if (args.includes("--json")) console.log("\n--- figures ---\n" + JSON.stringify(model, null, 2));
})().catch((error) => {
    console.error("Report failed:", error.details || error.message);
    process.exit(1);
});
