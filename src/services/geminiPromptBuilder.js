class GeminiPromptBuilder {

  /**
   * Build complete system and user prompts for Gemini
   * @param {Object} propertyData - Property details from database
   * @param {Object} renovationData - User's form selections
   * @param {Object} costAnalysis - Cost analysis from RenovationCostService
   * @returns {Object} { systemPrompt, userPrompt }
   */
  static buildPrompts(propertyData, renovationData, costAnalysis) {
    try {
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(propertyData, renovationData, costAnalysis);

      return {
        systemPrompt,
        userPrompt
      };
    } catch (error) {
      console.error("Error building prompts:", error);
      throw error;
    }
  }

  /**
   * Build system prompt - sets context and instructions for Gemini
   * @returns {String} System prompt
   */
  static buildSystemPrompt() {
    return `You are an expert real estate renovation architect and designer creating 
    REALISTIC property visualizations. Your visualizations must account for:

1. Geographic Location Context: Cost and availability of materials varies by region
2. Market Awareness: Renovations reflect typical styles and price points for the area
3. Property Specifics: Size, age, and type of property affect realistic renovation scope
4. Budget Constraints: Renovations must be achievable within the stated budget
5. Regional Preferences: Design preferences vary significantly by geography

CRITICAL: Your renovations should be realistic, achievable, and market-appropriate. 
Do not suggest premium finishes in markets that don't justify them.`;
  }

  /**
   * Build user prompt - dynamic content based on property and user selections
   * @param {Object} propertyData - Property details
   * @param {Object} renovationData - User's form selections
   * @param {Object} costAnalysis - Cost analysis
   * @returns {String} User prompt
   */
  static buildUserPrompt(propertyData, renovationData, costAnalysis) {
    const {
      street,
      city,
      state,
      beds,
      baths,
      squareFootage,
      yearBuilt,
      propertyType
    } = propertyData;

    const {
      primaryArea,
      style,
      colorScheme,
      openConcept,
      countertopPreference,
      luxuryLevel,
      spaFeatures,
      bathroomType,
      layoutFocus,
      flooringPreference,
      bedroomType,
      lightingPreference,
      roomPurpose,
      accentWall,
      colorSchemeStrategy,
      focusAreas,
      renovationType,
      exteriorFocusAreas,
      architecturalElements,
      includeLandscaping,
      budgetTier,
      includeFurniture
    } = renovationData;

    const {
      finalCost,
      costRange,
      marketContext,
      roiEstimate
    } = costAnalysis;

    // Build property section
    let propertySection = `PROPERTY DETAILS:
- Address: ${street}, ${city}, ${state}
- Type: ${propertyType}
- Size: ${squareFootage.toLocaleString()} sq ft
- Bedrooms: ${beds} | Bathrooms: ${baths}
- Built: ${yearBuilt}`;

    // Build renovation scope section (dynamic based on area)
    let renovationScope = this.buildRenovationScope(
      primaryArea,
      renovationData
    );

    // Build budget section
    let budgetSection = `BUDGET INFORMATION:
- Budget Tier: ${budgetTier}
- Estimated Cost: $${finalCost.toLocaleString()}
- Realistic Range: $${costRange.min.toLocaleString()} - $${costRange.max.toLocaleString()}`;

    // Build market context section
    let marketSection = `MARKET CONTEXT:
- Location: ${city}, ${state}
- Location Multiplier: ${marketContext.cityMultiplier}x national average
- ${marketContext.message}`;

    // Build design requirements section
    let designRequirements = this.buildDesignRequirements(
      primaryArea,
      budgetTier,
      style,
      renovationData,
      state,
      city
    );

    // Build realistic constraints section
    let constraints = this.buildConstraints(
      primaryArea,
      budgetTier,
      costRange,
      state,
      marketContext,
      renovationData
    );

    // Build ROI section
    let roiSection = `POTENTIAL VALUE INCREASE:
This renovation could increase your property
 value by ~$${roiEstimate.estimatedValueIncrease.toLocaleString()}
(${roiEstimate.roiMessage})`;

    // Combine all sections
    const userPrompt = `${propertySection}

${renovationScope}

${budgetSection}

${marketSection}

${designRequirements}

${constraints}

${roiSection}

Please create ONE high-quality before/after visualization showing realistic 
transformation with the above specifications.`;

    return userPrompt;
  }

  /**
   * Build renovation scope section based on primary area
   * @param {String} primaryArea - Type of renovation
   * @param {Object} renovationData - User's selections
   * @returns {String} Renovation scope section
   */
  static buildRenovationScope(primaryArea, renovationData) {
    let scope = `RENOVATION SCOPE:
- Primary Area: ${primaryArea}
- Design Style: ${renovationData.style}
- Color Scheme: ${renovationData.colorScheme}`;

    if (primaryArea === 'Kitchen') {
      scope += `
- Open Concept: ${renovationData.openConcept ? 'Yes' : 'No'}
- Countertop Material: ${renovationData.countertopPreference || 'Not specified'}`;
    } else if (primaryArea === 'Bathroom') {
      scope += `
- Luxury Level: ${renovationData.luxuryLevel || 'Not specified'}
- Spa Features: ${renovationData.spaFeatures ? 'Yes' : 'No'}
- Bathroom Type: ${renovationData.bathroomType || 'Full Bathroom'}`;
    } else if (primaryArea === 'Living Room') {
      scope += `
- Layout Focus: ${renovationData.layoutFocus || 'Not specified'}
- Flooring Preference: ${renovationData.flooringPreference || 'Not specified'}`;
    } else if (primaryArea === 'Bedroom') {
      scope += `
- Bedroom Type: ${renovationData.bedroomType || 'Master Bedroom'}
- Lighting Preference: ${renovationData.lightingPreference || 'Not specified'}`;
    } else if (primaryArea === 'Full Property') {
      scope += `
- Color Scheme Strategy: ${renovationData.colorSchemeStrategy || 'Consistent throughout'}
- Focus Areas: ${renovationData.focusAreas || 'All equally'}`;
    } else if (primaryArea === 'Exterior') {
      scope += `
- Focus Areas: ${renovationData.exteriorFocusAreas || 'Front entrance, Landscaping'}
- Architectural Elements: ${renovationData.architecturalElements || 'Update siding'}`;
    }

    scope += `
- Include Furniture: ${renovationData.includeFurniture ? 'Yes' : 'No'}`;

    return scope;
  }

  /**
   * Build design requirements section
   * @param {String} primaryArea - Type of renovation
   * @param {String} budgetTier - Budget tier
   * @param {String} style - Design style
   * @param {Object} renovationData - User's selections
   * @param {String} state - State name
   * @param {String} city - City name
   * @returns {String} Design requirements section
   */
  static buildDesignRequirements(primaryArea, budgetTier, style, renovationData, state, city) {
    let requirements = `DESIGN REQUIREMENTS:
1. Create a realistic "after" image showing the renovated ${primaryArea}
2. Use materials and finishes realistic for ${budgetTier} renovations in ${state}
3. Ensure the design is appropriate for this property type
4. Consider local building styles and trends for ${city}, ${state}
5. Incorporate ${style} style authentic to the region
6. Use ${renovationData.colorScheme} color scheme`;

    if (renovationData.includeFurniture) {
      requirements += `
7. Include modern furniture and styling`;
    }

    return requirements;
  }

  /**
   * Build realistic constraints section
   * @param {String} primaryArea - Type of renovation
   * @param {String} budgetTier - Budget tier
   * @param {Object} costRange - Cost range
   * @param {String} state - State name
   * @param {Object} marketContext - Market context data
   * @param {Object} renovationData - User's selections
   * @returns {String} Constraints section
   */
  static buildConstraints(primaryArea, budgetTier, costRange, state, marketContext, renovationData) {
    let constraints = `REALISTIC CONSTRAINTS:
- ${primaryArea} renovations in ${state} typically range $${costRange.min.toLocaleString()} - $${costRange.max.toLocaleString()}
- Choose materials and finishes that represent good value for the ${budgetTier} tier
- The finished space should match ${marketContext.city}, ${state} aesthetic preferences
- Design should be cohesive and practical for daily living
- Consider resale value and current market trends for the area`;

    return constraints;
  }
}

module.exports = GeminiPromptBuilder;
