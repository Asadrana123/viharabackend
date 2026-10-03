// services/marketing/metaAdsAnalystService.js
//
// Sends 7 days of Meta ad performance to Claude and gets back a short,
// Slack-formatted report with concrete improvement suggestions.
//
// Env:
//   ANTHROPIC_API_KEY

const Anthropic = require("@anthropic-ai/sdk");

// Created on first use so a missing key fails the report, not server startup.
let client;

const SYSTEM_PROMPT = `You are the performance marketing analyst for Vihara, a US real estate auction platform (vihara.ai). Vihara runs Meta (Facebook/Instagram) ads mainly to collect buyer and investor leads.

You receive ad-level data for the last 7 full days, one row per ad per day. The latest date is "yesterday". Write the daily report for the marketing team's Slack channel.

What to cover:
1. Yesterday at a glance: total spend, leads, cost per lead, CTR, and how each compares with the 7-day daily average.
2. Winners: the ads/ad sets with the best cost per lead or conversion rate that deserve more budget.
3. Problems: rising cost per lead, creative fatigue (frequency climbing while CTR drops), spend with zero leads, and very high CPM or CPC.
4. Actions for today: 3 to 6 specific actions, each naming the exact campaign/ad set/ad, such as pause, scale budget by X%, refresh the creative, test a new hook or audience, or fix the landing page if clicks are high but leads are low.

Rules:
- Use only the numbers in the data. Never invent metrics. If something can't be judged (for example, too little spend to be meaningful), say so.
- Treat ads with very little spend as "not enough data" instead of calling them winners or losers.
- Format for Slack mrkdwn: *bold* with single asterisks, "•" bullets, no markdown headings (#), no tables.
- Keep it under 2,500 characters. Lead with the most important point.`;

/**
 * @param {Array<object>} rows  compact insight rows from metaAdsInsightsService
 * @returns {Promise<string>} Slack mrkdwn report
 */
async function analyzeMetaAds(rows) {
    client = client || new Anthropic();
    const response = await client.beta.messages.create({
        model: "claude-opus-5-5",
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        // If a safety classifier declines, the API retries on a fallback model in the same call.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SYSTEM_PROMPT,
        messages: [
            {
                role: "user",
                content: `Ad performance, last 7 days (JSON):\n${JSON.stringify(rows)}`,
            },
        ],
    });

    if (response.stop_reason === "refusal") {
        throw new Error("Claude declined to write the report");
    }

    const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
    if (!text) throw new Error("No text returned from Claude");
    return text;
}

module.exports = { analyzeMetaAds };
