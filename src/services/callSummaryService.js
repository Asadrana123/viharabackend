// services/callSummaryService.js
const axios = require("axios");

// Uses Anthropic (Claude) to turn a raw call transcript into a short CRM summary
// plus a few structured fields. Best-effort: the caller must treat a null return
// as "no summary" and never let a failure here block saving the call.

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
// Haiku is fast + cheap and ideal for summarization. Override via env if needed.
const ANTHROPIC_SUMMARY_MODEL =
  process.env.ANTHROPIC_SUMMARY_MODEL || "claude-haiku-4-5-20251001";

// Guard against very long transcripts running up cost — calls are short anyway.
const MAX_TRANSCRIPT_CHARS = 12000;

const SYSTEM_PROMPT = `You summarize outbound real-estate sales calls for a CRM. Read the transcript and return ONLY a compact JSON object — no markdown, no code fences, no preamble — with exactly these keys:
{
  "summary": "2-3 sentences: who the person is, their interest level, any objections they raised, and what they're looking for. Write it so a salesperson reading it right before the next call instantly knows where things stand.",
  "interestLevel": "one of: high, medium, low, none",
  "objections": "short comma-separated list of objections or concerns they raised, or an empty string",
  "buyBox": "what they're looking for — property type, location, budget — or an empty string"
}
Base everything ONLY on what is actually in the transcript. Do not invent details. If the call never reached a real conversation, set interestLevel to "none" and keep the other fields short or empty.`;

/**
 * Summarize a transcript into { summary, interestLevel, objections, buyBox }.
 * Returns null when there's nothing to do or the API key is missing.
 * Throws on network/API errors — the caller wraps this in try/catch.
 */
async function summarizeTranscript(transcript) {
  const text = String(transcript || "").trim();
  if (!text) return null;

  if (!ANTHROPIC_API_KEY) {
    console.warn("[cb-debug] ANTHROPIC_API_KEY not set — skipping summary generation");
    return null;
  }

  const clipped =
    text.length > MAX_TRANSCRIPT_CHARS ? text.slice(0, MAX_TRANSCRIPT_CHARS) : text;

  const { data } = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: ANTHROPIC_SUMMARY_MODEL,
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Transcript:\n\n${clipped}` }],
    },
    {
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      timeout: 20000,
    }
  );

  // Pull the text out of the content blocks.
  const raw = Array.isArray(data.content)
    ? data.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim()
    : "";
  if (!raw) return null;

  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      summary: String(parsed.summary || "").trim(),
      interestLevel: String(parsed.interestLevel || "").trim(),
      objections: Array.isArray(parsed.objections)
        ? parsed.objections.join(", ")
        : String(parsed.objections || "").trim(),
      buyBox: String(parsed.buyBox || "").trim(),
    };
  } catch (_e) {
    // Model didn't return clean JSON — still salvage a usable summary.
    return {
      summary: cleaned.slice(0, 600),
      interestLevel: "",
      objections: "",
      buyBox: "",
    };
  }
}

module.exports = { summarizeTranscript };
