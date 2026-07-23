const mongoose = require("mongoose");
const voicePromptModel = require("../model/voicePromptModel");
const productModel = require("../model/productModel");
const { resolveProperty } = require("../services/vapiPropertyService");
const {
  PROMPT_VARIABLES,
  buildPreviewValues,
} = require("../services/vapiPromptService");
const catchAsyncError = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");

/**
 * GET /api/vapi/prompt/:propertyId
 * Returns the saved prompt (null when none exists yet) alongside the resolved
 * variable values for this property, so the editor can show the admin exactly
 * what each placeholder will speak.
 */
const getVoicePrompt = catchAsyncError(async (req, res, next) => {
  const { propertyId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(propertyId))
    return next(new ErrorHandler("Invalid property id", 400));

  const product = await productModel
    .findById(propertyId)
    .select("productName")
    .lean();

  if (!product) return next(new ErrorHandler("Property not found", 404));

  const prompt = await voicePromptModel
    .findOne({ propertyId })
    .select("-__v")
    .lean();

  // A missing starting bid / valuation makes resolveProperty throw. The editor
  // must still open, so fall back to empty property values and surface why.
  let variables;
  let variablesError = null;
  try {
    const property = await resolveProperty(propertyId);
    variables = buildPreviewValues(property);
  } catch (err) {
    variables = buildPreviewValues({});
    variablesError = err.message;
  }

  res.status(200).json({
    success: true,
    property: { _id: product._id, productName: product.productName },
    prompt: prompt || null,
    variables,
    variablesError,
  });
});

/**
 * PUT /api/vapi/prompt/:propertyId
 * Creates or replaces the prompt for a property.
 */
const upsertVoicePrompt = catchAsyncError(async (req, res, next) => {
  const { propertyId } = req.params;
  const {
    systemPrompt,
    firstMessage = "",
    voicemailMessage = "",
    endCallMessage = "",
  } = req.body;

  if (!mongoose.Types.ObjectId.isValid(propertyId))
    return next(new ErrorHandler("Invalid property id", 400));

  if (!systemPrompt || !String(systemPrompt).trim())
    return next(new ErrorHandler("systemPrompt is required", 400));

  const exists = await productModel.exists({ _id: propertyId });
  if (!exists) return next(new ErrorHandler("Property not found", 404));

  const prompt = await voicePromptModel.findOneAndUpdate(
    { propertyId },
    {
      propertyId,
      systemPrompt: String(systemPrompt).trim(),
      firstMessage: String(firstMessage).trim(),
      voicemailMessage: String(voicemailMessage).trim(),
      endCallMessage: String(endCallMessage).trim(),
      updatedBy: req.user?._id || null,
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  res.status(200).json({
    success: true,
    message: "Voice prompt saved",
    prompt,
  });
});

/**
 * GET /api/vapi/prompt-variables
 * Static variable catalogue — lets the editor render the reference list
 * before a property has been picked.
 */
const getPromptVariables = catchAsyncError(async (req, res) => {
  res.status(200).json({ success: true, variables: PROMPT_VARIABLES });
});

module.exports = {
  getVoicePrompt,
  upsertVoicePrompt,
  getPromptVariables,
};
