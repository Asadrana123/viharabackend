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
  getCostContextMessage,
  getDataSource,
  getRegionForState
} = require("../config/renovationConstants");

const GeminiRenovationService = require("./geminiRenovationService");

class RenovationCostService {

  /**
   * Main entry point — tries Gemini first, falls back to constants
   */
  static async calculateRenovationCost(propertyData, renovationData) {
    try {
      // Attempt Gemini real-time fetch
      const geminiResult = await GeminiRenovationService.fetchRenovationCosts(
        propertyData,
        renovationData
      );

      if (geminiResult) {
        return this.buildCostAnalysisFromGemini(geminiResult, propertyData, renovationData);
      }

      // Fallback to constants
      console.warn("RenovationCostService: Gemini unavailable, falling back to constants");
      return this.calculateFromConstants(propertyData, renovationData);
    } catch (error) {
      console.error("RenovationCostService.calculateRenovationCost error:", error);
      return this.calculateFromConstants(propertyData, renovationData);
    }
  }

  /**
   * Build cost analysis from Gemini response
   */
  static buildCostAnalysisFromGemini(geminiResult, propertyData, renovationData) {
    const { state, city } = propertyData;
    const { primaryArea, budgetTier } = renovationData;

    const lineItems = geminiResult.lineItems.map(item => ({
      item: item.item,
      description: item.description,
      costBasis: item.costBasis,
      cost: Math.round(item.cost),
      roiRecovery: item.roiRecovery,
      formula: {
        source: 'gemini',
        regionalFactor: geminiResult.regionalFactor
      }
    }));

    const subtotal = lineItems.reduce((sum, item) => sum + item.cost, 0);
    const contingencyAmount = Math.round(subtotal * CONTINGENCY_PERCENTAGE);
    const finalCost = subtotal + contingencyAmount;

    const roiData = this.getRoiData(primaryArea, budgetTier);
    const estimatedValueIncrease = Math.round(finalCost * (roiData.recovery / 100));

    return {
      finalCost: Math.round(finalCost),
      costRange: {
        min: Math.round(finalCost * 0.85),
        max: Math.round(finalCost * 1.15)
      },
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
        region: geminiResult.region || getRegionForState(state),
        regionalFactor: geminiResult.regionalFactor,
        message: getCostContextMessage(state, geminiResult.regionalFactor || 1.0),
        dataSource: geminiResult.dataSource,
        source: 'gemini'
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
   * Fallback — calculate from constants (no Houston references, correct region label)
   */
  static calculateFromConstants(propertyData, renovationData) {
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
  }

  /**
   * Fallback exterior cost calculation
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

    const locationMultiplier = this.getLocationMultiplier(state, city);
    const lineItems = this.buildExteriorLineItems(primaryWork, focusArea, budgetTier, locationMultiplier, squareFootage, lotSize);

    return this.assembleResult(lineItems, propertyData, renovationData, primaryWork, EXTERIOR_ROI_BY_PROJECT[primaryWork] || EXTERIOR_ROI_BY_PROJECT['Repaint only'], locationMultiplier);
  }

  /**
   * Fallback interior cost calculation
   */
  static calculateInteriorCost(propertyData, renovationData, renovationItems, roiByTier) {
    const { state, city } = propertyData;
    const { primaryArea, budgetTier } = renovationData;

    const locationMultiplier = this.getLocationMultiplier(state, city);
    const lineItems = this.buildInteriorLineItems(renovationItems, budgetTier, locationMultiplier);
    const roiData = roiByTier[budgetTier] || roiByTier['Mid-Range'];

    return this.assembleResult(lineItems, propertyData, renovationData, primaryArea, roiData, locationMultiplier);
  }

  /**
   * Shared result assembly for fallback path
   */
  static assembleResult(lineItems, propertyData, renovationData, primaryWork, roiData, locationMultiplier) {
    const { state, city } = propertyData;
    const { primaryArea, budgetTier } = renovationData;

    const subtotal = lineItems.reduce((sum, item) => sum + item.cost, 0);
    const contingencyAmount = Math.round(subtotal * CONTINGENCY_PERCENTAGE);
    const finalCost = subtotal + contingencyAmount;
    const estimatedValueIncrease = Math.round(finalCost * (roiData.recovery / 100));

    return {
      finalCost: Math.round(finalCost),
      costRange: {
        min: Math.round(finalCost * 0.85),
        max: Math.round(finalCost * 1.15)
      },
      lineItems,
      contingency: {
        percentage: Math.round(CONTINGENCY_PERCENTAGE * 100),
        amount: contingencyAmount,
        reason: 'Standard 12% contingency buffer for unexpected costs, permit fees, and material overruns'
      },
      breakdown: {
        primaryWork,
        tier: budgetTier,
        location: `${city}, ${state}`,
        subtotal: Math.round(subtotal)
      },
      marketContext: {
        state,
        city,
        region: getRegionForState(state),
        regionalFactor: locationMultiplier,
        message: getCostContextMessage(state, locationMultiplier),
        dataSource: getDataSource(state),
        source: 'constants'
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
   * Build interior line items — applies location multiplier only (no regional base baked in)
   */
  static buildInteriorLineItems(renovationItems, budgetTier, locationMultiplier) {
    return Object.entries(renovationItems).map(([itemKey, itemData]) => {
      const tierMultiplier = itemData.budgetTierMultipliers[budgetTier] || 1.0;
      const rawCost = itemData.nationalAvgCost * tierMultiplier * locationMultiplier;

      return {
        item: itemKey,
        description: itemData.description,
        costBasis: itemData.costBasis,
        cost: Math.round(rawCost),
        roiRecovery: itemData.roiRecovery,
        formula: {
          nationalAvgCost: itemData.nationalAvgCost,
          tierMultiplier,
          locationMultiplier,
          source: 'constants'
        }
      };
    });
  }

  /**
   * Build exterior line items
   */
  static buildExteriorLineItems(primaryWork, focusArea, budgetTier, locationMultiplier, squareFootage, lotSize) {
    const lineItems = [];
    const addedItems = new Set();

    const addItem = (itemKey) => {
      if (addedItems.has(itemKey)) return;
      const itemData = EXTERIOR_RENOVATION_ITEMS[itemKey];
      if (!itemData) return;

      const tierMultiplier = itemData.budgetTierMultipliers[budgetTier] || 1.0;
      let rawCost = itemData.nationalAvgCost * tierMultiplier * locationMultiplier;

      if (itemKey === 'Landscaping' && lotSize) {
        rawCost *= Math.min(Math.max(lotSize / 0.25, 0.5), 3.0);
      }
      if ((itemKey === 'Update roof/siding' || itemKey === 'Repaint only') && squareFootage) {
        rawCost *= Math.min(Math.max(squareFootage / 2500, 0.6), 2.5);
      }

      lineItems.push({
        item: itemKey,
        description: itemData.description,
        costBasis: itemData.costBasis,
        cost: Math.round(rawCost),
        roiRecovery: itemData.roiRecovery,
        formula: {
          nationalAvgCost: itemData.nationalAvgCost,
          tierMultiplier,
          locationMultiplier,
          source: 'constants'
        }
      });
      addedItems.add(itemKey);
    };

    addItem(primaryWork);
    if (focusArea !== primaryWork) addItem(focusArea);
    if (primaryWork !== 'All') {
      if (primaryWork !== 'Landscaping' && focusArea !== 'Landscaping') addItem('Landscaping');
    }

    return lineItems;
  }

  /**
   * Get location multiplier — city takes priority over state
   */
  static getLocationMultiplier(state, city) {
    const cityMultiplier = RENOVATION_COST_MULTIPLIERS.city[city];
    if (cityMultiplier) return cityMultiplier;
    return RENOVATION_COST_MULTIPLIERS.state[state] || 1.0;
  }

  /**
   * Get ROI data for area + tier
   */
  static getRoiData(primaryArea, budgetTier) {
    const roiMap = {
      'Kitchen': KITCHEN_ROI_BY_TIER,
      'Bathroom': BATHROOM_ROI_BY_TIER,
      'Bedroom': BEDROOM_ROI_BY_TIER,
      'Living Room': LIVING_ROOM_ROI_BY_TIER
    };
    const roiByTier = roiMap[primaryArea];
    if (roiByTier) return roiByTier[budgetTier] || roiByTier['Mid-Range'];
    return { recovery: 65, insight: 'Typical renovation recovers ~65% of cost in home value' };
  }

  /**
   * Validate inputs
   */
  static validateInputs(propertyData, renovationData) {
    if (!propertyData.state) return { isValid: false, error: "State is required" };
    if (!propertyData.squareFootage || propertyData.squareFootage <= 0) return { isValid: false, error: "Valid square footage is required" };
    if (!renovationData.budgetTier) return { isValid: false, error: "Budget tier is required" };
    if (!renovationData.primaryArea) return { isValid: false, error: "Primary area is required" };
    if (!RENOVATION_COST_TIERS[renovationData.budgetTier]) return { isValid: false, error: "Invalid budget tier" };
    const validAreas = ['Kitchen', 'Bathroom', 'Living Room', 'Bedroom', 'Exterior'];
    if (!validAreas.includes(renovationData.primaryArea)) return { isValid: false, error: "Invalid renovation area" };
    return { isValid: true, error: null };
  }
}

module.exports = RenovationCostService;
