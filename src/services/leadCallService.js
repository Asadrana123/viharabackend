// services/leadCallService.js
//
// Dispatches a single outbound call to a registered lead using ONE universal
// prompt. Prompt is read DB-first (admin-editable universalVoicePromptModel)
// and falls back to config/universalVoicePrompt.js when none is saved.

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

  const promptConfig = await loadUniversalPrompt();

  return dispatchCall(phones[0], contact, {
    researchSummary: "",
    property: {},
    promptConfig,
  });
};

module.exports = { dispatchRegistrationCall };