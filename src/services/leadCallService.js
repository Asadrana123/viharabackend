// services/leadCallService.js
//
// Dispatches a single outbound call to a registered lead.
//
// Prompt selection:
//   1. If the lead carries an explicit `promptConfig` (e.g. the 449 Georgia St
//      auction scheduler pins config/georgiaStVoicePrompt.js on every dial),
//      use it verbatim.
//   2. Otherwise fall back to the ONE universal prompt, read DB-first
//      (admin-editable universalVoicePromptModel) with config/universalVoicePrompt.js
//      as the final fallback.
//
// Early-access and persona flows pass no promptConfig, so their behaviour is
// unchanged.

const { parsePhones, dispatchCall } = require("./vapiService");
const UNIVERSAL_PROMPT_FILE = require("../config/universalVoicePrompt");
const universalVoicePromptModel = require("../model/universalVoicePromptModel");

/** DB-first prompt load, with the hardcoded file as fallback. */
const loadUniversalPrompt = async () => {
  const saved = await universalVoicePromptModel
    .findOne({ singletonKey: "universal" })
    .lean();

  if (saved && saved.systemPrompt) {
    return {
      systemPrompt: saved.systemPrompt,
      firstMessage: saved.firstMessage || "",
      voicemailMessage: saved.voicemailMessage || "",
      endCallMessage: saved.endCallMessage || "",
    };
  }
  return UNIVERSAL_PROMPT_FILE;
};

const dispatchRegistrationCall = async (lead = {}) => {
  const phones = parsePhones(lead.phone);
  if (!phones.length) {
    return { success: false, error: "Invalid or unreachable phone number" };
  }

  const contact = {
    fullName: (lead.fullName || "").trim(),
    city: (lead.city || "").trim(),
    state: (lead.state || "").trim(),
    email: (lead.email || "").trim() || null,
  };

  // Per-lead prompt override wins (e.g. 449 Georgia St auction); else universal.
  const promptConfig =
    lead.promptConfig && lead.promptConfig.systemPrompt
      ? lead.promptConfig
      : await loadUniversalPrompt();

  return dispatchCall(phones[0], contact, {
    researchSummary: "",
    property: {},
    promptConfig,
  });
};

module.exports = { dispatchRegistrationCall };
