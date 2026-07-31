// services/leadCallService.js
//
// Dispatches a single outbound call to a freshly-registered lead using ONE
// universal prompt (config/universalVoicePrompt.js). No per-property lookup.
// Reuses the existing VAPI primitives so call behaviour stays identical.

const { parsePhones, dispatchCall } = require("./vapiService");
const UNIVERSAL_PROMPT = require("../config/universalVoicePrompt");

/**
 * @param {object} lead
 * @param {string} lead.fullName
 * @param {string} lead.phone     raw phone from the form
 * @param {string} [lead.city]
 * @param {string} [lead.state]
 * @param {string} [lead.email]
 * @param {string} [lead.flipsPerYear]
 */
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
    flipsPerYear: (lead.flipsPerYear || "").toString().trim(),
  };

  return dispatchCall(phones[0], contact, {
    researchSummary: "",
    property: {},
    promptConfig: UNIVERSAL_PROMPT,
  });
};

module.exports = { dispatchRegistrationCall };
