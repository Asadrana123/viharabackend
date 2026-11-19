// controller/studio/creativeController.js
//
// Statics made in the Studio (vihara.ai/studio/creatives). As the video runs (studioController.js): an editor's click is
// stored as a step, the Creative OS server collects it on its own route (POST /studio/creatives/poll, with the shared
// key) and sends back what to show, with each creative's pictures in the private bucket. A server without this route
// never asks for these steps, so the video loop is untouched.

const mongoose = require("mongoose");
const catchAsyncError = require("../../middleware/catchAsyncError");
const ErrorHandler = require("../../utils/errorhandler");
const EditorProfile = require("../../model/studio/editorProfileModel");
const StudioCreative = require("../../model/studio/studioCreativeModel");
const StudioReady = require("../../model/studio/studioReadyModel");
const { storage, cleanCut, uploadUrl, viewUrl, storedBytes } = require("../../services/studio/cutStorage");
const { newRunId } = require("../../services/studio/runService");
const s = require("../../services/studio/creativeService");

/** The name a step is recorded under: the editor's Studio name, else their account's. */
async function nameOf(user) {
  const profile = await EditorProfile.findOne({ user: user._id }).select("name").lean();
  return profile?.name || user.name || user.email;
}

const creativeView = async (c) => {
  const urls = Object.fromEntries(await Promise.all(Object.entries(c.media ?? {}).map(async ([slot, m]) => [slot, await viewUrl(m.key)])));
  const pending = (c.commands ?? []).filter((x) => !x.doneAt).map((x) => ({ type: x.type, at: x.at, ...(x.data?.creative ? { creative: x.data.creative } : {}), ...(x.data?.angle ? { angle: x.data.angle } : {}) }));
  const { creativeId, propertyId, format, requestedByName, buyer, idea, state, angles, creatives, unchecked, usablePhotos, priceChange, spent, limit, error, notice, answer, notes, updatedAt, createdAt } = c;
  return { creativeId, propertyId, format, requestedByName, buyer, idea: idea ?? null, state, angles: angles ?? [], creatives: creatives ?? [], unchecked: unchecked ?? [], usablePhotos: usablePhotos ?? 0, priceChange: priceChange ?? [], spent: spent ?? 0, limit: limit ?? s.CREATIVE_LIMIT_USD, error: error ?? null, notice: notice ?? null, answer: answer ?? null, notes: notes ?? [], urls, pending, updatedAt: updatedAt ?? null, createdAt: createdAt ?? null };
};

/** GET /api/v1/studio/creatives - the editor's creative requests, newest first (an admin sees all), and the properties to start from. */
const listCreatives = catchAsyncError(async (req, res) => {
  const isAdmin = req.user.role === "admin";
  const rows = await StudioCreative.find(isAdmin ? {} : { requestedBy: req.user._id }).sort({ createdAt: -1 }).limit(100).lean();
  const ready = await StudioReady.findOne({ key: "videos" }).lean();
  res.status(200).json({ success: true, isAdmin, creatives: await Promise.all(rows.map(creativeView)), ready: ready?.rows ?? [], checkedAt: ready?.checkedAt ?? null });
});

/** POST /api/v1/studio/creatives  { propertyId, format, buyer: { icpId, stage? }, idea? } */
const startCreative = catchAsyncError(async (req, res, next) => {
  let input;
  try {
    input = s.cleanCreativeStart(req.body);
  } catch (e) {
    return next(new ErrorHandler(e.message, 400));
  }
  const ready = await StudioReady.findOne({ key: "videos" }).lean();
  if (!ready?.rows.some((r) => r.propertyId === input.propertyId && r.ready)) return next(new ErrorHandler("That property is not ready for new creatives.", 400));
  const name = await nameOf(req.user);
  const data = { format: input.format, buyer: { icpId: input.buyer.icpId, stage: input.buyer.stage }, ...(input.idea ? { idea: input.idea } : {}) };
  const c = await StudioCreative.create({ creativeId: newRunId(), propertyId: input.propertyId, format: input.format, requestedBy: req.user._id, requestedByName: name, buyer: input.buyer, idea: input.idea, state: "queued", limit: s.CREATIVE_LIMIT_USD, commands: [{ type: "open", byName: name, data }] });
  res.status(201).json({ success: true, creative: await creativeView(c.toObject()) });
});

/** One of the editor's steps on a creative request, collected by the server. */
const creativeStep = (build) =>
  catchAsyncError(async (req, res, next) => {
    const c = await StudioCreative.findOne({ creativeId: String(req.params.id) });
    if (!c) return next(new ErrorHandler("No such creative.", 404));
    const problem = s.actProblem(c, req.user);
    if (problem) return next(new ErrorHandler(problem, 403));
    let step;
    try {
      step = build(c, req.body);
    } catch (e) {
      return next(new ErrorHandler(e.message, 400));
    }
    c.commands.push({ ...step.command, byName: await nameOf(req.user) });
    c.state = step.state;
    if (step.command.type !== "view") {
      c.error = c.state === "failed" ? c.error : null;
      c.notice = null;
    }
    await c.save();
    res.status(200).json({ success: true, creative: await creativeView(c.toObject()) });
  });

const hookForCreative = creativeStep(s.hookCommand);
const makeForCreative = creativeStep(s.makeCommand);
const decideForCreative = creativeStep(s.decideCommand);
const reviseForCreative = creativeStep(s.reviseCommand);
const photosForCreative = creativeStep(s.photosCommand);
const priceForCreative = creativeStep(s.priceCommand);
const retryForCreative = creativeStep(s.retryCommand);
const viewForCreative = creativeStep(s.viewCommand);

/** POST /api/v1/studio/creatives/poll  { updates, done } - the Creative OS says what finished and collects what waits. */
const pollCreatives = catchAsyncError(async (req, res, next) => {
  let updates;
  try {
    updates = s.cleanCreativeUpdates(req.body?.updates);
  } catch (e) {
    return next(new ErrorHandler(e.message, 400));
  }
  const done = (Array.isArray(req.body?.done) ? req.body.done : []).map(String).filter((id) => mongoose.isValidObjectId(id));
  if (done.length) {
    const ids = done.map((id) => new mongoose.Types.ObjectId(id));
    await StudioCreative.updateMany({ "commands._id": { $in: ids } }, { $set: { "commands.$[c].doneAt": new Date() } }, { arrayFilters: [{ "c._id": { $in: ids } }] });
  }
  for (const { creativeId, fields } of updates) {
    const c = await StudioCreative.findOne({ creativeId });
    if (!c) continue;
    // A person may have clicked again since: only the latest step's result moves the state on.
    const waiting = c.commands.filter((x) => !x.doneAt && x.type !== "view").length;
    const { state, ...rest } = fields;
    Object.assign(c, rest, waiting > 0 && state !== "failed" ? {} : { state });
    // A Make still waiting keeps the page on "making" until its own result arrives.
    if (waiting > 0 && c.commands.some((x) => !x.doneAt && x.type === "make")) c.state = "making";
    await c.save();
  }
  const open = await StudioCreative.find({ commands: { $elemMatch: { doneAt: null } } }).lean();
  const commands = open.flatMap((c) => c.commands.filter((x) => !x.doneAt).map((x) => ({ id: String(x._id), creativeId: c.creativeId, propertyId: c.propertyId, type: x.type, ...(x.data ? { data: x.data } : {}), byName: x.byName })));
  res.status(200).json({ success: true, commands });
});

/** POST /api/v1/studio/creatives/:id/file-link  { slot, file } - a short-lived link to upload one picture. */
const creativeFileLink = catchAsyncError(async (req, res, next) => {
  if (!storage()) return next(new ErrorHandler("Storage is not set up.", 503));
  const c = await StudioCreative.findOne({ creativeId: String(req.params.id) }).select("creativeId").lean();
  if (!c) return next(new ErrorHandler("No such creative.", 404));
  let file;
  try {
    file = cleanCut(`creatives/${c.creativeId}/${s.cleanCreativeSlot(req.body?.slot)}`, req.body?.file);
  } catch (e) {
    return next(new ErrorHandler(e.message, 400));
  }
  res.status(200).json({ success: true, uploadUrl: await uploadUrl(file.key) });
});

/** POST /api/v1/studio/creatives/:id/file  { slot, file } - the upload finished; checked before it is shown. */
const confirmCreativeFile = catchAsyncError(async (req, res, next) => {
  if (!storage()) return next(new ErrorHandler("Storage is not set up.", 503));
  const c = await StudioCreative.findOne({ creativeId: String(req.params.id) });
  if (!c) return next(new ErrorHandler("No such creative.", 404));
  let file;
  let slot;
  try {
    slot = s.cleanCreativeSlot(req.body?.slot);
    file = cleanCut(`creatives/${c.creativeId}/${slot}`, req.body?.file);
  } catch (e) {
    return next(new ErrorHandler(e.message, 400));
  }
  if ((await storedBytes(file.key)) !== file.bytes) return next(new ErrorHandler("The uploaded file is missing or not the right size.", 409));
  c.media = { ...(c.media ?? {}), [slot]: file };
  c.markModified("media");
  await c.save();
  res.status(200).json({ success: true });
});

module.exports = { listCreatives, startCreative, hookForCreative, makeForCreative, decideForCreative, reviseForCreative, photosForCreative, priceForCreative, retryForCreative, viewForCreative, pollCreatives, creativeFileLink, confirmCreativeFile };
