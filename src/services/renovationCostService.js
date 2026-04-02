const {
  RENOVATION_COST_MULTIPLIERS,
  RENOVATION_COST_TIERS,
  AREA_COST_MULTIPLIERS,
  AREA_SIZE_ESTIMATES,
  ROI_RECOVERY_RATES,
  CONTINGENCY_PERCENTAGE,
  EXTERIOR_RENOVATION_ITEMS,
  EXTERIOR_ROI_BY_PROJECT,
  getCostContextMessage,
  getRoiMessage
} = require("../config/renovationConstants");

class RenovationCostService {

  /**
   * Main entry point — routes to exterior or generic calculation
   */
  static calculateRenovationCost(propertyData, renovationData) {
    try {
      const { primaryArea } = renovationData;

      if (primaryArea === 'Exterior') {
        return this.calculateExteriorCost(propertyData, renovationData);
      }

      return this.calculateGenericCost(propertyData, renovationData);
    } catch (error) {
      console.error("Error calculating renovation cost:", error);
      throw error;
    }
  }

  /**
   * Calculate itemized exterior renovation cost
   * Uses EXTERIOR_RENOVATION_ITEMS with real market data
   */
  static calculateExteriorCost(propertyData, renovationData) {
    const { state, city, squareFootage, lotSize } = propertyData;
    const { budgetTier } = renovationData;

    // Default primary work and focus area based on budget tier
    // Higher budgets assume more comprehensive scope
    const primaryWorkByTier = {
      'Budget-Friendly': 'Repaint only',
      'Mid-Range': 'Update roof/siding',
      'Premium': 'Update roof/siding',
      'Luxury': 'Update roof/siding'
    };

    const focusAreaByTier = {
      'Budget-Friendly': 'Front entrance',
      'Mid-Range': 'Landscaping',
      'Premium': 'All',
      'Luxury': 'All'
    };

    const primaryWork = primaryWorkByTier[budgetTier] || 'Repaint only';
    const focusArea = focusAreaByTier[budgetTier] || 'Front entrance';

    // Get location multipliers
    const stateMultiplier = this.getStateMultiplier(state);
    const cityMultiplier = this.getCityMultiplier(city) || stateMultiplier;

    // Build itemized breakdown
    const lineItems = this.buildExteriorLineItems(
      primaryWork,
      focusArea,
      budgetTier,
      cityMultiplier,
      squareFootage,
      lotSize
    );

    // Sum all line items
    const subtotal = lineItems.reduce((sum, item) => sum + item.cost, 0);

    // Add contingency
    const contingencyAmount = Math.round(subtotal * CONTINGENCY_PERCENTAGE);
    const finalCost = subtotal + contingencyAmount;

    // Cost range ±15%
    const costRange = {
      min: Math.round(finalCost * 0.85),
      max: Math.round(finalCost * 1.15)
    };

    // Get ROI for primary work item
    const roiData = EXTERIOR_ROI_BY_PROJECT[primaryWork] ||
      EXTERIOR_ROI_BY_PROJECT['Repaint only'];
    const estimatedValueIncrease = Math.round(finalCost * (roiData.recovery / 100));

    // Market context
    const marketContextMessage = getCostContextMessage(state, stateMultiplier);

    return {
      finalCost: Math.round(finalCost),
      costRange,
      lineItems,
      contingency: {
        percentage: Math.round(CONTINGENCY_PERCENTAGE * 100),
        amount: contingencyAmount,
        reason: 'Standard 12% contingency buffer for unexpected costs, permit fees, and site preparation'
      },
      breakdown: {
        primaryWork,
        focusArea,
        tier: budgetTier,
        location: `${city}, ${state}`,
        subtotal: Math.round(subtotal)
      },
      marketContext: {
        state,
        city,
        stateMultiplier,
        cityMultiplier,
        message: marketContextMessage,
        dataSource: 'Remodeling Magazine 2025 Cost vs Value Report — South Region'
      },
      roiEstimate: {
        estimatedValueIncrease,
        recoveryPercentage: roiData.recovery,
        roiMessage: roiData.insight,
        source: 'NAR 2025 Remodeling Impact Report'
      }
    };
  }

  /**
   * Build itemized line items for exterior renovation
   * Always includes primary work + focus area as two separate line items
   * Adds landscaping automatically if not already included
   */
  static buildExteriorLineItems(primaryWork, focusArea, budgetTier, cityMultiplier, squareFootage, lotSize) {
    const lineItems = [];
    const addedItems = new Set();

    const addItem = (itemKey) => {
      if (addedItems.has(itemKey)) return;

      const itemData = EXTERIOR_RENOVATION_ITEMS[itemKey];
      if (!itemData) return;

      const tierMultiplier = itemData.budgetTierMultipliers[budgetTier] || 1.0;
      const rawCost = itemData.nationalAvgCost * itemData.houstonMultiplier * tierMultiplier * cityMultiplier;

      // Apply lot size adjustment for landscaping and driveway
      let adjustedCost = rawCost;
      if (itemKey === 'Landscaping' && lotSize) {
        // Lot size in acres — scale cost proportionally
        // Base estimate assumes 0.25 acre lot
        const lotMultiplier = Math.min(Math.max(lotSize / 0.25, 0.5), 3.0);
        adjustedCost = rawCost * lotMultiplier;
      }

      // Apply sqft adjustment for siding and paint
      if ((itemKey === 'Update roof/siding' || itemKey === 'Repaint only') && squareFootage) {
        // Base estimate assumes 2,500 sqft house
        const sqftMultiplier = Math.min(Math.max(squareFootage / 2500, 0.6), 2.5);
        adjustedCost = rawCost * sqftMultiplier;
      }

      lineItems.push({
        item: itemKey,
        description: itemData.description,
        costBasis: itemData.costBasis,
        cost: Math.round(adjustedCost),
        roiRecovery: itemData.roiRecovery
      });

      addedItems.add(itemKey);
    };

    // Always add primary work first
    addItem(primaryWork);

    // Add focus area if different from primary work
    if (focusArea !== primaryWork) {
      addItem(focusArea);
    }

    // If primary is All, don't add anything else
    if (primaryWork === 'All') {
      return lineItems;
    }

    // Always add landscaping if not already included — it's always part of exterior
    if (primaryWork !== 'Landscaping' && focusArea !== 'Landscaping') {
      addItem('Landscaping');
    }

    return lineItems;
  }

  /**
   * Generic cost calculation for non-exterior areas (Kitchen, Bathroom etc.)
   * Kept for backward compatibility — used when interior areas are re-enabled
   */
  static calculateGenericCost(propertyData, renovationData) {
    const { state, city, squareFootage } = propertyData;
    const { primaryArea, budgetTier } = renovationData;

    const stateMultiplier = this.getStateMultiplier(state);
    const cityMultiplier = this.getCityMultiplier(city) || stateMultiplier;
    const areaMultiplier = AREA_COST_MULTIPLIERS[primaryArea] || 1.0;

    const tierData = RENOVATION_COST_TIERS[budgetTier];
    if (!tierData) throw new Error(`Invalid budget tier: ${budgetTier}`);

    const basePerSqFt = tierData.basePerSqFt;
    const areaSquareFootage = this.estimateAreaSquareFootage(squareFootage, primaryArea);
    const baseCost = areaSquareFootage * basePerSqFt;
    const adjustedCost = baseCost * cityMultiplier * areaMultiplier;
    const contingencyAmount = adjustedCost * CONTINGENCY_PERCENTAGE;
    const finalCost = adjustedCost + contingencyAmount;

    const costRange = {
      min: Math.round(finalCost * 0.85),
      max: Math.round(finalCost * 1.15)
    };

    const recoveryRate = ROI_RECOVERY_RATES[budgetTier];
    const estimatedValueIncrease = Math.round(finalCost * recoveryRate);
    const recoveryPercentage = Math.round(recoveryRate * 100);
    const marketContextMessage = getCostContextMessage(state, stateMultiplier);

    return {
      finalCost: Math.round(finalCost),
      costRange,
      lineItems: [],
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
  }

  /**
   * Estimate square footage for a specific renovation area
   */
  static estimateAreaSquareFootage(totalSqFt, primaryArea) {
    const areaEstimate = AREA_SIZE_ESTIMATES[primaryArea];
    if (!areaEstimate) throw new Error(`Unknown area type: ${primaryArea}`);
    const { minSqFt, percentageOfHouse } = areaEstimate;
    return Math.max(minSqFt, totalSqFt * percentageOfHouse);
  }

  static getStateMultiplier(state) {
    return RENOVATION_COST_MULTIPLIERS.state[state] || 1.0;
  }

  static getCityMultiplier(city) {
    return RENOVATION_COST_MULTIPLIERS.city[city] || null;
  }

  static getBudgetTierInfo(budgetTier) {
    return RENOVATION_COST_TIERS[budgetTier] || null;
  }

  /**
   * Validate inputs
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
    const validAreas = ['Kitchen', 'Bathroom', 'Living Room', 'Bedroom', 'Exterior'];
    if (!validAreas.includes(renovationData.primaryArea)) {
      return { isValid: false, error: "Invalid renovation area" };
    }
    return { isValid: true, error: null };
  }
}

module.exports = RenovationCostService;