// services/calling/callOutcome.js
//
// Rule-based call grading: outcome ("missed" | "voicemail" | "negative" |
// "callback" | "positive") and a 0-100 lead score, read from the endedReason,
// the duration and ONLY what the person said. Maya's own lines are never
// searched — her script mentions "Facebook", "book", "advisor", "interested",
// which made every call read as interested.
//
// This is the fallback. When a call has an AI grade (callGradeService, stored
// on CallLog.grade) that grade wins; see vapiCallsService.mapCallLog.

const MISSED_REASONS = [
  "no-answer",
  "customer-did-not-answer",
  "customer-busy",
  "silence-timed-out",
  "call-start-error",
  "twilio-failed-to-connect-call",
  "pipeline-error",
];

// An answering machine / carrier message read out as if the person said it.
const MACHINE_PHRASES = [
  "mailbox is full", "mailbox has not been set up", "voice mailbox", "voicemail",
  "leave a message", "leave your message", "after the tone", "after the beep",
  "at the tone", "is not available", "isn't available", "cannot take your call",
  "can't take your call", "unable to take your call", "not available to take",
  "record your message", "the number you have dialed", "the person you are trying",
  "the subscriber", "has been disconnected", "is no longer in service",
  "please try again later", "press 1", "press one", "press five", "sms notification",
  "message is too short", "google voice", "call screening",
  "screening service", "if you record your name",
];

const STOP_PHRASES = [
  "remove me", "stop calling", "take me off", "don't call", "do not call",
  "unsubscribe", "wrong number", "lose my number",
];
const DECLINE_PHRASES = [
  "not interested", "no thanks", "no thank you", "not looking", "no i'm good",
];
// "Not now" with a "call me later" is a callback, so these are checked after it.
const SOFT_DECLINE_PHRASES = ["not right now", "not at this time", "not now"];
const CALLBACK_PHRASES = [
  "call me back", "call back", "better time", "call me later", "call me tomorrow",
  "i'm busy", "i am busy", "i'm driving", "in a meeting", "at work right now",
];
const INTEREST_PHRASES = [
  "interested", "tell me more", "send me", "sounds good", "sounds great",
  "sign me up", "yes please", "go ahead", "i'm looking", "i am looking",
  "advisor", "schedule", "set it up", "what do you have", "what deals",
];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Whole words/phrases only, so "book" never matches inside "Facebook".
const phraseRe = (list) =>
  new RegExp(`(?:^|[^a-z'])(?:${list.map(escapeRe).join("|")})(?![a-z])`, "i");

const MACHINE_RE = phraseRe(MACHINE_PHRASES);
const STOP_RE = phraseRe(STOP_PHRASES);
const DECLINE_RE = phraseRe(DECLINE_PHRASES);
const SOFT_DECLINE_RE = phraseRe(SOFT_DECLINE_PHRASES);
const CALLBACK_RE = phraseRe(CALLBACK_PHRASES);
const INTEREST_RE = phraseRe(INTEREST_PHRASES);

/** What the person said, from the flat "AI: … / User: …" transcript. */
function userSaid(transcript) {
  return String(transcript || "")
    .split("\n")
    .filter((l) => /^user:/i.test(l.trim()))
    .map((l) => l.trim().replace(/^user:\s*/i, ""))
    .join(" ")
    .trim();
}

/** True when the "person" was really a voicemail greeting or carrier message. */
function isMachineText(said) {
  return MACHINE_RE.test(String(said || ""));
}

const wordCount = (s) => String(s || "").split(/\s+/).filter(Boolean).length;

/**
 * @param {{ endedReason?: string, transcript?: string }} call
 * @param {number} durationSecs
 */
function deriveOutcome(call, durationSecs) {
  const reason = String(call.endedReason || "").toLowerCase();

  if (MISSED_REASONS.includes(reason)) return "missed";
  if (reason.includes("error") || reason.includes("failed")) return "missed";
  if (reason === "voicemail") return "voicemail";

  const said = userSaid(call.transcript).toLowerCase();
  if (!said) return "missed";
  if (isMachineText(said)) return "voicemail";

  // Refusals first: "not interested" contains "interested".
  if (STOP_RE.test(said) || DECLINE_RE.test(said)) return "negative";
  if (CALLBACK_RE.test(said)) return "callback";
  if (SOFT_DECLINE_RE.test(said)) return "negative";
  if (INTEREST_RE.test(said)) return "positive";
  // A real back-and-forth with no clear signal either way.
  if (wordCount(said) >= 25 && durationSecs > 60) return "positive";
  // They picked up and said little (e.g. "No. Thank you.") — a pickup, not interest.
  return "negative";
}

function deriveLeadScore(call, outcome, durationSecs) {
  if (outcome === "missed") return 0;
  if (outcome === "voicemail") return 0;

  const said = userSaid(call.transcript).toLowerCase();
  let score = 0;

  if (outcome === "positive") score = 50;
  if (outcome === "callback") score = 35;
  if (outcome === "negative") score = 5;

  if (outcome !== "negative") {
    if (durationSecs > 300) score += 20;
    else if (durationSecs > 180) score += 14;
    else if (durationSecs > 90) score += 8;
    else if (durationSecs > 45) score += 3;

    if (phraseRe(["tell me more", "what do you have", "what deals"]).test(said)) score += 8;
    if (phraseRe(["advisor", "schedule", "set it up"]).test(said)) score += 10;
    if (phraseRe(["send me", "email me", "text me"]).test(said)) score += 6;
    if (phraseRe(["cash", "budget", "financing", "pre-approved", "preapproved"]).test(said)) score += 5;
  }

  if (STOP_RE.test(said)) score = 0;
  return Math.max(0, Math.min(100, score));
}

module.exports = {
  MISSED_REASONS,
  userSaid,
  isMachineText,
  wordCount,
  deriveOutcome,
  deriveLeadScore,
};
