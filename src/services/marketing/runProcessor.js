// services/marketing/runProcessor.js
//
// Runs one MarketingRun end to end in the background:
//   gate -> matrix -> brief -> copy per cell/channel -> compliance -> save.
//
// Per line: Gemini writes it, complianceChecker checks it. A failing or empty
// line is regenerated ONCE; if it still fails it becomes a visible
// [NEEDS INPUT: ...] placeholder. Lines that need a Blocked value gap are never
// written at all. Nothing is ever filled with a guess.

const productModel = require("../../model/property/productModel");
const Enrichment = require("../../model/marketing/enrichmentModel");
const MarketingRun = require("../../model/marketing/marketingRunModel");
const { runVerificationGate } = require("./verificationGate");
const { getBuildableCells, getPersonasForBuyerType } = require("./matrixService");
const { buildBrief } = require("./briefService");
const { checkLine, contextFromBrief, toStoredFlags, placeholderText } = require("./complianceChecker");
const copy = require("./copyGenerationService");
const {
    META_GROUPS,
    LANDING_PAGE_GROUPS,
    EMAIL_GROUPS,
    SMS_GROUPS,
} = require("../../config/marketing/copySpecConfig");
const {
    CHANNELS,
    GATE_BINS,
    LINE_SOURCES,
    RUN_STATUS,
} = require("../../config/marketing/marketingConstants");

// Gemini calls in flight at once. Keeps a 20-cell run fast without tripping rate limits.
const TASK_CONCURRENCY = 3;

const CHANNEL_LABELS = Object.freeze({
    [CHANNELS.META]: "Meta",
    [CHANNELS.LANDING_PAGE]: "Landing page",
    [CHANNELS.EMAIL]: "Email",
    [CHANNELS.SMS]: "SMS",
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function cleanText(raw) {
    if (typeof raw !== "string") return "";
    return raw
        .replace(/\r\n/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .replace(/^["\u201C\u201D]+|["\u201C\u201D]+$/g, "")
        .trim();
}

function placeholderLine(base, what, reason) {
    return {
        ...base,
        text: placeholderText(what),
        source: LINE_SOURCES.PLACEHOLDER,
        placeholderReason: reason,
        flags: [],
    };
}

/** Run async tasks with a concurrency cap, keeping results in task order. */
async function runPool(tasks, concurrency, onTaskDone) {
    const results = new Array(tasks.length);
    let cursor = 0;

    async function worker() {
        while (cursor < tasks.length) {
            const index = cursor++;
            results[index] = await tasks[index].run();
            await onTaskDone(tasks[index]);
        }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
    return results;
}

// ---------------------------------------------------------------------------
// One line: check, regenerate once, or placeholder
// ---------------------------------------------------------------------------
async function finalizeField({ brief, ctx, base, channel, groupSpec, fieldSpec, rawText }) {
    let text = cleanText(rawText);
    let flags = text ? checkLine(text, ctx) : [];
    if (text && !flags.length) {
        return { ...base, text, source: LINE_SOURCES.AI, placeholderReason: "", flags: [] };
    }

    // Regenerate once.
    const problems = text ? flags.map((f) => `${f.label} ("${f.match}")`) : ["the text was empty"];
    const retry = cleanText(
        await copy.regenerateLine(brief, {
            channelLabel: CHANNEL_LABELS[channel],
            groupLabel: groupSpec.label,
            fieldLabel: fieldSpec.label,
            maxChars: fieldSpec.maxChars,
            previousText: text,
            problems,
        })
    );
    const retryFlags = retry ? checkLine(retry, ctx) : [];
    if (retry && !retryFlags.length) {
        return { ...base, text: retry, source: LINE_SOURCES.AI, placeholderReason: "", flags: [], regenerated: true };
    }

    // Still failing: visible placeholder. A hard-stop rule (financing) names
    // its own missing input; other rules name the line.
    const finalFlags = retry ? retryFlags : flags;
    const hardStop = finalFlags.find((f) => f.placeholder);
    const what = hardStop ? hardStop.placeholder : fieldSpec.label;
    const reason = finalFlags.length
        ? `Failed compliance after one rewrite: ${finalFlags.map((f) => f.label).join(", ")}`
        : "AI returned no text after one rewrite";

    return {
        ...placeholderLine(base, what, reason),
        flags: toStoredFlags(finalFlags),
        regenerated: true,
    };
}

// ---------------------------------------------------------------------------
// One task: one Gemini call for a set of groups, then every field finalized
// ---------------------------------------------------------------------------
async function writeGroups({ brief, ctx, channel, cellKey = "", groups, generate }) {
    const gapVerified = brief.valueGap.status === GATE_BINS.VERIFIED;
    const needsGap = (g, f) => Boolean(g.requiresValueGap || f.requiresValueGap);
    const gapWhat = `value gap (${brief.valueGap.reason || "not verified"})`;

    // Ask Gemini only for what may be written.
    const askGroups = groups
        .map((g) => ({ ...g, fields: g.fields.filter((f) => gapVerified || !needsGap(g, f)) }))
        .filter((g) => g.fields.length);

    let raw = {};
    let aiError = "";
    if (askGroups.length) {
        try {
            raw = (await generate(askGroups)) || {};
        } catch (error) {
            aiError = error?.message || "AI writing failed";
            console.error(`runProcessor: ${CHANNEL_LABELS[channel]}${cellKey ? ` ${cellKey}` : ""} generation failed:`, aiError);
        }
    }

    const lines = [];
    for (const groupSpec of groups) {
        for (const fieldSpec of groupSpec.fields) {
            const base = { channel, cellKey, group: groupSpec.group, field: fieldSpec.field, label: fieldSpec.label };

            if (!gapVerified && needsGap(groupSpec, fieldSpec)) {
                lines.push(placeholderLine(base, gapWhat, brief.valueGap.reason));
                continue;
            }
            if (aiError) {
                lines.push(placeholderLine(base, `${fieldSpec.label} (AI writing failed, run again)`, aiError));
                continue;
            }
            lines.push(
                await finalizeField({
                    brief,
                    ctx,
                    base,
                    channel,
                    groupSpec,
                    fieldSpec,
                    rawText: raw?.[groupSpec.group]?.[fieldSpec.field],
                })
            );
        }
    }
    return lines;
}

function buildTasks(brief, cells) {
    const ctx = contextFromBrief(brief);
    const personaLabels = getPersonasForBuyerType(brief.buyerType).map((p) => p.label);

    const metaTasks = cells.map((cell) => ({
        label: `Meta: ${cell.personaLabel} / ${cell.stageLabel}`,
        run: () =>
            writeGroups({
                brief, ctx, channel: CHANNELS.META, cellKey: cell.key, groups: META_GROUPS,
                generate: (groups) => copy.generateMetaCopy(brief, cell, groups),
            }),
    }));

    return [
        ...metaTasks,
        {
            label: "Landing page",
            run: () =>
                writeGroups({
                    brief, ctx, channel: CHANNELS.LANDING_PAGE, groups: LANDING_PAGE_GROUPS,
                    generate: (groups) => copy.generateLandingPageCopy(brief, groups, personaLabels),
                }),
        },
        {
            label: "Email",
            run: () =>
                writeGroups({
                    brief, ctx, channel: CHANNELS.EMAIL, groups: EMAIL_GROUPS,
                    generate: (groups) => copy.generateEmailCopy(brief, groups, personaLabels),
                }),
        },
        {
            label: "SMS",
            run: () =>
                writeGroups({
                    brief, ctx, channel: CHANNELS.SMS, groups: SMS_GROUPS,
                    generate: (groups) => copy.generateSmsCopy(brief, groups),
                }),
        },
    ];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
/**
 * Process a run that is in "running" state. Never throws: any failure is
 * saved on the run as status "failed" with a readable error.
 */
async function processRun(runId) {
    const setRun = (update) => MarketingRun.updateOne({ _id: runId }, update);

    try {
        const run = await MarketingRun.findById(runId).lean();
        if (!run || run.status !== RUN_STATUS.RUNNING) return;

        if (!copy.isConfigured()) {
            throw new Error("Gemini is not configured on the server (GEMINI_API_KEY missing)");
        }

        const [property, enrichment] = await Promise.all([
            productModel.findById(run.property).lean(),
            Enrichment.findOne({ property: run.property }).lean(),
        ]);
        if (!property) throw new Error("The property no longer exists");

        // 1-2. Gate + matrix (saved first so a blocked brief still shows why).
        await setRun({ $set: { "progress.stage": "checking data" } });
        const gate = runVerificationGate(property, enrichment, { now: new Date() });
        const { cells, skipped } = getBuildableCells(run.buyerType, gate.readiness);
        await setRun({ $set: { gate, cells, skippedCells: skipped } });

        // 3. Brief (throws "Needs input ..." when required facts are Blocked).
        const brief = buildBrief({ gate, buyerType: run.buyerType, cells, skippedCells: skipped });

        // 4. Copy.
        const tasks = buildTasks(brief, cells);
        await setRun({
            $set: { brief, "progress.stage": "writing copy", "progress.completed": 0, "progress.total": tasks.length },
        });

        const results = await runPool(tasks, TASK_CONCURRENCY, (task) =>
            setRun({ $inc: { "progress.completed": 1 }, $set: { "progress.stage": task.label } }).catch(() => {})
        );

        await MarketingRun.updateOne(
            { _id: runId, status: RUN_STATUS.RUNNING },
            { $set: { status: RUN_STATUS.READY, lines: results.flat(), "progress.stage": "done", error: "" } }
        );
    } catch (error) {
        console.error(`runProcessor: run ${runId} failed:`, error?.message || error);
        await setRun({
            $set: { status: RUN_STATUS.FAILED, error: error?.message || "Run failed", "progress.stage": "failed" },
        }).catch(() => {});
    }
}

module.exports = { processRun };
