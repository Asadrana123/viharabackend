// controller/slides/slideDeckController.js
//
// Admin asks for a deck → it's made in the background → admin polls until
// it's "ready" (with the Google Slides link) or "failed" (with the reason).
const catchAsyncError = require("../../middleware/catchAsyncError");
const ErrorHandler = require("../../utils/errorhandler");
const SlideDeck = require("../../model/slides/slideDeckModel");
const { startDeck, startRevision, failStaleDecks } = require("../../services/slides/deckJobService");
const { getConnectionStatus } = require("../../services/slides/googleAuthService");
const { MIN_SLIDES, MAX_SLIDES, DEFAULT_SLIDES, MAX_NOTES_CHARS } = require("../../config/slidesAgentConfig");

const adminName = (user) =>
  [user?.name, user?.last_name].filter(Boolean).join(" ") || user?.email || "Admin";

const LIST_FIELDS = "topic audience slideCount status step error title url requestedByName createdAt updatedAt";

exports.createDeck = catchAsyncError(async (req, res, next) => {
  const topic = String(req.body?.topic || "").trim();
  const audience = String(req.body?.audience || "").trim();
  const notes = String(req.body?.notes || "").trim();
  const slideCount = req.body?.slideCount == null ? DEFAULT_SLIDES : Number(req.body.slideCount);

  if (!topic) return next(new ErrorHandler("Please write what the deck is about", 400));
  if (topic.length > 300) return next(new ErrorHandler("Keep the topic under 300 characters; put the details in the notes", 400));
  if (audience.length > 300) return next(new ErrorHandler("Keep the audience under 300 characters", 400));
  if (notes.length > MAX_NOTES_CHARS) return next(new ErrorHandler(`Notes can be at most ${MAX_NOTES_CHARS.toLocaleString("en-US")} characters`, 400));
  if (!Number.isInteger(slideCount) || slideCount < MIN_SLIDES || slideCount > MAX_SLIDES) {
    return next(new ErrorHandler(`Number of slides must be between ${MIN_SLIDES} and ${MAX_SLIDES}`, 400));
  }
  if (!(await getConnectionStatus()).connected) return next(new ErrorHandler("Connect Google first, then make a deck", 409));

  const deck = await SlideDeck.create({
    topic,
    audience,
    notes,
    slideCount,
    step: "Starting",
    requestedById: req.user._id,
    requestedByName: adminName(req.user),
    requestedByEmail: req.user.email || "",
  });
  startDeck(deck._id);
  res.status(201).json({ success: true, deck: await SlideDeck.findById(deck._id).select(LIST_FIELDS) });
});

exports.getDeck = catchAsyncError(async (req, res, next) => {
  await failStaleDecks();
  const deck = await SlideDeck.findById(req.params.id).select(`${LIST_FIELDS} notes plan revisions`).catch(() => null);
  if (!deck) return next(new ErrorHandler("Deck not found", 404));
  res.status(200).json({ success: true, deck });
});

exports.listDecks = catchAsyncError(async (req, res) => {
  await failStaleDecks();
  const decks = await SlideDeck.find().sort({ createdAt: -1 }).limit(50).select(LIST_FIELDS);
  res.status(200).json({ success: true, decks });
});

// Ask the agent to change a finished deck. Only the slides that change are rebuilt.
exports.reviseDeck = catchAsyncError(async (req, res, next) => {
  const instruction = String(req.body?.instruction || "").trim();
  if (!instruction) return next(new ErrorHandler("Please say what you'd like to change", 400));
  if (instruction.length > 2000) return next(new ErrorHandler("Keep the change under 2,000 characters", 400));

  // Only a ready deck made with visual slide types, and only one change at a time.
  const deck = await SlideDeck.findOneAndUpdate(
    { _id: req.params.id, status: "ready", "plan.0.type": { $exists: true } },
    { $set: { status: "working", step: "Starting" }, $push: { revisions: { instruction, byName: adminName(req.user) } } },
    { new: true, projection: `${LIST_FIELDS} notes plan revisions` }
  ).catch(() => null);

  if (!deck) {
    const existing = await SlideDeck.findById(req.params.id).select("status plan").lean().catch(() => null);
    if (!existing) return next(new ErrorHandler("Deck not found", 404));
    if (existing.status === "working") return next(new ErrorHandler("This deck is already being worked on. Wait for it to finish.", 409));
    if (existing.status === "failed") return next(new ErrorHandler("This deck wasn't made, so it can't be changed. Try making it again.", 409));
    return next(new ErrorHandler("This deck was made with an older version of the agent and can't be changed. Make a new deck instead.", 409));
  }
  startRevision(deck._id);
  res.status(200).json({ success: true, deck });
});
