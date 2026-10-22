// services/leads/formAnswers.js
//
// Extra questions a designer adds to a landing page form (Admin → Landing
// Pages). The page sends them as `extraAnswers: [{ question, answer }]` next to
// the form's usual fields; every landing lead stores them as they were asked.
// An answer may be text, a yes/no, a number or a list of picked options.

const MAX_ANSWERS = 30;
const MAX_QUESTION = 200;
const MAX_ANSWER = 2000;

const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function answerText(v) {
  if (Array.isArray(v)) return v.map((x) => answerText(x)).filter(Boolean).join(", ").slice(0, MAX_ANSWER);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return text(v, MAX_ANSWER);
}

/**
 * @param {*} raw  the request's extraAnswers (anything — it's user input)
 * @returns {Array<{question: string, answer: string}>} clean, non-empty answers
 */
function sanitizeFormAnswers(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_ANSWERS)
    .map((a) => ({ question: text(a?.question, MAX_QUESTION), answer: answerText(a?.answer) }))
    .filter((a) => a.question && a.answer);
}

// Rows for the Slack new-lead message.
const answersAsFields = (answers = []) => answers.map((a) => ({ label: a.question, value: a.answer }));

// "Question: answer; Question: answer" — what Maya is told on the call.
const answersSpoken = (answers = []) => answers.map((a) => `${a.question}: ${a.answer}`).join("; ");

const formAnswerSchemaDef = {
  type: [{ question: { type: String, default: "" }, answer: { type: String, default: "" }, _id: false }],
  default: [],
};

module.exports = { sanitizeFormAnswers, answersAsFields, answersSpoken, formAnswerSchemaDef };
