// services/marketing/complianceChecker.js
//
// Runs every compliance rule on one line of copy. Pure code, no AI.
// Returns a list of flags; an empty list means the line is compliant.

const { COMPLIANCE_RULES } = require("../../config/marketing/complianceRules");

const PLACEHOLDER_PREFIX = "[NEEDS INPUT:";

// Needs the brief's numbers, so it isn't in the static rules config.
const UNVERIFIED_DOLLAR_RULE = Object.freeze({
    id: "unverified-dollar-amount",
    label: "Unverified number",
    message: "Only dollar amounts from the verified brief may appear.",
});

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// "cash flow" also matches "cash-flow"; "can't" matches straight and curly quotes.
function termToRegex(term) {
    const body = term
        .trim()
        .split(/\s+/)
        .map((word) => escapeRegex(word).replace(/'/g, "['\u2019]"))
        .join("[\\s-]+");
    return new RegExp(`\\b${body}\\b`, "i");
}

// Compile once at module load.
const COMPILED_RULES = COMPLIANCE_RULES.map((rule) => ({
    ...rule,
    regexes: [
        ...(rule.terms || []).map(termToRegex),
        ...(rule.patterns || []).map((p) => new RegExp(p, "i")),
    ],
}));

const isPlaceholder = (text) => typeof text === "string" && text.trim().startsWith(PLACEHOLDER_PREFIX);

const placeholderText = (what) => `${PLACEHOLDER_PREFIX} ${what}]`;

/**
 * Every dollar amount in a string, as whole-dollar numbers.
 * "$60,000" -> 60000, "$60K" -> 60000, "$1.2M" -> 1200000
 */
function findDollarAmounts(text) {
    const re = /\$\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|m|thousand|million)?\b/gi;
    const found = [];
    let m;
    while ((m = re.exec(text)) !== null) {
        let value = Number(m[1].replace(/,/g, ""));
        const unit = (m[2] || "").toLowerCase();
        if (unit === "k" || unit === "thousand") value *= 1000;
        if (unit === "m" || unit === "million") value *= 1000000;
        found.push({ raw: m[0].trim(), value: Math.round(value) });
    }
    return found;
}

function ruleApplies(rule, context) {
    if (rule.buyerTypes && !rule.buyerTypes.includes(context.buyerType)) return false;
    if (rule.onlyWhenFinancingUnconfirmed && context.financingTermsConfirmed) return false;
    return true;
}

/**
 * @param {string} text
 * @param {object} context
 * @param {string}   context.buyerType
 * @param {boolean}  context.financingTermsConfirmed
 * @param {number[]} context.allowedDollarAmounts  verified numbers from the brief
 * @returns {Array<{ rule: string, label: string, message: string, match: string, placeholder?: string }>}
 */
function checkLine(text, context = {}) {
    if (typeof text !== "string" || !text.trim() || isPlaceholder(text)) return [];

    const flags = [];

    COMPILED_RULES.forEach((rule) => {
        if (!ruleApplies(rule, context)) return;
        for (const re of rule.regexes) {
            const m = text.match(re);
            if (m) {
                flags.push({
                    rule: rule.id,
                    label: rule.label,
                    message: rule.message,
                    match: m[0],
                    ...(rule.placeholder ? { placeholder: rule.placeholder } : {}),
                });
                break; // one flag per rule is enough
            }
        }
    });

    const allowed = new Set((context.allowedDollarAmounts || []).map((n) => Math.round(Number(n))));
    const unverified = findDollarAmounts(text).find((d) => !allowed.has(d.value));
    if (unverified) {
        flags.push({
            rule: UNVERIFIED_DOLLAR_RULE.id,
            label: UNVERIFIED_DOLLAR_RULE.label,
            message: UNVERIFIED_DOLLAR_RULE.message,
            match: unverified.raw,
        });
    }

    return flags;
}

/** The checker context for a run, taken from its brief. */
function contextFromBrief(brief = {}) {
    return {
        buyerType: brief.buyerType,
        financingTermsConfirmed: brief.financingTermsConfirmed === true,
        allowedDollarAmounts: brief.allowedDollarAmounts || [],
    };
}

/** Shape flags for the MarketingRun line.flags subdocument. */
function toStoredFlags(flags = []) {
    return flags.map((f) => ({ rule: f.rule, message: `${f.label}. ${f.message}`, match: f.match }));
}

module.exports = {
    checkLine,
    contextFromBrief,
    toStoredFlags,
    findDollarAmounts,
    isPlaceholder,
    placeholderText,
    PLACEHOLDER_PREFIX,
};
