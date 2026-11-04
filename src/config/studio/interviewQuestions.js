// config/studio/interviewQuestions.js
//
// The editor interview's default questions (Video Studio, vihara.ai/studio). The same seven
// sections as the Creative OS's editor-interview skill (Vihara-creative-OS,
// .claude/skills/editor-interview/SKILL.md), so an interview in the Studio and one in Claude Code
// fill the same sections of learning/video-editors.md.
//
// `label` is the section's heading in that file and must not change for the seven core keys: the
// Creative OS reads interviews by these labels. An admin may reword `question` and `usable` in the
// Studio, and may add sections with new keys.

const CORE_QUESTIONS = [
  {
    key: "tools",
    label: "Tools I use alongside the repo",
    question: "What tools do you use besides the Vihara repo when you make a video (editing app, sound library, phone, anything else)?",
    usable: "Named tools, e.g. \"CapCut on the phone for the final trim\".",
  },
  {
    key: "steps",
    label: "My steps, in order",
    question: "Walk me through your steps, from getting a property to handing over a cut.",
    usable: "Steps in order, with roughly how long one takes or which comes first.",
  },
  {
    key: "pacing",
    label: "How I pace and cut",
    question: "How do you pace and cut: how long do you hold a shot, where do you hold longer, which transitions do you use or avoid?",
    usable: "A shot length in seconds, a named transition, or a shot they always hold.",
  },
  {
    key: "music",
    label: "Music and voice",
    question: "How do you pick a track and set the levels, and which voices work for which viewer?",
    usable: "A level, a tempo, a named voice or track, or a reader and what works for them.",
  },
  {
    key: "captions",
    label: "Captions and on-screen text",
    question: "What are your rules for captions and on-screen text: size, position, timing, what you always check?",
    usable: "A size, a position, a word count, or a timing.",
  },
  {
    key: "fixes",
    label: "Fixes I make every time",
    question: "What do you fix every time in the agents' first cut?",
    usable: "A specific fix, ideally with where it happens (\"the end card comes in 0.5 s too early\").",
  },
  {
    key: "checks",
    label: "What I check before handing over",
    question: "What do you check before you hand a cut over?",
    usable: "A check they actually run, e.g. \"watch it muted on the phone once\".",
  },
];

const CORE_KEYS = CORE_QUESTIONS.map((q) => q.key);

module.exports = { CORE_QUESTIONS, CORE_KEYS };
