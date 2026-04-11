const GeminiRenovationService = require("./geminiRenovationService");

class RenovationContractorService {

  /**
   * Find contractors for a city/state/area via Gemini
   * @param {String} city
   * @param {String} state
   * @param {String} primaryArea
   * @returns {Object} { contractors, source }
   */
  static async findContractors(city, state, primaryArea) {
    const contractors = await GeminiRenovationService.fetchContractors(city, state, primaryArea);

    if (!contractors || contractors.length === 0) {
      return { contractors: [], source: 'gemini' };
    }

    return { contractors, source: 'gemini' };
  }
}

module.exports = RenovationContractorService;
