// controller/studio/studioController.js
//
// The Video Studio (vihara.ai/studio) for video editors: the interview, their profile and their
// notes; the videos and people's feedback on them; and for admins, the editors and the interview's
// questions. Every answer is the editor's own text, stored as typed (services/studio/interviewService.js).

const mongoose = require("mongoose");
const catchAsyncError = require("../../middleware/catchAsyncError");
const ErrorHandler = require("../../utils/errorhandler");
const EditorProfile = require("../../model/studio/editorProfileModel");
const StudioSettings = require("../../model/studio/studioSettingsModel");
const StudioVideo = require("../../model/studio/studioVideoModel");
const userModel = require("../../model/users/userModel");
const { CORE_QUESTIONS, CORE_KEYS } = require("../../config/studio/interviewQuestions");
const { startInterview, answerInterview, editSection, interviewStatus, syncSections, parseInterviewBlock } = require("../../services/studio/interviewService");
const { keyMatches, cleanBatch, cleanFeedback, undelivered } = require("../../services/studio/videoService");

const KEY = /^[a-z][a-z0-9-]{1,30}$/;

async function loadQuestions() {
  const doc = await StudioSettings.findOne({ key: "interview" }).lean();
  return doc?.questions?.length ? doc.questions : CORE_QUESTIONS;
}

/** The signed-in person's profile, made on first use with their account name. */
async function ownProfile(user) {
  let profile = await EditorProfile.findOne({ user: user._id });
  if (!profile) profile = new EditorProfile({ user: user._id, name: (user.name || user.email || "Editor").slice(0, 40) });
  return profile;
}

const view = (profile, questions) => {
  if (!profile) return null;
  syncSections(profile, questions);
  return { ...profile.toObject(), status: interviewStatus(profile, questions) };
};

/** GET /api/v1/studio/me */
const me = catchAsyncError(async (req, res) => {
  const questions = await loadQuestions();
  const profile = await EditorProfile.findOne({ user: req.user._id });
  res.status(200).json({
    success: true,
    user: { id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role },
    questions,
    profile: view(profile, questions),
  });
});

/** POST /api/v1/studio/interview/start */
const start = catchAsyncError(async (req, res) => {
  const questions = await loadQuestions();
  const profile = await ownProfile(req.user);
  const turn = startInterview(profile, questions);
  await profile.save();
  res.status(200).json({ success: true, ...turn, profile: view(profile, questions) });
});

/** POST /api/v1/studio/interview/answer  { text } */
const answer = catchAsyncError(async (req, res, next) => {
  const questions = await loadQuestions();
  const profile = await EditorProfile.findOne({ user: req.user._id });
  if (!profile) return next(new ErrorHandler("Start the interview first.", 400));
  let turn;
  try {
    turn = await answerInterview(profile, questions, req.body?.text);
  } catch (e) {
    return next(new ErrorHandler(e.message, 400));
  }
  await profile.save();
  res.status(200).json({ success: true, ...turn, profile: view(profile, questions) });
});

/** PUT /api/v1/studio/profile/sections/:key  { text } */
const updateSection = catchAsyncError(async (req, res, next) => {
  const questions = await loadQuestions();
  const profile = await ownProfile(req.user);
  try {
    editSection(profile, questions, req.params.key, req.body?.text);
  } catch (e) {
    return next(new ErrorHandler(e.message, 400));
  }
  await profile.save();
  res.status(200).json({ success: true, profile: view(profile, questions) });
});

/** PUT /api/v1/studio/profile/name  { name } */
const updateName = catchAsyncError(async (req, res, next) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name || name.length > 40) return next(new ErrorHandler("A name of 1 to 40 characters.", 400));
  const questions = await loadQuestions();
  const profile = await ownProfile(req.user);
  profile.name = name;
  await profile.save();
  res.status(200).json({ success: true, profile: view(profile, questions) });
});

/** POST /api/v1/studio/profile/notes  { video, text } - what the editor learned or fixed on a video. */
const addNote = catchAsyncError(async (req, res, next) => {
  const text = String(req.body?.text ?? "").trim();
  if (!text) return next(new ErrorHandler("Write the note.", 400));
  const questions = await loadQuestions();
  const profile = await ownProfile(req.user);
  profile.notes.push({ video: String(req.body?.video ?? "").trim().slice(0, 80), text });
  await profile.save();
  res.status(201).json({ success: true, profile: view(profile, questions) });
});

/** GET /api/v1/studio/editors (admin) - every editor and where their interview stands. */
const listEditors = catchAsyncError(async (req, res) => {
  const questions = await loadQuestions();
  const editors = await userModel.find({ role: "editor" }).select("name email").lean();
  const profiles = await EditorProfile.find({}).populate("user", "name email role");
  const byUser = new Map(profiles.filter((p) => p.user).map((p) => [String(p.user._id), p]));
  const rows = editors.map((u) => {
    const p = byUser.get(String(u._id));
    return { userId: u._id, email: u.email, accountName: u.name, profile: p ? view(p, questions) : null };
  });
  // Admins and others who have a profile but no editor role are listed too.
  for (const p of profiles) if (p.user && p.user.role !== "editor") rows.push({ userId: p.user._id, email: p.user.email, accountName: p.user.name, profile: view(p, questions) });
  res.status(200).json({ success: true, questions, editors: rows });
});

/** POST /api/v1/studio/editors  { email } (admin) - gives an existing account the editor role. */
const addEditor = catchAsyncError(async (req, res, next) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  if (!email) return next(new ErrorHandler("The editor's account email is required.", 400));
  const user = await userModel.findOne({ email });
  if (!user) return next(new ErrorHandler("No Vihara account with that email. The editor signs up at vihara.ai first.", 404));
  if (user.role === "admin") return next(new ErrorHandler("That account is an admin; admins already see the Studio.", 400));
  user.role = "editor";
  await user.save({ validateBeforeSave: false });
  res.status(200).json({ success: true, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
});

/** DELETE /api/v1/studio/editors/:userId (admin) - takes the editor role away; their profile stays. */
const removeEditor = catchAsyncError(async (req, res, next) => {
  const user = await userModel.findById(req.params.userId);
  if (!user || user.role !== "editor") return next(new ErrorHandler("Not an editor.", 404));
  user.role = "user";
  await user.save({ validateBeforeSave: false });
  res.status(200).json({ success: true });
});

/**
 * POST /api/v1/studio/editors/:userId/import  { text } (admin) - an interview taken in Claude Code,
 * pasted from learning/video-editors.md, into the editor's profile, word for word. Refused when the
 * editor already has answers in the Studio.
 */
const importInterview = catchAsyncError(async (req, res, next) => {
  const user = await userModel.findById(req.params.userId);
  if (!user || user.role !== "editor") return next(new ErrorHandler("Not an editor.", 404));
  const questions = await loadQuestions();
  let parsed;
  try {
    parsed = parseInterviewBlock(req.body?.text, questions, user.name);
  } catch (e) {
    return next(new ErrorHandler(e.message, 400));
  }
  const profile = await ownProfile(user);
  if (profile.sections.some((s) => s.entries.length)) return next(new ErrorHandler("This editor already has answers in the Studio; nothing was imported.", 400));
  profile.name = parsed.name;
  profile.startedAt = parsed.startedAt;
  profile.interviewedAt = parsed.startedAt;
  profile.importedFrom = "claude-code";
  profile.sections = parsed.sections;
  syncSections(profile, questions);
  profile.interview.state = "done";
  await profile.save();
  res.status(200).json({ success: true, profile: view(profile, questions) });
});

/** PUT /api/v1/studio/questions  { questions } (admin) - reword or add interview questions. */
const updateQuestions = catchAsyncError(async (req, res, next) => {
  const list = Array.isArray(req.body?.questions) ? req.body.questions : null;
  if (!list || list.length < CORE_KEYS.length || list.length > 20) return next(new ErrorHandler(`Send the questions: the ${CORE_KEYS.length} core ones and up to ${20 - CORE_KEYS.length} more.`, 400));
  const clean = list.map((q) => ({ key: String(q?.key ?? "").trim(), label: String(q?.label ?? "").trim(), question: String(q?.question ?? "").trim(), usable: String(q?.usable ?? "").trim() }));
  const keys = new Set();
  for (const q of clean) {
    if (!KEY.test(q.key)) return next(new ErrorHandler(`"${q.key}" is not a valid key: lower-case letters, digits and hyphens.`, 400));
    if (keys.has(q.key)) return next(new ErrorHandler(`The key "${q.key}" is used twice.`, 400));
    keys.add(q.key);
    if (!q.label || !q.question) return next(new ErrorHandler(`"${q.key}" needs a label and a question.`, 400));
  }
  for (const core of CORE_QUESTIONS) {
    const q = clean.find((x) => x.key === core.key);
    if (!q) return next(new ErrorHandler(`The core section "${core.label}" cannot be removed.`, 400));
    // The Creative OS reads interviews by these labels (learning/video-editors.md).
    if (q.label !== core.label) return next(new ErrorHandler(`The label of "${core.key}" stays "${core.label}"; change its question instead.`, 400));
  }
  const doc = await StudioSettings.findOneAndUpdate({ key: "interview" }, { questions: clean, updatedByName: req.user.name || req.user.email }, { upsert: true, new: true });
  res.status(200).json({ success: true, questions: doc.questions });
});

/** What the Studio shows of a video: people's names, never their account ids. */
const videoView = (v) => ({ ...v, feedback: (v.feedback ?? []).map(({ _id, text, byName, at }) => ({ _id, text, byName, at })) });

/** GET /api/v1/studio/videos - every video, newest build first. */
const listVideos = catchAsyncError(async (req, res) => {
  const videos = await StudioVideo.find({}).sort({ lastBuildAt: -1, updatedAt: -1 }).lean();
  res.status(200).json({ success: true, videos: videos.map(videoView) });
});

/** POST /api/v1/studio/videos/:coreId/feedback  { text } - a person's words on a video. Not a gate decision. */
const addVideoFeedback = catchAsyncError(async (req, res, next) => {
  let text;
  try {
    text = cleanFeedback(req.body?.text);
  } catch (e) {
    return next(new ErrorHandler(e.message, 400));
  }
  const video = await StudioVideo.findOne({ coreId: String(req.params.coreId) });
  if (!video) return next(new ErrorHandler("No such video.", 404));
  const profile = await EditorProfile.findOne({ user: req.user._id }).select("name").lean();
  video.feedback.push({ text, byName: profile?.name || req.user.name || req.user.email, user: req.user._id });
  await video.save();
  res.status(201).json({ success: true, video: videoView(video.toObject()) });
});

/**
 * POST /api/v1/studio/videos/sync  { videos, received } with the x-studio-key header. The Creative
 * OS sends its job summaries and the ids of the feedback it has stored; the reply is the feedback
 * it has not stored yet. An id is marked delivered only once it says so, so nothing is lost if a
 * push fails halfway.
 */
const syncVideos = catchAsyncError(async (req, res, next) => {
  if (!process.env.STUDIO_SYNC_KEY) return next(new ErrorHandler("Studio video sync is not set up.", 503));
  if (!keyMatches(process.env.STUDIO_SYNC_KEY, req.get("x-studio-key"))) return next(new ErrorHandler("Wrong sync key.", 401));
  let rows;
  try {
    rows = cleanBatch(req.body?.videos);
  } catch (e) {
    return next(new ErrorHandler(e.message, 400));
  }
  const now = new Date();
  if (rows.length) await StudioVideo.bulkWrite(rows.map((r) => ({ updateOne: { filter: { coreId: r.coreId }, update: { $set: { ...r, syncedAt: now } }, upsert: true } })));
  const received = (Array.isArray(req.body?.received) ? req.body.received : []).map(String).filter((id) => mongoose.isValidObjectId(id));
  if (received.length) {
    const ids = received.map((id) => new mongoose.Types.ObjectId(id));
    await StudioVideo.updateMany({ "feedback._id": { $in: ids } }, { $set: { "feedback.$[f].deliveredAt": now } }, { arrayFilters: [{ "f._id": { $in: ids } }] });
  }
  const pending = await StudioVideo.find({ "feedback.deliveredAt": null }).select("coreId feedback").lean();
  res.status(200).json({ success: true, stored: rows.length, feedback: undelivered(pending) });
});

module.exports = { me, start, answer, updateSection, updateName, addNote, listEditors, addEditor, removeEditor, importInterview, updateQuestions, listVideos, addVideoFeedback, syncVideos };
