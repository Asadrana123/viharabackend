const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanProblem, cleanReply, problemView } = require("./problemService");

test("keeps a report as typed, with the video it names", () => {
  assert.deepEqual(cleanProblem({ text: "  Video 0:14 pe ruk rahi hai  ", video: " CH703-V05 " }), { text: "Video 0:14 pe ruk rahi hai", video: "CH703-V05" });
  assert.equal(cleanProblem({ text: "x" }).video, "");
});

test("a report and a reply need words", () => {
  assert.throws(() => cleanProblem({ text: "  " }), /Describe the problem/);
  assert.throws(() => cleanProblem({ text: "x".repeat(4001) }), /At most/);
  assert.throws(() => cleanReply({ reply: " " }), /what was done/);
  assert.equal(cleanReply({ reply: " Fixed " }), "Fixed");
});

test("shows a report without the account behind it", () => {
  const view = problemView({ _id: "1", user: "secret", byName: "Dinesh", text: "t", video: "", status: "open", reply: "", resolvedBy: null, resolvedAt: null, createdAt: "d" });
  assert.equal("user" in view, false);
  assert.equal(view.byName, "Dinesh");
});
