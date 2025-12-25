// ==================== RENOVATION COST CONSTANTS ====================
// This file contains all static data for renovation cost calculations
// Data is based on national averages and regional market research

// ==================== STATE-LEVEL COST MULTIPLIERS ====================
// Multiplier relative to national average (1.0 = national average)
// Updated: January 2025
export const RENOVATION_COST_MULTIPLIERS = {
  state: {
    'California': 1.45,
    'New York': 1.40,
    'Massachusetts': 1.35,
    'Connecticut': 1.32,
    'New Jersey': 1.30,
    'Illinois': 1.15,
    'Washington': 1.25,
    'Oregon': 1.20,
    'Colorado': 1.18,
    'Utah': 1.12,
    'Texas': 0.85,
    'Arizona': 0.90,
    'Florida': 0.88,
    'Georgia': 0.80,
    'North Carolina': 0.78,
    'South Carolina': 0.75,
    'Tennessee': 0.72,
    'Oklahoma': 0.70,
    'Kansas': 0.68,
    'Nebraska': 0.65,
    'Iowa': 0.62,
    'Missouri': 0.70,
    'Arkansas': 0.65,
    'Mississippi': 0.60,
    'Alabama': 0.62,
    'Louisiana': 0.75,
    'Montana': 0.80,
    'Idaho': 0.78,
    'Wyoming': 0.75,
    'South Dakota': 0.60,
    'North Dakota': 0.65,
    'Maine': 1.08,
    'Vermont': 1.10,
    'New Hampshire': 1.12,
    'Rhode Island': 1.25,
    'Delaware': 1.20,
    'Pennsylvania': 1.08,
    'Ohio': 0.85,
    'Michigan': 0.88,
    'Indiana': 0.80,
    'Kentucky': 0.70,
    'West Virginia': 0.65,
    'Virginia': 1.05,
    'Maryland': 1.15,
    'DC': 1.50,
    'Hawaii': 1.80,
    'Alaska': 1.60,
    'Nevada': 0.95,
    'New Mexico': 0.72,
    'Minnesota': 1.00,
    'Wisconsin': 0.90,
  },

  // City-level adjustments (override state if available)
  city: {
    'San Francisco': 1.65,
    'Los Angeles': 1.55,
    'San Diego': 1.50,
    'New York': 1.50,
    'Boston': 1.40,
    'Seattle': 1.30,
    'Denver': 1.22,
    'Austin': 1.05,
    'Dallas': 0.90,
    'Houston': 0.85,
    'Miami': 1.10,
    'Atlanta': 0.88,
    'Chicago': 1.20,
    'Portland': 1.15,
  }
};

// ==================== BUDGET TIER BASE COSTS ====================
// National average cost per sq ft for each budget tier
export const RENOVATION_COST_TIERS = {
  'Budget-Friendly': {
    basePerSqFt: 50,
    priceRange: '$5,000 - $15,000',
    description: 'Basic updates, standard materials'
  },
  'Mid-Range': {
    basePerSqFt: 150,
    priceRange: '$15,000 - $35,000',
    description: 'Quality upgrades with modern finishes'
  },
  'Premium': {
    basePerSqFt: 300,
    priceRange: '$35,000 - $75,000',
    description: 'Luxury finishes with designer elements'
  },
  'Luxury': {
    basePerSqFt: 500,
    priceRange: '$75,000+',
    description: 'Full luxury renovation with bespoke elements'
  }
};

// ==================== AREA-SPECIFIC COST MULTIPLIERS ====================
// Cost multipliers for different renovation areas
// Kitchen is most expensive, bedrooms are least expensive
export const AREA_COST_MULTIPLIERS = {
  'Kitchen': 1.5,
  'Bathroom': 1.3,
  'Living Room': 0.9,
  'Bedroom': 0.8,
  'Exterior': 1.2,
  'Full Property': 1.0
};

// ==================== AREA-SPECIFIC SQUARE FOOTAGE ESTIMATES ====================
// Used to estimate area size when user doesn't provide dimensions
// Minimum size or percentage of total house
export const AREA_SIZE_ESTIMATES = {
  'Kitchen': {
    minSqFt: 150,
    percentageOfHouse: 0.1  // 10% of total house
  },
  'Bathroom': {
    minSqFt: 80,
    percentageOfHouse: 0.05  // 5% of total house
  },
  'Living Room': {
    minSqFt: 250,
    percentageOfHouse: 0.20  // 20% of total house
  },
  'Bedroom': {
    minSqFt: 200,
    percentageOfHouse: 0.15  // 15% of total house
  },
  'Exterior': {
    minSqFt: 500,
    percentageOfHouse: 0.30  // 30% of total house (lot size approximation)
  },
  'Full Property': {
    minSqFt: 0,
    percentageOfHouse: 1.0   // 100% of total house
  }
};

// ==================== ROI RECOVERY RATES ====================
// Typical percentage of renovation cost recovered in home value increase by tier
export const ROI_RECOVERY_RATES = {
  'Budget-Friendly': 0.70,  // 70% recovery
  'Mid-Range': 0.65,        // 65% recovery
  'Premium': 0.60,          // 60% recovery
  'Luxury': 0.50            // 50% recovery (luxury is hardest to recover)
};

// ==================== CONTINGENCY BUFFER ====================
// Percentage to add for contingency (unexpected costs)
export const CONTINGENCY_PERCENTAGE = 0.12; // 12% buffer

// ==================== GEMINI IMAGE QUALITY SETTINGS ====================
// Different output quality settings for Gemini
export const IMAGE_QUALITY_SETTINGS = {
  'Standard': {
    outputTokens: 1024,
    description: 'Standard quality - good for quick previews'
  },
  'High': {
    outputTokens: 2048,
    description: 'High quality - detailed and realistic'
  },
  'Ultra': {
    outputTokens: 4096,
    description: 'Ultra quality - maximum detail and realism'
  }
};

// ==================== COST CONTEXT MESSAGES ====================
// Messages to show users based on their location's cost multiplier
export const getCostContextMessage = (state, multiplier) => {
  if (multiplier > 1.3) {
    return `${state} has above-average renovation costs. Your renovation budget accounts for this premium market.`;
  } else if (multiplier < 0.8) {
    return `${state} has below-average renovation costs. Your budget gives you exceptional value.`;
  } else {
    return `${state} has average renovation costs relative to the national market.`;
  }
};

// ==================== ROI MESSAGE ====================
export const getRoiMessage = (recoveryPercentage) => {
  return `Typical renovations recover ~${recoveryPercentage}% of costs in home value increase.`;
};

// ==================== EXPORTS FOR BACKWARD COMPATIBILITY ====================
export default {
  RENOVATION_COST_MULTIPLIERS,
  RENOVATION_COST_TIERS,
  AREA_COST_MULTIPLIERS,
  AREA_SIZE_ESTIMATES,
  ROI_RECOVERY_RATES,
  CONTINGENCY_PERCENTAGE,
  IMAGE_QUALITY_SETTINGS,
  getCostContextMessage,
  getRoiMessage
};
