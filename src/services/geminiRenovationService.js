const { GoogleGenerativeAI } = require("@google/generative-ai");

class GeminiRenovationService {
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set");
    }
    this.client = new GoogleGenerativeAI(apiKey);
    this.modelName = "gemini-2.5-flash";
  }

  /**
   * Fetch real-time renovation costs for a specific city/state/area/tier
   * @param {Object} propertyData - { city, state, squareFootage, lotSize }
   * @param {Object} renovationData - { primaryArea, budgetTier }
   * @returns {Object|null} - Structured cost data or null if failed
   */
  async fetchRenovationCosts(propertyData, renovationData) {
    try {
      const { city, state, squareFootage, lotSize } = propertyData;
      const { primaryArea, budgetTier } = renovationData;

      const prompt = this._buildCostPrompt(city, state, squareFootage, lotSize, primaryArea, budgetTier);
      const model = this.client.getGenerativeModel({ model: this.modelName });

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1 }
      });

      const text = result.response.text();
      return this._parseCostResponse(text, city, state, primaryArea, budgetTier);
    } catch (error) {
      console.error("GeminiRenovationService.fetchRenovationCosts error:", error);
      return null;
    }
  }

  /**
   * Fetch real contractors for a specific city/state/renovation area
   * @param {String} city
   * @param {String} state
   * @param {String} primaryArea
   * @returns {Array|null} - Array of contractor objects or null if failed
   */
  async fetchContractors(city, state, primaryArea) {
    try {
      const prompt = this._buildContractorPrompt(city, state, primaryArea);
      const model = this.client.getGenerativeModel({ model: this.modelName });

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1 }
      });

      const text = result.response.text();
      return this._parseContractorResponse(text);
    } catch (error) {
      console.error("GeminiRenovationService.fetchContractors error:", error);
      return null;
    }
  }

  // ==================== PROMPT BUILDERS ====================

  _buildCostPrompt(city, state, squareFootage, lotSize, primaryArea, budgetTier) {
    const sqftContext = squareFootage ? `Property size: ${squareFootage} sq ft.` : '';
    const lotContext = lotSize ? `Lot size: ${lotSize} acres.` : '';

    const areaItems = this._getAreaItems(primaryArea);

    return `You are a real estate renovation cost expert. Provide REAL current 2025 renovation costs for ${city}, ${state}.

Property details: ${sqftContext} ${lotContext}
Renovation area: ${primaryArea}
Budget tier: ${budgetTier}

Provide itemized costs for these specific line items: ${areaItems.join(', ')}

Budget tier definitions:
- Budget-Friendly: Basic materials, standard finishes, minimal scope
- Mid-Range: Quality materials, modern finishes, full scope
- Premium: High-end materials, designer finishes, expanded scope  
- Luxury: Bespoke materials, luxury finishes, maximum scope

IMPORTANT: Return ONLY a valid JSON object, no markdown, no explanation, no backticks.

{
  "city": "${city}",
  "state": "${state}",
  "primaryArea": "${primaryArea}",
  "budgetTier": "${budgetTier}",
  "regionalFactor": <number: cost multiplier vs national average, e.g. 1.45 for San Francisco>,
  "region": "<US Census region: Northeast | South | West | Midwest>",
  "lineItems": [
    {
      "item": "<item name matching the line items list>",
      "description": "<one sentence describing what is included>",
      "cost": <number in USD, no commas>,
      "roiRecovery": <number: percentage of cost recovered in home value, e.g. 72>,
      "costBasis": "<brief explanation of how cost was calculated>"
    }
  ],
  "dataSource": "AI-powered real-time market analysis — Google Gemini"
}`;
  }

  _buildContractorPrompt(city, state, primaryArea) {
    return `You are a real estate renovation expert. Find REAL, currently operating renovation contractors in ${city}, ${state} specializing in ${primaryArea} renovation.

IMPORTANT: Only include contractors that actually exist and are currently operating in ${city}, ${state}. Do not invent or hallucinate businesses.

Return ONLY a valid JSON array, no markdown, no explanation, no backticks.

[
  {
    "name": "<real business name>",
    "phone": "<real phone number>",
    "address": "<real street address, city, state, zip>",
    "rating": <number between 4.0 and 5.0>,
    "reviewCount": <number>,
    "specialty": "<renovation specialty relevant to ${primaryArea}>",
    "yearsInBusiness": <number>,
    "source": "<where this business is listed, e.g. Yelp · Google · BBB>"
  }
]

Return 5 to 6 contractors. If you cannot find enough real verified contractors in ${city}, return fewer rather than inventing any.`;
  }

  _getAreaItems(primaryArea) {
    const itemMap = {
      'Kitchen':      ['Cabinets', 'Countertops', 'Appliances', 'Flooring', 'Lighting'],
      'Bathroom':     ['Vanity & Sink', 'Shower & Tub', 'Tile & Flooring', 'Fixtures & Lighting'],
      'Bedroom':      ['Flooring', 'Paint & Trim', 'Closet & Storage', 'Lighting'],
      'Living Room':  ['Flooring', 'Paint & Trim', 'Lighting', 'Fireplace Update'],
      'Exterior':     ['Repaint only', 'Update roof/siding', 'New entrance', 'Landscaping', 'Driveway']
    };
    return itemMap[primaryArea] || itemMap['Exterior'];
  }

  // ==================== RESPONSE PARSERS ====================

  _parseCostResponse(text, city, state, primaryArea, budgetTier) {
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);

      // Validate required fields
      if (
        !parsed.lineItems ||
        !Array.isArray(parsed.lineItems) ||
        parsed.lineItems.length === 0
      ) {
        console.warn("GeminiRenovationService: invalid cost response structure");
        return null;
      }

      // Validate each line item has a cost
      const validItems = parsed.lineItems.filter(
        item => item.item && typeof item.cost === 'number' && item.cost > 0
      );

      if (validItems.length === 0) {
        console.warn("GeminiRenovationService: no valid line items in cost response");
        return null;
      }

      return {
        ...parsed,
        lineItems: validItems,
        dataSource: `AI-powered real-time market analysis for ${city}, ${state} — Google Gemini`,
        source: 'gemini'
      };
    } catch (error) {
      console.error("GeminiRenovationService: failed to parse cost response:", error);
      return null;
    }
  }

  _parseContractorResponse(text) {
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);

      if (!Array.isArray(parsed) || parsed.length === 0) {
        console.warn("GeminiRenovationService: invalid contractor response structure");
        return null;
      }

      // Filter out any entries missing critical fields
      const valid = parsed.filter(c => c.name && c.phone);

      if (valid.length === 0) {
        console.warn("GeminiRenovationService: no valid contractors in response");
        return null;
      }

      return valid;
    } catch (error) {
      console.error("GeminiRenovationService: failed to parse contractor response:", error);
      return null;
    }
  }
}

module.exports = new GeminiRenovationService();