// ==================== RENOVATION COST CONSTANTS ====================
// Data sources:
// - Remodeling Magazine 2025 Cost vs Value Report (Houston/South region)
// - HomeAdvisor True Cost Guide 2025
// - National Association of Realtors 2025 Remodeling Impact Report
// - RSMeans Construction Cost Data 2025

// ==================== STATE-LEVEL COST MULTIPLIERS ====================
// Multiplier relative to national average (1.0 = national average)
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
    'Kingwood': 0.85,
    'Miami': 1.10,
    'Atlanta': 0.88,
    'Chicago': 1.20,
    'Portland': 1.15,
  }
};

// ==================== BUDGET TIER BASE COSTS ====================
// National average cost per sq ft for each budget tier
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
  'Kitchen': {
    minSqFt: 150,
    percentageOfHouse: 0.1
  },
  'Bathroom': {
    minSqFt: 80,
    percentageOfHouse: 0.05
  },
  'Living Room': {
    minSqFt: 250,
    percentageOfHouse: 0.20
  },
  'Bedroom': {
    minSqFt: 200,
    percentageOfHouse: 0.15
  },
  'Exterior': {
    minSqFt: 500,
    percentageOfHouse: 0.30
  },
  'Full Property': {
    minSqFt: 0,
    percentageOfHouse: 1.0
  }
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
// Source: Remodeling Magazine 2025 Cost vs Value Report — South Region (Houston, TX)
// Each item has:
//   - nationalAvgCost: baseline national average in USD
//   - houstonMultiplier: Houston-specific adjustment (labor + materials)
//   - budgetTierMultipliers: adjustment per budget tier
//   - roiRecovery: % of cost typically recovered in resale value (NAR 2025)
//   - description: shown to investor in cost breakdown
//   - costBasis: explains how cost is calculated (shown in CostDisplay)

const EXTERIOR_RENOVATION_ITEMS = {

  // Paint — most common exterior project
  // Source: HomeAdvisor 2025: national avg $3,040 for 2,500 sqft home
  // Houston labor rates ~15% below national avg
  'Repaint only': {
    nationalAvgCost: 3800,
    houstonMultiplier: 0.87,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.70,  // Basic 1 coat, standard paint
      'Mid-Range': 1.00,        // 2 coats, quality paint, prep work
      'Premium': 1.45,          // Premium paint, full prep, trim included
      'Luxury': 1.90            // Designer colors, multi-coat, all surfaces
    },
    roiRecovery: 55,
    description: 'Full exterior repaint including walls, trim, shutters, and front door',
    costBasis: 'Based on exterior surface area (~2x interior sq ft) at $1.50-$4.00/sq ft labor + materials'
  },

  // Siding replacement
  // Source: Remodeling Magazine 2025 Cost vs Value — fiber cement siding, South region
  // National avg: $19,915 | Houston avg: $16,280 (81.7% of national)
  'Update roof/siding': {
    nationalAvgCost: 19915,
    houstonMultiplier: 0.82,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.55,  // Vinyl siding, basic installation
      'Mid-Range': 1.00,        // Fiber cement (James Hardie), standard install
      'Premium': 1.55,          // Engineered wood or premium fiber cement
      'Luxury': 2.20            // Full brick/stone veneer or premium composite
    },
    roiRecovery: 76,
    description: 'Siding replacement with new material, installation, and trim work',
    costBasis: 'Based on exterior wall area at $7-$25/sq ft depending on material (vinyl to fiber cement to stone)'
  },

  // New windows — exterior upgrade
  // Source: Remodeling Magazine 2025 — vinyl window replacement, South region
  // National avg: $20,091 for 10 windows | Houston avg: $17,200
  'New windows': {
    nationalAvgCost: 20091,
    houstonMultiplier: 0.86,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.45,  // Basic vinyl, 4-6 windows
      'Mid-Range': 1.00,        // Mid-grade vinyl/fiberglass, 8-10 windows
      'Premium': 1.60,          // Premium fiberglass/wood-clad, 10-12 windows
      'Luxury': 2.30            // Custom wood or aluminum-clad, full replacement
    },
    roiRecovery: 69,
    description: 'Window replacement with new frames, installation, and exterior trim',
    costBasis: 'Based on $600-$1,200 per window (vinyl) to $1,500-$3,500 per window (premium) including installation'
  },

  // Front entrance upgrade
  // Source: Remodeling Magazine 2025 — steel door replacement, South region
  // National avg: $2,355 | Houston avg: $2,050
  'New entrance': {
    nationalAvgCost: 2355,
    houstonMultiplier: 0.87,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.60,  // Standard steel door with basic hardware
      'Mid-Range': 1.00,        // Fiberglass door, sidelights, quality hardware
      'Premium': 2.20,          // Custom wood door, sidelights, transom, smart lock
      'Luxury': 4.50            // Grand double door, custom millwork, full surround
    },
    roiRecovery: 188,
    description: 'New front entrance door with hardware, installation, and surround trim',
    costBasis: 'Steel door: $1,200-$2,500 | Fiberglass: $2,500-$5,000 | Custom wood: $5,000-$15,000 installed'
  },

  // Landscaping
  // Source: HomeAdvisor 2025 — full landscaping overhaul
  // National avg: $3,000-$15,000 | Houston: slightly below avg due to climate
  'Landscaping': {
    nationalAvgCost: 7500,
    houstonMultiplier: 0.83,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.40,  // Lawn cleanup, basic mulch, trimming
      'Mid-Range': 1.00,        // New sod, shrubs, flower beds, mulch, edging
      'Premium': 1.80,          // Full redesign, trees, irrigation system, lighting
      'Luxury': 3.20            // Complete landscape architecture, water features, custom hardscape
    },
    roiRecovery: 100,
    description: 'Full landscaping including lawn, planting beds, shrubs, and curb appeal improvements',
    costBasis: 'Sod: $0.35-$0.85/sq ft | Shrubs: $25-$150 each | Irrigation: $2,500-$4,500 | Design fee: $500-$2,000'
  },

  // Driveway
  // Source: HomeAdvisor 2025 — driveway replacement
  // National avg: $4,500 | Houston avg: $3,800 (concrete)
  'Driveway': {
    nationalAvgCost: 4500,
    houstonMultiplier: 0.84,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.55,  // Asphalt reseal or basic repair
      'Mid-Range': 1.00,        // New concrete driveway, standard finish
      'Premium': 1.65,          // Stamped concrete or exposed aggregate
      'Luxury': 2.80            // Paver driveway (brick or stone), custom design
    },
    roiRecovery: 70,
    description: 'Driveway replacement or upgrade including material, labor, and edging',
    costBasis: 'Asphalt: $3-$7/sq ft | Concrete: $6-$12/sq ft | Pavers: $15-$30/sq ft installed'
  },

  // All exterior — comprehensive
  'All': {
    nationalAvgCost: 45000,
    houstonMultiplier: 0.85,
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

  // Front entrance focus area (maps to focus areas field)
  'Front entrance': {
    nationalAvgCost: 6500,
    houstonMultiplier: 0.87,
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

  // Patio
  'Patio': {
    nationalAvgCost: 9000,
    houstonMultiplier: 0.84,
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
// Source: NAR 2025 Remodeling Impact Report + Remodeling Magazine Cost vs Value 2025
// These are the nationally published ROI recovery percentages for exterior projects
const EXTERIOR_ROI_BY_PROJECT = {
  'Repaint only': {
    recovery: 55,
    insight: 'Fresh paint is the highest-visual-impact, lowest-cost exterior upgrade'
  },
  'Update roof/siding': {
    recovery: 76,
    insight: 'Fiber cement siding consistently ranks in top 5 for ROI nationwide'
  },
  'New windows': {
    recovery: 69,
    insight: 'Energy-efficient windows add value and reduce utility costs for buyers'
  },
  'New entrance': {
    recovery: 188,
    insight: 'Front door replacement has the highest ROI of any exterior project per Remodeling Magazine 2025'
  },
  'Landscaping': {
    recovery: 100,
    insight: 'Professional landscaping recovers 100% of cost on average in the Houston market'
  },
  'Driveway': {
    recovery: 70,
    insight: 'Driveway condition is a top factor in buyer first impressions'
  },
  'All': {
    recovery: 72,
    insight: 'Comprehensive exterior renovation averages 72% cost recovery in the South region'
  },
  'Front entrance': {
    recovery: 150,
    insight: 'Entrance upgrades deliver outsized ROI relative to cost'
  },
  'Patio': {
    recovery: 80,
    insight: 'Outdoor living spaces are highly valued in the Houston climate'
  }
};

// ==================== REPLICATE MODEL CONFIG ====================
const REPLICATE_CONFIG = {
  model: 'adirik/interior-design:76604baddc85b1b4616e1c6475eca080da339c8875bd4996705440484a6eac38',
  promptStrength: 0.3,   // Tested value — preserves original structure while applying changes
  numInferenceSteps: 50,
  guidanceScale: 7.5
};

// ==================== COST CONTEXT MESSAGES ====================
const getCostContextMessage = (state, multiplier) => {
  if (multiplier > 1.3) {
    return `${state} has above-average renovation costs. Your renovation budget accounts for this premium market.`;
  } else if (multiplier < 0.8) {
    return `${state} has below-average renovation costs. Your budget gives you exceptional value compared to national averages.`;
  } else {
    return `${state} has average renovation costs relative to the national market.`;
  }
};

// ==================== ROI MESSAGE ====================
const getRoiMessage = (recoveryPercentage) => {
  return `Typical renovations recover ~${recoveryPercentage}% of costs in home value increase.`;
};

module.exports = {
  RENOVATION_COST_MULTIPLIERS,
  RENOVATION_COST_TIERS,
  AREA_COST_MULTIPLIERS,
  AREA_SIZE_ESTIMATES,
  ROI_RECOVERY_RATES,
  CONTINGENCY_PERCENTAGE,
  EXTERIOR_RENOVATION_ITEMS,
  EXTERIOR_ROI_BY_PROJECT,
  REPLICATE_CONFIG,
  getCostContextMessage,
  getRoiMessage
};