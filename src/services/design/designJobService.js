// services/design/designJobService.js
//
// Runs a design request from start to finish, in the background on this server:
//   check:   (Landing Pages tab) Claude reads the uploaded mockup; if some of
//            it can't be built → "needs_answer" until the designer skips it
//   round:   agent edits the page → commit to the request's branch → wait for
//            Vercel's preview of that commit → "ready" with the preview link
//   approve: pull request + squash merge into the live branch → "live"
//   undo:    a new commit restoring the files as they were → "undone"
//   discard: delete the branch → "discarded"
//
// Status changes are conditional updates on the expected current status, so
// two clicks (or a click and a background step) can never both win.
const DesignRequest = require("../../model/design/designRequestModel");
const github = require("./githubService");
const { runDesignRound } = require("./designAgentService");
const { landingTheme, reviewMockup } = require("./landingMockup");
const { getCurrentBrandKit } = require("../brand/brandKitService");
const { LEGACY_PAGES, NEW_PAGE, NEW_LANDING_PAGE, LANDING_REFERENCE } = require("../../config/designPages");

const os = require("os");

// Identifies this backend. A developer's local backend and the live one on
// Render share the same database, so each only recovers its own requests.
const WORKER_ID = process.env.RENDER_SERVICE_ID ? `render:${process.env.RENDER_SERVICE_ID}` : `local:${os.hostname()}`;

const PREVIEW_POLL_MS = 15000;
const PREVIEW_TIMEOUT_MS = 30 * 60 * 1000;
const BUILD_FAILED_INSTRUCTION =
  "The live preview failed to build. Re-read every file you changed and fix anything that could break a production Create React App build: syntax errors, missing imports, unused variables or imports (lint warnings count as errors), and invalid JSX.";

// Requests being worked on by this server process right now.
const active = new Set();

const log = (id) => (msg) => console.log(`[design ${id}] ${msg}`);

// What the agent may change for a request: fixed on the request when it was made.
function pageFor(doc) {
  const page = { label: doc.pageLabel, path: doc.pagePath };
  if (doc.pageKey === NEW_PAGE.key) {
    const folder = NEW_PAGE.folder(doc.newPageSlug);
    return { page, editable: [], newFilesIn: folder, mustCreate: [`${folder}index.jsx`] };
  }
  if (doc.pageKey === NEW_LANDING_PAGE.key) {
    const folder = NEW_LANDING_PAGE.folder(doc.newPageSlug);
    return { page, editable: [], newFilesIn: folder, mustCreate: [`${folder}index.jsx`] };
  }
  if (doc.editable?.length) return { page, editable: doc.editable, newFilesIn: doc.newFilesIn, mustCreate: [] };
  const legacy = LEGACY_PAGES[doc.pageKey];
  if (!legacy) throw new Error(`Unknown page "${doc.pageKey}"`);
  return { page, editable: legacy.editable, newFilesIn: "", mustCreate: [] };
}

// Plain-language reason for the admin, from whatever went wrong.
function friendlyError(err) {
  if (err instanceof github.GithubError) {
    if (err.status === 401 || err.status === 403) return "The design agent can't access GitHub. Ask your developer to check the GitHub token.";
    if (err.status === 409 || err.status === 405) return "This page was changed on the live site after the preview was made, so it can't be applied safely. Discard it and start a new request for this page.";
    return `GitHub problem: ${err.message}`;
  }
  return err.message || "Something went wrong";
}

const setRound = (i, fields) =>
  Object.fromEntries(Object.entries(fields).map(([k, v]) => [`rounds.${i}.${k}`, v]));

// Only while still in progress and still on this round, so a discard or a
// newer round in the meantime isn't overwritten.
const isLatest = (roundIndex) => (roundIndex >= 0 ? { [`rounds.${roundIndex + 1}`]: { $exists: false } } : {});

async function fail(id, roundIndex, message) {
  await DesignRequest.updateOne(
    { _id: id, status: { $in: ["checking", "working", "building"] }, ...isLatest(roundIndex) },
    { $set: { status: "failed", error: message, ...(roundIndex >= 0 ? setRound(roundIndex, { error: message, finishedAt: new Date() }) : {}) } }
  );
}

// Runs the latest round of a request (status must already be "working").
async function runLatestRound(id) {
  if (active.has(String(id))) return;
  active.add(String(id));
  const say = log(id);
  let roundIndex = -1;
  try {
    const doc = await DesignRequest.findById(id).select("+mockup.html");
    if (!doc || doc.status !== "working") return;
    roundIndex = doc.rounds.length - 1;
    const round = doc.rounds[roundIndex];
    const { page, editable, newFilesIn, mustCreate } = pageFor(doc);
    const isLanding = doc.kind === "landing";

    if (!doc.branch) {
      const branch = `design/${doc._id}`;
      await github.createBranch(branch, await github.branchSha(github.baseBranch()));
      await DesignRequest.updateOne({ _id: id }, { $set: { branch } });
      doc.branch = branch;
      say(`created branch ${branch}`);
    }

    const history = doc.rounds
      .slice(0, roundIndex)
      .filter((r) => r.commitSha)
      .map((r) => ({ instruction: r.instruction, summary: r.summary }));

    say(`round ${roundIndex + 1}: ${round.instruction.slice(0, 80)}`);
    const result = await runDesignRound({
      ref: doc.branch,
      page,
      editable,
      newFilesIn,
      kit: await getCurrentBrandKit(),
      instruction: round.instruction,
      history,
      mustCreate,
      landing: isLanding
        ? {
            mockupHtml: doc.mockup.html,
            skipped: doc.review?.blocked || [],
            isNew: doc.pageKey === NEW_LANDING_PAGE.key,
            reference: LANDING_REFERENCE,
            theme: await landingTheme(doc.branch),
          }
        : null,
      log: say,
      // Stop early (and stop spending) if the admin discards it meanwhile.
      shouldStop: async () => !(await DesignRequest.exists({ _id: id, status: "working", ...isLatest(roundIndex) })),
    });
    await DesignRequest.updateOne(
      { _id: id },
      {
        $inc: {
          "usage.inputTokens": result.usage.inputTokens,
          "usage.outputTokens": result.usage.outputTokens,
          "usage.cacheReadTokens": result.usage.cacheReadTokens,
          "usage.cacheWriteTokens": result.usage.cacheWriteTokens,
          "usage.costUsd": result.usage.costUsd,
        },
      }
    );
    if (!result.ok) return fail(id, roundIndex, result.error);
    if (!(await DesignRequest.exists({ _id: id, status: "working", ...isLatest(roundIndex) }))) {
      say("stopped or replaced while working — not saving");
      return;
    }

    const filesChanged = Object.keys(result.files);
    const sha = await github.commitFiles(
      doc.branch,
      result.files,
      `${isLanding ? "Landing" : "Design"} (${doc.pageLabel}): ${round.instruction.replace(/\s+/g, " ").slice(0, 60)}\n\nRequested by ${round.byName || "admin"} via the ${isLanding ? "landing page" : "design"} agent.`
    );
    say(`committed ${filesChanged.length} file(s) as ${sha.slice(0, 7)}`);
    await DesignRequest.updateOne(
      { _id: id, status: "working", ...isLatest(roundIndex) },
      { $set: { status: "building", error: "", ...setRound(roundIndex, { summary: result.summary, filesChanged, commitSha: sha }) } }
    );
  } catch (err) {
    console.error(`[design ${id}] round failed:`, err);
    await fail(id, roundIndex, friendlyError(err));
    return;
  } finally {
    active.delete(String(id));
  }
  waitForPreview(id);
}

// Polls until Vercel's preview of the latest commit is up (or fails / times out).
async function waitForPreview(id) {
  const say = log(id);
  const started = Date.now();
  for (;;) {
    const doc = await DesignRequest.findById(id).lean();
    if (!doc || doc.status !== "building") return;
    const i = doc.rounds.length - 1;
    const sha = doc.rounds[i]?.commitSha;
    if (!sha) return; // this round saved nothing, so there's no preview to wait for
    try {
      const preview = await github.previewForCommit(sha);
      if (preview.state === "success" && preview.url) {
        const previewUrl = `${preview.url.replace(/\/+$/, "")}${doc.pagePath}`;
        await DesignRequest.updateOne(
          { _id: id, status: "building" },
          { $set: { status: "ready", ...setRound(i, { previewUrl, finishedAt: new Date() }) } }
        );
        say(`preview ready: ${previewUrl}`);
        return;
      }
      if (preview.state === "failure") {
        say("preview build failed");
        return fail(id, i, "The preview couldn't be built. Click \"Try again\" and the agent will fix it.");
      }
    } catch (err) {
      say(`checking preview: ${err.message}`);
    }
    if (Date.now() - started > PREVIEW_TIMEOUT_MS) {
      return fail(id, i, "The preview took too long to build. Check the \"Design preview\" run under GitHub → Actions, then click \"Try again\".");
    }
    await new Promise((r) => setTimeout(r, PREVIEW_POLL_MS));
  }
}

async function startRequest({ pageKey, pageLabel, pagePath, newPageSlug, editable, newFilesIn, instruction, byName }) {
  const doc = await DesignRequest.create({
    pageKey,
    pageLabel,
    pagePath,
    newPageSlug: newPageSlug || "",
    editable: editable || [],
    newFilesIn: newFilesIn || "",
    createdByName: byName,
    status: "working",
    worker: WORKER_ID,
    rounds: [{ instruction, byName }],
  });
  runLatestRound(doc._id);
  return doc;
}

// Landing Pages tab: check the mockup first (status must already be "checking").
// Nothing blocked → build straight away; otherwise wait for the designer.
async function runReview(id) {
  if (active.has(String(id))) return;
  active.add(String(id));
  const say = log(id);
  let build = false;
  try {
    const doc = await DesignRequest.findById(id).select("+mockup.html").lean();
    if (!doc || doc.status !== "checking") return;
    const { page, editable } = pageFor(doc);
    say("checking the mockup");
    const { review, usage } = await reviewMockup({
      ref: github.baseBranch(),
      mockupHtml: doc.mockup.html,
      page,
      editable,
      isNew: doc.pageKey === NEW_LANDING_PAGE.key,
      notes: doc.rounds[0]?.instruction,
    });
    build = review.blocked.length === 0;
    await DesignRequest.updateOne(
      { _id: id, status: "checking" },
      {
        $set: { status: build ? "working" : "needs_answer", error: "", review: { ...review, checkedAt: new Date() } },
        $inc: {
          "usage.inputTokens": usage.inputTokens,
          "usage.outputTokens": usage.outputTokens,
          "usage.cacheReadTokens": usage.cacheReadTokens,
          "usage.cacheWriteTokens": usage.cacheWriteTokens,
          "usage.costUsd": usage.costUsd,
        },
      }
    );
    say(build ? "mockup ok — building" : `${review.blocked.length} thing(s) can't be built — asking the designer`);
  } catch (err) {
    console.error(`[design ${id}] mockup check failed:`, err);
    await fail(id, -1, friendlyError(err));
    return;
  } finally {
    active.delete(String(id));
  }
  if (build) runLatestRound(id);
}

async function startLandingRequest({ pageKey, pageLabel, pagePath, newPageSlug, editable, newFilesIn, instruction, fileName, html, byName }) {
  const doc = await DesignRequest.create({
    kind: "landing",
    pageKey,
    pageLabel,
    pagePath,
    newPageSlug: newPageSlug || "",
    editable: editable || [],
    newFilesIn: newFilesIn || "",
    createdByName: byName,
    status: "checking",
    worker: WORKER_ID,
    mockup: { fileName, html },
    rounds: [{ instruction, byName }],
  });
  runReview(doc._id);
  return doc;
}

// "Skip these and build" on a mockup with things that can't be built.
async function skipAndBuild(id, byName) {
  const doc = await DesignRequest.findOneAndUpdate(
    { _id: id, status: "needs_answer" },
    { $set: { status: "working", error: "", worker: WORKER_ID, "review.skippedByName": byName } },
    { new: true }
  );
  if (doc) runLatestRound(doc._id);
  return doc;
}

// "Change this…" on a ready request, or "Try again" on a failed one.
async function addRound(id, { instruction, byName, from }) {
  const doc = await DesignRequest.findOneAndUpdate(
    { _id: id, status: { $in: from } },
    { $set: { status: "working", error: "", worker: WORKER_ID }, $push: { rounds: { instruction, byName } } },
    { new: true }
  );
  if (doc) runLatestRound(doc._id);
  return doc;
}

async function retry(id, byName) {
  const doc = await DesignRequest.findById(id).lean();
  if (!doc || doc.status !== "failed") return null;
  // The mockup check itself failed: check again.
  if (doc.kind === "landing" && !doc.review?.checkedAt) {
    const again = await DesignRequest.findOneAndUpdate(
      { _id: id, status: "failed" },
      { $set: { status: "checking", error: "", worker: WORKER_ID } },
      { new: true }
    );
    if (again) runReview(again._id);
    return again;
  }
  const last = doc.rounds[doc.rounds.length - 1];
  // Committed but the preview failed to build: ask the agent to fix the build.
  const instruction = last?.commitSha && !last.previewUrl ? BUILD_FAILED_INSTRUCTION : last.instruction;
  return addRound(id, { instruction, byName, from: ["failed"] });
}

async function approve(id, byName) {
  const doc = await DesignRequest.findOneAndUpdate(
    { _id: id, status: "ready" },
    { $set: { status: "approving", error: "", worker: WORKER_ID } },
    { new: true }
  );
  if (!doc) return null;
  try {
    const summary = doc.rounds.filter((r) => r.summary).map((r) => r.summary).join("\n");
    const { prNumber, mergeSha } = await github.mergeBranch(
      doc.branch,
      `Design: ${doc.pageLabel} (approved by ${byName})`,
      `Requested by ${doc.createdByName} and approved by ${byName} in the admin panel.\n\n${summary}`
    );
    await github.deleteBranch(doc.branch).catch(() => {});
    return DesignRequest.findOneAndUpdate(
      { _id: id },
      { $set: { status: "live", prNumber, mergeSha, approvedByName: byName, approvedAt: new Date() } },
      { new: true }
    );
  } catch (err) {
    console.error(`[design ${id}] approve failed:`, err);
    return DesignRequest.findOneAndUpdate(
      { _id: id },
      { $set: { status: "ready", error: friendlyError(err) } },
      { new: true }
    );
  }
}

// Restores every file the approved change touched to how it was before it.
async function undo(id, byName) {
  const doc = await DesignRequest.findOneAndUpdate(
    { _id: id, status: "live" },
    { $set: { status: "undoing", error: "", worker: WORKER_ID } },
    { new: true }
  );
  if (!doc) return null;
  const branch = `design/${doc._id}-undo`;
  try {
    const { parentSha, files } = await github.commitFilesChanged(doc.mergeSha);
    const restore = {};
    for (const f of files) {
      if (f.status === "added") restore[f.filename] = null;
      else if (f.status === "renamed") {
        restore[f.filename] = null;
        restore[f.previous_filename] = await github.readFile(f.previous_filename, parentSha);
      } else restore[f.filename] = await github.readFile(f.filename, parentSha);
    }
    await github.deleteBranch(branch);
    await github.createBranch(branch, await github.branchSha(github.baseBranch()));
    await github.commitFiles(branch, restore, `Undo design: ${doc.pageLabel}\n\nUndone by ${byName} in the admin panel.`);
    const { mergeSha: undoSha } = await github.mergeBranch(
      branch,
      `Undo design: ${doc.pageLabel} (by ${byName})`,
      `Restores the page as it was before design change #${doc.prNumber}.`
    );
    await github.deleteBranch(branch).catch(() => {});
    return DesignRequest.findOneAndUpdate(
      { _id: id },
      { $set: { status: "undone", undoSha, undoneByName: byName, undoneAt: new Date() } },
      { new: true }
    );
  } catch (err) {
    console.error(`[design ${id}] undo failed:`, err);
    await github.deleteBranch(branch).catch(() => {});
    return DesignRequest.findOneAndUpdate(
      { _id: id },
      { $set: { status: "live", error: `Undo didn't work: ${friendlyError(err)}` } },
      { new: true }
    );
  }
}

async function discard(id) {
  const doc = await DesignRequest.findOneAndUpdate(
    { _id: id, status: { $in: ["checking", "needs_answer", "working", "building", "ready", "failed"] } },
    { $set: { status: "discarded" } },
    { new: true }
  );
  if (doc?.branch) await github.deleteBranch(doc.branch).catch((err) => console.error(`[design ${id}] delete branch:`, err.message));
  return doc;
}

// After a restart: this server's in-progress work was lost; previews that
// were building can keep being watched. Requests run by another server
// (e.g. the live backend, when this is a local one) are left alone.
async function recoverDesignJobs() {
  try {
    await DesignRequest.updateMany(
      { status: { $in: ["checking", "working"] }, worker: WORKER_ID },
      { $set: { status: "failed", error: "The server restarted while the agent was working. Click \"Try again\"." } }
    );
    await DesignRequest.updateMany(
      { status: "approving", worker: WORKER_ID },
      { $set: { status: "ready", error: "Approval was interrupted by a server restart. Check the live site, then approve again if needed." } }
    );
    await DesignRequest.updateMany(
      { status: "undoing", worker: WORKER_ID },
      { $set: { status: "live", error: "Undo was interrupted by a server restart. Check the live site, then undo again if needed." } }
    );
    const building = await DesignRequest.find({ status: "building" }).select("_id").lean();
    building.forEach((d) => waitForPreview(d._id));
  } catch (err) {
    console.error("[design] recovery failed:", err);
  }
}

module.exports = { startRequest, startLandingRequest, skipAndBuild, addRound, retry, approve, undo, discard, recoverDesignJobs };
