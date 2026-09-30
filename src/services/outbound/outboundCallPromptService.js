// services/outbound/outboundCallPromptService.js
//
// CRUD + resolution for the Outbound call prompt — a separate store from
// src/services/calling/vapiPromptService.js's per-property voice prompt
// (voicePromptModel). Only imports resolveProperty/buildPreviewValues from
// src/services/calling/ (read-only reuse, never edited), same constraint as
// outboundCallRunner.js.

const OutboundCallPrompt = require("../../model/outbound/outboundCallPromptModel");
const Errorhandler = require("../../utils/errorhandler");
const { resolveProperty } = require("../calling/vapiPropertyService");
const { PROMPT_VARIABLES, buildPreviewValues } = require("../calling/vapiPromptService");

/**
 * Returns the saved prompt (null when none exists yet) alongside the
 * resolved variable values for this property, so the editor can show the
 * admin exactly what each placeholder will speak. Mirrors
 * voicePromptController.getVoicePrompt.
 */
const getOutboundCallPrompt = async (propertyId) => {
  const prompt = await OutboundCallPrompt.findOne({ propertyId }).select("-__v").lean();

  let variables;
  let variablesError = null;
  try {
    const property = await resolveProperty(propertyId);
    variables = buildPreviewValues(property);
  } catch (err) {
    variables = buildPreviewValues({});
    variablesError = err.message;
  }

  return { prompt: prompt || null, variables, variablesError };
};

/** Creates or replaces the Outbound call prompt for a property. */
const upsertOutboundCallPrompt = async (propertyId, { systemPrompt, firstMessage = "", voicemailMessage = "", endCallMessage = "" }, user) => {
  if (!systemPrompt || !String(systemPrompt).trim()) {
    throw new Errorhandler("systemPrompt is required", 400);
  }

  const prompt = await OutboundCallPrompt.findOneAndUpdate(
    { propertyId },
    {
      propertyId,
      systemPrompt: String(systemPrompt).trim(),
      firstMessage: String(firstMessage).trim(),
      voicemailMessage: String(voicemailMessage).trim(),
      endCallMessage: String(endCallMessage).trim(),
      updatedBy: user?._id || null,
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  return prompt;
};

/**
 * Resolves the prompt config dispatchCall expects, throwing (with
 * statusCode) if none has been written yet. Same contract as
 * vapiPromptService's equivalent resolver.
 */
const resolveOutboundCallPromptConfig = async (propertyId) => {
  const prompt = await OutboundCallPrompt.findOne({ propertyId }).lean();

  if (!prompt || !prompt.systemPrompt) {
    const err = new Error("No Outbound call prompt has been written for this property yet. Add one in the Calls tab before dispatching.");
    err.statusCode = 422;
    throw err;
  }

  return {
    systemPrompt: prompt.systemPrompt,
    firstMessage: prompt.firstMessage || "",
    voicemailMessage: prompt.voicemailMessage || "",
    endCallMessage: prompt.endCallMessage || "",
  };
};

module.exports = {
  PROMPT_VARIABLES,
  getOutboundCallPrompt,
  upsertOutboundCallPrompt,
  resolveOutboundCallPromptConfig,
};
