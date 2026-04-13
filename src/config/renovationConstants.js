// ==================== US CENSUS REGION MAPPING ====================
const STATE_TO_REGION = {
  'Maine': 'Northeast', 'New Hampshire': 'Northeast', 'Vermont': 'Northeast',
  'Massachusetts': 'Northeast', 'Rhode Island': 'Northeast', 'Connecticut': 'Northeast',
  'New York': 'Northeast', 'New Jersey': 'Northeast', 'Pennsylvania': 'Northeast',
  'Delaware': 'Northeast', 'Maryland': 'Northeast', 'DC': 'Northeast',

  'Ohio': 'Midwest', 'Michigan': 'Midwest', 'Indiana': 'Midwest', 'Illinois': 'Midwest',
  'Wisconsin': 'Midwest', 'Minnesota': 'Midwest', 'Iowa': 'Midwest', 'Missouri': 'Midwest',
  'North Dakota': 'Midwest', 'South Dakota': 'Midwest', 'Nebraska': 'Midwest',
  'Kansas': 'Midwest',

  'Virginia': 'South', 'West Virginia': 'South', 'Kentucky': 'South', 'Tennessee': 'South',
  'North Carolina': 'South', 'South Carolina': 'South', 'Georgia': 'South',
  'Florida': 'South', 'Alabama': 'South', 'Mississippi': 'South', 'Arkansas': 'South',
  'Louisiana': 'South', 'Texas': 'South', 'Oklahoma': 'South',

  'Montana': 'West', 'Idaho': 'West', 'Wyoming': 'West', 'Colorado': 'West',
  'New Mexico': 'West', 'Arizona': 'West', 'Utah': 'West', 'Nevada': 'West',
  'California': 'West', 'Oregon': 'West', 'Washington': 'West',
  'Alaska': 'West', 'Hawaii': 'West'
};

// ==================== STATE-LEVEL COST MULTIPLIERS ====================
const RENOVATION_COST_MULTIPLIERS = {
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
  city: {
    'San Francisco': 1.65,
    'Los Angeles': 1.55,
    'San Diego': 1.50,
    'Oakland': 1.50,
    'New York': 1.50,
    'Boston': 1.40,
    'Seattle': 1.30,
    'Denver': 1.22,
    'Austin': 1.05,
    'Dallas': 0.90,
    'Houston': 0.85,
    'Kingwood': 0.85,
    'Miami': 1.10,
    'Atlanta': 0.88,
    'Chicago': 1.20,
    'Portland': 1.15,
  }
};

// ==================== BUDGET TIER BASE COSTS ====================
const RENOVATION_COST_TIERS = {
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
const AREA_COST_MULTIPLIERS = {
  'Kitchen': 1.5,
  'Bathroom': 1.3,
  'Living Room': 0.9,
  'Bedroom': 0.8,
  'Exterior': 1.2,
  'Full Property': 1.0
};

// ==================== AREA-SPECIFIC SQUARE FOOTAGE ESTIMATES ====================
const AREA_SIZE_ESTIMATES = {
  'Kitchen': { minSqFt: 150, percentageOfHouse: 0.1 },
  'Bathroom': { minSqFt: 80, percentageOfHouse: 0.05 },
  'Living Room': { minSqFt: 250, percentageOfHouse: 0.20 },
  'Bedroom': { minSqFt: 200, percentageOfHouse: 0.15 },
  'Exterior': { minSqFt: 500, percentageOfHouse: 0.30 },
  'Full Property': { minSqFt: 0, percentageOfHouse: 1.0 }
};

// ==================== ROI RECOVERY RATES ====================
const ROI_RECOVERY_RATES = {
  'Budget-Friendly': 0.70,
  'Mid-Range': 0.65,
  'Premium': 0.60,
  'Luxury': 0.50
};

// ==================== CONTINGENCY BUFFER ====================
const CONTINGENCY_PERCENTAGE = 0.12;

// ==================== EXTERIOR RENOVATION ITEMS ====================
// nationalAvgCost = true national average baseline (no regional adjustment baked in)
// regionalMultiplier removed — location adjustment applied dynamically via city/state multiplier table

const EXTERIOR_RENOVATION_ITEMS = {
  'Repaint only': {
    nationalAvgCost: 3800,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.70,
      'Mid-Range': 1.00,
      'Premium': 1.45,
      'Luxury': 1.90
    },
    roiRecovery: 55,
    description: 'Full exterior repaint including walls, trim, shutters, and front door',
    costBasis: 'Based on exterior surface area (~2x interior sq ft) at $1.50-$4.00/sq ft labor + materials'
  },
  'Update roof/siding': {
    nationalAvgCost: 19915,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.55,
      'Mid-Range': 1.00,
      'Premium': 1.55,
      'Luxury': 2.20
    },
    roiRecovery: 76,
    description: 'Siding replacement with new material, installation, and trim work',
    costBasis: 'Based on exterior wall area at $7-$25/sq ft depending on material (vinyl to fiber cement to stone)'
  },
  'New windows': {
    nationalAvgCost: 20091,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.45,
      'Mid-Range': 1.00,
      'Premium': 1.60,
      'Luxury': 2.30
    },
    roiRecovery: 69,
    description: 'Window replacement with new frames, installation, and exterior trim',
    costBasis: 'Based on $600-$1,200 per window (vinyl) to $1,500-$3,500 per window (premium) including installation'
  },
  'New entrance': {
    nationalAvgCost: 2355,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.60,
      'Mid-Range': 1.00,
      'Premium': 2.20,
      'Luxury': 4.50
    },
    roiRecovery: 188,
    description: 'New front entrance door with hardware, installation, and surround trim',
    costBasis: 'Steel door: $1,200-$2,500 | Fiberglass: $2,500-$5,000 | Custom wood: $5,000-$15,000 installed'
  },
  'Landscaping': {
    nationalAvgCost: 7500,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.40,
      'Mid-Range': 1.00,
      'Premium': 1.80,
      'Luxury': 3.20
    },
    roiRecovery: 100,
    description: 'Full landscaping including lawn, planting beds, shrubs, and curb appeal improvements',
    costBasis: 'Sod: $0.35-$0.85/sq ft | Shrubs: $25-$150 each | Irrigation: $2,500-$4,500 | Design fee: $500-$2,000'
  },
  'Driveway': {
    nationalAvgCost: 4500,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.55,
      'Mid-Range': 1.00,
      'Premium': 1.65,
      'Luxury': 2.80
    },
    roiRecovery: 70,
    description: 'Driveway replacement or upgrade including material, labor, and edging',
    costBasis: 'Asphalt: $3-$7/sq ft | Concrete: $6-$12/sq ft | Pavers: $15-$30/sq ft installed'
  },
  'All': {
    nationalAvgCost: 45000,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.35,
      'Mid-Range': 1.00,
      'Premium': 1.70,
      'Luxury': 2.80
    },
    roiRecovery: 72,
    description: 'Complete exterior renovation including paint, landscaping, entrance, and driveway',
    costBasis: 'Full exterior scope: paint + landscaping + entrance + driveway improvements'
  },
  'Front entrance': {
    nationalAvgCost: 6500,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.50,
      'Mid-Range': 1.00,
      'Premium': 2.00,
      'Luxury': 3.50
    },
    roiRecovery: 150,
    description: 'Front entrance enhancement including door, lighting, pathway, and porch area',
    costBasis: 'Door + surround + pathway + lighting: $2,000-$25,000 depending on scope'
  },
  'Patio': {
    nationalAvgCost: 9000,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.45,
      'Mid-Range': 1.00,
      'Premium': 1.80,
      'Luxury': 3.00
    },
    roiRecovery: 80,
    description: 'Patio installation or renovation including surface, edging, and basic outdoor features',
    costBasis: 'Concrete patio: $6-$12/sq ft | Pavers: $14-$20/sq ft | Natural stone: $20-$35/sq ft'
  }
};

// ==================== EXTERIOR ROI BY PROJECT ====================
const EXTERIOR_ROI_BY_PROJECT = {
  'Repaint only': { recovery: 55, insight: 'Fresh paint is the highest-visual-impact, lowest-cost exterior upgrade' },
  'Update roof/siding': { recovery: 76, insight: 'Fiber cement siding consistently ranks in top 5 for ROI nationwide' },
  'New windows': { recovery: 69, insight: 'Energy-efficient windows add value and reduce utility costs for buyers' },
  'New entrance': { recovery: 188, insight: 'Front door replacement has the highest ROI of any exterior project per Remodeling Magazine 2025' },
  'Landscaping': { recovery: 100, insight: 'Professional landscaping recovers 100% of cost on average' },
  'Driveway': { recovery: 70, insight: 'Driveway condition is a top factor in buyer first impressions' },
  'All': { recovery: 72, insight: 'Comprehensive exterior renovation averages 72% cost recovery' },
  'Front entrance': { recovery: 150, insight: 'Entrance upgrades deliver outsized ROI relative to cost' },
  'Patio': { recovery: 80, insight: 'Outdoor living spaces are highly valued in warm climates' }
};

// ==================== REPLICATE MODEL CONFIG ====================
const REPLICATE_CONFIG = {
  model: 'adirik/interior-design:76604baddc85b1b4616e1c6475eca080da339c8875bd4996705440484a6eac38',
  promptStrength: 0.5,  // Increased to ensure damage repair and full transformation
  numInferenceSteps: 50,
  guidanceScale: 7.5
};

// ==================== KITCHEN RENOVATION ITEMS ====================
const KITCHEN_RENOVATION_ITEMS = {
  'Cabinets': {
    nationalAvgCost: 14000,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.45,
      'Mid-Range': 1.00,
      'Premium': 1.85,
      'Luxury': 3.80
    },
    roiRecovery: 67,
    description: 'Cabinet replacement or refacing including hardware, soft-close hinges, and installation',
    costBasis: 'Stock cabinets: $5K-$8K | Semi-custom: $12K-$18K | Custom: $25K-$50K+ installed'
  },
  'Countertops': {
    nationalAvgCost: 5500,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.45,
      'Mid-Range': 1.00,
      'Premium': 2.00,
      'Luxury': 4.00
    },
    roiRecovery: 72,
    description: 'Countertop replacement including material, fabrication, and installation',
    costBasis: 'Laminate: $15-$40/sqft | Quartz: $50-$100/sqft | Marble: $75-$250/sqft installed'
  },
  'Appliances': {
    nationalAvgCost: 8000,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.45,
      'Mid-Range': 1.00,
      'Premium': 1.75,
      'Luxury': 3.25
    },
    roiRecovery: 60,
    description: 'Full appliance package including refrigerator, range, dishwasher, and microwave',
    costBasis: 'Budget: $3K-$5K | Mid-range: $7K-$12K | Premium: $14K-$18K | Luxury: $25K-$30K+'
  },
  'Flooring': {
    nationalAvgCost: 4200,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.50,
      'Mid-Range': 1.00,
      'Premium': 1.70,
      'Luxury': 2.80
    },
    roiRecovery: 72,
    description: 'Kitchen flooring replacement including subfloor prep, material, and installation',
    costBasis: 'LVP: $3-$10/sqft | Ceramic tile: $5-$15/sqft | Hardwood: $6-$12/sqft installed'
  },
  'Lighting': {
    nationalAvgCost: 2200,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.45,
      'Mid-Range': 1.00,
      'Premium': 1.80,
      'Luxury': 3.20
    },
    roiRecovery: 65,
    description: 'Kitchen lighting upgrade including recessed lights, pendants, and undercabinet lighting',
    costBasis: 'Recessed lights: $150-$300 each | Pendants: $200-$800 each | Undercabinet LED: $20-$50/lf'
  }
};

// ==================== BATHROOM RENOVATION ITEMS ====================
const BATHROOM_RENOVATION_ITEMS = {
  'Vanity & Sink': {
    nationalAvgCost: 3500,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.40,
      'Mid-Range': 1.00,
      'Premium': 1.85,
      'Luxury': 3.50
    },
    roiRecovery: 65,
    description: 'Vanity cabinet, countertop, sink, faucet, and mirror replacement',
    costBasis: 'Stock: $200-$600 | Semi-custom: $800-$2K | Custom: $3K-$13K installed'
  },
  'Shower & Tub': {
    nationalAvgCost: 8500,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.55,
      'Mid-Range': 1.00,
      'Premium': 1.90,
      'Luxury': 3.80
    },
    roiRecovery: 68,
    description: 'Shower and tub replacement or renovation including tile, fixtures, and glass enclosure',
    costBasis: 'Prefab insert: $1K-$3K | Tile shower: $8K-$15K | Custom frameless: $15K-$25K installed'
  },
  'Tile & Flooring': {
    nationalAvgCost: 3800,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.45,
      'Mid-Range': 1.00,
      'Premium': 1.80,
      'Luxury': 3.50
    },
    roiRecovery: 62,
    description: 'Bathroom floor and wall tile replacement including waterproofing and installation',
    costBasis: 'Ceramic: $5-$10/sqft | Porcelain: $8-$20/sqft | Marble: $20-$50/sqft installed'
  },
  'Fixtures & Lighting': {
    nationalAvgCost: 2200,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.40,
      'Mid-Range': 1.00,
      'Premium': 1.80,
      'Luxury': 3.50
    },
    roiRecovery: 60,
    description: 'Toilet, faucets, towel bars, lighting fixtures, and ventilation fan replacement',
    costBasis: 'Toilet: $300-$1.5K | Faucets: $150-$800 each | Vanity light: $200-$1.2K installed'
  }
};

// ==================== BEDROOM RENOVATION ITEMS ====================
const BEDROOM_RENOVATION_ITEMS = {
  'Flooring': {
    nationalAvgCost: 4500,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.40,
      'Mid-Range': 1.00,
      'Premium': 1.70,
      'Luxury': 2.80
    },
    roiRecovery: 70,
    description: 'Bedroom flooring replacement including removal, subfloor prep, and installation',
    costBasis: 'Carpet: $2-$8/sqft | LVP: $3-$10/sqft | Hardwood: $6-$12/sqft installed'
  },
  'Paint & Trim': {
    nationalAvgCost: 1800,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.45,
      'Mid-Range': 1.00,
      'Premium': 1.70,
      'Luxury': 3.20
    },
    roiRecovery: 65,
    description: 'Interior painting, crown molding, baseboards, and trim work',
    costBasis: 'Paint only: $300-$800/room | Crown molding: $7-$16/lf | Wainscoting: $10-$30/lf installed'
  },
  'Closet & Storage': {
    nationalAvgCost: 3200,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.35,
      'Mid-Range': 1.00,
      'Premium': 1.80,
      'Luxury': 3.50
    },
    roiRecovery: 60,
    description: 'Closet organization system including shelving, hanging rods, drawers, and lighting',
    costBasis: 'Wire shelving: $200-$600 | Modular: $1K-$3K | Custom built-in: $5K-$12K installed'
  },
  'Lighting': {
    nationalAvgCost: 1500,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.45,
      'Mid-Range': 1.00,
      'Premium': 1.80,
      'Luxury': 3.50
    },
    roiRecovery: 58,
    description: 'Bedroom lighting upgrade including ceiling fixtures, recessed lights, and controls',
    costBasis: 'Ceiling fan: $150-$600 | Recessed light: $150-$300 each | Chandelier: $500-$5K installed'
  }
};

// ==================== LIVING ROOM RENOVATION ITEMS ====================
const LIVING_ROOM_RENOVATION_ITEMS = {
  'Flooring': {
    nationalAvgCost: 6000,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.40,
      'Mid-Range': 1.00,
      'Premium': 1.65,
      'Luxury': 2.80
    },
    roiRecovery: 72,
    description: 'Living room flooring replacement including removal, subfloor prep, and installation',
    costBasis: 'Laminate: $3-$8/sqft | LVP: $4-$10/sqft | Hardwood: $6-$12/sqft | Marble: $15-$30/sqft'
  },
  'Paint & Trim': {
    nationalAvgCost: 2500,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.40,
      'Mid-Range': 1.00,
      'Premium': 1.65,
      'Luxury': 3.20
    },
    roiRecovery: 65,
    description: 'Interior painting, crown molding, wainscoting, and trim throughout living room',
    costBasis: 'Paint: $400-$1K/room | Crown molding: $7-$16/lf | Built-in shelving: $150-$500/lf'
  },
  'Lighting': {
    nationalAvgCost: 3000,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.40,
      'Mid-Range': 1.00,
      'Premium': 1.70,
      'Luxury': 3.50
    },
    roiRecovery: 60,
    description: 'Living room lighting upgrade including recessed lights, fixtures, and controls',
    costBasis: 'Recessed: $150-$300 each | Chandelier: $500-$5K | Smart dimmer system: $500-$2K'
  },
  'Fireplace Update': {
    nationalAvgCost: 5500,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.30,
      'Mid-Range': 1.00,
      'Premium': 1.80,
      'Luxury': 3.50
    },
    roiRecovery: 65,
    description: 'Fireplace update including surround, mantel, and gas conversion if applicable',
    costBasis: 'Mantel only: $500-$2K | Gas conversion: $3.5K-$7K | Custom stone surround: $8K-$20K'
  }
};

// ==================== ROI BY TIER ====================
const KITCHEN_ROI_BY_TIER = {
  'Budget-Friendly': { recovery: 80, insight: 'Minor kitchen remodels return ~80% — top interior ROI per Remodeling Magazine 2025' },
  'Mid-Range': { recovery: 72, insight: 'Mid-range kitchen remodels average 70-80% ROI' },
  'Premium': { recovery: 62, insight: 'Premium kitchen remodels recover ~60-65%' },
  'Luxury': { recovery: 45, insight: 'Luxury kitchen remodels ($100K+) recover ~38-50%' }
};

const BATHROOM_ROI_BY_TIER = {
  'Budget-Friendly': { recovery: 74, insight: 'Budget bathroom refreshes return 70-80%' },
  'Mid-Range': { recovery: 68, insight: 'Mid-range bathroom remodels return ~65-70%' },
  'Premium': { recovery: 58, insight: 'Premium bathroom remodels recover ~55-65%' },
  'Luxury': { recovery: 48, insight: 'Luxury bathroom remodels recover ~45-55%' }
};

const BEDROOM_ROI_BY_TIER = {
  'Budget-Friendly': { recovery: 65, insight: 'Basic bedroom updates return ~60-70%' },
  'Mid-Range': { recovery: 60, insight: 'Mid-range bedroom remodels return ~58-65%' },
  'Premium': { recovery: 55, insight: 'Premium bedroom remodels recover ~50-60%' },
  'Luxury': { recovery: 45, insight: 'Luxury bedroom remodels recover ~40-50%' }
};

const LIVING_ROOM_ROI_BY_TIER = {
  'Budget-Friendly': { recovery: 65, insight: 'Living room cosmetic updates return ~60-70%' },
  'Mid-Range': { recovery: 62, insight: 'Mid-range living room remodels return ~60-65%' },
  'Premium': { recovery: 58, insight: 'Premium living room remodels recover ~55-60%' },
  'Luxury': { recovery: 48, insight: 'Luxury living room remodels recover ~45-50%' }
};

// ==================== HELPER FUNCTIONS ====================

const getRegionForState = (state) => {
  return STATE_TO_REGION[state] || 'National';
};

const getDataSource = (state) => {
  const region = getRegionForState(state);
  return `Remodeling Magazine 2025 Cost vs Value Report — ${region} Region | HomeAdvisor True Cost Guide 2025 | NAR 2025 Remodeling Impact Report`;
};

const getCostContextMessage = (state, multiplier) => {
  if (multiplier > 1.3) {
    return `${state} has above-average renovation costs. Your renovation budget accounts for this premium market.`;
  } else if (multiplier < 0.8) {
    return `${state} has below-average renovation costs. Your budget gives you exceptional value compared to national averages.`;
  } else {
    return `${state} has average renovation costs relative to the national market.`;
  }
};

const getRoiMessage = (recoveryPercentage) => {
  return `Typical renovations recover ~${recoveryPercentage}% of costs in home value increase.`;
};

module.exports = {
  STATE_TO_REGION,
  RENOVATION_COST_MULTIPLIERS,
  RENOVATION_COST_TIERS,
  AREA_COST_MULTIPLIERS,
  AREA_SIZE_ESTIMATES,
  ROI_RECOVERY_RATES,
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
  REPLICATE_CONFIG,
  getRegionForState,
  getDataSource,
  getCostContextMessage,
  getRoiMessage
};