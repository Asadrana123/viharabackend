const axios = require("axios");
const { buildVariableValues } = require("./vapiPromptService");
const { buildPriorContext } = require("./callMemoryService");

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;
const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID;

const VAPI_MODEL_PROVIDER = process.env.VAPI_MODEL_PROVIDER || "openai";
const VAPI_MODEL = process.env.VAPI_MODEL || "gpt-5.1";

const VAPI_WEBHOOK_URL = process.env.VAPI_WEBHOOK_URL;
const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET;

console.log("[cb-debug] vapiService loaded. VAPI_WEBHOOK_URL =", VAPI_WEBHOOK_URL || "(NOT SET)",
  "| secret set?", !!VAPI_WEBHOOK_SECRET);

// ── Conversational feel: timing, interruptions, voice ──────────────────────────
// These make Maya sound like a real person instead of a bot.
//
//   • Timing + interruption plans are SAFE on every call (no account-specific
//     IDs), so they are baked in and always applied.
//   • Voice + transcriber need provider-specific IDs tied to YOUR VAPI account,
//     so they are OPT-IN via env vars. Leave them unset and the call uses
//     whatever your VAPI assistant already has. Set them to switch to a warmer
//     voice / faster transcriber:
//        VAPI_VOICE_PROVIDER=cartesia   VAPI_VOICE_ID=<your voice id>
//        VAPI_TRANSCRIBER_PROVIDER=deepgram   VAPI_TRANSCRIBER_MODEL=nova-3
//
// Numeric feel knobs (override via env if you want to tune without a deploy):
const VAPI_LLM_TEMPERATURE = Number(process.env.VAPI_LLM_TEMPERATURE || 0.75);
const START_WAIT_SECONDS = Number(process.env.VAPI_START_WAIT_SECONDS || 0.4);
const SMART_ENDPOINTING_PROVIDER = process.env.VAPI_SMART_ENDPOINTING_PROVIDER || "livekit";
const STOP_NUM_WORDS = Number(process.env.VAPI_STOP_NUM_WORDS || 2);
const STOP_BACKOFF_SECONDS = Number(process.env.VAPI_STOP_BACKOFF_SECONDS || 1.0);

const VAPI_VOICE_PROVIDER = process.env.VAPI_VOICE_PROVIDER || "";
const VAPI_VOICE_ID = process.env.VAPI_VOICE_ID || "";
const VAPI_TRANSCRIBER_PROVIDER = process.env.VAPI_TRANSCRIBER_PROVIDER || "";
const VAPI_TRANSCRIBER_MODEL = process.env.VAPI_TRANSCRIBER_MODEL || "nova-3";

// Smart endpointing: wait while the caller is mid-thought, reply fast when they
// are clearly done — the single biggest "feels human" turn-taking win.
const START_SPEAKING_PLAN = {
  waitSeconds: START_WAIT_SECONDS,
  smartEndpointingPlan: { provider: SMART_ENDPOINTING_PROVIDER },
};

// Barge-in: stop talking almost immediately when the caller speaks, then pause
// briefly before resuming. numWords>0 avoids stopping on a stray noise/breath.
const STOP_SPEAKING_PLAN = {
  numWords: STOP_NUM_WORDS,
  backoffSeconds: STOP_BACKOFF_SECONDS,
};

const buildVoice = () => {
  if (!VAPI_VOICE_PROVIDER || !VAPI_VOICE_ID) return null;
  return { provider: VAPI_VOICE_PROVIDER, voiceId: VAPI_VOICE_ID };
};

const buildTranscriber = () => {
  if (!VAPI_TRANSCRIBER_PROVIDER) return null;
  return { provider: VAPI_TRANSCRIBER_PROVIDER, model: VAPI_TRANSCRIBER_MODEL };
};

// Appended to the system prompt whenever the scheduleCallback tool is attached,
// so the agent reliably USES the tool instead of just verbally agreeing. Kept
// short and directive because the property prompts are tight scripts.
const CALLBACK_INSTRUCTION = `

## Handling callback requests (IMPORTANT)
You have a tool called scheduleCallback. If the caller asks you to call them back later — for example "call me in 5 minutes", "try me in half an hour", "call me tomorrow", or "call me at 5pm" — you MUST call the scheduleCallback function. Set delayMinutes to the number of minutes from now (convert their words into a number: "five minutes" = 5, "half an hour" = 30, "an hour" = 60). Call the tool BEFORE you say goodbye or end the call. After the tool succeeds, briefly confirm the time out loud (for example, "Got it, I'll call you back in five minutes"). Never promise a callback without calling scheduleCallback.`;

// How Maya should SOUND on the call — talk like a person, not a script reader.
// Behavioral only, appended once (idempotent).
const HUMAN_STYLE = `

## How to sound (IMPORTANT)
Talk like a real person on the phone, not a script. Use contractions and short, natural sentences. It's fine to use small natural fillers like "yeah", "right", "for sure", "got it". Don't read things out as a list. Let the caller finish; if you talk over them, stop and let them speak. Keep your energy warm and easy, like a friendly salesperson who's done this a hundred times.`;

// Central objection-handling guidance, appended to every call's system prompt
// (idempotent — skipped if the authored prompt already teaches objections).
// One place, every page. Behavioral only: it never invents property facts —
// specific numbers still come from the prompt's {{variables}}.
const OBJECTION_PLAYBOOK = `

## Handling objections like a top salesperson (IMPORTANT)
Never argue, never get pushy, and never sound scripted. Acknowledge the concern, give a short honest answer, then guide back toward one clear next step. Keep every reply to a sentence or two. Common objections:

- "Too good to be true / what's the catch / is this a scam?" → Understandable reaction. These are bank-owned and distressed properties sold at auction, which is why entry prices are low, and everything is verifiable on the public listing. Offer to text the listing link.
- "I already have my own agent / realtor." → Great — they can absolutely use their own agent. Vihara is the marketplace where the property is listed, not a competing agent. The point is getting them access to the deal.
- "I need financing / I'm not all cash." → Many buyers finance. Today's goal is just to get them registered so they can see terms and deadlines, not to close on the call.
- "The market's bad / prices are dropping." → That's exactly why below-market, distressed entry points matter — the margin is built in at purchase. Tie back to this property's specific numbers.
- "I'm just browsing / not right now / not ready." → No pressure. Offer a low-friction next step: register for early access so they don't miss the auction date, or schedule a callback for a better time (use scheduleCallback).
- "Never heard of Vihara." → Briefly establish credibility (an AI-native auction marketplace for bank-direct and distressed properties) and point them to the live listing to see for themselves.
- "Just send me an email." → Agree to send it, but try to confirm one useful detail first (what they're looking for, or their market) so the follow-up is worthwhile, then capture the next step.

If they clearly and firmly say no or ask you to stop, respect it, thank them warmly, and end the call. Do not badger.`;

// Appended to the system prompt when we have prior-call memory for this number.
// Same idempotent-append pattern: one central place, every page benefits, no
// per-prompt edits. Empty context → empty string → prompt untouched (first-ever
// calls behave exactly as before).
const buildPriorContextBlock = (priorContext) => {
  const ctx = String(priorContext || "").trim();
  if (!ctx) return "";
  return `

## What you already know about this caller (from previous calls)
You have spoken with this person before. Do NOT re-introduce yourself or run the opening as if this is a first call. Reference what was already discussed naturally, the way a salesperson who remembers them would. Most recent first:
${ctx}

Use this only where it helps the conversation — never read it aloud or list it back. If anything here conflicts with what they tell you now, trust what they say now.`;
};

// Behavioral blocks that ride along on every call, added only if the authored
// prompt doesn't already cover them (idempotent).
const buildStyleBlock = (systemPrompt = "") =>
  /##\s*How to sound/i.test(systemPrompt) ? "" : HUMAN_STYLE;
const buildObjectionBlock = (systemPrompt = "") =>
  /##\s*Handling objections/i.test(systemPrompt) ? "" : OBJECTION_PLAYBOOK;

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

// Build the model override object with the given system content, attaching
// temperature + tools consistently.
const buildModel = (systemContent, callbackTool) => ({
  provider: VAPI_MODEL_PROVIDER,
  model: VAPI_MODEL,
  temperature: VAPI_LLM_TEMPERATURE,
  messages: [{ role: "system", content: systemContent }],
  ...(callbackTool ? { tools: [callbackTool] } : {}),
});

const buildAssistantOverrides = (contact, researchSummary, property, promptConfig, priorContext = "") => {
  const overrides = {
    variableValues: buildVariableValues(contact, researchSummary, property),
    voicemailDetection: VOICEMAIL_DETECTION,
    // Conversational feel — applied on every call.
    startSpeakingPlan: START_SPEAKING_PLAN,
    stopSpeakingPlan: STOP_SPEAKING_PLAN,
  };

  // Opt-in voice / transcriber (only when env vars are set).
  const voice = buildVoice();
  if (voice) overrides.voice = voice;
  const transcriber = buildTranscriber();
  if (transcriber) overrides.transcriber = transcriber;

  const callbackTool = buildCallbackTool();
  const priorBlock = buildPriorContextBlock(priorContext);

  if (!promptConfig) {
    // No authored prompt. Build a model override only if there's already a
    // reason to (callback tool and/or memory); when we do, ride the behavioral
    // blocks along so tone/objection handling stay consistent.
    if (callbackTool || priorBlock) {
      const content = (CALLBACK_INSTRUCTION.trim() + HUMAN_STYLE + OBJECTION_PLAYBOOK + priorBlock).trim();
      overrides.model = buildModel(content, callbackTool);
    }
    console.log("[cb-debug] overrides built (no promptConfig). tools?", !!(overrides.model && overrides.model.tools),
      "| priorContext?", !!priorBlock, "| voiceOverride?", !!voice);
    return overrides;
  }

  if (promptConfig.systemPrompt) {
    // Idempotent appends: each block is added only if the authored prompt
    // doesn't already cover it.
    const alreadyHasTool = /scheduleCallback/i.test(promptConfig.systemPrompt);
    const withCallback =
      callbackTool && !alreadyHasTool
        ? promptConfig.systemPrompt + CALLBACK_INSTRUCTION
        : promptConfig.systemPrompt;
    const styleBlock = buildStyleBlock(promptConfig.systemPrompt);
    const objectionBlock = buildObjectionBlock(promptConfig.systemPrompt);
    const systemContent = withCallback + styleBlock + objectionBlock + priorBlock;

    overrides.model = buildModel(systemContent, callbackTool);
  } else if (callbackTool || priorBlock) {
    const content = (CALLBACK_INSTRUCTION.trim() + HUMAN_STYLE + OBJECTION_PLAYBOOK + priorBlock).trim();
    overrides.model = buildModel(content, callbackTool);
  }

  if (promptConfig.firstMessage) overrides.firstMessage = promptConfig.firstMessage;
  if (promptConfig.voicemailMessage) overrides.voicemailMessage = promptConfig.voicemailMessage;
  if (promptConfig.endCallMessage) overrides.endCallMessage = promptConfig.endCallMessage;

  console.log("[cb-debug] overrides built (with promptConfig). tools?", !!(overrides.model && overrides.model.tools),
    "| callbackInstructionAppended?", !!callbackTool, "| priorContext?", !!priorBlock, "| voiceOverride?", !!voice);
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

    // Pull prior-call memory for this number. Non-fatal — a lookup failure must
    // never block the call; we just dial without memory.
    let priorContext = "";
    try {
      priorContext = await buildPriorContext(phoneNumber);
    } catch (err) {
      console.error("[cb-debug] buildPriorContext failed (non-fatal):", err.message);
    }

    const assistantOverrides = buildAssistantOverrides(person, researchSummary, property, promptConfig, priorContext);

    console.log("[cb-debug] dispatchCall payload", JSON.stringify({
      to: phoneNumber,
      metadata,
      toolsAttached: !!(assistantOverrides.model && assistantOverrides.model.tools),
      toolNames: (assistantOverrides.model?.tools || []).map((t) => t.function?.name),
      toolServerUrl: assistantOverrides.model?.tools?.[0]?.server?.url || null,
      priorContextChars: priorContext.length,
      voiceOverridden: !!assistantOverrides.voice,
      smartEndpointing: SMART_ENDPOINTING_PROVIDER,
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