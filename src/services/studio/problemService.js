// services/studio/problemService.js
//
// Problems reported in the Video Studio. A person's words are kept as typed.

const MAX_TEXT = 4000;

function cleanProblem(body) {
  const text = String(body?.text ?? "").trim();
  if (!text) throw new Error("Describe the problem.");
  if (text.length > MAX_TEXT) throw new Error(`At most ${MAX_TEXT} characters.`);
  return { text, video: String(body?.video ?? "").trim().slice(0, 80) };
}

function cleanReply(body) {
  const reply = String(body?.reply ?? "").trim();
  if (!reply) throw new Error("Write what was done, so the person knows.");
  if (reply.length > MAX_TEXT) throw new Error(`At most ${MAX_TEXT} characters.`);
  return reply;
}

/** What a person sees of a report. */
const problemView = ({ _id, byName, text, video, status, reply, resolvedBy, resolvedAt, createdAt }) => ({ _id, byName, text, video, status, reply, resolvedBy, resolvedAt, createdAt });

module.exports = { cleanProblem, cleanReply, problemView };
