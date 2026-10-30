// services/studio/interviewService.js
//
// The editor interview in the Video Studio. The flow is code: the same sections in the same order
// for every editor, one at a time, at most one follow-up per section, and "skip" leaves a section
// open. Claude is asked one thing only: does this answer have a number or a concrete example, and
// if not, what one short follow-up question asks for it. The editor's text is stored exactly as
// typed; Claude's words are never stored as the editor's.
//
// Env: ANTHROPIC_API_KEY, optional STUDIO_MODEL (default claude-opus-5-5).

const Anthropic = require("@anthropic-ai/sdk");

const MODEL = process.env.STUDIO_MODEL || "claude-opus-5-5";
let client;

// Replies that leave a section for later.
const SKIP = /^\s*(skip|later|baad me|baad mein|pata nahi|don'?t know|not sure|pass)\s*[.!]?\s*$/i;
const isSkip = (text) => SKIP.test(text ?? "");

const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    concrete: { type: "boolean", description: "True when the answer has a number (seconds, dB, px, count) or a concrete example (a named tool, voice, track, transition, video or timecode)." },
    followup: { type: "string", description: "When not concrete: one short, friendly question asking for a number or one example. Empty when concrete." },
  },
  required: ["concrete", "followup"],
  additionalProperties: false,
};

const JUDGE_SYSTEM = [
  "You help interview a video editor about how they make property videos.",
  "You judge one answer: does it contain at least one number or one concrete example (a named tool, voice, track, transition, a specific video, a timecode)?",
  "If it does, set concrete true and followup to an empty string.",
  "If it does not, set concrete false and write one short follow-up question that asks for a number or one example about what they said, in the same language and tone as the editor (English, Hindi or Hinglish).",
  "Never answer for the editor, never suggest an answer, never comment on whether their way is right.",
].join(" ");

/**
 * Asks Claude whether an answer is concrete. Returns { concrete, followup }. A failure counts as
 * concrete, so a broken API never blocks an interview; it only skips the follow-up.
 */
async function judgeAnswer(question, answer) {
  try {
    client = client || new Anthropic();
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 2000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low", format: { type: "json_schema", schema: JUDGE_SCHEMA } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: JUDGE_SYSTEM,
      messages: [{ role: "user", content: `Question: ${question.question}\nA usable answer has: ${question.usable || "a number or an example"}\n\nThe editor's answer:\n${answer}` }],
    });
    const response = await stream.finalMessage();
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return { concrete: true, followup: "" };
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    const parsed = JSON.parse(text);
    return { concrete: parsed.concrete !== false, followup: String(parsed.followup || "").trim() };
  } catch (e) {
    console.error("studio interview judge failed:", e.message);
    return { concrete: true, followup: "" };
  }
}

/** The profile's sections, in question order, adding any section the questions have and it lacks. */
function syncSections(profile, questions) {
  const byKey = new Map((profile.sections || []).map((s) => [s.key, s]));
  profile.sections = questions.map((q) => {
    const s = byKey.get(q.key);
    return s ? Object.assign(s, { label: q.label }) : { key: q.key, label: q.label, status: "open", entries: [] };
  });
  return profile;
}

const say = (profile, role, text, now) => profile.interview.transcript.push({ role, text, at: now });

/** The next section still open after `from`, or -1. */
const nextOpen = (profile, from) => profile.sections.findIndex((s, i) => i >= from && s.status === "open");

function ask(profile, questions, index, now) {
  const q = questions[index];
  const text = `${index + 1}/${questions.length}. ${q.question}`;
  say(profile, "interviewer", text, now);
  return text;
}

function finish(profile, now) {
  profile.interview.state = "done";
  profile.interview.followupAsked = false;
  const open = profile.sections.filter((s) => s.status !== "answered").map((s) => s.label);
  if (!profile.interviewedAt) profile.interviewedAt = now;
  const text = open.length
    ? `Thank you. Still open, for later: ${open.join("; ")}. You can answer them any time from your profile.`
    : "Thank you, that's every section. Your answers are saved under your name, word for word. You can change any of them from your profile.";
  say(profile, "interviewer", text, now);
  return text;
}

/** Starts (or resumes) the interview: asks the first open section. */
function startInterview(profile, questions, now = new Date()) {
  syncSections(profile, questions);
  const index = nextOpen(profile, 0);
  if (index === -1) return { reply: finish(profile, now), done: true };
  profile.interview.state = "in_progress";
  profile.interview.index = index;
  profile.interview.followupAsked = false;
  return { reply: ask(profile, questions, index, now), done: false };
}

/**
 * Records one reply from the editor and returns the interviewer's next line. `judge` is
 * judgeAnswer, injectable for tests.
 */
async function answerInterview(profile, questions, text, judge = judgeAnswer, now = new Date()) {
  syncSections(profile, questions);
  const reply = String(text ?? "").trim();
  if (!reply) throw new Error("Write an answer, or \"skip\" to leave this one for later.");
  if (profile.interview.state !== "in_progress") throw new Error("The interview has not started.");
  const index = profile.interview.index;
  const section = profile.sections[index];
  const question = questions[index];
  say(profile, "editor", reply, now);

  if (isSkip(reply)) {
    if (section.status === "open") section.status = "skipped";
  } else {
    const followup = profile.interview.followupAsked;
    section.entries.push({ text: reply, kind: followup ? "follow-up" : "answer", at: now });
    section.status = "answered";
    if (!followup) {
      const verdict = await judge(question, reply);
      if (!verdict.concrete) {
        profile.interview.followupAsked = true;
        const ask2 = verdict.followup || "Can you give me one number or one example for that?";
        say(profile, "interviewer", ask2, now);
        return { reply: ask2, done: false };
      }
    }
  }

  profile.interview.followupAsked = false;
  const next = nextOpen(profile, index + 1);
  if (next === -1) return { reply: finish(profile, now), done: true };
  profile.interview.index = next;
  return { reply: ask(profile, questions, next, now), done: false };
}

/** An editor changes a section later: a new dated entry; earlier ones stay. */
function editSection(profile, questions, key, text, now = new Date()) {
  syncSections(profile, questions);
  const section = profile.sections.find((s) => s.key === key);
  if (!section) throw new Error(`No section "${key}".`);
  const value = String(text ?? "").trim();
  if (!value) throw new Error("Write the new answer.");
  section.entries.push({ text: value, kind: "edit", at: now });
  section.status = "answered";
  return section;
}

/**
 * Reads an editor's section of the Creative OS's learning/video-editors.md (an interview taken in
 * Claude Code) word for word, for an admin's import. Each answer is a quotation closed by
 * "(Name, YYYY-MM-DD[, follow-up])". Refuses text it cannot attribute rather than guess.
 */
function parseInterviewBlock(markdown, questions) {
  const text = String(markdown ?? "").replace(/\r\n/g, "\n");
  const head = /^### (.+?), started (\d{4}-\d{2}-\d{2})\s*$/m.exec(text);
  if (!head) throw new Error("Paste the editor's whole section, starting with \"### Name, started YYYY-MM-DD\".");
  const name = head[1].trim();
  const sections = [];
  for (const q of questions) {
    const marker = `**${q.label}:**`;
    const from = text.indexOf(marker);
    if (from < 0) continue;
    const rest = text.slice(from + marker.length);
    const end = rest.search(/^\*\*[^*\n]+:\*\*/m);
    const lines = (end < 0 ? rest : rest.slice(0, end)).split("\n").filter((l) => l.startsWith(">")).map((l) => l.replace(/^> ?/, ""));
    const entries = [];
    let buffer = [];
    for (const line of lines) {
      const m = /^\((.+?), (\d{4}-\d{2}-\d{2})(, follow-up)?\)$/.exec(line.trim());
      if (m && m[1].trim() === name) {
        entries.push({ text: buffer.join("\n").trim(), kind: m[3] ? "follow-up" : "answer", at: new Date(`${m[2]}T00:00:00Z`) });
        buffer = [];
      } else buffer.push(line);
    }
    if (buffer.join("").trim()) throw new Error(`"${q.label}" has text without the editor's name and date; nothing was imported.`);
    if (entries.length) sections.push({ key: q.key, label: q.label, status: "answered", entries });
  }
  if (!sections.length) throw new Error("No answers were found in the pasted text.");
  return { name, startedAt: new Date(`${head[2]}T00:00:00Z`), sections };
}

/** answered / total, and the overall state, for lists. */
function interviewStatus(profile, questions) {
  syncSections(profile, questions);
  const answered = profile.sections.filter((s) => s.status === "answered").length;
  const total = questions.length;
  return { answered, total, state: answered === total ? "interviewed" : answered > 0 ? "partial" : "not_started" };
}

module.exports = { judgeAnswer, startInterview, answerInterview, editSection, interviewStatus, syncSections, isSkip, parseInterviewBlock };
