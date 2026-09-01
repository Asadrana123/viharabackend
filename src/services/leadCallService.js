// services/leadCallService.js

const { parsePhones, dispatchCall } = require("./vapiService");
const UNIVERSAL_PROMPT_FILE = require("../config/universalVoicePrompt");
const universalVoicePromptModel = require("../model/universalVoicePromptModel");
const { buildFollowUp } = require("../config/voicePromptFollowUp");

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
    market: (lead.market || "").toString().trim(),
    buyerType: (lead.buyerType || "").toString().trim(),
    dealSize: (lead.dealSize || "").toString().trim(),
  };

  // Per-lead prompt override wins (e.g. 449 Georgia St auction); else universal.
  let promptConfig =
    lead.promptConfig && lead.promptConfig.systemPrompt
      ? lead.promptConfig
      : await loadUniversalPrompt();

  // Daily-callback sweeps pass isFollowUp:true so the call doesn't reuse the
  // signup script. Transform whatever prompt we resolved into its follow-up
  // variant — one central place, every page.
  if (lead.isFollowUp) {
    promptConfig = buildFollowUp(promptConfig);
  }

  return dispatchCall(phones[0], contact, {
    researchSummary: "",
    property: {},
    promptConfig,
    // Carry the funnel tag ("nor-cal" / "early-access" / "partner-program" / …)
    // into VAPI metadata so a callback booked mid-call can re-use the same
    // funnel prompt. Empty for property/universal calls — unchanged behaviour.
    source: (lead.source || "").toString().trim(),
  });
};

module.exports = { dispatchRegistrationCall };