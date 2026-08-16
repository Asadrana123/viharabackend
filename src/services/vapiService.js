const axios = require("axios");
const { buildVariableValues } = require("./vapiPromptService");

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;
const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID;

// The model override must name a provider or VAPI rejects the payload.
// These default to the assistant's dashboard config; override per environment.
const VAPI_MODEL_PROVIDER = process.env.VAPI_MODEL_PROVIDER || "openai";
const VAPI_MODEL = process.env.VAPI_MODEL || "gpt-5.1";

// Callback tool wiring. When VAPI_WEBHOOK_URL is set, every call Maya makes gets
// a `scheduleCallback` function tool she can invoke when the caller asks to be
// called back later. VAPI posts the tool call to VAPI_WEBHOOK_URL and speaks
// back whatever the webhook returns. The secret is sent as `x-vapi-secret` so
// the webhook can verify the request is really from VAPI.
const VAPI_WEBHOOK_URL = process.env.VAPI_WEBHOOK_URL;   // e.g. https://api.vihara.ai/api/vapi/webhook
const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET;

// Voicemail detection tuning (VAPI's recommended sales-outreach profile).
// Sent on every call so behaviour is deterministic and does not depend on the
// dashboard assistant's toggle. The message that gets spoken once voicemail is
// detected is the per-property `voicemailMessage` authored in the Prompt tab;
// if that is blank VAPI simply hangs up without leaving a message.
const VOICEMAIL_DETECTION = {
  provider: "vapi",
  backoffPlan: {
    maxRetries: 5,
    startAtSeconds: 2,
    frequencySeconds: 2.5,
  },
  beepMaxAwaitSeconds: 25,
};

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
 * The scheduleCallback tool definition. Returned only when a webhook URL is
 * configured, so nothing breaks in environments without it. The description is
 * what the model reads to decide when to call it — it is written to fire exactly
 * when the caller asks to be rung back at a later time.
 */
const buildCallbackTool = () => {
  if (!VAPI_WEBHOOK_URL) return null;
  return {
    type: "function",
    async: false, // VAPI waits for the webhook so Maya can speak the confirmation
    function: {
      name: "scheduleCallback",
      description:
        "Schedule a callback when the caller asks to be called back later — e.g. 'call me in 5 minutes', 'try me in half an hour', or 'call me back at 5pm'. Convert their words into delayMinutes (minutes from now). Only use callAtISO if they name a specific clock time and you can express it as a full ISO 8601 timestamp; otherwise prefer delayMinutes. Do not use this to end the call or for anything other than a genuine callback request.",
      parameters: {
        type: "object",
        properties: {
          delayMinutes: {
            type: "number",
            description:
              "Minutes from now to call back. e.g. 5, 10, 15, 30, 60. Preferred field.",
          },
          callAtISO: {
            type: "string",
            description:
              "Optional. An absolute ISO 8601 time to call back, only when the caller names a specific clock time.",
          },
          note: {
            type: "string",
            description: "Optional short reason the caller gave for the callback.",
          },
        },
      },
    },
    server: {
      url: VAPI_WEBHOOK_URL,
      ...(VAPI_WEBHOOK_SECRET ? { secret: VAPI_WEBHOOK_SECRET } : {}),
    },
  };
};

/**
 * Build the assistantOverrides payload. The admin-authored prompt replaces
 * the dashboard assistant's system message; blank optional fields are omitted
 * so the dashboard value is preserved rather than blanked out.
 *
 * voicemailDetection is always attached so an unanswered call that rings out
 * to voicemail is detected and the voicemailMessage (when set) is left.
 *
 * When a webhook URL is configured, the scheduleCallback tool is attached to the
 * model override so Maya can book callbacks the caller asks for.
 */
const buildAssistantOverrides = (contact, researchSummary, property, promptConfig) => {
  const overrides = {
    variableValues: buildVariableValues(contact, researchSummary, property),
    voicemailDetection: VOICEMAIL_DETECTION,
  };

  const callbackTool = buildCallbackTool();

  if (!promptConfig) {
    // No admin prompt (legacy default path). Still attach the tool via a model
    // override that carries only tools, leaving the dashboard system message and
    // provider untouched apart from the provider/model VAPI requires.
    if (callbackTool) {
      overrides.model = {
        provider: VAPI_MODEL_PROVIDER,
        model: VAPI_MODEL,
        tools: [callbackTool],
      };
    }
    return overrides;
  }

  if (promptConfig.systemPrompt) {
    overrides.model = {
      provider: VAPI_MODEL_PROVIDER,
      model: VAPI_MODEL,
      messages: [{ role: "system", content: promptConfig.systemPrompt }],
      ...(callbackTool ? { tools: [callbackTool] } : {}),
    };
  } else if (callbackTool) {
    overrides.model = {
      provider: VAPI_MODEL_PROVIDER,
      model: VAPI_MODEL,
      tools: [callbackTool],
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
        // Context echoed back on webhooks. Lets the callback webhook re-use the
        // same property's prompt when Maya books a callback on this call.
        metadata: {
          source: "vihara-voice",
          propertyId: property && property.id ? property.id : null,
        },
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


const getCall = async (callId) => {
  const { data } = await axios.get(`https://api.vapi.ai/call/${callId}`, {
    headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
  });
  return data;
};

module.exports = { parsePhones, dispatchCall, PROPERTY, getCall };
