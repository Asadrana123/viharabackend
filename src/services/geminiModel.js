// services/geminiModel.js
//
// The one place the Gemini text model name is set. Google retires models and closes them to new
// accounts (gemini-2.5-flash did, which broke Vtext AI replies), so switching is a GEMINI_MODEL
// change in Render instead of a code change. Embeddings are separate (GEMINI_EMBED_MODEL).
const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

const GEMINI_MODEL = (process.env.GEMINI_MODEL || "").trim() || DEFAULT_GEMINI_MODEL;

module.exports = { GEMINI_MODEL, DEFAULT_GEMINI_MODEL };
