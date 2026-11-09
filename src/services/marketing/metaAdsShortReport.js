// services/marketing/metaAdsShortReport.js
//
// The short Meta Ads report that goes to Slack.
//
//   1. keyNumbers(): yesterday's spend, form leads, website leads, cost per lead and CTR against the
//      7-day daily average (all 7 days, yesterday included), computed in code so these figures are
//      always right. The analyst uses the same definition, so both write the same averages.
//   2. condenseMetaReport(): Claude (Sonnet) cuts the full analysis (metaAdsAnalystService.js) down to
//      a headline, What worked, What didn't work and Action items. Every figure in the short text must
//      appear in the full analysis or the numbers line; a draft that fails gets one retry.
//
// The full analysis is not posted. It still goes to the repair agent, which looks for technical
// problems in it and closes a report incident once the report stops mentioning it, so it must never be
// given the short version.
//
// Env:
//   ANTHROPIC_API_KEY
//   META_ADS_SUMMARY_MODEL  optional, default claude-sonnet-5-5

const Anthropic = require("@anthropic-ai/sdk");
const { trackAnthropic } = require("../usage/spendRecorder");
const { figuresNotInData } = require("../analytics/gaSummaryService");

let client;

const MODEL = (process.env.META_ADS_SUMMARY_MODEL || "").trim() || "claude-sonnet-5-5";
const MAX_ATTEMPTS = 2;

// Meta's "lead" action is the total of these two: instant form leads and website (pixel) leads.
const FORM_LEAD = "onsite_conversion.lead_grouped";
const SITE_LEAD = "offsite_conversion.fb_pixel_lead";

const sum = (list) => list.reduce((a, b) => a + b, 0);
const money = (n) => `$${n.toFixed(2)}`;

function totalsFor(rows) {
    const act = (r, key) => (r.actions && r.actions[key]) || 0;
    const spend = sum(rows.map((r) => r.spend || 0));
    const impressions = sum(rows.map((r) => r.impressions || 0));
    const clicks = sum(rows.map((r) => r.clicks || 0));
    const formLeads = sum(rows.map((r) => act(r, FORM_LEAD)));
    const siteLeads = sum(rows.map((r) => act(r, SITE_LEAD)));
    const leads = sum(rows.map((r) => act(r, "lead")));
    return { spend, impressions, clicks, formLeads, siteLeads, leads };
}

/**
 * Pure. Yesterday (the latest date in the rows) against the daily average of every day in the rows,
 * yesterday included. Cost per lead and CTR are 7-day totals divided, not averages of daily ratios.
 * @param {Array<object>} rows  compact insight rows from metaAdsInsightsService
 */
function keyNumbers(rows) {
    const dates = [...new Set(rows.map((r) => r.date))].sort();
    const day = dates[dates.length - 1];
    const today = totalsFor(rows.filter((r) => r.date === day));
    const prior = totalsFor(rows);
    // A single day has nothing to compare with.
    const n = dates.length > 1 ? dates.length : 0;
    return {
        day,
        days: n,
        today: {
            ...today,
            costPerLead: today.leads ? today.spend / today.leads : null,
            ctr: today.impressions ? (today.clicks / today.impressions) * 100 : null,
        },
        avg: n
            ? {
                  spend: prior.spend / n,
                  formLeads: prior.formLeads / n,
                  siteLeads: prior.siteLeads / n,
                  // Weighted over the whole period, so a quiet day does not count as much as a busy one.
                  costPerLead: prior.leads ? prior.spend / prior.leads : null,
                  ctr: prior.impressions ? (prior.clicks / prior.impressions) * 100 : null,
              }
            : null,
    };
}

/** One line of key numbers for the top of the post. */
function keyNumbersLine(k) {
    const t = k.today;
    const a = k.avg;
    const was = (text) => (a ? ` (avg ${text})` : "");
    const parts = [
        `Spend *${money(t.spend)}*${a ? was(money(a.spend)) : ""}`,
        `form leads *${t.formLeads}*${a ? was(a.formLeads.toFixed(1)) : ""}`,
        `website leads *${t.siteLeads}*${a ? was(a.siteLeads.toFixed(1)) : ""}`,
        `cost per lead *${t.costPerLead === null ? "no leads" : money(t.costPerLead)}*${a && a.costPerLead !== null ? was(money(a.costPerLead)) : ""}`,
        `CTR *${t.ctr === null ? "n/a" : `${t.ctr.toFixed(2)}%`}*${a && a.ctr !== null ? was(`${a.ctr.toFixed(2)}%`) : ""}`,
    ];
    const note = a ? `\n_Avg is the daily average of the last ${k.days} days, yesterday included._` : "";
    return parts.join(", ") + note;
}

const SYSTEM_PROMPT = `You shorten Vihara's daily Meta Ads report for Slack. Vihara is a US real estate auction platform (vihara.ai) that runs Meta ads to collect buyer and investor leads. The marketing team reads it at a glance. You get the full analysis written by an analyst and a line of key numbers that is posted above your text.

Write these parts, in this order, in Slack mrkdwn:

1. A headline of one sentence: the most important thing about yesterday. Do not repeat the figures from the key numbers line; name what drove them.
2. *What worked* with 1 to 3 "•" bullets: the ads, ad sets or campaigns doing well, with the figure that shows it. Leave the part out if nothing qualifies.
3. *What didn't work* with 1 to 3 "•" bullets: the biggest problems (rising cost per lead, spend with no leads, fatigue, tracking or landing page faults). Leave the part out if nothing qualifies.
4. *Action items* with 1 to 3 numbered lines ("1.", "2."): the most important actions from the analysis, each naming the exact campaign, ad set or ad.

Rules:
- Use only what the analysis says. Do not add advice, causes or judgements it does not make.
- Use only figures that appear in the analysis or the key numbers line, written the same way. Do not calculate new numbers.
- Keep names of campaigns, ad sets and ads exactly as written in the analysis.
- If the analysis says something has too little spend to judge, do not list it as working or not working.
- Each bullet is one short line. Keep the whole text under 900 characters.
- Format: "•" bullets, *bold* with single asterisks, no headings with #, no tables, no emojis, no em dashes. Plain words, no filler.`;

async function askClaude(fullReport, keyLine, retryNote) {
    client = client || trackAnthropic(new Anthropic(), "meta-ads-report");
    const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [
            {
                role: "user",
                content: `Key numbers line:\n${keyLine}\n\nFull analysis:\n${fullReport}${retryNote}`,
            },
        ],
    });
    if (response.stop_reason === "refusal") throw new Error("Claude declined to write the short report");
    if (response.stop_reason === "max_tokens") throw new Error("Claude's short report was cut off");
    const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
    if (!text) throw new Error("No text returned from Claude");
    return text;
}

/**
 * @param {string} fullReport  the analyst's full report
 * @param {string} keyLine  keyNumbersLine() output
 * @returns {Promise<string>} Slack mrkdwn
 */
async function condenseMetaReport(fullReport, keyLine) {
    const source = `${fullReport}\n${keyLine}`;
    let retryNote = "";
    let unknown = [];
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const text = await askClaude(fullReport, keyLine, retryNote);
        unknown = figuresNotInData(text, source);
        if (!unknown.length) return text;
        console.warn(`[metaAdsReport] Short report attempt ${attempt} used figures not in the analysis: ${unknown.join(", ")}`);
        retryNote = `\n\nYour previous draft used figures that are not in the analysis: ${unknown.join(", ")}. Write it again using only figures from the analysis or the key numbers line.`;
    }
    throw new Error(`Short report kept using figures not in the analysis: ${unknown.join(", ")}`);
}

/** The Slack text: header, key numbers, the short report, and where the detail lives. */
function buildShortMessage(day, keyLine, shortText) {
    return `📊 *Meta Ads daily report, ${day}*\n\n${keyLine}\n\n${shortText}\n\n_Per-ad numbers are in Meta Ads Manager._`;
}

module.exports = { keyNumbers, keyNumbersLine, condenseMetaReport, buildShortMessage, FORM_LEAD, SITE_LEAD };
