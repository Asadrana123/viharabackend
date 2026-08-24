// services/propertyDescriptionService.js
//
// Generates a clean, human-readable property description from parsed PropStream
// facts using Google Gemini — matching the project's existing Gemini setup
// (@google/generative-ai, model gemini-2.5-flash, key GEMINI_API_KEY).
//
// Safety:
//   - NO invented data: the prompt forbids adding features/amenities/numbers
//     that aren't in the supplied facts.
//   - Never throws: if the key is missing or Gemini errors/returns empty, it
//     falls back to a factual template so an import is never blocked.

const { GoogleGenerativeAI } = require("@google/generative-ai");

const MODEL_NAME = "gemini-2.5-flash";

// Lazily created so a missing key doesn't crash module load (unlike a service
// that throws in its constructor) — the importer must degrade, not break.
let _client = null;
function getClient() {
    if (_client) return _client;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    _client = new GoogleGenerativeAI(apiKey);
    return _client;
}

/** Factual fallback description built purely from parsed facts. */
function templateDescription(p) {
    const bits = [];
    const bedbath =
        p.beds != null && p.baths != null ? `${p.beds}-bedroom, ${p.baths}-bathroom ` : "";
    const type = (p.propertyType || "home").toLowerCase();
    const loc = [p.city, p.state].filter(Boolean).join(", ");
    let lead = `${bedbath}${type}${loc ? ` in ${loc}` : ""}`;
    if (p.yearBuilt) lead += `, built in ${p.yearBuilt}`;
    bits.push(lead + ".");
    if (p.squareFootage || p.lotSize) {
        const sqft = p.squareFootage ? `${p.squareFootage.toLocaleString()} sq ft of living space` : "";
        const lot = p.lotSize ? `${p.lotSize.toLocaleString()} sq ft lot` : "";
        bits.push(`Offering ${[sqft, lot].filter(Boolean).join(" on a ")}.`);
    }
    if (p.assetType === "Foreclosure Homes") {
        bits.push(`Distressed / pre-foreclosure opportunity${p.county ? ` in ${p.county} County` : ""}.`);
    }
    return bits.join(" ").trim();
}

function buildPrompt(p) {
    const facts = [
        p.street && `Address: ${p.street}`,
        (p.city || p.state) && `City/State: ${[p.city, p.state].filter(Boolean).join(", ")}`,
        p.county && `County: ${p.county}`,
        p.propertyType && `Property type: ${p.propertyType}`,
        p.beds != null && `Bedrooms: ${p.beds}`,
        p.baths != null && `Bathrooms: ${p.baths}`,
        p.squareFootage && `Living area: ${p.squareFootage} sq ft`,
        p.lotSize && `Lot size: ${p.lotSize} sq ft`,
        p.yearBuilt && `Year built: ${p.yearBuilt}`,
        p.occupancyStatus && `Occupancy: ${p.occupancyStatus}`,
        p.assetType === "Foreclosure Homes" && `Status: distressed / pre-foreclosure`,
    ].filter(Boolean).join("\n");

    return `You are writing a concise, factual listing description for a real-estate auction marketplace.

Rules:
- Use ONLY the facts below. Do NOT invent features, amenities, condition, upgrades, views, or any numbers not provided.
- 2 to 4 sentences. Plain text only — no markdown, no bullet points, no headings, no emojis.
- Professional and appealing, but honest. Do not mention price, reserve, bidding, or the auction itself.
- If a fact is missing, simply omit it. Do not speculate.

Facts:
${facts}

Return only the description text.`;
}

/**
 * @param {object} parsed  Parsed PropStream facts (from propStreamParserService).
 * @returns {Promise<string>} A description — Gemini-generated, or the template.
 */
async function generatePropertyDescription(parsed) {
    const client = getClient();
    if (!client) return templateDescription(parsed);

    try {
        const model = client.getGenerativeModel({ model: MODEL_NAME });
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: buildPrompt(parsed) }] }],
            generationConfig: { temperature: 0.4 },
        });
        const text = (result?.response?.text() || "").replace(/```/g, "").trim();
        return text || templateDescription(parsed);
    } catch (error) {
        console.error("propertyDescriptionService: Gemini failed, using template:", error?.message || error);
        return templateDescription(parsed);
    }
}

module.exports = { generatePropertyDescription, templateDescription };
