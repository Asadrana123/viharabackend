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

// ==================== KITCHEN RENOVATION ITEMS ====================
// Sources:
// - Remodeling Magazine 2025 Cost vs Value Report — South Region
// - Tell Projects Houston 2025 Remodeling Cost Guide
// - SCS Contracting Texas Kitchen Remodel Cost Guide 2025
// - HomeAdvisor / Angi 2025 True Cost Guide
// Houston avg kitchen remodel: $27,013 (M&M Roofing 2025)
// Budget: $10,000-$20,000 | Mid-Range: $20,000-$60,000 | Premium: $60,000-$100,000 | Luxury: $100,000+

const KITCHEN_RENOVATION_ITEMS = {

  // Cabinets — largest single cost in kitchen (25-40% of budget)
  // Source: NKBA 2025, Houston Builders 2025
  // Stock: $5K-$8K | Semi-custom: $12K-$18K | Custom: $50K+
  'Cabinets': {
    nationalAvgCost: 14000,
    houstonMultiplier: 0.85,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.45,  // Cabinet refacing/painting: $4K-$8K
      'Mid-Range': 1.00,        // Semi-custom shaker cabinets: $12K-$18K
      'Premium': 1.85,          // Custom cabinets to ceiling: $25K-$30K
      'Luxury': 3.80            // Bespoke custom cabinetry: $50K+
    },
    roiRecovery: 67,
    description: 'Cabinet replacement or refacing including hardware, soft-close hinges, and installation',
    costBasis: 'Stock cabinets: $5K-$8K | Semi-custom: $12K-$18K | Custom: $25K-$50K+ installed'
  },

  // Countertops
  // Source: Houston Builders 2025, Tell Projects 2025
  // Laminate: $2K-$4K | Granite: $5K-$10K | Quartz: $8K-$15K | Marble: $10K-$25K+
  'Countertops': {
    nationalAvgCost: 5500,
    houstonMultiplier: 0.85,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.45,  // Laminate: $2K-$3K
      'Mid-Range': 1.00,        // Quartz: $5K-$8K
      'Premium': 2.00,          // Premium quartz/granite: $10K-$15K
      'Luxury': 4.00            // Marble/quartzite waterfall: $20K-$25K
    },
    roiRecovery: 72,
    description: 'Countertop replacement including material, fabrication, and installation',
    costBasis: 'Laminate: $15-$40/sqft | Quartz: $50-$100/sqft | Marble: $75-$250/sqft installed'
  },

  // Appliances
  // Source: Tell Projects Houston 2025, Houston Builders 2025
  // Budget brands: $3K-$5K | Mid-range: $7K-$12K | High-end (Wolf, Sub-Zero): $15K-$30K+
  'Appliances': {
    nationalAvgCost: 8000,
    houstonMultiplier: 0.88,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.45,  // Basic appliance package: $3K-$5K
      'Mid-Range': 1.00,        // Mid-grade stainless: $7K-$10K
      'Premium': 1.75,          // Premium brands (Bosch, KitchenAid): $14K-$18K
      'Luxury': 3.25            // Professional grade (Wolf, Sub-Zero, Miele): $25K-$30K
    },
    roiRecovery: 60,
    description: 'Full appliance package including refrigerator, range, dishwasher, and microwave',
    costBasis: 'Budget: $3K-$5K | Mid-range: $7K-$12K | Premium: $14K-$18K | Luxury: $25K-$30K+'
  },

  // Flooring
  // Source: Harrison Construction Houston 2025, HomeGuide 2025
  // LVP: $3-$10/sqft | Tile: $5-$15/sqft | Hardwood: $6-$12/sqft
  'Flooring': {
    nationalAvgCost: 4200,
    houstonMultiplier: 0.85,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.50,  // Vinyl/LVP: $2K-$3K for ~200sqft kitchen
      'Mid-Range': 1.00,        // Tile or LVP premium: $3.5K-$5K
      'Premium': 1.70,          // Hardwood or large format tile: $6K-$8K
      'Luxury': 2.80            // Custom hardwood or imported tile: $10K-$15K
    },
    roiRecovery: 72,
    description: 'Kitchen flooring replacement including subfloor prep, material, and installation',
    costBasis: 'LVP: $3-$10/sqft | Ceramic tile: $5-$15/sqft | Hardwood: $6-$12/sqft installed'
  },

  // Lighting & Electrical
  // Source: HomeGuide 2025, Houston Builders 2025
  'Lighting': {
    nationalAvgCost: 2200,
    houstonMultiplier: 0.87,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.45,  // Basic recessed lighting + fixtures: $800-$1.2K
      'Mid-Range': 1.00,        // Recessed + pendants over island: $1.8K-$2.5K
      'Premium': 1.80,          // Designer fixtures + undercabinet LED: $3.5K-$4.5K
      'Luxury': 3.20            // Custom lighting design + smart controls: $6K-$8K
    },
    roiRecovery: 65,
    description: 'Kitchen lighting upgrade including recessed lights, pendants, and undercabinet lighting',
    costBasis: 'Recessed lights: $150-$300 each | Pendants: $200-$800 each | Undercabinet LED: $20-$50/lf'
  }
};

// ==================== BATHROOM RENOVATION ITEMS ====================
// Sources:
// - Badeloft Texas Bathroom Remodel Cost Guide 2025
// - Tell Projects Houston Bathroom Cost Guide 2025/2026
// - Sweeten Houston Bathroom Cost Guide 2025
// - Apex Bath Remodeling Texas 2025
// Houston: Budget $8K-$15K | Mid-Range $16K-$35K | Luxury $36K-$75K+

const BATHROOM_RENOVATION_ITEMS = {

  // Vanity & Sink
  // Source: Home Remedy Houston 2025, Tell Projects 2025
  // Stock vanity: $200-$600 | Semi-custom: $800-$2K | Custom: $3K-$13K
  'Vanity & Sink': {
    nationalAvgCost: 3500,
    houstonMultiplier: 0.85,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.40,  // Stock vanity + basic sink: $1K-$1.5K
      'Mid-Range': 1.00,        // Semi-custom vanity + undermount sink: $3K-$4K
      'Premium': 1.85,          // Custom double vanity + vessel sink: $6K-$7K
      'Luxury': 3.50            // Custom built-in, premium stone top, designer faucets: $12K-$13K
    },
    roiRecovery: 65,
    description: 'Vanity cabinet, countertop, sink, faucet, and mirror replacement',
    costBasis: 'Stock: $200-$600 | Semi-custom: $800-$2K | Custom: $3K-$13K installed'
  },

  // Shower / Tub
  // Source: Apex Bath Remodeling 2025, Tell Projects 2025
  // Tile work: $8K-$15K | Custom shower: $10K-$25K
  'Shower & Tub': {
    nationalAvgCost: 8500,
    houstonMultiplier: 0.87,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.55,  // Tub resurfacing or prefab shower insert: $4K-$5K
      'Mid-Range': 1.00,        // Tile shower with glass door, new tub: $8K-$10K
      'Premium': 1.90,          // Large format tile shower, frameless glass, rainfall head: $15K-$18K
      'Luxury': 3.80            // Custom walk-in shower + freestanding soaking tub: $30K-$35K
    },
    roiRecovery: 68,
    description: 'Shower and tub replacement or renovation including tile, fixtures, and glass enclosure',
    costBasis: 'Prefab insert: $1K-$3K | Tile shower: $8K-$15K | Custom frameless: $15K-$25K installed'
  },

  // Tile & Flooring
  // Source: Tell Projects 2025, Houston Builders 2025
  'Tile & Flooring': {
    nationalAvgCost: 3800,
    houstonMultiplier: 0.86,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.45,  // Basic ceramic tile floor: $1.5K-$2K for 60sqft
      'Mid-Range': 1.00,        // Porcelain floor + partial wall tile: $3.5K-$4.5K
      'Premium': 1.80,          // Large format porcelain floor-to-ceiling: $6K-$7.5K
      'Luxury': 3.50            // Marble or designer tile throughout: $12K-$15K
    },
    roiRecovery: 62,
    description: 'Bathroom floor and wall tile replacement including waterproofing and installation',
    costBasis: 'Ceramic: $5-$10/sqft | Porcelain: $8-$20/sqft | Marble: $20-$50/sqft installed'
  },

  // Fixtures & Lighting
  // Source: Houston Builders 2025, HomeGuide 2025
  'Fixtures & Lighting': {
    nationalAvgCost: 2200,
    houstonMultiplier: 0.87,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.40,  // Basic fixtures + standard lighting: $800-$1K
      'Mid-Range': 1.00,        // Mid-grade fixtures + vanity lighting: $2K-$2.5K
      'Premium': 1.80,          // Designer fixtures + LED mirror + heated floor: $3.5K-$4.5K
      'Luxury': 3.50            // Luxury brand fixtures + smart controls + heated floor: $7K-$8K
    },
    roiRecovery: 60,
    description: 'Toilet, faucets, towel bars, lighting fixtures, and ventilation fan replacement',
    costBasis: 'Toilet: $300-$1.5K | Faucets: $150-$800 each | Vanity light: $200-$1.2K installed'
  }
};

// ==================== BEDROOM RENOVATION ITEMS ====================
// Sources:
// - HomeGuide 2025 (bedroom remodel: $15-$40/sqft)
// - Angi 2025 (basic: $1,500-$5,000 | complete: $4,000-$12,000)
// - Full Home Remodel Cost Houston 2026 (Legacy Custom)
// - Harrison Construction Houston 2025

const BEDROOM_RENOVATION_ITEMS = {

  // Flooring — most impactful bedroom upgrade
  // Source: Harrison Construction 2025, HomeGuide 2025
  // Hardwood: $6-$12/sqft | LVP: $3-$10/sqft | Carpet: $2-$8/sqft
  'Flooring': {
    nationalAvgCost: 4500,
    houstonMultiplier: 0.85,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.40,  // Carpet replacement: ~200sqft avg bedroom $1.5K-$2K
      'Mid-Range': 1.00,        // LVP or engineered hardwood: $4K-$5K
      'Premium': 1.70,          // Solid hardwood with stain: $7K-$8K
      'Luxury': 2.80            // Premium hardwood herringbone + baseboards: $11K-$13K
    },
    roiRecovery: 70,
    description: 'Bedroom flooring replacement including removal, subfloor prep, and installation',
    costBasis: 'Carpet: $2-$8/sqft | LVP: $3-$10/sqft | Hardwood: $6-$12/sqft installed'
  },

  // Paint & Trim
  // Source: HomeGuide 2025, Houston contractors 2025
  'Paint & Trim': {
    nationalAvgCost: 1800,
    houstonMultiplier: 0.85,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.45,  // DIY-grade paint + basic trim: $700-$900
      'Mid-Range': 1.00,        // Professional paint + crown molding: $1.5K-$2K
      'Premium': 1.70,          // Designer colors + coffered ceiling + wainscoting: $2.8K-$3.5K
      'Luxury': 3.20            // Full custom millwork, wallcovering, decorative ceilings: $5K-$6.5K
    },
    roiRecovery: 65,
    description: 'Interior painting, crown molding, baseboards, and trim work',
    costBasis: 'Paint only: $300-$800/room | Crown molding: $7-$16/lf | Wainscoting: $10-$30/lf installed'
  },

  // Closet & Storage
  // Source: HomeGuide 2025, Houston Builders 2025
  'Closet & Storage': {
    nationalAvgCost: 3200,
    houstonMultiplier: 0.85,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.35,  // Basic wire shelving system: $800-$1.2K
      'Mid-Range': 1.00,        // Modular closet system (ClosetMaid/IKEA PAX): $2.5K-$3.5K
      'Premium': 1.80,          // Semi-custom closet organizer: $5K-$6.5K
      'Luxury': 3.50            // Fully custom walk-in wardrobe with island: $10K-$12K
    },
    roiRecovery: 60,
    description: 'Closet organization system including shelving, hanging rods, drawers, and lighting',
    costBasis: 'Wire shelving: $200-$600 | Modular: $1K-$3K | Custom built-in: $5K-$12K installed'
  },

  // Lighting & Electrical
  // Source: HomeGuide 2025
  'Lighting': {
    nationalAvgCost: 1500,
    houstonMultiplier: 0.87,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.45,  // New ceiling fan + basic fixtures: $600-$800
      'Mid-Range': 1.00,        // Recessed lighting + ceiling fan + dimmer: $1.3K-$1.8K
      'Premium': 1.80,          // Designer fixtures + recessed + accent lighting: $2.5K-$3K
      'Luxury': 3.50            // Statement chandelier + full lighting design: $5K-$6K
    },
    roiRecovery: 58,
    description: 'Bedroom lighting upgrade including ceiling fixtures, recessed lights, and controls',
    costBasis: 'Ceiling fan: $150-$600 | Recessed light: $150-$300 each | Chandelier: $500-$5K installed'
  }
};

// ==================== LIVING ROOM RENOVATION ITEMS ====================
// Sources:
// - Angi Living Room Remodel Cost 2025/2026 ($50-$200/sqft)
// - Full Home Remodel Cost Houston 2026 ($5-$15/sqft for living areas)
// - HomeGuide 2025
// - Harrison Construction Houston 2025

const LIVING_ROOM_RENOVATION_ITEMS = {

  // Flooring — single biggest living room upgrade
  // Source: Harrison Construction 2025, Angi 2025
  // Living rooms avg 300-400sqft in Houston homes
  'Flooring': {
    nationalAvgCost: 6000,
    houstonMultiplier: 0.85,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.40,  // Laminate or basic LVP: $2K-$2.5K for 300sqft
      'Mid-Range': 1.00,        // LVP premium or engineered hardwood: $5K-$7K
      'Premium': 1.65,          // Solid hardwood with custom stain: $9K-$11K
      'Luxury': 2.80            // Premium hardwood herringbone or marble: $15K-$18K
    },
    roiRecovery: 72,
    description: 'Living room flooring replacement including removal, subfloor prep, and installation',
    costBasis: 'Laminate: $3-$8/sqft | LVP: $4-$10/sqft | Hardwood: $6-$12/sqft | Marble: $15-$30/sqft'
  },

  // Paint & Trim
  // Source: Angi 2025, HomeGuide 2025
  'Paint & Trim': {
    nationalAvgCost: 2500,
    houstonMultiplier: 0.85,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.40,  // Single color paint + basic trim: $800-$1.2K
      'Mid-Range': 1.00,        // Professional paint + crown molding: $2K-$3K
      'Premium': 1.65,          // Designer colors + wainscoting + coffered ceiling: $3.5K-$4.5K
      'Luxury': 3.20            // Custom millwork, wallcovering, built-in shelving surround: $7K-$8.5K
    },
    roiRecovery: 65,
    description: 'Interior painting, crown molding, wainscoting, and trim throughout living room',
    costBasis: 'Paint: $400-$1K/room | Crown molding: $7-$16/lf | Built-in shelving: $150-$500/lf'
  },

  // Lighting & Electrical
  // Source: Angi 2025, HomeGuide 2025
  'Lighting': {
    nationalAvgCost: 3000,
    houstonMultiplier: 0.87,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.40,  // New ceiling fixture + basic recessed: $1K-$1.5K
      'Mid-Range': 1.00,        // Recessed lighting + dimmer + accent: $2.5K-$3.5K
      'Premium': 1.70,          // Designer chandelier + full recessed + smart: $4.5K-$5.5K
      'Luxury': 3.50            // Custom lighting design + statement pieces + smart home: $9K-$11K
    },
    roiRecovery: 60,
    description: 'Living room lighting upgrade including recessed lights, fixtures, and controls',
    costBasis: 'Recessed: $150-$300 each | Chandelier: $500-$5K | Smart dimmer system: $500-$2K'
  },

  // Fireplace
  // Source: Houston Builders 2025 ($3,500-$7,000 for gas conversion)
  // Only added for Premium/Luxury tiers
  'Fireplace Update': {
    nationalAvgCost: 5500,
    houstonMultiplier: 0.87,
    budgetTierMultipliers: {
      'Budget-Friendly': 0.30,  // Fireplace surround repaint + new mantel: $1.2K-$1.8K
      'Mid-Range': 1.00,        // Gas insert conversion + new surround: $4K-$6K
      'Premium': 1.80,          // Custom stone or tile surround + gas insert: $8K-$11K
      'Luxury': 3.50            // Full custom marble fireplace + built-in surrounds: $18K-$20K
    },
    roiRecovery: 65,
    description: 'Fireplace update including surround, mantel, and gas conversion if applicable',
    costBasis: 'Mantel only: $500-$2K | Gas conversion: $3.5K-$7K | Custom stone surround: $8K-$20K'
  }
};

// ==================== INTERIOR ROI BY PROJECT ====================
// Sources: NAR 2025 Remodeling Impact Report, Remodeling Magazine 2025 Cost vs Value
// Angi 2025, Tell Projects Houston 2025

const KITCHEN_ROI_BY_TIER = {
  'Budget-Friendly': {
    recovery: 80,
    insight: 'Minor kitchen remodels (cabinet refacing, new countertops, appliances) return ~80% in Houston — top interior ROI per Remodeling Magazine 2025'
  },
  'Mid-Range': {
    recovery: 72,
    insight: 'Mid-range kitchen remodels average 70-80% ROI in Houston — semi-custom cabinets and quartz countertops deliver the best value balance'
  },
  'Premium': {
    recovery: 62,
    insight: 'Premium kitchen remodels recover ~60-65% — diminishing returns begin above $60K per industry experts'
  },
  'Luxury': {
    recovery: 45,
    insight: 'Luxury kitchen remodels ($100K+) recover ~38-50% — best justified for personal enjoyment in long-term ownership'
  }
};

const BATHROOM_ROI_BY_TIER = {
  'Budget-Friendly': {
    recovery: 74,
    insight: 'Budget bathroom refreshes return 70-80% in Houston — new fixtures and vanity deliver strong value per Tell Projects 2025'
  },
  'Mid-Range': {
    recovery: 68,
    insight: 'Mid-range bathroom remodels return ~65-70% in Houston — tile shower and modern vanity are top ROI upgrades'
  },
  'Premium': {
    recovery: 58,
    insight: 'Premium bathroom remodels recover ~55-65% — spa features add lifestyle value beyond pure financial return'
  },
  'Luxury': {
    recovery: 48,
    insight: 'Luxury bathroom remodels ($75K+) recover ~45-55% — best for luxury home positioning in high-value Houston neighborhoods'
  }
};

const BEDROOM_ROI_BY_TIER = {
  'Budget-Friendly': {
    recovery: 65,
    insight: 'Basic bedroom updates (flooring, paint, lighting) return ~60-70% — flooring alone delivers 70-80% ROI per Harrison Construction 2025'
  },
  'Mid-Range': {
    recovery: 60,
    insight: 'Mid-range bedroom remodels return ~58-65% — engineered hardwood and closet systems provide best ROI combination'
  },
  'Premium': {
    recovery: 55,
    insight: 'Premium bedroom remodels recover ~50-60% — custom closets and hardwood floors improve marketability significantly'
  },
  'Luxury': {
    recovery: 45,
    insight: 'Luxury bedroom remodels recover ~40-50% — bespoke millwork and premium finishes justify long-term ownership investment'
  }
};

const LIVING_ROOM_ROI_BY_TIER = {
  'Budget-Friendly': {
    recovery: 65,
    insight: 'Living room cosmetic updates return ~60-70% — flooring and fresh paint are the highest-impact low-cost upgrades'
  },
  'Mid-Range': {
    recovery: 62,
    insight: 'Mid-range living room remodels return ~60-65% per Angi 2025 — open layouts and energy-efficient lighting add the most value'
  },
  'Premium': {
    recovery: 58,
    insight: 'Premium living room remodels recover ~55-60% — built-ins and fireplace updates improve buyer appeal significantly'
  },
  'Luxury': {
    recovery: 48,
    insight: 'Luxury living room remodels recover ~45-50% — custom millwork and designer finishes best suit high-value property positioning'
  }
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
  KITCHEN_RENOVATION_ITEMS,       // NEW
  BATHROOM_RENOVATION_ITEMS,      // NEW
  BEDROOM_RENOVATION_ITEMS,       // NEW
  LIVING_ROOM_RENOVATION_ITEMS,   // NEW
  KITCHEN_ROI_BY_TIER,            // NEW
  BATHROOM_ROI_BY_TIER,           // NEW
  BEDROOM_ROI_BY_TIER,            // NEW
  LIVING_ROOM_ROI_BY_TIER,        // NEW
  REPLICATE_CONFIG,
  getCostContextMessage,
  getRoiMessage
};