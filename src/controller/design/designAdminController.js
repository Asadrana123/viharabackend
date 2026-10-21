// controller/design/designAdminController.js
//
// Admin side of the design agent: ask for a page design, see progress and the
// preview link, ask for changes, approve (goes live), undo, or discard.
//
// ENV: DESIGN_APPROVER_EMAILS — optional comma-separated list. When set, only
// these admins may approve or undo (going live); any admin may still request
// designs and previews.
const mongoose = require("mongoose");
const catchAsyncError = require("../../middleware/catchAsyncError");
const ErrorHandler = require("../../utils/errorhandler");
const DesignRequest = require("../../model/design/designRequestModel");
const jobs = require("../../services/design/designJobService");
const github = require("../../services/design/githubService");
const { discoverPages, findPage } = require("../../services/design/pageDiscovery");
const { cleanMockupHtml, MockupError } = require("../../services/design/landingMockup");
const { NEW_PAGE, NEW_LANDING_PAGE, isLandingFile, toSlug } = require("../../config/designPages");

const MAX_INSTRUCTION = 4000;
const BUSY = ["checking", "needs_answer", "working", "building", "approving"];
const DEFAULT_LANDING_INSTRUCTION = "Build the page from the uploaded mockup.";

const adminName = (user) =>
  [user?.name, user?.last_name].filter(Boolean).join(" ") || user?.email || "Admin";

const approvers = () =>
  String(process.env.DESIGN_APPROVER_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

const canApprove = (user) => {
  const list = approvers();
  return !list.length || list.includes(String(user?.email || "").toLowerCase());
};

const requireId = (req, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    next(new ErrorHandler("Invalid request id", 400));
    return false;
  }
  return true;
};

const readInstruction = (body, next) => {
  const text = String(body?.instruction || "").trim();
  if (!text) {
    next(new ErrorHandler("Tell the design agent what you'd like", 400));
    return null;
  }
  if (text.length > MAX_INSTRUCTION) {
    next(new ErrorHandler(`Keep it under ${MAX_INSTRUCTION} characters`, 400));
    return null;
  }
  return text;
};

// After a conditional action matched nothing: 404 if missing, else 409 with the status.
const explainMiss = async (id, action, next) => {
  const doc = await DesignRequest.findById(id).select("status").lean();
  if (!doc) return next(new ErrorHandler("Design request not found", 404));
  return next(new ErrorHandler(`Can't ${action} while it is "${doc.status}"`, 409));
};

// The site's pages (found from the website's code), with a timeout so the
// first scan after a restart doesn't keep the admin waiting.
async function pagesWithin(ms) {
  try {
    const found = await Promise.race([discoverPages(), new Promise((r) => setTimeout(() => r(null), ms))]);
    if (found) return { found, pagesError: "" };
    return { found: [], pagesError: "Still reading the list of pages from the website. Refresh in a minute." };
  } catch (err) {
    console.error("[design] page discovery failed:", err.message);
    return { found: [], pagesError: "Couldn't read the list of pages from GitHub. You can still make a new page." };
  }
}

// Every page on the site, plus "New page".
exports.listPages = catchAsyncError(async (req, res) => {
  const { found, pagesError } = await pagesWithin(15000);
  const pages = found.map(({ key, label, path, group }) => ({ key, label, path, group }));
  res.status(200).json({
    success: true,
    pages: [{ key: NEW_PAGE.key, label: NEW_PAGE.label, path: NEW_PAGE.path("your-page-name"), group: "Create" }, ...pages],
    pagesError,
    canApprove: canApprove(req.user),
    configured: {
      github: Boolean(process.env.DESIGN_GITHUB_TOKEN),
      ai: Boolean(process.env.ANTHROPIC_API_KEY),
    },
  });
});

// Landing Pages tab: only pages in the Landing folder, plus "New landing page".
exports.listLandingPages = catchAsyncError(async (req, res) => {
  const { found, pagesError } = await pagesWithin(15000);
  const pages = found.filter((p) => isLandingFile(p.file)).map(({ key, label, path }) => ({ key, label, path, group: "Landing pages" }));
  res.status(200).json({
    success: true,
    pages: [{ key: NEW_LANDING_PAGE.key, label: NEW_LANDING_PAGE.label, path: NEW_LANDING_PAGE.path("your-page-name"), group: "Create" }, ...pages],
    pagesError,
    canApprove: canApprove(req.user),
    configured: {
      github: Boolean(process.env.DESIGN_GITHUB_TOKEN),
      ai: Boolean(process.env.ANTHROPIC_API_KEY),
    },
  });
});

// ?kind=landing for the Landing Pages tab; Design Studio's own requests otherwise.
exports.listRequests = catchAsyncError(async (req, res) => {
  const kindFilter = req.query.kind === "landing" ? { kind: "landing" } : { kind: { $ne: "landing" } };
  const requests = await DesignRequest.find(kindFilter)
    .sort({ createdAt: -1 })
    .limit(50)
    .select("pageKey pageLabel pagePath status createdByName createdAt updatedAt rounds.instruction mockup.fileName")
    .lean();
  res.status(200).json({
    success: true,
    requests: requests.map(({ rounds, ...r }) => ({ ...r, firstInstruction: rounds?.[0]?.instruction || "", roundCount: rounds?.length || 0 })),
  });
});

exports.getRequest = catchAsyncError(async (req, res, next) => {
  if (!requireId(req, next)) return;
  const request = await DesignRequest.findById(req.params.id).lean();
  if (!request) return next(new ErrorHandler("Design request not found", 404));
  res.status(200).json({ success: true, request, canApprove: canApprove(req.user) });
});

exports.createRequest = catchAsyncError(async (req, res, next) => {
  const instruction = readInstruction(req.body, next);
  if (!instruction) return;
  const { pageKey } = req.body;

  let page;
  if (pageKey === NEW_PAGE.key) {
    const slug = toSlug(req.body.newPageName);
    if (slug.length < 3) return next(new ErrorHandler("Give the new page a name (at least 3 letters)", 400));
    const taken = await DesignRequest.exists({ newPageSlug: slug, status: { $nin: ["discarded", "undone"] } });
    if (taken) return next(new ErrorHandler(`A page called "${slug}" already exists or is being designed`, 409));
    const onSite = await github
      .listFiles(github.baseBranch())
      .then((files) => files.some((f) => f.startsWith(NEW_PAGE.folder(slug))))
      .catch(() => false);
    if (onSite) return next(new ErrorHandler(`A page called "${slug}" already exists on the site`, 409));
    page = { pageKey, pageLabel: `New page: ${String(req.body.newPageName).trim()}`, pagePath: NEW_PAGE.path(slug), newPageSlug: slug };
  } else {
    const found = await findPage(String(pageKey || ""));
    if (!found) return next(new ErrorHandler("Pick a page from the list", 400));
    const busy = await DesignRequest.exists({ pageKey, status: { $in: BUSY } });
    if (busy) return next(new ErrorHandler(`The ${found.label} page is already being worked on. Wait for it to finish first.`, 409));
    page = { pageKey, pageLabel: found.label, pagePath: found.previewPath, editable: found.editable, newFilesIn: found.newFilesIn };
  }

  const request = await jobs.startRequest({ ...page, instruction, byName: adminName(req.user) });
  res.status(201).json({ success: true, request });
});

// Landing Pages tab: an uploaded HTML mockup for a landing page (or a new one).
// Body: { pageKey, newPageName?, fileName, html, notes? }
exports.createLandingRequest = catchAsyncError(async (req, res, next) => {
  const { pageKey } = req.body || {};
  const notes = String(req.body?.notes || "").trim();
  if (notes.length > MAX_INSTRUCTION) return next(new ErrorHandler(`Keep the notes under ${MAX_INSTRUCTION} characters`, 400));
  const fileName = String(req.body?.fileName || "design.html").slice(0, 200);
  if (!/\.html?$/i.test(fileName)) return next(new ErrorHandler("Upload an .html file", 400));

  let html;
  try {
    html = cleanMockupHtml(req.body?.html);
  } catch (err) {
    if (err instanceof MockupError) return next(new ErrorHandler(err.message, 400));
    throw err;
  }

  let page;
  if (pageKey === NEW_LANDING_PAGE.key) {
    const slug = toSlug(req.body.newPageName);
    if (slug.length < 3) return next(new ErrorHandler("Give the new page a name (at least 3 letters)", 400));
    const taken = await DesignRequest.exists({ pageKey, newPageSlug: slug, status: { $nin: ["discarded", "undone"] } });
    if (taken) return next(new ErrorHandler(`A landing page called "${slug}" already exists or is being made`, 409));
    const onSite = await github
      .listFiles(github.baseBranch())
      .then((files) => files.some((f) => f.startsWith(NEW_LANDING_PAGE.folder(slug))))
      .catch(() => false);
    if (onSite) return next(new ErrorHandler(`A landing page called "${slug}" already exists on the site`, 409));
    page = { pageKey, pageLabel: `New landing page: ${String(req.body.newPageName).trim()}`, pagePath: NEW_LANDING_PAGE.path(slug), newPageSlug: slug };
  } else {
    const found = await findPage(String(pageKey || ""));
    if (!found || !isLandingFile(found.file)) return next(new ErrorHandler("Pick a landing page from the list", 400));
    const busy = await DesignRequest.exists({ pageKey, status: { $in: BUSY } });
    if (busy) return next(new ErrorHandler(`The ${found.label} page is already being worked on. Wait for it to finish first.`, 409));
    page = { pageKey, pageLabel: found.label, pagePath: found.previewPath, editable: found.editable, newFilesIn: found.newFilesIn };
  }

  const request = await jobs.startLandingRequest({
    ...page,
    instruction: notes || DEFAULT_LANDING_INSTRUCTION,
    fileName,
    html,
    byName: adminName(req.user),
  });
  res.status(201).json({ success: true, request });
});

// "Skip these and build": go ahead without the parts of the mockup that can't be built.
exports.skipAndBuild = catchAsyncError(async (req, res, next) => {
  if (!requireId(req, next)) return;
  const request = await jobs.skipAndBuild(req.params.id, adminName(req.user));
  if (!request) return explainMiss(req.params.id, "build", next);
  res.status(200).json({ success: true, request });
});

exports.sendFeedback = catchAsyncError(async (req, res, next) => {
  if (!requireId(req, next)) return;
  const instruction = readInstruction(req.body, next);
  if (!instruction) return;
  const request = await jobs.addRound(req.params.id, { instruction, byName: adminName(req.user), from: ["ready"] });
  if (!request) return explainMiss(req.params.id, "ask for changes", next);
  res.status(200).json({ success: true, request });
});

exports.retry = catchAsyncError(async (req, res, next) => {
  if (!requireId(req, next)) return;
  const request = await jobs.retry(req.params.id, adminName(req.user));
  if (!request) return explainMiss(req.params.id, "try again", next);
  res.status(200).json({ success: true, request });
});

exports.approve = catchAsyncError(async (req, res, next) => {
  if (!requireId(req, next)) return;
  if (!canApprove(req.user)) return next(new ErrorHandler("You're not allowed to put changes live. Ask an approver.", 403));
  const request = await jobs.approve(req.params.id, adminName(req.user));
  if (!request) return explainMiss(req.params.id, "approve", next);
  res.status(200).json({ success: true, request });
});

exports.undo = catchAsyncError(async (req, res, next) => {
  if (!requireId(req, next)) return;
  if (!canApprove(req.user)) return next(new ErrorHandler("You're not allowed to change the live site. Ask an approver.", 403));
  const request = await jobs.undo(req.params.id, adminName(req.user));
  if (!request) return explainMiss(req.params.id, "undo", next);
  res.status(200).json({ success: true, request });
});

exports.discard = catchAsyncError(async (req, res, next) => {
  if (!requireId(req, next)) return;
  const request = await jobs.discard(req.params.id);
  if (!request) return explainMiss(req.params.id, "discard", next);
  res.status(200).json({ success: true, request });
});
