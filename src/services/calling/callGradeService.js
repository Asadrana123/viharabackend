// services/calling/callGradeService.js
//
// Grades one finished Maya call: what happened (outcome), why, and a 0-100
// lead score. Claude reads the transcript and reports WHAT happened plus a few
// yes/no signals; the score itself comes from the fixed table below, so the
// same call always gets the same number and anyone can see why.
//
// Calls nobody spoke on (no answer, carrier errors, voicemail) are graded by
// the rules in callOutcome.js without asking Claude. If Claude is unavailable
// the rules grade the rest too — a call is never left ungraded.
//
// Env: ANTHROPIC_API_KEY, optional CALL_GRADE_MODEL (default claude-opus-5-5).

const Anthropic = require("@anthropic-ai/sdk");
const { userSaid, isMachineText, deriveOutcome, deriveLeadScore } = require("./callOutcome");

// Bump when the prompt or score table changes, so a regrade can find old grades.
const GRADE_VERSION = 1;

// Claude's verdict → the outcome the admin table / Slack already understand.
const OUTCOME_FOR = {
  no_conversation: "missed",
  voicemail: "voicemail",
  not_interested: "negative",
  not_now: "negative",
  callback: "callback",
  interested: "positive",
  hot: "positive",
};

const BASE_SCORE = {
  no_conversation: 0,
  voicemail: 0,
  not_interested: 5,
  not_now: 15,
  callback: 35,
  interested: 55,
  hot: 75,
};

// Added only when the person showed some interest (callback / interested / hot).
const SIGNAL_POINTS = {
  wantsDeals: 5,
  askedForAdvisor: 10,
  bookedCallback: 10,
  gaveBudget: 5,
  gaveTimeline: 5,
  gaveLocation: 3,
  askedQuestions: 5,
};
const SIGNALS = Object.keys(SIGNAL_POINTS);

const SYSTEM = `You grade outbound calls made by Maya, Vihara's AI assistant, to real-estate buyer leads. Lines starting "AI:" are Maya; lines starting "User:" are whoever or whatever answered.

Pick the outcome from what the PERSON said and did — never from Maya's script:
- no_conversation: nobody really spoke (silence, hello then hang-up, line noise).
- voicemail: an answering machine, voicemail greeting, "mailbox is full", carrier or call-screening message. Speech-to-text often puts these on "User:" lines; they are still voicemail.
- not_interested: a real person declined, asked to stop, or said it was the wrong number.
- not_now: a real person answered but couldn't talk and gave no time to call back.
- callback: a real person asked to be called back or agreed a later time.
- interested: a real person engaged and wants deals, info, or a follow-up.
- hot: interested AND concrete — budget, timeline, financing or an advisor call — and ready to act soon.

Signals are true only when the person clearly said it (never when only Maya said it): wantsDeals (agreed to receive deals), askedForAdvisor, bookedCallback (a callback time was agreed), gaveBudget, gaveTimeline, gaveLocation, askedQuestions (asked real questions about deals or the process), requestedStop (asked not to be called again).

reason: one plain sentence a salesperson can read, quoting the person's key words where useful.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["outcome", "signals", "reason"],
  properties: {
    outcome: { type: "string", enum: Object.keys(OUTCOME_FOR) },
    signals: {
      type: "object",
      additionalProperties: false,
      required: [...SIGNALS, "requestedStop"],
      properties: Object.fromEntries([...SIGNALS, "requestedStop"].map((k) => [k, { type: "boolean" }])),
    },
    reason: { type: "string" },
  },
};

/** The score table: verdict + signals → 0-100. */
function scoreFor(verdict, signals = {}) {
  if (signals.requestedStop) return 0;
  let score = BASE_SCORE[verdict] || 0;
  if (["callback", "interested", "hot"].includes(verdict)) {
    for (const k of SIGNALS) if (signals[k]) score += SIGNAL_POINTS[k];
  }
  return Math.min(100, score);
}

/** Grade from the rules only (no Claude). */
function gradeByRules({ transcript, endedReason, durationSecs }) {
  const shim = { endedReason, transcript };
  const outcome = deriveOutcome(shim, durationSecs);
  return {
    outcome,
    verdict: null,
    score: deriveLeadScore(shim, outcome, durationSecs),
    reason: "",
    signals: null,
    by: "rules",
    version: GRADE_VERSION,
    gradedAt: new Date(),
  };
}

let client;
async function askClaude(transcript) {
  // Runs inside the end-of-call webhook — keep it short; the rules cover a timeout.
  client = client || new Anthropic({ timeout: 20000, maxRetries: 1 });
  const response = await client.beta.messages.create({
    model: process.env.CALL_GRADE_MODEL || "claude-opus-5-5",
    max_tokens: 4000,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [{ role: "user", content: `Transcript:\n\n${transcript}` }],
  });
  if (response.stop_reason === "refusal") throw new Error("Claude declined to grade this call");
  if (response.stop_reason === "max_tokens") throw new Error("grade was cut off (max_tokens)");
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return JSON.parse(text);
}

/**
 * @param {{ transcript?: string, endedReason?: string, durationSecs?: number }} call
 * @returns {Promise<object>} the grade to store on CallLog.grade
 */
async function gradeCall({ transcript = "", endedReason = "", durationSecs = 0 } = {}) {
  const rules = gradeByRules({ transcript, endedReason, durationSecs });
  // Nothing a person said → nothing for Claude to judge.
  const said = userSaid(transcript);
  if (!said || rules.outcome === "missed" || isMachineText(said)) return rules;
  if (!process.env.ANTHROPIC_API_KEY) return rules;

  try {
    const ai = await askClaude(transcript);
    return {
      outcome: OUTCOME_FOR[ai.outcome] || rules.outcome,
      verdict: ai.outcome,
      score: scoreFor(ai.outcome, ai.signals),
      reason: String(ai.reason || "").trim(),
      signals: ai.signals || null,
      by: "ai",
      version: GRADE_VERSION,
      gradedAt: new Date(),
    };
  } catch (err) {
    console.error("[call-grade] Claude grade failed, using rules:", err.message);
    return rules;
  }
}

module.exports = { gradeCall, gradeByRules, scoreFor, GRADE_VERSION };
