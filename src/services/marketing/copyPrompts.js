// services/marketing/copyPrompts.js
//
// Builds the Gemini prompts for the Marketing Engine. Prompts only carry the
// brief's verified facts and exact strings. Gemini writes wording; it never
// decides what is allowed. Every returned line is still checked in code by
// complianceChecker.js afterwards.

const { BUYER_TYPES } = require("../../config/marketing/marketingConstants");
const { STAGE_GUIDANCE, PERSONA_GUIDANCE } = require("../../config/marketing/copySpecConfig");

const isHomeBuyer = (brief) => brief.buyerType !== BUYER_TYPES.INVESTOR;

function rulesBlock(brief) {
    const rules = [
        "Use ONLY the facts and strings below. Never invent features, condition, upgrades, views, amenities or numbers.",
        "Dollar amounts: copy them exactly as written in STRINGS. Never compute, round, abbreviate or write any other dollar amount.",
        "Never use percentages or the word percent.",
        "Fair Housing: describe the property, never the buyer. Never say who it suits (families, kids, couples, singles, retirees, seniors, students, any age, religion or group of people). Never describe the neighborhood as safe or exclusive.",
        "No guaranteed returns and no promises about future value or appreciation.",
        "Never use em dashes. Use commas or periods instead.",
        "Plain text only. No emojis, no hashtags, no markdown, no quotation marks around the text.",
        "Research context is background color only. Never state it as a fact and never take a number from it.",
    ];

    if (isHomeBuyer(brief)) {
        rules.push(
            "Audience: people buying a home to live in. Never use: bid, bidding, bidder, REO, foreclosure, distressed, short sale, bank owned.",
            "Never talk about investment, investors, rent, rental, yield, cash flow, ROI or flipping."
        );
        if (!brief.financingTermsConfirmed) {
            rules.push("Never mention mortgages, financing, loans, lenders, down payments, contingencies, escrow or closing costs.");
        }
    } else {
        rules.push("Audience: property investors. Auction language is fine. Rent and repair figures may only be quoted from STRINGS.");
    }

    return rules.map((r, i) => `${i + 1}. ${r}`).join("\n");
}

function factsBlock(brief) {
    const strings = Object.fromEntries(Object.entries(brief.strings).filter(([, v]) => v));
    const facts = Object.fromEntries(
        Object.entries(brief.facts).filter(([, v]) => v !== null && v !== "" && !(Array.isArray(v) && !v.length))
    );

    const research = brief.research.length
        ? brief.research.map((r) => `- ${r.key}: ${r.text}`).join("\n")
        : "(none)";

    return [
        `VERIFIED FACTS (may be stated as facts):\n${JSON.stringify(facts, null, 2)}`,
        `STRINGS (copy exactly when used):\n${JSON.stringify(strings, null, 2)}`,
        `RESEARCH CONTEXT (background color only):\n${research}`,
    ].join("\n\n");
}

/** { group: { field: "max N chars: Label" } } for the fields we want back. */
function jsonShape(groups) {
    const shape = {};
    groups.forEach((g) => {
        shape[g.group] = {};
        g.fields.forEach((f) => {
            shape[g.group][f.field] = `max ${f.maxChars} characters: ${f.label}`;
        });
    });
    return JSON.stringify(shape, null, 2);
}

function groupsBlock(groups) {
    return groups
        .map((g) => `- ${g.group}: ${g.label}${g.angle ? `. ${g.angle}` : ""}`)
        .join("\n");
}

function wrap({ task, brief, groups, extra = "" }) {
    return `You write marketing copy for Vihara, a US real estate marketplace.

TASK
${task}

RULES (hard constraints)
${rulesBlock(brief)}

${factsBlock(brief)}
${extra ? `\n${extra}\n` : ""}
PIECES TO WRITE
${groupsBlock(groups)}

Return ONLY a JSON object with exactly this shape. Replace each value with the finished text and respect the character limits:
${jsonShape(groups)}`;
}

// ---------------------------------------------------------------------------
// Per-channel prompts
// ---------------------------------------------------------------------------
function buildMetaPrompt(brief, cell, groups) {
    return wrap({
        brief,
        groups,
        task: `Write Facebook and Instagram ad copy for one audience bucket.
Persona: ${cell.personaLabel}. ${PERSONA_GUIDANCE[cell.personaId] || ""}
Awareness stage: ${cell.stageLabel}. ${STAGE_GUIDANCE[cell.stageId] || ""}
The ad button says "${cell.cta}". Do not write the button yourself; card5 and primary text may invite the reader to tap it.`,
    });
}

function buildLandingPagePrompt(brief, groups, personaLabels) {
    return wrap({
        brief,
        groups,
        task: `Write copy blocks for this property's landing page. Readers: ${personaLabels.join(", ")}.
The page button says "${brief.strings.primaryCta}". The FAQs must answer questions these readers would really ask, using only the facts given.
"How it works" explains in plain language how buying through Vihara works, without promising outcomes.`,
    });
}

function buildEmailPrompt(brief, groups, personaLabels) {
    return wrap({
        brief,
        groups,
        task: `Write the launch email announcing this property. Readers: ${personaLabels.join(", ")}.
End the body with one call to action: "${brief.strings.primaryCta}".`,
    });
}

function buildSmsPrompt(brief, groups) {
    return wrap({
        brief,
        groups,
        task: `Write one short SMS nudge for people who registered interest in this property but have not taken the next step.
One call to action: "${brief.strings.primaryCta}". Keep it under 160 characters. Do not add a link; the sending system adds it.`,
    });
}

/** Rewrite ONE line that failed the compliance check or came back empty. */
function buildRegeneratePrompt(brief, { channelLabel, groupLabel, fieldLabel, maxChars, previousText, problems }) {
    return `You write marketing copy for Vihara, a US real estate marketplace.

TASK
Rewrite one line: ${channelLabel} / ${groupLabel} / ${fieldLabel} (max ${maxChars} characters).
Previous version: ${previousText ? JSON.stringify(previousText) : "(empty)"}
It was rejected because: ${problems.join("; ")}.
Fix every problem while keeping the same purpose.

RULES (hard constraints)
${rulesBlock(brief)}

${factsBlock(brief)}

Return ONLY a JSON object: { "text": "the rewritten line" }`;
}

module.exports = {
    buildMetaPrompt,
    buildLandingPagePrompt,
    buildEmailPrompt,
    buildSmsPrompt,
    buildRegeneratePrompt,
};
