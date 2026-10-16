// services/adsLoop/learningStore.js
//
// The learning store that the planning and build steps read every time:
//   - design rules: suggestions queued for the Creative OS repo (its rules/ and
//     learning/ are the source of truth); recorded ones are shown to Claude
//   - the example library: labelled creatives sent to Claude as images
//
// "Training" here means putting rules, labelled examples and scores into
// Claude's context; no model is fine-tuned. Every lesson stays readable and
// editable.

const DesignRule = require("../../model/adsLoop/designRuleModel");
const CreativeExample = require("../../model/adsLoop/creativeExampleModel");
const { RULE_STATUS } = require("../../model/adsLoop/designRuleModel");
const { ATTRIBUTE_KEYS } = require("../../config/adsLoop/attributeTags");

const MAX_RULE_CHARS = 300;

// ---------------------------------------------------------------------------
// Design rules
// ---------------------------------------------------------------------------
// The Creative OS repo (rules/, learning/) is the source of truth. Here a
// rule is only a suggestion until a person records it there; see
// model/adsLoop/designRuleModel.js for the statuses.
const day = (d) => new Date(d).toISOString().slice(0, 10);

const formatRule = (r) => `- ${r.text} (${r.source}, ${day(r.recordedAt || r.endorsedAt || r.createdAt)})`;

/** Rules recorded in the Creative OS: the only ones the interim builder follows. */
async function activeRules() {
    return DesignRule.find({ status: RULE_STATUS.RECORDED }).sort({ recordedAt: 1, createdAt: 1 }).lean();
}

/** The recorded rules as lines for Claude's context. */
async function activeRulesText() {
    const rules = await activeRules();
    return rules.length ? rules.map(formatRule).join("\n") : "(no design rules yet)";
}

/** Recorded rules plus the queue waiting for the Creative OS. */
async function designRulesMarkdown() {
    const [recorded, queue] = await Promise.all([activeRules(), endorsedQueue()]);
    return [
        "# Design rules (ads loop copy)",
        "",
        "The source of truth is the Creative OS repo (rules/ and learning/).",
        "",
        "## Recorded in the Creative OS",
        ...(recorded.length ? recorded.map((r) => `${formatRule(r)}${r.recordedAs ? ` → ${r.recordedAs}` : ""}`) : ["(none yet)"]),
        "",
        "## Waiting to be recorded (endorsed with ✅ in Slack)",
        ...(queue.length ? queue.map((r) => `${formatRule(r)} [id ${r._id}]`) : ["(none)"]),
        "",
    ].join("\n");
}

async function endorsedQueue() {
    return DesignRule.find({ status: RULE_STATUS.ENDORSED }).sort({ endorsedAt: 1 }).lean();
}

/**
 * The queue for the Creative OS team: each endorsed rule with where it came
 * from, so a person can record it as a decision in the repo.
 */
async function endorsedQueueMarkdown() {
    const queue = await endorsedQueue();
    return [
        "# Design rule suggestions for the Creative OS",
        "",
        "Endorsed with ✅ in Slack by an approver. Record each one as a decision in rules/ or learning/",
        "(or drop it), then mark it recorded: POST /api/v1/ads-loop/design-rules/<id>/recorded { recordedAs }.",
        "",
        ...(queue.length
            ? queue.flatMap((r) => [
                  `## ${r.text}`,
                  `- id: ${r._id}`,
                  `- source: ${r.source}`,
                  `- endorsed: ${day(r.endorsedAt)} by Slack user ${r.endorsedBy}`,
                  r.slackTs ? `- Slack message: ${r.slackChannel} / ${r.slackTs}` : "",
                  "",
              ])
            : ["(nothing waiting)"]),
        "",
    ]
        .filter((line, i, all) => line !== "" || all[i - 1] !== "")
        .join("\n");
}

/** A proposed rule, before it is posted to Slack. */
async function proposeRule({ text, source }) {
    const clean = String(text || "").trim().slice(0, MAX_RULE_CHARS);
    if (!clean) return null;
    return DesignRule.create({ text: clean, source, status: RULE_STATUS.PROPOSED });
}

/** ✅ on the rule's Slack message by an approver: queue it for the Creative OS. */
async function endorseRuleByMessage({ channel, ts, userId }) {
    return DesignRule.findOneAndUpdate(
        { slackChannel: channel, slackTs: ts, status: RULE_STATUS.PROPOSED },
        { $set: { status: RULE_STATUS.ENDORSED, endorsedBy: userId, endorsedAt: new Date() } },
        { new: true }
    ).lean();
}

/** A person recorded the rule as a decision in the Creative OS repo. */
async function markRuleRecorded(ruleId, { userId = "", recordedAs = "" } = {}) {
    return DesignRule.findOneAndUpdate(
        { _id: ruleId, status: { $in: [RULE_STATUS.PROPOSED, RULE_STATUS.ENDORSED] } },
        { $set: { status: RULE_STATUS.RECORDED, recordedBy: userId, recordedAt: new Date(), recordedAs: String(recordedAs || "").slice(0, 300) } },
        { new: true }
    ).lean();
}

async function removeRule(ruleId, userId) {
    return DesignRule.findOneAndUpdate(
        { _id: ruleId, status: { $ne: RULE_STATUS.REMOVED } },
        { $set: { status: RULE_STATUS.REMOVED, removedBy: userId, removedAt: new Date() } },
        { new: true }
    ).lean();
}

// ---------------------------------------------------------------------------
// Example library
// ---------------------------------------------------------------------------
/** Add or relabel one creative in the library. */
async function addExample({ coreId, label, attributes, why = "", imageUrl, ctr = null, qualifiedLeads = null, costPerQualifiedLead = null, addedBy = "" }) {
    if (!imageUrl) return null;
    if (!coreId) return CreativeExample.create({ label, attributes, why, imageUrl, addedBy });
    return CreativeExample.findOneAndUpdate(
        { coreId, label },
        { $set: { attributes, why, imageUrl, ctr, qualifiedLeads, costPerQualifiedLead, addedBy } },
        { upsert: true, new: true }
    ).lean();
}

const overlap = (a = {}, b = {}) => ATTRIBUTE_KEYS.reduce((n, k) => n + (a[k] && a[k] === b[k] ? 1 : 0), 0);

function bestMatches(examples, attributes, count) {
    return examples
        .map((e) => ({ e, score: overlap(e.attributes, attributes) }))
        .sort((x, y) => y.score - x.score || new Date(y.e.createdAt) - new Date(x.e.createdAt))
        .slice(0, count)
        .map((x) => x.e);
}

/**
 * 3-5 library images for a planned creative: up to 2 winners, 1 rejected
 * (with its reason), then approved / reference examples to fill up.
 */
async function pickExamples(attributes, { max = 5 } = {}) {
    const all = await CreativeExample.find({}).sort({ createdAt: -1 }).limit(300).lean();
    const by = (label) => all.filter((e) => e.label === label);

    const picked = [...bestMatches(by("winner"), attributes, 2), ...bestMatches(by("rejected"), attributes, 1)];
    const fill = bestMatches([...by("approved"), ...by("reference")], attributes, max);
    for (const e of fill) {
        if (picked.length >= max) break;
        if (!picked.some((p) => String(p._id) === String(e._id))) picked.push(e);
    }
    return picked;
}

/** One line per example, shown to Claude next to its image. */
function describeExample(e) {
    const attrs = ATTRIBUTE_KEYS.filter((k) => e.attributes?.[k]).map((k) => `${k}=${e.attributes[k]}`).join(", ");
    const stats = [e.ctr != null ? `CTR ${e.ctr}%` : "", e.qualifiedLeads != null ? `${e.qualifiedLeads} qualified leads` : ""]
        .filter(Boolean)
        .join(", ");
    const note = e.label === "reference" ? " (outside ad: learn from it, never copy it)" : "";
    return `${e.label.toUpperCase()}${e.coreId ? ` ${e.coreId}` : ""}${note}: ${attrs || "no tags"}${stats ? `; ${stats}` : ""}. Why: ${e.why || "not given"}`;
}

module.exports = {
    activeRules,
    activeRulesText,
    designRulesMarkdown,
    proposeRule,
    endorsedQueueMarkdown,
    endorseRuleByMessage,
    markRuleRecorded,
    removeRule,
    addExample,
    pickExamples,
    describeExample,
};
