const test = require("node:test");
const assert = require("node:assert/strict");
const { startInterview, answerInterview, editSection, interviewStatus, isSkip, parseInterviewBlock } = require("./interviewService");
const { CORE_QUESTIONS } = require("../../config/studio/interviewQuestions");

const NOW = new Date("2026-10-30T10:00:00Z");
const blank = () => ({ name: "Preetham", sections: [], interviewedAt: null, interview: { state: "not_started", index: 0, followupAsked: false, transcript: [] }, notes: [] });
// A stand-in for Claude: an answer with a digit is concrete.
const judge = async (_q, answer) => (/\d/.test(answer) ? { concrete: true, followup: "" } : { concrete: false, followup: "Kitne second ka?" });

test("asks the sections in order and stores each answer word for word", async () => {
  const p = blank();
  const first = startInterview(p, CORE_QUESTIONS, NOW);
  assert.match(first.reply, /^1\/7\. What tools/);
  const r = await answerInterview(p, CORE_QUESTIONS, "  HyperFrames and Epidemic Sound, 2 apps  ", judge, NOW);
  assert.match(r.reply, /^2\/7\./);
  assert.deepEqual(p.sections[0].entries, [{ text: "HyperFrames and Epidemic Sound, 2 apps", kind: "answer", at: NOW }]);
  assert.equal(p.sections[0].status, "answered");
});

test("asks one follow-up when an answer has no number or example, then moves on whatever the reply", async () => {
  const p = blank();
  startInterview(p, CORE_QUESTIONS, NOW);
  const r1 = await answerInterview(p, CORE_QUESTIONS, "Hook strong hona chahiye", judge, NOW);
  assert.equal(r1.reply, "Kitne second ka?");
  const r2 = await answerInterview(p, CORE_QUESTIONS, "Jitna lagta hai", judge, NOW);
  assert.match(r2.reply, /^2\/7\./);
  assert.deepEqual(p.sections[0].entries.map((e) => [e.kind, e.text]), [["answer", "Hook strong hona chahiye"], ["follow-up", "Jitna lagta hai"]]);
});

test("skip leaves a section open for later and the end lists what is open", async () => {
  const p = blank();
  startInterview(p, CORE_QUESTIONS, NOW);
  for (let i = 0; i < 7; i++) await answerInterview(p, CORE_QUESTIONS, i === 2 ? "skip" : `answer ${i} 1.5 s`, judge, NOW);
  assert.equal(p.interview.state, "done");
  assert.equal(p.sections[2].status, "skipped");
  assert.match(p.interview.transcript.at(-1).text, /Still open, for later: How I pace and cut/);
  assert.deepEqual(interviewStatus(p, CORE_QUESTIONS), { answered: 6, total: 7, state: "partial" });
  // Resuming asks only what is still open: a skipped section is asked again.
  p.sections[2].status = "open";
  assert.match(startInterview(p, CORE_QUESTIONS, NOW).reply, /^3\/7\./);
});

test("an edit adds a dated entry and keeps the earlier ones", async () => {
  const p = blank();
  startInterview(p, CORE_QUESTIONS, NOW);
  await answerInterview(p, CORE_QUESTIONS, "CapCut, 1 app", judge, NOW);
  editSection(p, CORE_QUESTIONS, "tools", "CapCut and Premiere", new Date("2026-11-01T00:00:00Z"));
  assert.deepEqual(p.sections[0].entries.map((e) => e.kind), ["answer", "edit"]);
  assert.throws(() => editSection(p, CORE_QUESTIONS, "nope", "x", NOW), /No section/);
  assert.throws(() => editSection(p, CORE_QUESTIONS, "tools", "  ", NOW), /new answer/);
});

test("an empty reply is refused, and a judge failure never blocks the interview", async () => {
  const p = blank();
  startInterview(p, CORE_QUESTIONS, NOW);
  await assert.rejects(() => answerInterview(p, CORE_QUESTIONS, "   ", judge, NOW), /Write an answer/);
  const failing = async () => ({ concrete: true, followup: "" });
  const r = await answerInterview(p, CORE_QUESTIONS, "no numbers here", failing, NOW);
  assert.match(r.reply, /^2\/7\./);
});

test("reads a Claude Code interview word for word, and refuses text it cannot attribute", () => {
  const block = [
    "### Preetham, started 2026-10-29", "", "Interviewed 2026-10-29 with the editor-interview skill.", "",
    "**Tools I use alongside the repo:**", "> HyperFrames", ">", "> and Epidemic Sound", "> (Preetham, 2026-10-29)", "> Enhance this", "> (Preetham, 2026-10-29, follow-up)", "",
    "**How I pace and cut:**", "not answered yet", "", "**Notes by date:**",
  ].join("\n");
  const r = parseInterviewBlock(block, CORE_QUESTIONS);
  assert.equal(r.name, "Preetham");
  assert.deepEqual(r.sections.map((s) => s.key), ["tools"]);
  assert.deepEqual(r.sections[0].entries.map((e) => [e.kind, e.text]), [["answer", "HyperFrames\n\nand Epidemic Sound"], ["follow-up", "Enhance this"]]);
  assert.throws(() => parseInterviewBlock("no heading", CORE_QUESTIONS), /whole section/);
  assert.throws(() => parseInterviewBlock(block.replace("> (Preetham, 2026-10-29, follow-up)", ""), CORE_QUESTIONS), /without the editor's name/);
});

test("reads skip words in English and Hinglish", () => {
  for (const w of ["skip", "Later", "baad me", "pata nahi", "don't know"]) assert.equal(isSkip(w), true, w);
  assert.equal(isSkip("I skip the intro shot"), false);
});
