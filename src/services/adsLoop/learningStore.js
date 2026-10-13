// services/adsLoop/learningStore.js
//
// The learning store that the planning and build steps read every time:
//   - design rules (design-rules.md): short, testable rules with a source and date
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
const day = (d) => new Date(d).toISOString().slice(0, 10);

const formatRule = (r) => `- ${r.text} (${r.source}, ${day(r.acceptedAt || r.createdAt)})`;

async function activeRules() {
    return DesignRule.find({ status: RULE_STATUS.ACTIVE }).sort({ acceptedAt: 1, createdAt: 1 }).lean();
}

/** The active rules as the lines of design-rules.md. */
async function activeRulesText() {
    const rules = await activeRules();
    return rules.length ? rules.map(formatRule).join("\n") : "(no design rules yet)";
}

async function designRulesMarkdown() {
    const rules = await activeRules();
    return [
        "# Design rules",
        "",
        "Short, testable rules for Vihara ad creatives. Each has its source and date.",
        "Added when a person reacts ✅ to a rule Claude proposed in Slack; removed by a person.",
        "",
        ...(rules.length ? rules.map(formatRule) : ["(none yet)"]),
        "",
    ].join("\n");
}

/** A proposed rule, before it is posted to Slack. */
async function proposeRule({ text, source }) {
    const clean = String(text || "").trim().slice(0, MAX_RULE_CHARS);
    if (!clean) return null;
    return DesignRule.create({ text: clean, source, status: RULE_STATUS.PROPOSED });
}

/** ✅ on the rule's Slack message by an approver. Returns the rule when it changed. */
async function acceptRuleByMessage({ channel, ts, userId }) {
    return DesignRule.findOneAndUpdate(
        { slackChannel: channel, slackTs: ts, status: RULE_STATUS.PROPOSED },
        { $set: { status: RULE_STATUS.ACTIVE, acceptedBy: userId, acceptedAt: new Date() } },
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
async function addExample({ ltId, label, attributes, why = "", imageUrl, ctr = null, qualifiedLeads = null, costPerQualifiedLead = null, addedBy = "" }) {
    if (!imageUrl) return null;
    if (!ltId) return CreativeExample.create({ label, attributes, why, imageUrl, addedBy });
    return CreativeExample.findOneAndUpdate(
        { ltId, label },
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
    return `${e.label.toUpperCase()}${e.ltId ? ` ${e.ltId}` : ""}${note}: ${attrs || "no tags"}${stats ? `; ${stats}` : ""}. Why: ${e.why || "not given"}`;
}

module.exports = {
    activeRules,
    activeRulesText,
    designRulesMarkdown,
    proposeRule,
    acceptRuleByMessage,
    removeRule,
    addExample,
    pickExamples,
    describeExample,
};
