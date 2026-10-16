// services/adsLoop/claudeJson.js
//
// One Claude call that returns JSON matching a schema (structured outputs).
// Streams so long answers (a full HTML build) can't hit a request timeout,
// and opts into server-side fallbacks so a classifier decline is retried on
// a fallback model inside the same call.
//
// Env: ANTHROPIC_API_KEY, optional ADS_LOOP_MODEL (default claude-opus-5-5).

const Anthropic = require("@anthropic-ai/sdk");
const { getAdsLoopConfig } = require("../../config/adsLoop/adsLoopConfig");

// Created on first use so a missing key fails the job, not server startup.
let client;

/**
 * @param {object} p
 * @param {string} p.system
 * @param {Array} p.content          user message content blocks (text and images)
 * @param {object} p.schema          JSON schema of the answer (objects need additionalProperties: false)
 * @param {"low"|"medium"|"high"|"xhigh"|"max"} [p.effort]
 * @param {number} [p.maxTokens]
 * @returns {Promise<object>} the parsed answer
 */
async function claudeJson({ system, content, schema, effort = "high", maxTokens = 32000 }) {
    client = client || new Anthropic();
    const stream = client.beta.messages.stream({
        model: getAdsLoopConfig().creative.model,
        max_tokens: maxTokens,
        thinking: { type: "adaptive" },
        output_config: { effort, format: { type: "json_schema", schema } },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system,
        messages: [{ role: "user", content }],
    });
    const response = await stream.finalMessage();

    if (response.stop_reason === "refusal") {
        throw new Error(`Claude declined this request${response.stop_details?.explanation ? `: ${response.stop_details.explanation}` : ""}`);
    }
    if (response.stop_reason === "max_tokens") throw new Error("Claude's answer was cut off (max_tokens)");

    const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
    try {
        return JSON.parse(text);
    } catch {
        throw new Error("Claude did not return valid JSON");
    }
}

const textBlock = (text) => ({ type: "text", text });
const imageBlock = (url) => ({ type: "image", source: { type: "url", url } });

module.exports = { claudeJson, textBlock, imageBlock };
