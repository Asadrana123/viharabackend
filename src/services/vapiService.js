const axios = require("axios");
const { buildVariableValues } = require("./vapiPromptService");

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;
const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID;

const VAPI_MODEL_PROVIDER = process.env.VAPI_MODEL_PROVIDER || "openai";
const VAPI_MODEL = process.env.VAPI_MODEL || "gpt-5.1";

const VAPI_WEBHOOK_URL = process.env.VAPI_WEBHOOK_URL;
const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET;

console.log("[cb-debug] vapiService loaded. VAPI_WEBHOOK_URL =", VAPI_WEBHOOK_URL || "(NOT SET)",
  "| secret set?", !!VAPI_WEBHOOK_SECRET);

// Appended to the system prompt whenever the scheduleCallback tool is attached,
// so the agent reliably USES the tool instead of just verbally agreeing. Kept
// short and directive because the property prompts are tight scripts.
const CALLBACK_INSTRUCTION = `

## Handling callback requests (IMPORTANT)
You have a tool called scheduleCallback. If the caller asks you to call them back later — for example "call me in 5 minutes", "try me in half an hour", "call me tomorrow", or "call me at 5pm" — you MUST call the scheduleCallback function. Set delayMinutes to the number of minutes from now (convert their words into a number: "five minutes" = 5, "half an hour" = 30, "an hour" = 60). Call the tool BEFORE you say goodbye or end the call. After the tool succeeds, briefly confirm the time out loud (for example, "Got it, I'll call you back in five minutes"). Never promise a callback without calling scheduleCallback.`;

const VOICEMAIL_DETECTION = {
  provider: "vapi",
  backoffPlan: { maxRetries: 5, startAtSeconds: 2, frequencySeconds: 2.5 },
  beepMaxAwaitSeconds: 25,
};

const PROPERTY = {
  address: "1496 Adeline St, Oakland, California 94607",
  type: "3-bedroom 2-bathroom REO Bank Owned Townhome",
  starting_bid: "three hundred thousand dollars",
  estimate: "six hundred sixty five thousand dollars",
  monthly_rent: "three thousand three hundred seventy one dollars",
  listing_url: "vihara.ai/listing/oakland-auction",
};

const parsePhones = (phonesStr) => {
  if (!phonesStr) return [];
  return phonesStr
    .split("|")
    .map((p) => p.trim())
    .filter((p) => p.length > 6)
    .map((p) => {
      const digits = p.replace(/\D/g, "");
      if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
      if (digits.length === 10) return `+1${digits}`;
      if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
      return null;
    })
    .filter(Boolean);
};

const buildCallbackTool = () => {
  if (!VAPI_WEBHOOK_URL) {
    console.log("[cb-debug] buildCallbackTool → NO URL, tool NOT attached");
    return null;
  }
  return {
    type: "function",
    async: false,
    function: {
      name: "scheduleCallback",
      description:
        "Schedule a callback when the caller asks to be called back later — e.g. 'call me in 5 minutes', 'try me in half an hour', or 'call me back at 5pm'. Convert their words into delayMinutes (minutes from now). Only use callAtISO if they name a specific clock time and you can express it as a full ISO 8601 timestamp; otherwise prefer delayMinutes.",
      parameters: {
        type: "object",
        properties: {
          delayMinutes: {
            type: "number",
            description: "Minutes from now to call back. e.g. 5, 10, 15, 30, 60. Preferred field.",
          },
          callAtISO: {
            type: "string",
            description: "Optional. An absolute ISO 8601 time to call back, only when the caller names a specific clock time.",
          },
          note: { type: "string", description: "Optional short reason the caller gave for the callback." },
        },
      },
    },
    server: {
      url: VAPI_WEBHOOK_URL,
      ...(VAPI_WEBHOOK_SECRET ? { secret: VAPI_WEBHOOK_SECRET } : {}),
    },
  };
};

const buildAssistantOverrides = (contact, researchSummary, property, promptConfig) => {
  const overrides = {
    variableValues: buildVariableValues(contact, researchSummary, property),
    voicemailDetection: VOICEMAIL_DETECTION,
  };

  const callbackTool = buildCallbackTool();

  if (!promptConfig) {
    if (callbackTool) {
      overrides.model = {
        provider: VAPI_MODEL_PROVIDER,
        model: VAPI_MODEL,
        messages: [{ role: "system", content: CALLBACK_INSTRUCTION.trim() }],
        tools: [callbackTool],
      };
    }
    console.log("[cb-debug] overrides built (no promptConfig). tools?", !!(overrides.model && overrides.model.tools));
    return overrides;
  }

  if (promptConfig.systemPrompt) {
    // Idempotent: only append if the prompt doesn't already teach the tool.
    const alreadyHasTool = /scheduleCallback/i.test(promptConfig.systemPrompt);
    const systemContent =
      callbackTool && !alreadyHasTool
        ? promptConfig.systemPrompt + CALLBACK_INSTRUCTION
        : promptConfig.systemPrompt;

    overrides.model = {
      provider: VAPI_MODEL_PROVIDER,
      model: VAPI_MODEL,
      messages: [{ role: "system", content: systemContent }],
      ...(callbackTool ? { tools: [callbackTool] } : {}),
    };
  } else if (callbackTool) {
    overrides.model = {
      provider: VAPI_MODEL_PROVIDER,
      model: VAPI_MODEL,
      messages: [{ role: "system", content: CALLBACK_INSTRUCTION.trim() }],
      tools: [callbackTool],
    };
  }

  if (promptConfig.firstMessage) overrides.firstMessage = promptConfig.firstMessage;
  if (promptConfig.voicemailMessage) overrides.voicemailMessage = promptConfig.voicemailMessage;
  if (promptConfig.endCallMessage) overrides.endCallMessage = promptConfig.endCallMessage;

  console.log("[cb-debug] overrides built (with promptConfig). tools?", !!(overrides.model && overrides.model.tools),
    "| callbackInstructionAppended?", !!callbackTool);
  return overrides;
};

const dispatchCall = async (
  phoneNumber,
  person,
  { researchSummary = "", property = PROPERTY, promptConfig = null } = {}
) => {
  try {
    const metadata = {
      source: "vihara-voice",
      propertyId: property && property.id ? property.id : null,
    };
    const assistantOverrides = buildAssistantOverrides(person, researchSummary, property, promptConfig);

    console.log("[cb-debug] dispatchCall payload", JSON.stringify({
      to: phoneNumber,
      metadata,
      toolsAttached: !!(assistantOverrides.model && assistantOverrides.model.tools),
      toolNames: (assistantOverrides.model?.tools || []).map((t) => t.function?.name),
      toolServerUrl: assistantOverrides.model?.tools?.[0]?.server?.url || null,
    }));

    const response = await axios.post(
      "https://api.vapi.ai/call",
      {
        assistantId: VAPI_ASSISTANT_ID,
        phoneNumberId: VAPI_PHONE_NUMBER_ID,
        metadata,
        customer: { number: phoneNumber, name: person.fullName },
        assistantOverrides,
      },
      { headers: { Authorization: `Bearer ${VAPI_API_KEY}`, "Content-Type": "application/json" } }
    );

    console.log(`✅ Call dispatched: ${person.fullName} → ${phoneNumber} | Call ID: ${response.data.id}`);
    return { success: true, callId: response.data.id, phone: phoneNumber };
  } catch (err) {
    const reason =
      err.response?.data?.message ||
      (Array.isArray(err.response?.data?.error) ? err.response.data.error.join(", ") : err.response?.data?.error) ||
      err.message;
    console.error(`❌ Call failed: ${person.fullName} → ${phoneNumber}:`, err.response?.data || err.message);
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
