// services/repair/incidentService.js
//
// The repair loop:
//   1. runChecks()  the daily checks; new problems become incidents (one Slack
//                   message each), problems that are gone are marked resolved.
//      runReportIssues() does the same for the technical action items of the
//                   daily Meta Ads report (budget / creative advice is left to people)
//   2. startFix()   the repair agent investigates; a code fix is committed to a
//                   repair/... branch in each repo it touched (the website one
//                   gets a preview link), then Slack shows Go / Reject. A cause
//                   outside the code (GTM, Meta settings) gets manual steps.
//   3. handleGo()   an approver's Go merges the branches; deploys go out as usual
//                   and the next check confirms the fix
//
// Nothing reaches the live site without an approver's Go.

const RepairIncident = require("../../model/repair/repairIncidentModel");
const { INCIDENT_STATUS: S } = require("../../model/repair/repairIncidentModel");
const { getRepairConfig, missingRepairSettings } = require("../../config/repair/repairConfig");
const { CHECKS } = require("./checks");
const { issuesFromReport } = require("./reportIssues");
const { investigate, repoClients } = require("./repairAgent");
const guard = require("../adsLoop/guardrails");
const slack = require("../adsLoop/slackBot");

const { section, context, button, actions } = slack.blocks;
const PREVIEW_WAIT_MS = 20 * 60 * 1000;
// A merged fix gets this long (two daily checks) before it counts as "didn't work".
const CONFIRM_AFTER_MS = 30 * 3600 * 1000;
const MAX_ATTEMPTS = 2;

const STATUS_LINE = {
    [S.OPEN]: "🔎 Found, waiting for the repair agent",
    [S.FIXING]: "🔧 The repair agent is investigating",
    [S.AWAITING_APPROVAL]: "🟡 Fix ready: waiting for Go",
    [S.NEEDS_MANUAL]: "🙋 Needs a person: the cause is outside the code",
    [S.MERGED]: "🚀 Fix is live: the next check will confirm it",
    [S.REJECTED]: "✋ Fix rejected",
    [S.FAILED]: "⚠️ The repair agent couldn't fix this",
    [S.RESOLVED]: "✅ Resolved: the check passes again",
};

// ---------------------------------------------------------------------------
// Slack
// ---------------------------------------------------------------------------
const compareUrl = (c) => `https://github.com/${c.repoName}/compare/${getRepairConfig().baseBranch}...${encodeURIComponent(c.branch)}`;

function incidentBlocks(inc) {
    const blocks = [section(`*${inc.incidentId}* · ${inc.title}`), context(STATUS_LINE[inc.status] || inc.status)];
    if (inc.cause) blocks.push(section(`*Cause*\n${inc.cause}`));
    if (inc.fixSummary) blocks.push(section(`*Fix*\n${inc.fixSummary}`));
    for (const c of inc.changes) {
        const preview = c.repo === "website"
            ? c.previewUrl
                ? ` · <${c.previewUrl}|preview${c.previewState === "failure" ? " (build FAILED)" : ""}>`
                : c.previewState ? ` · preview ${c.previewState}` : ""
            : "";
        const pr = c.prNumber ? ` · <https://github.com/${c.repoName}/pull/${c.prNumber}|PR #${c.prNumber}>` : "";
        blocks.push(context(`*${c.repo}*: ${c.files.join(", ")} · <${compareUrl(c)}|see the change>${preview}${pr}`));
    }
    if (inc.manualSteps) blocks.push(section(`*To do by hand*\n${inc.manualSteps}`));
    if (inc.note) blocks.push(context(inc.note));

    const id = inc.incidentId;
    if (inc.status === S.AWAITING_APPROVAL) {
        blocks.push(actions([button("Go: make it live", "repair_go", id, "primary"), button("Reject", "repair_reject", id, "danger")]));
    } else if ([S.NEEDS_MANUAL, S.REJECTED, S.FAILED, S.MERGED].includes(inc.status)) {
        const elements = [button("Re-check now", "repair_recheck", id)];
        if (inc.status !== S.MERGED) elements.push(button("Try a fix again", "repair_retry", id));
        blocks.push(actions(elements));
    }
    return blocks;
}

/** Posts the incident's message, or updates it in place. */
async function render(inc) {
    const channel = inc.slackChannel || getRepairConfig().slackChannel;
    const text = `${inc.incidentId}: ${inc.title}`;
    try {
        if (inc.slackTs) {
            await slack.updateMessage({ channel, ts: inc.slackTs, text, blocks: incidentBlocks(inc) });
        } else {
            const { ts, channel: ch } = await slack.postMessage({ channel, threadTs: inc.slackThreadTs || undefined, text: `🚨 ${text}`, blocks: incidentBlocks(inc) });
            await RepairIncident.updateOne({ _id: inc._id }, { $set: { slackTs: ts, slackChannel: ch } });
            inc.slackTs = ts;
            inc.slackChannel = ch;
        }
    } catch (error) {
        console.error(`[repair] Slack for ${inc.incidentId} failed:`, error.message);
    }
}

const threadNote = (inc, text) => slack.replyInThread(inc.slackChannel, inc.slackThreadTs || inc.slackTs, text);

async function save(inc, set) {
    Object.assign(inc, set);
    await RepairIncident.updateOne({ _id: inc._id }, { $set: set });
    await render(inc);
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------
async function nextIncidentId() {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const count = await RepairIncident.countDocuments({ incidentId: new RegExp(`^R-${day}-`) });
    return `R-${day}-${String(count + 1).padStart(2, "0")}`;
}

// Checks and report reads take turns, so two of them never create the same incident.
let applying = Promise.resolve();
function serially(fn) {
    const run = applying.then(fn, fn);
    applying = run.catch(() => {});
    return run;
}

/**
 * Records what a source found: new problems become incidents (and are queued
 * for a fix), known ones are refreshed, and active incidents the source looked
 * at but no longer sees are resolved.
 * @param {Array<{key, kind, title, evidence}>} findings
 * @param {Array<(key: string) => boolean>} covers  which keys the source looked at
 * @param {string} resolvedText  thread reply when an incident is resolved
 */
async function applyFindings(findings, covers, resolvedText) {
    const toFix = [];
    const summary = { found: 0, stillBroken: 0, resolved: 0 };

    for (const f of findings) {
        let inc = await RepairIncident.findOne({ key: f.key, active: true });
        if (!inc) {
            inc = await RepairIncident.create({ incidentId: await nextIncidentId(), key: f.key, kind: f.kind, title: f.title, evidence: f.evidence });
            summary.found += 1;
            await render(inc);
            toFix.push(inc);
            continue;
        }
        summary.stillBroken += 1;
        await RepairIncident.updateOne({ _id: inc._id }, { $set: { lastSeenAt: new Date(), title: f.title, evidence: f.evidence } });
        Object.assign(inc, { title: f.title, evidence: f.evidence });

        // A merged fix that didn't make the problem go away.
        if (inc.status === S.MERGED && Date.now() - inc.mergedAt > CONFIRM_AFTER_MS) {
            await threadNote(inc, "❌ Still broken after the fix went live.");
            if (inc.attempts < MAX_ATTEMPTS) {
                await save(inc, { status: S.OPEN, note: "The first fix didn't work; trying again." });
                toFix.push(inc);
            } else {
                await save(inc, { status: S.FAILED, note: `Still broken after ${inc.attempts} fixes. A person needs to look at it.` });
            }
        }
    }

    const seen = new Set(findings.map((f) => f.key));
    const active = await RepairIncident.find({ active: true });
    for (const inc of active) {
        if (seen.has(inc.key) || !covers.some((c) => c(inc.key))) continue;
        summary.resolved += 1;
        if (inc.status === S.AWAITING_APPROVAL) await deleteBranches(inc);
        await save(inc, { status: S.RESOLVED, active: false, resolvedAt: new Date() });
        await threadNote(inc, resolvedText);
    }

    // Fixes run one at a time afterwards, so a slow fix never blocks the next check.
    if (toFix.length) runInQueue(toFix);
    return summary;
}

const summaryLine = (s) => `${s.found} new, ${s.stillBroken} still broken, ${s.resolved} resolved`;

/** Runs every check, records incidents, and starts fixes for new ones. Returns a summary line. */
function runChecks() {
    return serially(async () => {
        const covers = [];
        const findings = [];
        const failed = [];
        for (const [name, check] of Object.entries(CHECKS)) {
            try {
                const result = await check();
                covers.push(result.covers);
                findings.push(...result.findings);
            } catch (error) {
                console.error(`[repair] ${name} check failed:`, error.response?.data?.error?.message || error.message);
                failed.push(name);
            }
        }
        const summary = await applyFindings(findings, covers, "✅ The check passes again. Closing this.");
        const line = `${summaryLine(summary)}${failed.length ? `; checks that failed to run: ${failed.join(", ")}` : ""}`;
        console.log(`[repair] checks: ${line}`);
        return line;
    });
}

/**
 * Turns the technical action items of the daily Meta Ads report into
 * incidents. Report incidents the report no longer mentions are resolved.
 * @param {string} report  the Slack text of today's report
 */
function runReportIssues(report) {
    return serially(async () => {
        const open = await RepairIncident.find({ active: true }).select("incidentId key kind title").lean();
        const { findings, covers } = await issuesFromReport(report, open);
        const summary = await applyFindings(findings, covers, "✅ The daily report no longer mentions this. Closing it.");
        console.log(`[repair] report: ${summaryLine(summary)}`);
        return summaryLine(summary);
    });
}

/**
 * A sign-up doctor reason someone asked to fix: becomes an incident inside the
 * report's Slack thread, and the repair agent starts on it.
 * An earlier incident for the same reason that is finished (rejected, failed,
 * needs a person, live) is closed first; one still in progress is returned as is.
 * @returns {Promise<{incident, existing: boolean}>}
 */
function startSignupFix({ key, title, evidence, slackChannel, slackThreadTs }) {
    return serially(async () => {
        const current = await RepairIncident.findOne({ key, active: true });
        if (current && [S.OPEN, S.FIXING, S.AWAITING_APPROVAL].includes(current.status)) return { incident: current, existing: true };
        if (current) await RepairIncident.updateOne({ _id: current._id }, { $set: { active: false, resolvedAt: new Date() } });
        const inc = await RepairIncident.create({
            incidentId: await nextIncidentId(),
            key,
            kind: "signup_issue",
            title,
            evidence,
            slackChannel,
            slackThreadTs,
        });
        await render(inc);
        runInQueue([inc]);
        return { incident: inc, existing: false };
    });
}

/** Sign-up fixes that went live a while ago, on pages the sign-up doctor no longer flags: resolved. */
async function resolveSignupFixes(stillFlaggedPageKeys) {
    const live = await RepairIncident.find({ active: true, kind: "signup_issue", status: S.MERGED, mergedAt: { $lt: new Date(Date.now() - CONFIRM_AFTER_MS) } });
    for (const inc of live) {
        if (stillFlaggedPageKeys.has(inc.evidence?.pageKey)) continue;
        await save(inc, { status: S.RESOLVED, active: false, resolvedAt: new Date() });
        await threadNote(inc, `✅ ${inc.incidentId}: the page's sign-up rate is back to normal since the fix went live.`);
    }
}

// ---------------------------------------------------------------------------
// Fixing
// ---------------------------------------------------------------------------
let queue = Promise.resolve();
function runInQueue(incidents) {
    for (const inc of incidents) {
        queue = queue.then(() => startFix(inc)).catch((e) => console.error(`[repair] fix ${inc.incidentId} crashed:`, e.message));
    }
    return queue;
}

async function waitForPreview(github, sha) {
    const deadline = Date.now() + PREVIEW_WAIT_MS;
    while (Date.now() < deadline) {
        const preview = await github.previewForCommit(sha).catch(() => ({ state: "pending" }));
        if (preview.state !== "pending") return preview;
        await new Promise((r) => setTimeout(r, 30000));
    }
    return { state: "pending" };
}

async function deleteBranches(inc) {
    const gh = repoClients();
    for (const c of inc.changes) {
        if (!c.prNumber) await gh[c.repo].deleteBranch(c.branch).catch(() => {});
    }
}

async function startFix(inc) {
    inc = await RepairIncident.findById(inc._id);
    if (!inc || !inc.active || [S.FIXING, S.AWAITING_APPROVAL, S.MERGED].includes(inc.status)) return;
    const missing = missingRepairSettings();
    if (missing.length) {
        await save(inc, { status: S.FAILED, note: `The repair agent can't run: missing settings ${missing.join(", ")}.` });
        return;
    }

    const attempt = inc.attempts + 1;
    await save(inc, { status: S.FIXING, attempts: attempt, note: "", cause: "", fixSummary: "", manualSteps: "", changes: [] });

    let result;
    try {
        result = await investigate(inc, { log: (line) => console.log(`[repair] ${inc.incidentId} ${line}`) });
    } catch (error) {
        result = { ok: false, error: error.message, usage: { costUsd: 0 } };
    }
    const costUsd = Math.round((inc.costUsd + (result.usage?.costUsd || 0)) * 100) / 100;
    if (!result.ok) {
        await save(inc, { status: S.FAILED, costUsd, note: result.error });
        return;
    }

    const config = getRepairConfig();
    const gh = repoClients();
    const changes = [];
    try {
        for (const [repo, files] of Object.entries(result.files)) {
            if (!Object.keys(files).length) continue;
            const branch = `repair/${inc.incidentId.toLowerCase()}-${attempt}`;
            await gh[repo].deleteBranch(branch);
            await gh[repo].createBranch(branch, result.baseShas[repo]);
            const commitSha = await gh[repo].commitFiles(branch, files, `Repair ${inc.incidentId}: ${inc.title}`.slice(0, 200));
            changes.push({ repo, repoName: config.repos[repo], branch, commitSha, files: Object.keys(files), previewState: repo === "website" ? "pending" : "" });
        }
    } catch (error) {
        await save(inc, { status: S.FAILED, costUsd, cause: result.cause, note: `Couldn't save the fix to GitHub: ${error.message}` });
        return;
    }

    const status = changes.length ? S.AWAITING_APPROVAL : S.NEEDS_MANUAL;
    await save(inc, { status, costUsd, cause: result.cause, fixSummary: result.fixSummary, manualSteps: result.manualSteps, changes });

    // The website change gets a preview link once its build finishes.
    const site = changes.find((c) => c.repo === "website");
    if (site) {
        const preview = await waitForPreview(gh.website, site.commitSha);
        const fresh = await RepairIncident.findById(inc._id);
        if (!fresh || fresh.status !== S.AWAITING_APPROVAL) return;
        const updated = fresh.changes.map((c) => (c.repo === "website" ? { ...c.toObject(), previewState: preview.state, previewUrl: preview.url || "" } : c.toObject()));
        await save(fresh, { changes: updated, ...(preview.state === "failure" && { note: "⚠️ The website build failed on this fix. Don't press Go; use Try a fix again." }) });
    }
}

// ---------------------------------------------------------------------------
// Slack buttons
// ---------------------------------------------------------------------------
async function loadIncident(incidentId) {
    const inc = await RepairIncident.findOne({ incidentId });
    if (!inc) throw new guard.GuardrailError(`No incident ${incidentId}.`);
    return inc;
}

async function handleGo({ incidentId, userId }) {
    guard.assertApprover(userId);
    const inc = await loadIncident(incidentId);
    if (inc.status !== S.AWAITING_APPROVAL) throw new guard.GuardrailError(`${incidentId} is not waiting for Go (${inc.status}).`);
    if (inc.changes.some((c) => c.previewState === "failure")) {
        throw new guard.GuardrailError("The website build failed on this fix, so it can't go live. Use Try a fix again.");
    }

    const gh = repoClients();
    const changes = inc.changes.map((c) => c.toObject());
    const errors = [];
    // Backend first: when a fix spans both, the website must not call something the backend doesn't have yet.
    const backendFirst = (c) => (c.repo === "backend" ? 0 : 1);
    for (const c of [...changes].sort((x, y) => backendFirst(x) - backendFirst(y))) {
        try {
            const body = `${inc.title}\n\n**Cause:** ${inc.cause}\n\n**Fix:** ${inc.fixSummary}\n\nApproved in Slack by ${userId}. Opened by the repair agent.`;
            const merged = await gh[c.repo].mergeBranch(c.branch, `Repair ${inc.incidentId}: ${inc.title}`.slice(0, 200), body);
            Object.assign(c, { prNumber: merged.prNumber, mergeSha: merged.mergeSha });
            await gh[c.repo].deleteBranch(c.branch).catch(() => {});
        } catch (error) {
            errors.push(`${c.repo}: ${error.message}`);
        }
    }

    const mergedAny = changes.some((c) => c.prNumber);
    if (errors.length) {
        await save(inc, {
            changes,
            decidedBy: userId,
            decidedAt: new Date(),
            ...(mergedAny ? { status: S.MERGED, mergedAt: new Date() } : {}),
            note: `⚠️ Merge problem: ${errors.join("; ")}${mergedAny ? ". Part of the fix went live; check the other repo by hand." : ""}`,
        });
        return;
    }
    await save(inc, { status: S.MERGED, mergedAt: new Date(), decidedBy: userId, decidedAt: new Date(), changes, note: `Go by <@${userId}>. Deploying now.` });
}

async function handleReject({ incidentId, userId }) {
    guard.assertApprover(userId);
    const inc = await loadIncident(incidentId);
    if (inc.status !== S.AWAITING_APPROVAL) throw new guard.GuardrailError(`${incidentId} is not waiting for Go (${inc.status}).`);
    await deleteBranches(inc);
    await save(inc, { status: S.REJECTED, decidedBy: userId, decidedAt: new Date(), note: `Rejected by <@${userId}>.` });
}

async function handleRetry({ incidentId, userId }) {
    guard.assertApprover(userId);
    const inc = await loadIncident(incidentId);
    if (!inc.active || ![S.NEEDS_MANUAL, S.REJECTED, S.FAILED, S.OPEN].includes(inc.status)) {
        throw new guard.GuardrailError(`${incidentId} can't be retried now (${inc.status}).`);
    }
    await threadNote(inc, `🔁 <@${userId}> asked for another fix.`);
    runInQueue([inc]);
}

async function handleRecheck({ incidentId, userId }) {
    const inc = await loadIncident(incidentId);
    await threadNote(inc, `🔄 <@${userId}> asked for a re-check. Running the checks now.`);
    const line = await runChecks();
    await threadNote(inc, `Checks done: ${line}.`);
}

/** Startup: fixes cut off by a restart are tried again. */
async function recoverRepairs() {
    await RepairIncident.syncIndexes().catch((e) => console.error("[repair] index sync:", e.message));
    const stuck = await RepairIncident.find({ active: true, status: { $in: [S.FIXING, S.OPEN] } });
    for (const inc of stuck) {
        // An attempt cut off by the restart doesn't count.
        if (inc.status === S.FIXING) {
            inc.attempts = Math.max(0, inc.attempts - 1);
            inc.status = S.OPEN;
            await RepairIncident.updateOne({ _id: inc._id }, { $set: { status: S.OPEN, attempts: inc.attempts } });
        }
    }
    if (stuck.length) runInQueue(stuck);
}

module.exports = { runChecks, runReportIssues, startFix, startSignupFix, resolveSignupFixes, handleGo, handleReject, handleRetry, handleRecheck, recoverRepairs };
