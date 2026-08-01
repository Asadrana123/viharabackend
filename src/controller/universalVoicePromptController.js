const universalVoicePromptModel = require("../model/universalVoicePromptModel");
const { PROMPT_VARIABLES } = require("../services/vapiPromptService");
const catchAsyncError = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");

const CONTACT_VARIABLES = PROMPT_VARIABLES.filter((v) => v.scope === "contact");

const getUniversalPrompt = catchAsyncError(async (req, res) => {
  const prompt = await universalVoicePromptModel
    .findOne({ singletonKey: "universal" })
    .select("-__v")
    .lean();
  res.status(200).json({ success: true, prompt: prompt || null, variables: CONTACT_VARIABLES });
});

const upsertUniversalPrompt = catchAsyncError(async (req, res, next) => {
  const { systemPrompt, firstMessage = "", voicemailMessage = "", endCallMessage = "" } = req.body;

  if (!systemPrompt || !String(systemPrompt).trim())
    return next(new ErrorHandler("systemPrompt is required", 400));

  const prompt = await universalVoicePromptModel.findOneAndUpdate(
    { singletonKey: "universal" },
    {
      singletonKey: "universal",
      systemPrompt: String(systemPrompt).trim(),
      firstMessage: String(firstMessage).trim(),
      voicemailMessage: String(voicemailMessage).trim(),
      endCallMessage: String(endCallMessage).trim(),
      updatedBy: req.user?._id || null,
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  res.status(200).json({ success: true, message: "Universal prompt saved", prompt });
});

module.exports = { getUniversalPrompt, upsertUniversalPrompt };