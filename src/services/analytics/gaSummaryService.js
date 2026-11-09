// services/analytics/gaSummaryService.js
//
// Asks Claude to write the daily website report that goes to Slack: a headline, what worked,
// what didn't work, and action items. The numbers are already computed (gaReportFormatter.js),
// so the model only reads and describes them.
//
// Every figure in the written text is checked against the data it was given. A draft with a
// figure that is not in the data gets one retry, and then the job posts the numbers without it.
//
// Env:
//   ANTHROPIC_API_KEY
//   GA_SUMMARY_MODEL  optional, default claude-sonnet-5-5

const Anthropic = require("@anthropic-ai/sdk");
const { trackAnthropic } = require("../usage/spendRecorder");
const { buildSummaryFacts } = require("./gaReportFormatter");

// Created on first use so a missing key fails the report, not server startup.
let client;

const MODEL = (process.env.GA_SUMMARY_MODEL || "").trim() || "claude-sonnet-5-5";
const MAX_ATTEMPTS = 2;

const SYSTEM_PROMPT = `You write Vihara's daily website report for Slack. Vihara is a US real estate auction platform (vihara.ai). The marketing and product team reads it at a glance, so it must be short. There are no tables under your text: readers see one line of key numbers (visitors, sessions, engagement, sign-ups) above it, then your text, then a link to the dashboard.

You receive yesterday's figures as JSON: traffic against the same weekday last week and the previous 7-day average, event counts, pages, landing pages, channels, sources, campaigns (yesterday and last 7 days, with sign-ups), and tracking checks. There is no ad spend in this data. Spend lives in the Meta Ads report.

Write these parts, in this order, in Slack mrkdwn:

1. A headline of one sentence: what moved most yesterday and what drove it. Do not repeat the visitors, sessions, engagement or sign-up figures from the key numbers line; name the driver instead.
2. *What worked* with 1 to 3 "•" bullets: pages, landing pages, channels or campaigns doing well, with the figure that shows it. Leave the part out if nothing qualifies.
3. *What didn't work* with 1 to 3 "•" bullets: traffic that arrives and does nothing (high sessions, very low engagement), a channel or campaign that dropped, tracking gaps, anything in the tracking checks. Leave the part out if nothing qualifies.
4. *Action items* with 1 to 3 numbered lines ("1.", "2."). Each names the thing to check or change and the figure that justifies it.

Rules:
- Each bullet is one short line. Keep the whole text under 900 characters.
- Use only figures that appear in the data, written the way the data writes them. Do not calculate new numbers, new percentages or new budgets. An action must not contain a figure that is not in the data.
- Do not state causes you cannot see. Say what changed, and when the reason is unknown write "unclear whether ...", like "unclear whether this was intended".
- Volumes are small. A count below about 20 is too small to read: do not call it a trend, and leave it out unless it is a tracking problem. Events marked as having no comparison cannot be called up or down.
- Campaign names that start with "Campaign ID" mean the ad link sent an ID where a name should be. Mention it once, in What didn't work or an action item, and never list those rows under What worked.
- Actions come from this data only: pages, landing pages, channels, campaigns, tracking and sign-ups. Do not give advice about ad spend, bids or budgets, because there is no spend here. For campaign advice, say to check it in Ads Manager.
- Only report what the data shows. A missing breakdown, an unset custom dimension or a feature that is not set up is a setup gap, not a problem. Never list it under What didn't work or Action items.
- A problem needs a figure that is wrong or worse than usual. Do not list a page or channel as a problem only because it is the biggest or has a low figure with no comparison.
- Format: "•" bullets, *bold* with single asterisks, no headings with #, no tables, no emojis, no em dashes.
- Plain words, no filler.`;

const NUMBER = /\d+(?:,\d{3})*(?:\.\d+)?/g;

const numbersIn = (text) => (String(text).match(NUMBER) || []).map((t) => parseFloat(t.replace(/,/g, "")));

/** Numbers that may appear in the text without being in the data: "7-day", and the 1., 2. of the action list. */
function writtenNumbers(text) {
    const cleaned = String(text)
        .replace(/^\s*\d+\.\s/gm, "") // numbered list markers
        .replace(/\b7-day\b/gi, "");
    return numbersIn(cleaned);
}

/** Figures in the text that are not in the data. Empty means every figure checks out. */
function figuresNotInData(text, facts) {
    const allowed = new Set(numbersIn(JSON.stringify(facts)));
    return [...new Set(writtenNumbers(text).filter((n) => !allowed.has(n)))];
}

async function askClaude(facts, retryNote) {
    client = client || trackAnthropic(new Anthropic(), "ga-report");
    const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `Website figures for ${facts.day} (JSON):\n${JSON.stringify(facts)}${retryNote}` }],
    });

    if (response.stop_reason === "refusal") throw new Error("Claude declined to write the summary");
    if (response.stop_reason === "max_tokens") throw new Error("Claude's summary was cut off");

    const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
    if (!text) throw new Error("No text returned from Claude");
    return text;
}

/**
 * @param {object} model - the report model from buildReportModel
 * @returns {Promise<string>} Slack mrkdwn
 */
async function summarizeGaReport(model) {
    const facts = buildSummaryFacts(model);
    let retryNote = "";
    let unknown = [];
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const text = await askClaude(facts, retryNote);
        unknown = figuresNotInData(text, facts);
        if (!unknown.length) return text;
        console.warn(`[gaReport] Summary attempt ${attempt} used figures not in the data: ${unknown.join(", ")}`);
        retryNote = `\n\nYour previous draft used figures that are not in the data: ${unknown.join(", ")}. Write it again using only figures from the data.`;
    }
    throw new Error(`Summary kept using figures that are not in the data: ${unknown.join(", ")}`);
}

module.exports = { summarizeGaReport, figuresNotInData };
