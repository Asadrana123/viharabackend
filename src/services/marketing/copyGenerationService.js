// services/marketing/copyGenerationService.js
//
// Calls Gemini to write Marketing Engine copy. Same setup as
// propertyDescriptionService: @google/generative-ai, gemini-2.5-flash,
// GEMINI_API_KEY, lazily created client.
//
// Gemini only writes wording. It never decides what is allowed; the caller
// runs complianceChecker on every line it returns.

const { GoogleGenerativeAI } = require("@google/generative-ai");
const Errorhandler = require("../../utils/errorhandler");
const prompts = require("./copyPrompts");

const MODEL_NAME = "gemini-2.5-flash";
const REQUEST_TIMEOUT_MS = 60000;
const TEMPERATURE = 0.6;
const REGENERATE_TEMPERATURE = 0.3;

let _client = null;
function getClient() {
    if (_client) return _client;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    _client = new GoogleGenerativeAI(apiKey);
    return _client;
}

function isConfigured() {
    return Boolean(process.env.GEMINI_API_KEY);
}

/** Parse Gemini's JSON reply, tolerating stray code fences. */
function parseJson(text) {
    const stripped = String(text || "").replace(/```json|```/g, "").trim();
    try {
        return JSON.parse(stripped);
    } catch {
        const start = stripped.indexOf("{");
        const end = stripped.lastIndexOf("}");
        if (start !== -1 && end > start) return JSON.parse(stripped.slice(start, end + 1));
        throw new Error("Gemini did not return valid JSON");
    }
}

async function generateJson(prompt, temperature = TEMPERATURE) {
    const client = getClient();
    if (!client) {
        throw new Errorhandler("Gemini is not configured on the server (GEMINI_API_KEY missing)", 500);
    }

    const model = client.getGenerativeModel({ model: MODEL_NAME }, { timeout: REQUEST_TIMEOUT_MS });
    const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature, responseMimeType: "application/json" },
    });
    return parseJson(result?.response?.text());
}

// ---------------------------------------------------------------------------
// Public API: each returns { [group]: { [field]: string } }
// ---------------------------------------------------------------------------
const generateMetaCopy = (brief, cell, groups) =>
    generateJson(prompts.buildMetaPrompt(brief, cell, groups));

const generateLandingPageCopy = (brief, groups, personaLabels) =>
    generateJson(prompts.buildLandingPagePrompt(brief, groups, personaLabels));

const generateEmailCopy = (brief, groups, personaLabels) =>
    generateJson(prompts.buildEmailPrompt(brief, groups, personaLabels));

const generateSmsCopy = (brief, groups) =>
    generateJson(prompts.buildSmsPrompt(brief, groups));

/**
 * Rewrite one line. Never throws: returns "" on any failure so the caller can
 * fall back to a visible placeholder.
 */
async function regenerateLine(brief, details) {
    try {
        const json = await generateJson(prompts.buildRegeneratePrompt(brief, details), REGENERATE_TEMPERATURE);
        return typeof json?.text === "string" ? json.text : "";
    } catch (error) {
        console.error("copyGenerationService: regenerate failed:", error?.message || error);
        return "";
    }
}

module.exports = {
    isConfigured,
    generateMetaCopy,
    generateLandingPageCopy,
    generateEmailCopy,
    generateSmsCopy,
    regenerateLine,
};
