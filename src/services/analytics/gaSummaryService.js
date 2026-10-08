// services/analytics/gaSummaryService.js
//
// Asks Claude for a short written summary of the daily website report. The numbers
// are already computed (gaReportFormatter.js), so the model only reads and describes
// them. The job posts the report without a summary if this call fails.
//
// Env:
//   ANTHROPIC_API_KEY

const Anthropic = require("@anthropic-ai/sdk");

// Created on first use so a missing key fails the report, not server startup.
let client;

const SYSTEM_PROMPT = `You write the summary at the top of Vihara's daily website report. Vihara is a US real estate auction platform (vihara.ai). The report is for the marketing and product team's Slack channel.

You receive the day's figures as JSON: traffic against the same weekday last week and a 7-day average, event counts, top pages, channels, and tracking checks.

Write 3 to 4 short bullet lines. Cover what moved most, which pages or channels drove it, and anything in "checks".

Rules:
- Use only numbers that appear in the data. Never calculate new percentages or invent figures.
- Do not guess causes (campaigns, outages, seasonality). Describe what changed, not why.
- Volumes are small. When a figure is below about 20, call the change too small to read and do not treat it as a trend.
- Events marked as having no comparison yet cannot be called up or down.
- Format for Slack mrkdwn: "•" bullets, *bold* with single asterisks, no headings, no tables.
- Plain words, no filler. Keep it under 700 characters.`;

/**
 * @param {object} model - the report model from buildReportModel
 * @returns {Promise<string>} Slack mrkdwn
 */
async function summarizeGaReport(model) {
    client = client || new Anthropic();
    const response = await client.messages.create({
        model: "claude-sonnet-5-5",
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `Website figures for ${model.day} (JSON):\n${JSON.stringify(model)}` }],
    });

    if (response.stop_reason === "refusal") throw new Error("Claude declined to write the summary");

    const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
    if (!text) throw new Error("No text returned from Claude");
    return text;
}

module.exports = { summarizeGaReport };
