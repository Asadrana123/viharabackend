const axios = require("axios");
const { buildVariableValues } = require("./vapiPromptService");

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;
const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID;

// The model override must name a provider or VAPI rejects the payload.
// These default to the assistant's dashboard config; override per environment.
const VAPI_MODEL_PROVIDER = process.env.VAPI_MODEL_PROVIDER || "openai";
const VAPI_MODEL = process.env.VAPI_MODEL || "gpt-4o";

// Fallback property, kept for backwards compatibility with any caller that
// still resolves without a propertyId. Live calls always pass a real property.
const PROPERTY = {
  address: "1496 Adeline St, Oakland, California 94607",
  type: "3-bedroom 2-bathroom REO Bank Owned Townhome",
  starting_bid: "three hundred thousand dollars",
  estimate: "six hundred sixty five thousand dollars",
  monthly_rent: "three thousand three hundred seventy one dollars",
  listing_url: "vihara.ai/listing/oakland-auction",
};

/**
 * Parse phones from "phone1 | phone2 | phone3" format
 * Returns array of valid E.164 formatted numbers
 */
const parsePhones = (phonesStr) => {
  if (!phonesStr) return [];
  return phonesStr
    .split("|")
    .map((p) => p.trim())
    .filter((p) => p.length > 6)
    .map((p) => {
      const digits = p.replace(/\D/g, "");
      // India — must include the country code. A bare 10-digit number is
      // ambiguous with US, so it is not auto-detected as Indian.
      if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
      // US / Canada
      if (digits.length === 10) return `+1${digits}`;
      if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
      return null;
    })
    .filter(Boolean);
};

/**
 * Build the assistantOverrides payload. The admin-authored prompt replaces
 * the dashboard assistant's system message; blank optional fields are omitted
 * so the dashboard value is preserved rather than blanked out.
 */
const buildAssistantOverrides = (contact, researchSummary, property, promptConfig) => {
  const overrides = {
    variableValues: buildVariableValues(contact, researchSummary, property),
  };

  if (!promptConfig) return overrides;

  if (promptConfig.systemPrompt) {
    overrides.model = {
      provider: VAPI_MODEL_PROVIDER,
      model: VAPI_MODEL,
      messages: [{ role: "system", content: promptConfig.systemPrompt }],
    };
  }
  if (promptConfig.firstMessage) overrides.firstMessage = promptConfig.firstMessage;
  if (promptConfig.voicemailMessage)
    overrides.voicemailMessage = promptConfig.voicemailMessage;
  if (promptConfig.endCallMessage)
    overrides.endCallMessage = promptConfig.endCallMessage;

  return overrides;
};

/**
 * Dispatch a single call via VAPI.
 *
 * @param {string} phoneNumber      E.164 number
 * @param {object} person          normalised contact
 * @param {object} options
 * @param {string} options.researchSummary  enrichment text ("" when skipped)
 * @param {object} options.property         resolved property being pitched
 * @param {object} options.promptConfig     admin-authored prompt for that property
 */
const dispatchCall = async (
  phoneNumber,
  person,
  { researchSummary = "", property = PROPERTY, promptConfig = null } = {}
) => {
  try {
    const response = await axios.post(
      "https://api.vapi.ai/call",
      {
        assistantId: VAPI_ASSISTANT_ID,
        phoneNumberId: VAPI_PHONE_NUMBER_ID,
        customer: {
          number: phoneNumber,
          name: person.fullName,
        },
        assistantOverrides: buildAssistantOverrides(
          person,
          researchSummary,
          property,
          promptConfig
        ),
      },
      {
        headers: {
          Authorization: `Bearer ${VAPI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(
      `✅ Call dispatched: ${person.fullName} → ${phoneNumber} | Call ID: ${response.data.id}`
    );
    return { success: true, callId: response.data.id, phone: phoneNumber };
  } catch (err) {
    const reason =
      err.response?.data?.message ||
      (Array.isArray(err.response?.data?.error)
        ? err.response.data.error.join(", ")
        : err.response?.data?.error) ||
      err.message;

    console.error(
      `❌ Call failed: ${person.fullName} → ${phoneNumber}:`,
      err.response?.data || err.message
    );
    return { success: false, phone: phoneNumber, error: String(reason) };
  }
};

module.exports = { parsePhones, dispatchCall, PROPERTY };
