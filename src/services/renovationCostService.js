const {
  RENOVATION_COST_MULTIPLIERS,
  RENOVATION_COST_TIERS,
  CONTINGENCY_PERCENTAGE,
  EXTERIOR_RENOVATION_ITEMS,
  EXTERIOR_ROI_BY_PROJECT,
  KITCHEN_RENOVATION_ITEMS,
  BATHROOM_RENOVATION_ITEMS,
  BEDROOM_RENOVATION_ITEMS,
  LIVING_ROOM_RENOVATION_ITEMS,
  KITCHEN_ROI_BY_TIER,
  BATHROOM_ROI_BY_TIER,
  BEDROOM_ROI_BY_TIER,
  LIVING_ROOM_ROI_BY_TIER,
  getCostContextMessage
} = require("../config/renovationConstants");

class RenovationCostService {

  /**
   * Main entry point — routes to area-specific calculation
   */
  static calculateRenovationCost(propertyData, renovationData) {
    try {
      const { primaryArea } = renovationData;

      switch (primaryArea) {
        case 'Exterior':
          return this.calculateExteriorCost(propertyData, renovationData);
        case 'Kitchen':
          return this.calculateInteriorCost(propertyData, renovationData, KITCHEN_RENOVATION_ITEMS, KITCHEN_ROI_BY_TIER);
        case 'Bathroom':
          return this.calculateInteriorCost(propertyData, renovationData, BATHROOM_RENOVATION_ITEMS, BATHROOM_ROI_BY_TIER);
        case 'Bedroom':
          return this.calculateInteriorCost(propertyData, renovationData, BEDROOM_RENOVATION_ITEMS, BEDROOM_ROI_BY_TIER);
        case 'Living Room':
          return this.calculateInteriorCost(propertyData, renovationData, LIVING_ROOM_RENOVATION_ITEMS, LIVING_ROOM_ROI_BY_TIER);
        default:
          throw new Error(`Unknown renovation area: ${primaryArea}`);
      }
    } catch (error) {
      console.error("Error calculating renovation cost:", error);
      throw error;
    }
  }

  /**
   * Calculate itemized exterior renovation cost
   */
  static calculateExteriorCost(propertyData, renovationData) {
    const { state, city, squareFootage, lotSize } = propertyData;
    const { budgetTier } = renovationData;

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

    const stateMultiplier = this.getStateMultiplier(state);
    const cityMultiplier = this.getCityMultiplier(city) || stateMultiplier;

    const lineItems = this.buildExteriorLineItems(
      primaryWork,
      focusArea,
      budgetTier,
      cityMultiplier,
      squareFootage,
      lotSize
    );

    const subtotal = lineItems.reduce((sum, item) => sum + item.cost, 0);
    const contingencyAmount = Math.round(subtotal * CONTINGENCY_PERCENTAGE);
    const finalCost = subtotal + contingencyAmount;

    const costRange = {
      min: Math.round(finalCost * 0.85),
      max: Math.round(finalCost * 1.15)
    };

    const roiData = EXTERIOR_ROI_BY_PROJECT[primaryWork] || EXTERIOR_ROI_BY_PROJECT['Repaint only'];
    const estimatedValueIncrease = Math.round(finalCost * (roiData.recovery / 100));
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
   * Calculate itemized interior renovation cost
   * Shared logic for Kitchen, Bathroom, Bedroom, Living Room
   * @param {Object} propertyData
   * @param {Object} renovationData
   * @param {Object} renovationItems  - area-specific constants (e.g. KITCHEN_RENOVATION_ITEMS)
   * @param {Object} roiByTier        - area-specific ROI by budget tier
   */
  static calculateInteriorCost(propertyData, renovationData, renovationItems, roiByTier) {
    const { state, city } = propertyData;
    const { primaryArea, budgetTier } = renovationData;

    const stateMultiplier = this.getStateMultiplier(state);
    const cityMultiplier = this.getCityMultiplier(city) || stateMultiplier;

    // Build itemized line items from all items in the area constants
    const lineItems = this.buildInteriorLineItems(
      renovationItems,
      budgetTier,
      cityMultiplier
    );

    const subtotal = lineItems.reduce((sum, item) => sum + item.cost, 0);
    const contingencyAmount = Math.round(subtotal * CONTINGENCY_PERCENTAGE);
    const finalCost = subtotal + contingencyAmount;

    const costRange = {
      min: Math.round(finalCost * 0.85),
      max: Math.round(finalCost * 1.15)
    };

    const roiData = roiByTier[budgetTier] || roiByTier['Mid-Range'];
    const estimatedValueIncrease = Math.round(finalCost * (roiData.recovery / 100));
    const marketContextMessage = getCostContextMessage(state, stateMultiplier);

    return {
      finalCost: Math.round(finalCost),
      costRange,
      lineItems,
      contingency: {
        percentage: Math.round(CONTINGENCY_PERCENTAGE * 100),
        amount: contingencyAmount,
        reason: 'Standard 12% contingency buffer for unexpected costs, permit fees, and material overruns'
      },
      breakdown: {
        primaryWork: primaryArea,
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
        dataSource: 'Remodeling Magazine 2025 Cost vs Value Report | Tell Projects Houston 2025 | Angi 2025'
      },
      roiEstimate: {
        estimatedValueIncrease,
        recoveryPercentage: roiData.recovery,
        roiMessage: roiData.insight,
        source: 'NAR 2025 Remodeling Impact Report | Remodeling Magazine 2025 Cost vs Value'
      }
    };
  }

  /**
   * Build itemized line items for interior areas
   * Loops all items in the area constants and applies tier + location multipliers
   */
  static buildInteriorLineItems(renovationItems, budgetTier, cityMultiplier) {
    return Object.entries(renovationItems).map(([itemKey, itemData]) => {
      const tierMultiplier = itemData.budgetTierMultipliers[budgetTier] || 1.0;
      const rawCost = itemData.nationalAvgCost * itemData.houstonMultiplier * tierMultiplier * cityMultiplier;

      return {
        item: itemKey,
        description: itemData.description,
        costBasis: itemData.costBasis,
        cost: Math.round(rawCost),
        roiRecovery: itemData.roiRecovery,
        formula: {
          nationalAvgCost: itemData.nationalAvgCost,
          houstonMultiplier: itemData.houstonMultiplier,
          tierMultiplier: tierMultiplier,
          cityMultiplier: cityMultiplier
        }
      };
    });
  }

  /**
   * Build itemized line items for exterior renovation
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

      let adjustedCost = rawCost;

      if (itemKey === 'Landscaping' && lotSize) {
        const lotMultiplier = Math.min(Math.max(lotSize / 0.25, 0.5), 3.0);
        adjustedCost = rawCost * lotMultiplier;
      }

      if ((itemKey === 'Update roof/siding' || itemKey === 'Repaint only') && squareFootage) {
        const sqftMultiplier = Math.min(Math.max(squareFootage / 2500, 0.6), 2.5);
        adjustedCost = rawCost * sqftMultiplier;
      }

      lineItems.push({
        item: itemKey,
        description: itemData.description,
        costBasis: itemData.costBasis,
        cost: Math.round(adjustedCost),
        roiRecovery: itemData.roiRecovery,
        formula: {
          nationalAvgCost: itemData.nationalAvgCost,
          houstonMultiplier: itemData.houstonMultiplier,
          tierMultiplier: itemData.budgetTierMultipliers[budgetTier] || 1.0,
          cityMultiplier: cityMultiplier
        }
      });
      addedItems.add(itemKey);
    };

    addItem(primaryWork);

    if (focusArea !== primaryWork) {
      addItem(focusArea);
    }

    if (primaryWork === 'All') {
      return lineItems;
    }

    if (primaryWork !== 'Landscaping' && focusArea !== 'Landscaping') {
      addItem('Landscaping');
    }

    return lineItems;
  }

  static getStateMultiplier(state) {
    return RENOVATION_COST_MULTIPLIERS.state[state] || 1.0;
  }

  static getCityMultiplier(city) {
    return RENOVATION_COST_MULTIPLIERS.city[city] || null;
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