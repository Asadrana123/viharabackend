// services/repair/gaReportIssues.js
//
// Reads the daily website (Google Analytics) report and picks out its TECHNICAL
// problems: tracking that looks broken, event parameters the site never sends,
// pages that get visits but look broken. Those become repair incidents.
// Marketing advice, content ideas and "too small to read" notes are left to people.
//
// The fixed rules in gaChecks.js already cover a few cases (no sessions, an event at 0 on two
// days, an unfilled custom dimension, campaign IDs). This catches what the rules don't.

const { claudeJson, textBlock } = require("../adsLoop/claudeJson");

// New incidents one report may open. Each one starts a paid investigation.
const MAX_NEW_PER_REPORT = 3;

const SYSTEM = `You read Vihara's daily website report (Google Analytics 4) and list only the TECHNICAL problems in it: things that look broken, not decisions about marketing or content.

Technical (list these):
- tracking that looks broken: an event that fires far less than it should for the traffic, or not at all, a count that does not match what the page shows
- an event parameter the site seems not to send (a breakdown that is all "(not set)" although events happened)
- a page that gets visits but looks broken: almost no engagement time with real traffic, visits that never reach the next step
- pages or links that go to the wrong place, or a landing page that is empty or "(not set)" for real traffic

Not technical (never list these): which channel to push, budget or bid advice, new content ideas, copy changes, "traffic is up or down" without a sign of breakage, any performance judgement.

Only list an item when the numbers are big enough to mean something: at least 20 sessions for a page or channel, and for an event only when its 7-day average was at least 5 a day and it dropped to 0 or close to it. An event that always had a tiny average (for example email_agent at 0.0) is not broken. Never list the custom breakdowns "Sign-ups by form" or "Property views by page type" being partly "(not set)": those fill in slowly and a separate check watches them.

Never list a setup gap. If the report says a breakdown is missing because it is not set up yet or has too little data, that is not a fault. Never list a number the report calls too small to read.

You are also given the incidents already open. If an item is the same problem as an open incident, set same_as to that incident's id instead of describing it as new. List in still_open the ids of open incidents whose key starts with "ga_report:" that today's report still mentions.

Use only what the report says. Do not invent a cause. Write titles in short plain English (under 120 characters), naming the page or event. topic is 2-5 lowercase words that identify the problem and stay the same from day to day (for example "sign up event missing").`;

const SCHEMA = {
    type: "object",
    properties: {
        issues: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    topic: { type: "string" },
                    title: { type: "string" },
                    report_says: { type: "string", description: "What the report says about it, with its numbers" },
                    pages_or_events: { type: "array", items: { type: "string" }, description: "Pages or event names involved, exactly as in the report" },
                    same_as: { type: "string", description: "Open incident id it duplicates, or empty" },
                },
                required: ["topic", "title", "report_says", "pages_or_events", "same_as"],
                additionalProperties: false,
            },
        },
        still_open: { type: "array", items: { type: "string" } },
    },
    required: ["issues", "still_open"],
    additionalProperties: false,
};

const slug = (text) =>
    String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "issue";

const isReportKey = (key) => key.startsWith("ga_report:");

/**
 * Pure: turns Claude's answer into findings.
 * @param {{issues: Array, still_open: Array<string>}} answer
 * @param {Array<{incidentId, key, kind, title}>} open  active incidents
 * @returns {{findings: Array, covers: Array<(key) => boolean>}}
 */
function findingsFromAnswer(answer, open) {
    const byId = new Map(open.map((i) => [i.incidentId, i]));
    const findings = [];
    const seen = new Set();
    let added = 0;
    for (const issue of answer.issues || []) {
        const dupe = byId.get(issue.same_as);
        // Already tracked by a check or the Meta report: that incident covers it.
        if (dupe && !isReportKey(dupe.key)) continue;
        const key = dupe ? dupe.key : `ga_report:${slug(issue.topic)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // Known incidents are refreshed; only brand new ones are capped.
        const isNew = !open.some((i) => i.key === key);
        if (isNew && added >= MAX_NEW_PER_REPORT) continue;
        if (isNew) added += 1;
        findings.push({
            key,
            kind: "ga_issue",
            title: issue.title.slice(0, 200),
            evidence: {
                source: "the daily 4 PM website report (Google Analytics)",
                reportSays: issue.report_says,
                pagesOrEvents: issue.pages_or_events,
            },
        });
    }

    // Report incidents still mentioned stay open even if not listed as an issue today.
    const stillOpen = new Set((answer.still_open || []).map((id) => byId.get(id)?.key).filter(Boolean));
    return { findings, covers: [(key) => isReportKey(key) && !stillOpen.has(key)] };
}

/**
 * @param {string} report  today's report as plain text
 * @param {Array<{incidentId, key, kind, title}>} open  active incidents
 */
async function issuesFromGaReport(report, open) {
    const openText = open.length ? open.map((i) => `${i.incidentId} [${i.key}] ${i.title}`).join("\n") : "(none)";
    const answer = await claudeJson({
        system: SYSTEM,
        content: [textBlock(`Open incidents:\n${openText}\n\nToday's report:\n${report}`)],
        schema: SCHEMA,
        effort: "medium",
        maxTokens: 8000,
    });
    return findingsFromAnswer(answer, open);
}

module.exports = { issuesFromGaReport, findingsFromAnswer, MAX_NEW_PER_REPORT };
