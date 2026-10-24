const test = require("node:test");
const assert = require("node:assert/strict");
const { deriveOutcome, deriveLeadScore, userSaid } = require("./callOutcome");
const { scoreFor, adminGrade } = require("./callGradeService");
const { hadMeaningfulConversation } = require("./registrationCallService");

const OPENER = "AI: Hi, Kevin. This is Maya from Vihara. You just filled in our form on Facebook about new bank owned deals. Is now an okay time for a quick two minutes?";
const grade = (transcript, secs = 15) => {
  const call = { endedReason: "customer-ended-call", transcript };
  const outcome = deriveOutcome(call, secs);
  return { outcome, score: deriveLeadScore(call, outcome, secs) };
};

test("Maya's own words never count — 'Facebook' is not 'book'", () => {
  assert.equal(userSaid(OPENER), "");
  assert.deepEqual(grade(OPENER), { outcome: "missed", score: 0 });
});

test("a mailbox-full message on a User line is voicemail", () => {
  assert.equal(grade(`${OPENER}\nUser: The mailbox is full and cannot accept any messages at this time. Goodbye.`).outcome, "voicemail");
  assert.equal(grade(`${OPENER}\nUser: is not available. The mailbox is full and cannot accept any messages at this time. Goodbye.`).outcome, "voicemail");
});

test("'No. Thank you.' is a pickup that declined, not interest", () => {
  const g = grade(`${OPENER}\nUser: No. Thank you.`);
  assert.equal(g.outcome, "negative");
  assert.ok(g.score <= 10);
});

test("'not interested' is negative even though it contains 'interested'", () => {
  assert.equal(grade(`${OPENER}\nUser: I'm not interested.`).outcome, "negative");
});

test("real interest and callbacks still read right", () => {
  assert.equal(grade(`${OPENER}\nUser: Yeah, send me the deals, I'm interested.`, 70).outcome, "positive");
  assert.equal(grade(`${OPENER}\nUser: I'm driving, call me back tomorrow.`).outcome, "callback");
});

test("score table: verdict + signals, stop request zeroes it", () => {
  assert.equal(scoreFor("voicemail", { askedForAdvisor: true }), 0);
  assert.equal(scoreFor("not_now", { wantsDeals: true }), 15);
  assert.equal(scoreFor("interested", { wantsDeals: true, gaveBudget: true }), 65);
  assert.equal(scoreFor("hot", { askedForAdvisor: true, bookedCallback: true, gaveBudget: true, gaveTimeline: true }), 100);
  assert.equal(scoreFor("interested", { requestedStop: true }), 0);
});

test("admin correction rescores and keeps the machine grade it replaced", () => {
  const ai = { outcome: "positive", verdict: "interested", score: 60, reason: "r", signals: { wantsDeals: true }, by: "ai" };
  const first = adminGrade("voicemail", ai);
  assert.equal(first.outcome, "voicemail");
  assert.equal(first.score, 0);
  assert.equal(first.replaced, ai);
  const second = adminGrade("hot", first, "wants an advisor");
  assert.equal(second.score, 80);
  assert.equal(second.reason, "wants an advisor");
  assert.equal(second.replaced, ai);
});

test("the prompt naming scheduleCallback is not a booked callback", () => {
  const messages = [
    { role: "system", message: "…CALL the scheduleCallback tool…" },
    { role: "bot", message: "Hi, Quincy." },
    { role: "user", message: "The mailbox is full and cannot accept any messages at this time. Goodbye." },
  ];
  assert.equal(hadMeaningfulConversation({ messages }), false);
  messages.push({ role: "tool_calls", toolCalls: [{ function: { name: "scheduleCallback" } }] });
  assert.equal(hadMeaningfulConversation({ messages }), true);
});
