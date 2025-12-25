const {
  RENOVATION_COST_MULTIPLIERS,
  RENOVATION_COST_TIERS,
  AREA_COST_MULTIPLIERS,
  AREA_SIZE_ESTIMATES,
  ROI_RECOVERY_RATES,
  CONTINGENCY_PERCENTAGE,
  getCostContextMessage,
  getRoiMessage
} = require("../config/renovationConstants");

class RenovationCostService {
  
  /**
   * Calculate complete renovation cost analysis
   * @param {Object} propertyData - Property details (state, city, squareFootage, etc.)
   * @param {Object} renovationData - User's renovation preferences (primaryArea, budgetTier)
   * @returns {Object} Complete cost analysis with breakdown and ROI
   */
  static calculateRenovationCost(propertyData, renovationData) {
    try {
      const { state, city, squareFootage } = propertyData;
      const { primaryArea, budgetTier } = renovationData;

      // Validate inputs
      if (!state || !budgetTier || !primaryArea) {
        throw new Error("Missing required property or renovation data");
      }

      // Get location multipliers
      const stateMultiplier = this.getStateMultiplier(state);
      const cityMultiplier = this.getCityMultiplier(city) || stateMultiplier;

      // Get area multiplier
      const areaMultiplier = AREA_COST_MULTIPLIERS[primaryArea] || 1.0;

      // Get budget tier base cost per sq ft
      const tierData = RENOVATION_COST_TIERS[budgetTier];
      if (!tierData) {
        throw new Error(`Invalid budget tier: ${budgetTier}`);
      }
      const basePerSqFt = tierData.basePerSqFt;

      // Calculate area-specific square footage
      const areaSquareFootage = this.estimateAreaSquareFootage(
        squareFootage,
        primaryArea
      );

      // Calculate base cost
      const baseCost = areaSquareFootage * basePerSqFt;

      // Apply location adjustment
      const adjustedCost = baseCost * cityMultiplier * areaMultiplier;

      // Add contingency buffer
      const contingencyAmount = adjustedCost * CONTINGENCY_PERCENTAGE;
      const finalCost = adjustedCost + contingencyAmount;

      // Calculate cost range (±15% variance)
      const costRange = {
        min: Math.round(finalCost * 0.85),
        max: Math.round(finalCost * 1.15)
      };

      // Get ROI estimate
      const recoveryRate = ROI_RECOVERY_RATES[budgetTier];
      const estimatedValueIncrease = Math.round(finalCost * recoveryRate);
      const recoveryPercentage = Math.round(recoveryRate * 100);

      // Get market context message
      const marketContextMessage = getCostContextMessage(state, stateMultiplier);

      return {
        finalCost: Math.round(finalCost),
        costRange,
        breakdown: {
          basePerSqFt,
          areaSquareFootage: Math.round(areaSquareFootage),
          tier: budgetTier,
          location: `${city}, ${state}`
        },
        marketContext: {
          state,
          city,
          stateMultiplier,
          cityMultiplier,
          message: marketContextMessage
        },
        roiEstimate: {
          estimatedValueIncrease,
          recoveryPercentage,
          roiMessage: getRoiMessage(recoveryPercentage)
        }
      };
    } catch (error) {
      console.error("Error calculating renovation cost:", error);
      throw error;
    }
  }

  /**
   * Estimate square footage for a specific renovation area
   * @param {Number} totalSqFt - Total house square footage
   * @param {String} primaryArea - Type of area being renovated
   * @returns {Number} Estimated square footage for the area
   */
  static estimateAreaSquareFootage(totalSqFt, primaryArea) {
    try {
      const areaEstimate = AREA_SIZE_ESTIMATES[primaryArea];
      
      if (!areaEstimate) {
        throw new Error(`Unknown area type: ${primaryArea}`);
      }

      const { minSqFt, percentageOfHouse } = areaEstimate;
      const calculatedSqFt = totalSqFt * percentageOfHouse;

      return Math.max(minSqFt, calculatedSqFt);
    } catch (error) {
      console.error("Error estimating area square footage:", error);
      throw error;
    }
  }

  /**
   * Get state-level cost multiplier
   * @param {String} state - State name
   * @returns {Number} Cost multiplier for the state
   */
  static getStateMultiplier(state) {
    return RENOVATION_COST_MULTIPLIERS.state[state] || 1.0;
  }

  /**
   * Get city-level cost multiplier
   * @param {String} city - City name
   * @returns {Number|null} Cost multiplier for the city, or null if not found
   */
  static getCityMultiplier(city) {
    return RENOVATION_COST_MULTIPLIERS.city[city] || null;
  }

  /**
   * Get budget tier information
   * @param {String} budgetTier - Budget tier name
   * @returns {Object} Budget tier details
   */
  static getBudgetTierInfo(budgetTier) {
    return RENOVATION_COST_TIERS[budgetTier] || null;
  }

  /**
   * Validate cost calculation inputs
   * @param {Object} propertyData - Property details
   * @param {Object} renovationData - Renovation preferences
   * @returns {Object} Validation result { isValid: boolean, error: string }
   */
  static validateInputs(propertyData, renovationData) {
    if (!propertyData.state) {
      return { isValid: false, error: "State is required" };
    }
    if (!propertyData.squareFootage || propertyData.squareFootage <= 0) {
      return { isValid: false, error: "Valid square footage is required" };
    }
    if (!renovationData.budgetTier) {
      return { isValid: false, error: "Budget tier is required" };
    }
    if (!renovationData.primaryArea) {
      return { isValid: false, error: "Primary area is required" };
    }
    if (!RENOVATION_COST_TIERS[renovationData.budgetTier]) {
      return { isValid: false, error: "Invalid budget tier" };
    }
    if (!AREA_COST_MULTIPLIERS[renovationData.primaryArea]) {
      return { isValid: false, error: "Invalid renovation area" };
    }

    return { isValid: true, error: null };
  }
}

module.exports = RenovationCostService;
