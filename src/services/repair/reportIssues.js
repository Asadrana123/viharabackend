// services/repair/reportIssues.js
//
// Reads the daily Meta Ads report and picks out its TECHNICAL action items:
// tracking / pixel events, landing pages that don't load, convert or redirect
// right, broken links or forms, ads that don't deliver because of a setup
// problem. Those become repair incidents. Budget, pause, scaling, creative and
// audience advice is not technical and is left to people.

const { claudeJson, textBlock } = require("../adsLoop/claudeJson");
const meta = require("./metaGraph");

const SYSTEM = `You read Vihara's daily Meta Ads report and list only the TECHNICAL problems in it: things that are broken, not decisions about marketing.

Technical (list these):
- tracking: pixel or Conversions API events missing, wrong, or not matching sign-ups
- landing pages: slow, not loading, redirecting wrongly, form not working, clicks that don't become page views, visitors who reach the page but can't sign up because something is broken
- broken links or wrong ad destinations
- an ad that isn't delivering or spending when it should, where the cause may be a setup problem

Not technical (never list these): budget changes, pausing or scaling ads, creative refreshes, new hooks, audiences, bids, "hold, don't scale", any performance judgement.

When the report suggests an "audit" or "check" of something technical, list it: the repair agent does the audit.

You are also given the incidents already open. If an item is the same problem as an open incident, set same_as to that incident's id instead of describing it as new. List in still_open the ids of open incidents of kind report_issue that today's report still mentions.

Write titles in short plain English (under 120 characters), naming the ad or page. topic is 2-5 lowercase words that identify the problem and stay the same from day to day (e.g. "lathrup village page dropoff").`;

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
                    ads: { type: "array", items: { type: "string" }, description: "Ad names involved, exactly as in the report" },
                    same_as: { type: "string", description: "Open incident id it duplicates, or empty" },
                },
                required: ["topic", "title", "report_says", "ads", "same_as"],
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

/**
 * @param {string} report  today's report text
 * @param {Array<{incidentId, key, kind, title}>} open  active incidents
 * @returns {Promise<{findings: Array, covers: Array<(key) => boolean>}>}
 */
async function issuesFromReport(report, open) {
    const openText = open.length
        ? open.map((i) => `${i.incidentId} [${i.kind}] ${i.title}`).join("\n")
        : "(none)";
    const answer = await claudeJson({
        system: SYSTEM,
        content: [textBlock(`Open incidents:\n${openText}\n\nToday's report:\n${report}`)],
        schema: SCHEMA,
        effort: "medium",
        maxTokens: 8000,
    });

    // The pages the named ads link to, so the agent can open them.
    const ads = await meta.activeAdsWithLinks().catch(() => []);
    const linksFor = (names) =>
        ads.filter((a) => names.some((n) => a.adName.trim().toLowerCase() === n.trim().toLowerCase())).flatMap((a) => a.links);

    const byId = new Map(open.map((i) => [i.incidentId, i]));
    const findings = [];
    for (const issue of answer.issues || []) {
        const dupe = byId.get(issue.same_as);
        // Already tracked by a check (e.g. the Lead check): that incident covers it.
        if (dupe && dupe.kind !== "report_issue") continue;
        findings.push({
            key: dupe ? dupe.key : `report:${slug(issue.topic)}`,
            kind: "report_issue",
            title: issue.title.slice(0, 200),
            evidence: {
                source: "the daily 9 AM Meta Ads report",
                reportSays: issue.report_says,
                ads: issue.ads,
                adLinks: [...new Set(linksFor(issue.ads))],
            },
        });
    }

    // Report incidents still mentioned stay open even if not listed as an issue today.
    const stillOpen = new Set((answer.still_open || []).map((id) => byId.get(id)?.key).filter(Boolean));
    return { findings, covers: [(key) => key.startsWith("report:") && !stillOpen.has(key)] };
}

module.exports = { issuesFromReport };
