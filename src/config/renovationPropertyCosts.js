/**
 * renovationPropertyCosts.js
 *
 * Hardcoded renovation cost data for specific Vihara properties.
 * Keyed by MongoDB propertyId string.
 *
 * Research sources (June 2025):
 *  - Project Cost Atlas (Oakland, CA) — Dec 2025 data
 *  - HomeAdvisor / Angi (Kingwood, TX)
 *  - Houston Builders Texas (kitchen costs Houston/Kingwood 2025)
 *  - Remodeling Magazine / Zonda 2025 Cost vs. Value Report
 *  - homeyou.com (Oakland siding/exterior actuals)
 *
 * Oakland city cost multiplier:  1.50x national average
 * Kingwood (Houston area) cost multiplier: 0.85x national average
 */

// ─── PROPERTY IDs ────────────────────────────────────────────────────────────
const OAKLAND_PROPERTY_ID  = '69cf9ec217e006f5c4437c62'; // 1496 Adeline St, Oakland CA 94607
const KINGWOOD_PROPERTY_ID = '695236a4acad197a54f80e95'; // 1703 Brookside Pine Ln, Kingwood TX 77345

// ─── SHARED HELPER ───────────────────────────────────────────────────────────
/**
 * Applies a budget-tier multiplier to a mid-range baseline.
 * Multipliers are calibrated so Mid-Range = 1.00.
 */
const applyTier = (midRangeBase, multipliers, tier) =>
  Math.round(midRangeBase * (multipliers[tier] ?? 1.0));

// ─────────────────────────────────────────────────────────────────────────────
//  PROPERTY COST CONFIGS
// ─────────────────────────────────────────────────────────────────────────────

const PROPERTY_COSTS = {

  // ══════════════════════════════════════════════════════════════════════════
  //  1496 Adeline St · Oakland, CA 94607
  //  1,300 sq ft · 3 bed / 2.5 bath · Built 1996 · REO Bank Owned
  //  Oakland city multiplier: 1.50x  |  California state multiplier: 1.45x
  // ══════════════════════════════════════════════════════════════════════════
  [OAKLAND_PROPERTY_ID]: {
    meta: {
      address:        '1496 Adeline St, Oakland, CA 94607',
      city:           'Oakland',
      state:          'California',
      squareFootage:  1300,
      bedrooms:       3,
      bathrooms:      2.5,
      yearBuilt:      1996,
      regionalFactor: 1.50,
      dataSource:     'Project Cost Atlas Oakland CA (Dec 2025) · Remodeling Magazine 2025 Cost vs. Value Report (Pacific Region)'
    },

    areas: {

      // ── EXTERIOR ─────────────────────────────────────────────────────────
      // 1,300 sqft townhome exterior. Oakland labor is premium (union rates).
      // Paint: ~$7,500 mid-range based on homeyou Oakland actuals.
      // Siding: homeyou Oakland average $5,315–$6,597 for ~300 sqft section.
      Exterior: {
        focusAreas: {

          'Repaint only': {
            tiers: {
              'Budget-Friendly': { cost: 5200,  range: { min: 4500,  max: 6000  } },
              'Mid-Range':       { cost: 7500,  range: { min: 6500,  max: 9000  } },
              'Premium':         { cost: 11500, range: { min: 10000, max: 13500 } },
              'Luxury':          { cost: 16500, range: { min: 14000, max: 19000 } }
            },
            lineItems: [
              {
                item:        'Surface Preparation & Power Washing',
                description: 'Pressure washing, scraping, caulking, and priming exterior surfaces',
                costBasis:   '~$800–$1,200 for a 1,300 sqft townhome in Oakland',
                roiRecovery: 55,
                formula: {
                  regionalFactor: 1.50,
                  tierMultiplier: 1.00,
                  nationalAvgCost: 950
                }
              },
              {
                item:        'Exterior Paint (Walls, Trim & Shutters)',
                description: 'Two-coat application with premium exterior paint on all wall surfaces and trim',
                costBasis:   '$1.75–$4.50/sqft labor + materials in Oakland (25–30% above national avg)',
                roiRecovery: 60,
                formula: {
                  nationalAvgCost: 3800,
                  tierMultiplier:  1.00,
                  locationMultiplier: 1.50
                }
              },
              {
                item:        'Front Door Repaint & Hardware',
                description: 'Strip, prime, and repaint front door with updated exterior hardware',
                costBasis:   'Door repaint: $350–$600 | Hardware: $150–$400 in Oakland market',
                roiRecovery: 70,
                formula: {
                  regionalFactor: 1.50,
                  tierMultiplier: 1.00,
                  nationalAvgCost: 500
                }
              }
            ],
            contingency: { percentage: 12, reason: 'Lead paint testing/remediation risk on 1996 build; permit required for Oakland exterior work' },
            roiEstimate: { estimatedValueIncrease: 4500, recoveryPercentage: 60, roiMessage: 'Fresh exterior paint is the highest-visual-impact, lowest-cost upgrade for a West Oakland townhome.', source: 'NAR 2025 Remodeling Impact Report' }
          },

          'Update roof/siding': {
            tiers: {
              'Budget-Friendly': { cost: 14000, range: { min: 12000, max: 17000 } },
              'Mid-Range':       { cost: 22000, range: { min: 19000, max: 26000 } },
              'Premium':         { cost: 36000, range: { min: 31000, max: 42000 } },
              'Luxury':          { cost: 52000, range: { min: 44000, max: 62000 } }
            },
            lineItems: [
              {
                item:        'Siding Removal & Disposal',
                description: 'Full tear-off of existing siding, inspection for moisture damage, proper disposal',
                costBasis:   'Demo/haul-away: $1,500–$2,500 in Oakland (union labor rates apply)',
                roiRecovery: 76,
                formula: {
                  nationalAvgCost: 1800,
                  tierMultiplier:  1.00,
                  locationMultiplier: 1.50
                }
              },
              {
                item:        'New Siding Installation',
                description: 'Fiber cement siding (James Hardie preferred in Bay Area for moisture resistance)',
                costBasis:   'Fiber cement: $10–$18/sqft installed in Oakland (vs $7–$12 national avg)',
                roiRecovery: 76,
                formula: {
                  nationalAvgCost: 14000,
                  tierMultiplier:  1.00,
                  locationMultiplier: 1.50
                }
              },
              {
                item:        'Trim, Flashing & Moisture Barrier',
                description: 'Install weather-resistant barrier, new trim boards, and window/door flashing',
                costBasis:   'Critical for Bay Area fog/moisture; $2,000–$4,500 for this property size',
                roiRecovery: 70,
                formula: {
                  nationalAvgCost: 2800,
                  tierMultiplier:  1.00,
                  locationMultiplier: 1.50
                }
              }
            ],
            contingency: { percentage: 15, reason: 'Hidden moisture damage is common in 1996 Bay Area builds; asbestos testing may be required' },
            roiEstimate: { estimatedValueIncrease: 17600, recoveryPercentage: 80, roiMessage: 'Fiber cement siding consistently ranks in the top 5 ROI projects in the Pacific region.', source: 'Remodeling Magazine 2025 Cost vs. Value — Pacific Region' }
          },

          'New windows': {
            tiers: {
              'Budget-Friendly': { cost: 8000,  range: { min: 6500,  max: 10000 } },
              'Mid-Range':       { cost: 18000, range: { min: 15000, max: 22000 } },
              'Premium':         { cost: 30000, range: { min: 26000, max: 36000 } },
              'Luxury':          { cost: 44000, range: { min: 38000, max: 52000 } }
            },
            lineItems: [
              {
                item:        'Window Removal & Disposal',
                description: 'Removal of 8–10 existing windows (estimated for 1,300 sqft townhome)',
                costBasis:   '$100–$200 per window removal in Oakland',
                roiRecovery: 69,
                formula: {
                  nationalAvgCost: 1200,
                  tierMultiplier:  1.00,
                  locationMultiplier: 1.50
                }
              },
              {
                item:        'New Window Units (8–10 windows)',
                description: 'Vinyl double-pane (budget) to fiberglass triple-pane (premium); Energy Star rated',
                costBasis:   'Oakland: $900–$1,800/window vinyl | $1,800–$3,500/window fiberglass installed',
                roiRecovery: 69,
                formula: {
                  nationalAvgCost: 14000,
                  tierMultiplier:  1.00,
                  locationMultiplier: 1.50
                }
              },
              {
                item:        'Exterior Trim & Caulking',
                description: 'New exterior trim, weather-seal caulking, and touch-up painting around all windows',
                costBasis:   '$200–$500 per window for trim and finishing in the Bay Area',
                roiRecovery: 65,
                formula: {
                  nationalAvgCost: 2500,
                  tierMultiplier:  1.00,
                  locationMultiplier: 1.50
                }
              }
            ],
            contingency: { percentage: 12, reason: 'Oakland building permit required; lead paint disturb testing on 1996 build' },
            roiEstimate: { estimatedValueIncrease: 13500, recoveryPercentage: 75, roiMessage: 'Energy-efficient windows are highly valued by Bay Area buyers and reduce utility costs significantly.', source: 'Remodeling Magazine 2025 Cost vs. Value — Pacific Region' }
          },

          'New entrance': {
            tiers: {
              'Budget-Friendly': { cost: 2200,  range: { min: 1800,  max: 2800  } },
              'Mid-Range':       { cost: 4800,  range: { min: 4000,  max: 6000  } },
              'Premium':         { cost: 10500, range: { min: 8500,  max: 13000 } },
              'Luxury':          { cost: 22000, range: { min: 18000, max: 27000 } }
            },
            lineItems: [
              {
                item:        'New Entry Door (Steel or Fiberglass)',
                description: 'Pre-hung steel or fiberglass door with weather-stripping, deadbolt, and finish hardware',
                costBasis:   'Steel door installed Oakland: $1,500–$3,000 | Fiberglass: $3,000–$7,000',
                roiRecovery: 188,
                formula: {
                  nationalAvgCost: 2355,
                  tierMultiplier:  1.00,
                  locationMultiplier: 1.50
                }
              },
              {
                item:        'Pathway & Porch Update',
                description: 'Repair or replace pathway pavers/concrete and porch lighting upgrade',
                costBasis:   '$800–$2,500 for pathway + $300–$700 for new porch fixtures in Oakland',
                roiRecovery: 120,
                formula: {
                  nationalAvgCost: 1500,
                  tierMultiplier:  1.00,
                  locationMultiplier: 1.50
                }
              }
            ],
            contingency: { percentage: 10, reason: 'Minor permit may be required for structural door frame modifications' },
            roiEstimate: { estimatedValueIncrease: 9000, recoveryPercentage: 188, roiMessage: 'Front door replacement delivers the highest ROI of any single exterior project per Remodeling Magazine 2025.', source: 'Remodeling Magazine 2025 Cost vs. Value Report' }
          },

          'Landscaping': {
            tiers: {
              'Budget-Friendly': { cost: 2800,  range: { min: 2200,  max: 3800  } },
              'Mid-Range':       { cost: 6500,  range: { min: 5500,  max: 8000  } },
              'Premium':         { cost: 12000, range: { min: 10000, max: 15000 } },
              'Luxury':          { cost: 22000, range: { min: 18000, max: 27000 } }
            },
            lineItems: [
              {
                item:        'Lawn & Ground Cover',
                description: 'Sod or drought-resistant ground cover (California water restrictions apply)',
                costBasis:   'Drought-tolerant sod Oakland: $0.50–$1.20/sqft installed; ~400 sqft front yard estimate',
                roiRecovery: 100,
                formula: {
                  nationalAvgCost: 2200,
                  tierMultiplier:  1.00,
                  locationMultiplier: 1.50
                }
              },
              {
                item:        'Shrubs, Plants & Mulch',
                description: 'Native California plants preferred (drought resistant, lower water bill)',
                costBasis:   '$35–$180 per shrub; 8–12 plants typical for West Oakland townhome lot',
                roiRecovery: 100,
                formula: {
                  nationalAvgCost: 1800,
                  tierMultiplier:  1.00,
                  locationMultiplier: 1.50
                }
              },
              {
                item:        'Edging, Cleanup & Bark Mulch',
                description: 'Define planting beds, install edging, 3-inch bark mulch layer for moisture retention',
                costBasis:   '$600–$1,200 for labor and materials at this property size',
                roiRecovery: 90,
                formula: {
                  nationalAvgCost: 700,
                  tierMultiplier:  1.00,
                  locationMultiplier: 1.50
                }
              }
            ],
            contingency: { percentage: 10, reason: 'Soil quality varies in West Oakland; irrigation cost may vary' },
            roiEstimate: { estimatedValueIncrease: 6500, recoveryPercentage: 100, roiMessage: 'Professional landscaping recovers 100% of cost on average in the Oakland market.', source: 'NAR 2025 Remodeling Impact Report' }
          },

          'Driveway': {
            tiers: {
              'Budget-Friendly': { cost: 3200,  range: { min: 2600,  max: 4000  } },
              'Mid-Range':       { cost: 6500,  range: { min: 5500,  max: 8000  } },
              'Premium':         { cost: 11500, range: { min: 9500,  max: 14000 } },
              'Luxury':          { cost: 19000, range: { min: 16000, max: 23000 } }
            },
            lineItems: [
              {
                item:        'Driveway Demo & Grading',
                description: 'Remove existing driveway surface, regrade base, compact subbase',
                costBasis:   '$1,200–$2,200 for demo and prep of typical townhome driveway in Oakland',
                roiRecovery: 70,
                formula: {
                  nationalAvgCost: 1400,
                  tierMultiplier:  1.00,
                  locationMultiplier: 1.50
                }
              },
              {
                item:        'New Driveway Surface',
                description: 'Concrete (standard) to decorative pavers (premium); includes edging and sealer',
                costBasis:   'Concrete Oakland: $8–$14/sqft | Pavers: $18–$35/sqft installed',
                roiRecovery: 70,
                formula: {
                  nationalAvgCost: 3500,
                  tierMultiplier:  1.00,
                  locationMultiplier: 1.50
                }
              }
            ],
            contingency: { percentage: 12, reason: 'Oakland permit required for driveway work; access constraints may add cost' },
            roiEstimate: { estimatedValueIncrease: 4800, recoveryPercentage: 74, roiMessage: 'Driveway condition is a top factor in buyer first impressions in competitive Oakland market.', source: 'HomeAdvisor True Cost Guide 2025' }
          },

          'Patio': {
            tiers: {
              'Budget-Friendly': { cost: 4500,  range: { min: 3800,  max: 5800  } },
              'Mid-Range':       { cost: 10000, range: { min: 8500,  max: 12500 } },
              'Premium':         { cost: 18500, range: { min: 16000, max: 23000 } },
              'Luxury':          { cost: 31000, range: { min: 26000, max: 38000 } }
            },
            lineItems: [
              {
                item:        'Patio Demo & Base Prep',
                description: 'Remove existing surface, excavate and compact gravel base',
                costBasis:   '$800–$1,500 for a ~200 sqft townhome patio in Oakland',
                roiRecovery: 80,
                formula: {
                  nationalAvgCost: 900,
                  tierMultiplier:  1.00,
                  locationMultiplier: 1.50
                }
              },
              {
                item:        'Patio Surface & Finishing',
                description: 'Concrete, stamped concrete, or natural stone pavers with sealer and edging',
                costBasis:   'Concrete patio Oakland: $9–$15/sqft | Pavers: $18–$40/sqft installed',
                roiRecovery: 80,
                formula: {
                  nationalAvgCost: 6000,
                  tierMultiplier:  1.00,
                  locationMultiplier: 1.50
                }
              }
            ],
            contingency: { percentage: 12, reason: 'Drainage engineering may be required; Oakland permit needed' },
            roiEstimate: { estimatedValueIncrease: 8500, recoveryPercentage: 85, roiMessage: 'Outdoor living spaces command a premium in the Bay Area where mild climate makes patios year-round usable.', source: 'NAR 2025 Remodeling Impact Report' }
          },

          'Front entrance': {
            tiers: {
              'Budget-Friendly': { cost: 3000,  range: { min: 2500,  max: 4000  } },
              'Mid-Range':       { cost: 7500,  range: { min: 6000,  max: 9500  } },
              'Premium':         { cost: 15000, range: { min: 12500, max: 19000 } },
              'Luxury':          { cost: 27000, range: { min: 22000, max: 34000 } }
            },
            lineItems: [
              {
                item:        'New Entry Door & Hardware',
                description: 'Replace entry door, add smart lock, new exterior hardware set',
                costBasis:   'Steel door + install Oakland: $2,000–$3,500 | Fiberglass: $3,500–$7,500',
                roiRecovery: 150,
                formula: {
                  nationalAvgCost: 2355,
                  tierMultiplier:  1.00,
                  locationMultiplier: 1.50
                }
              },
              {
                item:        'Porch Lighting & Address Numbers',
                description: 'New porch light fixture, pathway lights, and updated address numbers',
                costBasis:   '$400–$900 in Oakland for fixtures and electrician time',
                roiRecovery: 120,
                formula: {
                  nationalAvgCost: 500,
                  tierMultiplier:  1.00,
                  locationMultiplier: 1.50
                }
              },
              {
                item:        'Pathway & Porch Tile/Pavers',
                description: 'New pathway surface from sidewalk to door; porch tile or stone overlay',
                costBasis:   '$1,500–$4,500 for pathway and porch area in Oakland',
                roiRecovery: 120,
                formula: {
                  nationalAvgCost: 2500,
                  tierMultiplier:  1.00,
                  locationMultiplier: 1.50
                }
              }
            ],
            contingency: { percentage: 10, reason: 'Minor Oakland building permit may be required for structural modifications' },
            roiEstimate: { estimatedValueIncrease: 11000, recoveryPercentage: 147, roiMessage: 'Front entrance upgrades deliver outsized ROI in the competitive Oakland resale market.', source: 'Remodeling Magazine 2025 Cost vs. Value — Pacific Region' }
          },

          'All': {
            tiers: {
              'Budget-Friendly': { cost: 22000, range: { min: 18000, max: 28000 } },
              'Mid-Range':       { cost: 52000, range: { min: 44000, max: 64000 } },
              'Premium':         { cost: 92000, range: { min: 78000, max: 110000 } },
              'Luxury':          { cost: 145000, range: { min: 120000, max: 175000 } }
            },
            lineItems: [
              {
                item:        'Complete Exterior Paint',
                description: 'Full repaint of all exterior surfaces with premium paint',
                costBasis:   'Oakland mid-range exterior paint: $6,500–$9,000',
                roiRecovery: 60,
                formula: {
                  nationalAvgCost: 5000,
                  tierMultiplier:  1.00,
                  locationMultiplier: 1.50
                }
              },
              {
                item:        'Landscaping & Curb Appeal',
                description: 'Lawn, plants, mulch, edging, and pathway improvements',
                costBasis:   'Oakland mid-range landscaping: $5,500–$8,000',
                roiRecovery: 100,
                formula: {
                  nationalAvgCost: 4000,
                  tierMultiplier:  1.00,
                  locationMultiplier: 1.50
                }
              },
              {
                item:        'New Entry Door & Porch',
                description: 'New fiberglass door, hardware, porch lighting, and pathway',
                costBasis:   'Oakland mid-range entrance: $7,000–$10,000',
                roiRecovery: 150,
                formula: {
                  nationalAvgCost: 5500,
                  tierMultiplier:  1.00,
                  locationMultiplier: 1.50
                }
              },
              {
                item:        'Siding & Trim Update',
                description: 'Fiber cement siding sections with new trim boards and flashing',
                costBasis:   'Oakland mid-range partial siding: $15,000–$22,000',
                roiRecovery: 80,
                formula: {
                  nationalAvgCost: 12000,
                  tierMultiplier:  1.00,
                  locationMultiplier: 1.50
                }
              }
            ],
            contingency: { percentage: 15, reason: 'Multi-trade coordination; Oakland permit required for full exterior scope; lead paint testing on 1996 build' },
            roiEstimate: { estimatedValueIncrease: 42000, recoveryPercentage: 81, roiMessage: 'Complete exterior renovation averages 81% cost recovery and significantly reduces time-on-market in Oakland.', source: 'Remodeling Magazine 2025 Cost vs. Value — Pacific Region · NAR 2025' }
          }
        },

        // Default focus area if not matched (matches RenovationForm default)
        defaultFocusArea: 'Repaint only'
      },

      // ── KITCHEN ──────────────────────────────────────────────────────────
      // Oakland kitchen: $18,750 low / $43,750 typical / $93,750 high (Project Cost Atlas Dec 2025)
      // 1,300 sqft home = ~130 sqft kitchen estimate
      Kitchen: {
        tiers: {
          'Budget-Friendly': { cost: 19500, range: { min: 15000, max: 24000 } },
          'Mid-Range':       { cost: 44000, range: { min: 37000, max: 54000 } },
          'Premium':         { cost: 78000, range: { min: 66000, max: 94000 } },
          'Luxury':          { cost: 135000, range: { min: 112000, max: 165000 } }
        },
        lineItems: [
          {
            item:        'Cabinets & Hardware',
            description: 'Semi-custom cabinet replacement with soft-close hardware; Oakland labor premium applies',
            costBasis:   'Oakland: Semi-custom cabinets $15K–$22K | Custom: $28K–$55K installed',
            roiRecovery: 67,
            formula: { nationalAvgCost: 14000, tierMultiplier: 1.00, locationMultiplier: 1.50 }
          },
          {
            item:        'Countertops (Quartz)',
            description: 'Quartz countertop fabrication and installation; ~30 sqft for this kitchen size',
            costBasis:   'Oakland: Quartz $65–$120/sqft installed ($1,950–$3,600 for ~30 sqft)',
            roiRecovery: 72,
            formula: { nationalAvgCost: 5500, tierMultiplier: 1.00, locationMultiplier: 1.50 }
          },
          {
            item:        'Appliance Package',
            description: 'Mid-range: refrigerator, range, dishwasher, microwave (stainless steel)',
            costBasis:   'Oakland mid-range appliance package: $7,500–$13,000 with delivery/install',
            roiRecovery: 60,
            formula: { nationalAvgCost: 8000, tierMultiplier: 1.00, locationMultiplier: 1.50 }
          },
          {
            item:        'Flooring & Backsplash',
            description: 'LVP flooring replacement and tile backsplash installation',
            costBasis:   'Oakland: LVP $4–$11/sqft installed | Tile backsplash $25–$50/sqft labor+material',
            roiRecovery: 70,
            formula: { nationalAvgCost: 4200, tierMultiplier: 1.00, locationMultiplier: 1.50 }
          },
          {
            item:        'Lighting & Electrical',
            description: 'Recessed lights, pendant lighting, undercabinet LED, panel upgrade if needed',
            costBasis:   'Oakland electrician rate: $85–$130/hr; total lighting package $2,500–$5,000',
            roiRecovery: 65,
            formula: { nationalAvgCost: 2200, tierMultiplier: 1.00, locationMultiplier: 1.50 }
          }
        ],
        contingency: { percentage: 12, reason: 'Plumbing and electrical upgrades often required in 1996 Oakland homes; permit required' },
        roiEstimate: { estimatedValueIncrease: 32000, recoveryPercentage: 73, roiMessage: 'A mid-range kitchen remodel returns 70–80% in Oakland — one of the top interior ROI projects in the Bay Area.', source: 'Project Cost Atlas Oakland CA (Dec 2025) · Remodeling Magazine 2025 Cost vs. Value — Pacific Region' }
      },

      // ── BATHROOM ─────────────────────────────────────────────────────────
      // Oakland bathroom: $7,438 low / $17,000 typical / $37,188 high (Project Cost Atlas Dec 2025)
      // Property has 2.5 bathrooms — costs below are per bathroom
      Bathroom: {
        tiers: {
          'Budget-Friendly': { cost: 8500,  range: { min: 7000,  max: 11000 } },
          'Mid-Range':       { cost: 18500, range: { min: 16000, max: 23000 } },
          'Premium':         { cost: 30000, range: { min: 26000, max: 37000 } },
          'Luxury':          { cost: 52000, range: { min: 44000, max: 63000 } }
        },
        lineItems: [
          {
            item:        'Vanity, Sink & Mirror',
            description: 'Vanity cabinet replacement, new countertop, undermount sink, faucet, and framed mirror',
            costBasis:   'Oakland: Semi-custom vanity $1,200–$3,500 | Custom: $4,500–$12,000 installed',
            roiRecovery: 65,
            formula: { nationalAvgCost: 3500, tierMultiplier: 1.00, locationMultiplier: 1.50 }
          },
          {
            item:        'Shower / Tub Renovation',
            description: 'Tile shower rebuild or tub replacement with new fixtures and glass enclosure',
            costBasis:   'Oakland: Tile shower $9,000–$16,000 | Custom frameless glass: $16,000–$28,000',
            roiRecovery: 68,
            formula: { nationalAvgCost: 8500, tierMultiplier: 1.00, locationMultiplier: 1.50 }
          },
          {
            item:        'Floor & Wall Tile',
            description: 'Porcelain floor tile and partial wall tile with waterproofing membrane',
            costBasis:   'Oakland tile install: $10–$22/sqft labor + $3–$18/sqft material (porcelain)',
            roiRecovery: 62,
            formula: { nationalAvgCost: 3800, tierMultiplier: 1.00, locationMultiplier: 1.50 }
          },
          {
            item:        'Toilet, Fixtures & Lighting',
            description: 'Comfort-height toilet, new faucets, towel bars, exhaust fan, and vanity lighting',
            costBasis:   'Oakland: Toilet $400–$1,800 installed | LED vanity light $250–$900 | Fan $350–$700',
            roiRecovery: 60,
            formula: { nationalAvgCost: 2200, tierMultiplier: 1.00, locationMultiplier: 1.50 }
          }
        ],
        contingency: { percentage: 15, reason: 'Plumbing roughed in 1996; galvanized pipe replacement common in Oakland homes of this era' },
        roiEstimate: { estimatedValueIncrease: 13000, recoveryPercentage: 70, roiMessage: 'Bathroom remodels return 65–74% in Oakland — strong ROI given the competitive Bay Area buyer market.', source: 'Project Cost Atlas Oakland CA (Dec 2025) · Remodeling Magazine 2025 Cost vs. Value Report' }
      },

      // ── LIVING ROOM ──────────────────────────────────────────────────────
      // Oakland mid-range living room remodel (250 sqft estimate for 1,300 sqft home)
      'Living Room': {
        tiers: {
          'Budget-Friendly': { cost: 5500,  range: { min: 4500,  max: 7000  } },
          'Mid-Range':       { cost: 13500, range: { min: 11500, max: 16500 } },
          'Premium':         { cost: 24000, range: { min: 20000, max: 29000 } },
          'Luxury':          { cost: 40000, range: { min: 34000, max: 49000 } }
        },
        lineItems: [
          {
            item:        'Hardwood / LVP Flooring',
            description: 'Replace carpet or old flooring with engineered hardwood or luxury vinyl plank',
            costBasis:   'Oakland: Engineered hardwood $6–$14/sqft installed | LVP $4–$11/sqft',
            roiRecovery: 72,
            formula: { nationalAvgCost: 6000, tierMultiplier: 1.00, locationMultiplier: 1.50 }
          },
          {
            item:        'Paint, Trim & Crown Molding',
            description: 'Interior repaint, new baseboards, and crown molding installation',
            costBasis:   'Oakland: $400–$1,000/room paint | Crown molding $8–$18/lf installed',
            roiRecovery: 65,
            formula: { nationalAvgCost: 2500, tierMultiplier: 1.00, locationMultiplier: 1.50 }
          },
          {
            item:        'Lighting Upgrade',
            description: 'Recessed lighting installation, dimmer switches, and new ceiling fixtures',
            costBasis:   'Oakland electrician: $85–$130/hr; recessed light install $200–$400 each',
            roiRecovery: 60,
            formula: { nationalAvgCost: 3000, tierMultiplier: 1.00, locationMultiplier: 1.50 }
          }
        ],
        contingency: { percentage: 10, reason: 'Electrical upgrades may require panel permit in Oakland' },
        roiEstimate: { estimatedValueIncrease: 9000, recoveryPercentage: 67, roiMessage: 'Living room updates return 60–70% in Oakland — flooring delivers the strongest per-dollar ROI.', source: 'NAR 2025 Remodeling Impact Report' }
      },

      // ── BEDROOM ──────────────────────────────────────────────────────────
      // Oakland master bedroom (200 sqft estimate)
      Bedroom: {
        tiers: {
          'Budget-Friendly': { cost: 4000,  range: { min: 3200,  max: 5200  } },
          'Mid-Range':       { cost: 9500,  range: { min: 8000,  max: 12000 } },
          'Premium':         { cost: 17500, range: { min: 14500, max: 21000 } },
          'Luxury':          { cost: 30000, range: { min: 25000, max: 37000 } }
        },
        lineItems: [
          {
            item:        'Flooring Replacement',
            description: 'Remove carpet; install engineered hardwood or luxury vinyl plank',
            costBasis:   'Oakland: LVP $4–$11/sqft | Engineered hardwood $6–$14/sqft installed (~200 sqft)',
            roiRecovery: 70,
            formula: { nationalAvgCost: 4500, tierMultiplier: 1.00, locationMultiplier: 1.50 }
          },
          {
            item:        'Paint & Trim',
            description: 'Repaint walls and ceiling, new baseboards and door casings',
            costBasis:   'Oakland: $350–$800/room repaint | Trim/baseboard $8–$16/lf installed',
            roiRecovery: 65,
            formula: { nationalAvgCost: 1800, tierMultiplier: 1.00, locationMultiplier: 1.50 }
          },
          {
            item:        'Closet Organization System',
            description: 'Custom or modular closet system with shelving, rods, and drawers',
            costBasis:   'Oakland: Wire shelving $300–$700 | Modular $1,200–$3,500 | Custom $6,000–$14,000',
            roiRecovery: 60,
            formula: { nationalAvgCost: 3200, tierMultiplier: 1.00, locationMultiplier: 1.50 }
          }
        ],
        contingency: { percentage: 10, reason: 'Minor permit may be needed for electrical work in Oakland' },
        roiEstimate: { estimatedValueIncrease: 6000, recoveryPercentage: 63, roiMessage: 'Bedroom updates return 60–65% in Oakland. Flooring and closet upgrades drive the most buyer appeal.', source: 'NAR 2025 Remodeling Impact Report' }
      }
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  //  1703 Brookside Pine Ln · Kingwood, TX 77345
  //  4,906 sq ft · 5 bed / 5 bath · Built 1990 · REO Bank Owned
  //  Kingwood/Houston multiplier: 0.85x  |  Texas state multiplier: 0.85x
  // ══════════════════════════════════════════════════════════════════════════
  [KINGWOOD_PROPERTY_ID]: {
    meta: {
      address:        '1703 Brookside Pine Ln, Kingwood, TX 77345',
      city:           'Kingwood',
      state:          'Texas',
      squareFootage:  4906,
      bedrooms:       5,
      bathrooms:      5,
      yearBuilt:      1990,
      regionalFactor: 0.85,
      dataSource:     'HomeAdvisor Kingwood TX · Houston Builders Texas (2025) · Remodeling Magazine 2025 Cost vs. Value Report (West South-Central Region)'
    },

    areas: {

      // ── EXTERIOR ─────────────────────────────────────────────────────────
      // 4,906 sqft home in Kingwood TX. Large footprint = large exterior scope.
      // TX labor is significantly cheaper than Bay Area. No union premium.
      Exterior: {
        focusAreas: {

          'Repaint only': {
            tiers: {
              'Budget-Friendly': { cost: 5800,  range: { min: 4800,  max: 7200  } },
              'Mid-Range':       { cost: 10500, range: { min: 8800,  max: 12800 } },
              'Premium':         { cost: 16500, range: { min: 14000, max: 20000 } },
              'Luxury':          { cost: 24000, range: { min: 20000, max: 29000 } }
            },
            lineItems: [
              {
                item:        'Surface Prep & Power Washing',
                description: 'Pressure wash, scrape loose paint, caulk gaps, prime bare wood on large 4,906 sqft home',
                costBasis:   '$1,200–$2,000 for prep on a large Kingwood/Houston area home',
                roiRecovery: 55,
                formula: {
                  nationalAvgCost: 1200,
                  tierMultiplier:  1.00,
                  locationMultiplier: 0.85
                }
              },
              {
                item:        'Exterior Paint (Full Home)',
                description: 'Two-coat application on all exterior walls, trim, and shutters of 4,906 sqft home',
                costBasis:   'Kingwood/Houston: $1.25–$3.00/sqft exterior; larger home = more total but lower $/sqft',
                roiRecovery: 55,
                formula: {
                  nationalAvgCost: 7000,
                  tierMultiplier:  1.00,
                  locationMultiplier: 0.85
                }
              },
              {
                item:        'Front Door, Trim & Shutters',
                description: 'Repaint front door, all exterior trim boards, window shutters, and garage door',
                costBasis:   '$800–$1,800 for trim and accent painting in Kingwood',
                roiRecovery: 65,
                formula: {
                  nationalAvgCost: 1000,
                  tierMultiplier:  1.00,
                  locationMultiplier: 0.85
                }
              }
            ],
            contingency: { percentage: 10, reason: 'Asbestos testing recommended on 1990 build; Houston-area humidity may require additional sealer coat' },
            roiEstimate: { estimatedValueIncrease: 6000, recoveryPercentage: 57, roiMessage: 'Exterior repaint on a large Kingwood home dramatically improves curb appeal at one of the lowest cost-per-dollar ratios.', source: 'NAR 2025 Remodeling Impact Report' }
          },

          'Update roof/siding': {
            tiers: {
              'Budget-Friendly': { cost: 16000, range: { min: 13000, max: 20000 } },
              'Mid-Range':       { cost: 28000, range: { min: 24000, max: 35000 } },
              'Premium':         { cost: 46000, range: { min: 38000, max: 56000 } },
              'Luxury':          { cost: 68000, range: { min: 56000, max: 82000 } }
            },
            lineItems: [
              {
                item:        'Siding Removal & Disposal',
                description: 'Full tear-off of existing siding on large 4,906 sqft home; includes haul-away',
                costBasis:   '$2,500–$4,000 for demo at this home size in Kingwood area',
                roiRecovery: 76,
                formula: {
                  nationalAvgCost: 2500,
                  tierMultiplier:  1.00,
                  locationMultiplier: 0.85
                }
              },
              {
                item:        'New Siding (Vinyl or Fiber Cement)',
                description: 'Vinyl (budget/mid) or fiber cement (premium/luxury) siding installation',
                costBasis:   'Kingwood: Vinyl siding $5–$9/sqft | Fiber cement $8–$15/sqft installed',
                roiRecovery: 76,
                formula: {
                  nationalAvgCost: 18000,
                  tierMultiplier:  1.00,
                  locationMultiplier: 0.85
                }
              },
              {
                item:        'Trim, House Wrap & Flashing',
                description: 'Weather-resistant barrier, new trim boards, and all flashing around openings',
                costBasis:   '$3,500–$6,500 for a large home of this size in Houston area',
                roiRecovery: 70,
                formula: {
                  nationalAvgCost: 3500,
                  tierMultiplier:  1.00,
                  locationMultiplier: 0.85
                }
              }
            ],
            contingency: { percentage: 12, reason: 'High humidity and storm exposure in Kingwood may reveal hidden moisture damage during demo' },
            roiEstimate: { estimatedValueIncrease: 22000, recoveryPercentage: 79, roiMessage: 'Siding replacement on a large Kingwood home delivers strong ROI due to storm protection value buyers pay premium for.', source: 'Remodeling Magazine 2025 Cost vs. Value — West South-Central Region' }
          },

          'New windows': {
            tiers: {
              'Budget-Friendly': { cost: 9500,  range: { min: 8000,  max: 12000 } },
              'Mid-Range':       { cost: 22000, range: { min: 18000, max: 27000 } },
              'Premium':         { cost: 38000, range: { min: 32000, max: 46000 } },
              'Luxury':          { cost: 58000, range: { min: 48000, max: 70000 } }
            },
            lineItems: [
              {
                item:        'Window Removal (est. 18–22 windows)',
                description: 'Remove existing windows; 5 bed / 5 bath home estimated at 18–22 window openings',
                costBasis:   '$75–$150 per window removal in Kingwood/Houston area',
                roiRecovery: 69,
                formula: {
                  nationalAvgCost: 1500,
                  tierMultiplier:  1.00,
                  locationMultiplier: 0.85
                }
              },
              {
                item:        'New Window Units',
                description: 'Double-pane Low-E vinyl (budget) to triple-pane fiberglass (luxury); all openings',
                costBasis:   'Kingwood: Vinyl window installed $600–$1,200 | Fiberglass $1,200–$2,800 each',
                roiRecovery: 69,
                formula: {
                  nationalAvgCost: 17000,
                  tierMultiplier:  1.00,
                  locationMultiplier: 0.85
                }
              },
              {
                item:        'Exterior Trim & Caulking',
                description: 'New exterior casing, weather-seal caulk, and touch-up paint at all windows',
                costBasis:   '$150–$350 per window for trim and finishing in Kingwood',
                roiRecovery: 65,
                formula: {
                  nationalAvgCost: 3500,
                  tierMultiplier:  1.00,
                  locationMultiplier: 0.85
                }
              }
            ],
            contingency: { percentage: 10, reason: 'Energy code compliance (Texas 2021 IECC) may require specific glazing ratings' },
            roiEstimate: { estimatedValueIncrease: 16500, recoveryPercentage: 75, roiMessage: 'Energy-efficient windows provide significant cooling cost savings — a major selling point for large Kingwood homes.', source: 'Remodeling Magazine 2025 Cost vs. Value Report' }
          },

          'New entrance': {
            tiers: {
              'Budget-Friendly': { cost: 1800,  range: { min: 1400,  max: 2400  } },
              'Mid-Range':       { cost: 4000,  range: { min: 3400,  max: 5200  } },
              'Premium':         { cost: 8800,  range: { min: 7200,  max: 11000 } },
              'Luxury':          { cost: 18000, range: { min: 15000, max: 22000 } }
            },
            lineItems: [
              {
                item:        'New Entry Door (Double or Grand)',
                description: 'Pre-hung steel or fiberglass double entry door appropriate for a large 5-bed home',
                costBasis:   'Kingwood: Steel double door $2,000–$4,000 installed | Fiberglass grand entry $5,000–$12,000',
                roiRecovery: 188,
                formula: {
                  nationalAvgCost: 2355,
                  tierMultiplier:  1.00,
                  locationMultiplier: 0.85
                }
              },
              {
                item:        'Portico / Entry Lighting',
                description: 'New exterior entry lighting and address numbers appropriate for home scale',
                costBasis:   '$500–$1,200 in Kingwood for fixtures and electrician',
                roiRecovery: 120,
                formula: {
                  nationalAvgCost: 800,
                  tierMultiplier:  1.00,
                  locationMultiplier: 0.85
                }
              }
            ],
            contingency: { percentage: 10, reason: 'Grand entrance may require structural header work on 1990 build' },
            roiEstimate: { estimatedValueIncrease: 7500, recoveryPercentage: 188, roiMessage: 'Entry door replacement returns the highest ROI of any exterior project — buyers pay outsized attention to first impressions.', source: 'Remodeling Magazine 2025 Cost vs. Value Report' }
          },

          'Landscaping': {
            tiers: {
              'Budget-Friendly': { cost: 3500,  range: { min: 2800,  max: 4800  } },
              'Mid-Range':       { cost: 9000,  range: { min: 7500,  max: 11500 } },
              'Premium':         { cost: 17000, range: { min: 14000, max: 21000 } },
              'Luxury':          { cost: 30000, range: { min: 25000, max: 37000 } }
            },
            lineItems: [
              {
                item:        'Lawn Restoration & Sod',
                description: 'St. Augustine or Bermuda sod (Kingwood standard); large lot size for 5-bed home',
                costBasis:   'Kingwood: Sod $0.30–$0.75/sqft installed; large front yard ~1,500–2,500 sqft estimated',
                roiRecovery: 100,
                formula: {
                  nationalAvgCost: 3500,
                  tierMultiplier:  1.00,
                  locationMultiplier: 0.85
                }
              },
              {
                item:        'Shrubs, Trees & Planting Beds',
                description: 'Native Texas plants: Crape myrtles, Indian hawthorn, Asian jasmine groundcover',
                costBasis:   '$25–$120/shrub | $200–$600/tree; ~15–20 plants for this size lot in Kingwood',
                roiRecovery: 100,
                formula: {
                  nationalAvgCost: 2500,
                  tierMultiplier:  1.00,
                  locationMultiplier: 0.85
                }
              },
              {
                item:        'Irrigation System (Repair/Upgrade)',
                description: '1990 home likely has existing irrigation; upgrade controller and repair heads',
                costBasis:   'Kingwood: Irrigation repair $500–$1,500 | Full replacement $2,800–$5,500',
                roiRecovery: 90,
                formula: {
                  nationalAvgCost: 2000,
                  tierMultiplier:  1.00,
                  locationMultiplier: 0.85
                }
              }
            ],
            contingency: { percentage: 10, reason: 'Post-flood soil assessment may be needed; Kingwood has history of flooding events' },
            roiEstimate: { estimatedValueIncrease: 9000, recoveryPercentage: 100, roiMessage: 'Landscaping is a top ROI project in Kingwood where large lots and curb appeal drive buyer decisions.', source: 'NAR 2025 Remodeling Impact Report' }
          },

          'Driveway': {
            tiers: {
              'Budget-Friendly': { cost: 3800,  range: { min: 3000,  max: 5000  } },
              'Mid-Range':       { cost: 7800,  range: { min: 6500,  max: 9800  } },
              'Premium':         { cost: 13500, range: { min: 11000, max: 17000 } },
              'Luxury':          { cost: 22000, range: { min: 18000, max: 27000 } }
            },
            lineItems: [
              {
                item:        'Driveway Demo & Base Prep',
                description: 'Break up and haul away existing concrete/asphalt; regrade and compact base',
                costBasis:   '$1,800–$3,200 for large home driveway demo in Kingwood',
                roiRecovery: 70,
                formula: {
                  nationalAvgCost: 2000,
                  tierMultiplier:  1.00,
                  locationMultiplier: 0.85
                }
              },
              {
                item:        'New Concrete Driveway',
                description: 'Reinforced concrete driveway; large home may have 3-car garage approach',
                costBasis:   'Kingwood: Concrete $5–$10/sqft | Stamped concrete $8–$18/sqft installed',
                roiRecovery: 70,
                formula: {
                  nationalAvgCost: 5500,
                  tierMultiplier:  1.00,
                  locationMultiplier: 0.85
                }
              }
            ],
            contingency: { percentage: 12, reason: 'Drainage engineering critical in Kingwood flood-prone area; may require French drain integration' },
            roiEstimate: { estimatedValueIncrease: 5800, recoveryPercentage: 74, roiMessage: 'Driveway replacement with proper drainage is especially valuable in Kingwood given flooding history.', source: 'HomeAdvisor True Cost Guide 2025' }
          },

          'Patio': {
            tiers: {
              'Budget-Friendly': { cost: 5500,  range: { min: 4500,  max: 7000  } },
              'Mid-Range':       { cost: 12000, range: { min: 10000, max: 15000 } },
              'Premium':         { cost: 22000, range: { min: 18000, max: 27000 } },
              'Luxury':          { cost: 38000, range: { min: 32000, max: 46000 } }
            },
            lineItems: [
              {
                item:        'Patio Demo & Grading',
                description: 'Remove existing surface; regrade for drainage (critical in Kingwood)',
                costBasis:   '$1,000–$2,000 for patio demo at a large Kingwood property',
                roiRecovery: 80,
                formula: {
                  nationalAvgCost: 1200,
                  tierMultiplier:  1.00,
                  locationMultiplier: 0.85
                }
              },
              {
                item:        'Covered Patio / Outdoor Living',
                description: 'Concrete or paver patio; large 5-bed home warrants 400–600 sqft outdoor space',
                costBasis:   'Kingwood: Concrete patio $6–$11/sqft | Pavers $12–$22/sqft | Pergola $4,000–$12,000',
                roiRecovery: 80,
                formula: {
                  nationalAvgCost: 8000,
                  tierMultiplier:  1.00,
                  locationMultiplier: 0.85
                }
              }
            ],
            contingency: { percentage: 12, reason: 'Covered patio may need building permit; drainage engineering required in Kingwood' },
            roiEstimate: { estimatedValueIncrease: 10500, recoveryPercentage: 88, roiMessage: 'Outdoor living spaces are extremely valuable in Kingwood — mild winters make patios nearly year-round usable.', source: 'NAR 2025 Remodeling Impact Report' }
          },

          'Front entrance': {
            tiers: {
              'Budget-Friendly': { cost: 2800,  range: { min: 2200,  max: 3800  } },
              'Mid-Range':       { cost: 6500,  range: { min: 5400,  max: 8200  } },
              'Premium':         { cost: 13000, range: { min: 11000, max: 16500 } },
              'Luxury':          { cost: 24000, range: { min: 20000, max: 29000 } }
            },
            lineItems: [
              {
                item:        'Grand Entry Door Replacement',
                description: 'Double fiberglass or wood entry door with sidelights; appropriate for 5-bed home scale',
                costBasis:   'Kingwood: Fiberglass double door $3,500–$8,500 | Custom wood $8,000–$18,000 installed',
                roiRecovery: 150,
                formula: {
                  nationalAvgCost: 4000,
                  tierMultiplier:  1.00,
                  locationMultiplier: 0.85
                }
              },
              {
                item:        'Entry Lighting & Hardware',
                description: 'Exterior coach lights, smart lock/keypad, address plaque update',
                costBasis:   '$600–$1,500 in Kingwood for fixtures and installation',
                roiRecovery: 120,
                formula: {
                  nationalAvgCost: 800,
                  tierMultiplier:  1.00,
                  locationMultiplier: 0.85
                }
              }
            ],
            contingency: { percentage: 10, reason: 'Custom door sizing may be needed on 1990 build; verify rough opening dimensions' },
            roiEstimate: { estimatedValueIncrease: 10000, recoveryPercentage: 154, roiMessage: 'Grand entry upgrades deliver exceptional ROI on large Kingwood homes where first impressions set buyer expectations.', source: 'Remodeling Magazine 2025 Cost vs. Value — West South-Central Region' }
          },

          'All': {
            tiers: {
              'Budget-Friendly': { cost: 28000, range: { min: 23000, max: 35000 } },
              'Mid-Range':       { cost: 62000, range: { min: 52000, max: 76000 } },
              'Premium':         { cost: 110000, range: { min: 90000, max: 135000 } },
              'Luxury':          { cost: 175000, range: { min: 145000, max: 215000 } }
            },
            lineItems: [
              {
                item:        'Full Exterior Repaint',
                description: 'All exterior walls, trim, shutters, and garage door repaint',
                costBasis:   'Kingwood mid-range: $8,800–$12,800',
                roiRecovery: 55,
                formula: { nationalAvgCost: 8000, tierMultiplier: 1.00, locationMultiplier: 0.85 }
              },
              {
                item:        'Landscaping & Sod',
                description: 'Lawn restoration, native plantings, irrigation repair',
                costBasis:   'Kingwood mid-range: $7,500–$11,500',
                roiRecovery: 100,
                formula: { nationalAvgCost: 7000, tierMultiplier: 1.00, locationMultiplier: 0.85 }
              },
              {
                item:        'Grand Entry & Lighting',
                description: 'Double fiberglass door, coach lights, smart lock, updated hardware',
                costBasis:   'Kingwood mid-range: $5,400–$8,200',
                roiRecovery: 150,
                formula: { nationalAvgCost: 5000, tierMultiplier: 1.00, locationMultiplier: 0.85 }
              },
              {
                item:        'Driveway & Walkway',
                description: 'Concrete driveway replacement and pathway resurfacing',
                costBasis:   'Kingwood mid-range: $6,500–$9,800',
                roiRecovery: 70,
                formula: { nationalAvgCost: 6000, tierMultiplier: 1.00, locationMultiplier: 0.85 }
              },
              {
                item:        'Covered Patio Installation',
                description: 'Large outdoor living area with pergola or patio cover',
                costBasis:   'Kingwood mid-range: $10,000–$15,000',
                roiRecovery: 88,
                formula: { nationalAvgCost: 9000, tierMultiplier: 1.00, locationMultiplier: 0.85 }
              }
            ],
            contingency: { percentage: 15, reason: 'Multi-trade full exterior scope; drainage engineering required; flood zone considerations' },
            roiEstimate: { estimatedValueIncrease: 50000, recoveryPercentage: 81, roiMessage: 'A complete exterior renovation on a large Kingwood home dramatically boosts market value and reduces time-on-market.', source: 'Remodeling Magazine 2025 Cost vs. Value — West South-Central Region · NAR 2025' }
          }
        },

        defaultFocusArea: 'Repaint only'
      },

      // ── KITCHEN ──────────────────────────────────────────────────────────
      // Kingwood large kitchen (4,906 sqft home = ~400–500 sqft kitchen estimate)
      // Houston Builders TX 2025: "Lake Houston/Kingwood homes typically feature kitchens in medium to extensive range"
      // Complete kitchen: $45,000–$75,000 for Kingwood (Houston Builders TX 2025)
      Kitchen: {
        tiers: {
          'Budget-Friendly': { cost: 25000, range: { min: 20000, max: 32000 } },
          'Mid-Range':       { cost: 52000, range: { min: 44000, max: 64000 } },
          'Premium':         { cost: 90000, range: { min: 76000, max: 110000 } },
          'Luxury':          { cost: 145000, range: { min: 120000, max: 175000 } }
        },
        lineItems: [
          {
            item:        'Cabinets & Hardware',
            description: 'Semi-custom cabinetry replacement for large open-concept Kingwood kitchen',
            costBasis:   'Kingwood/Houston: Semi-custom $12K–$20K | Custom $22K–$45K installed (large kitchen)',
            roiRecovery: 67,
            formula: { nationalAvgCost: 14000, tierMultiplier: 1.00, locationMultiplier: 0.85 }
          },
          {
            item:        'Countertops (Quartz or Granite)',
            description: 'Quartz or granite countertops; large kitchen = ~80–120 sqft of counter surface',
            costBasis:   'Kingwood: Quartz $40–$80/sqft | Granite $35–$75/sqft installed',
            roiRecovery: 72,
            formula: { nationalAvgCost: 8000, tierMultiplier: 1.00, locationMultiplier: 0.85 }
          },
          {
            item:        'Appliance Package',
            description: 'Full appliance suite for large kitchen: refrigerator, double oven, dishwasher, microwave',
            costBasis:   'Kingwood mid-range: $8,000–$14,000 for complete appliance package with install',
            roiRecovery: 60,
            formula: { nationalAvgCost: 9000, tierMultiplier: 1.00, locationMultiplier: 0.85 }
          },
          {
            item:        'Flooring & Backsplash',
            description: 'Tile or LVP flooring and tile backsplash for large kitchen area',
            costBasis:   'Kingwood: Tile $5–$12/sqft installed | LVP $3–$8/sqft; large area increases total',
            roiRecovery: 70,
            formula: { nationalAvgCost: 6000, tierMultiplier: 1.00, locationMultiplier: 0.85 }
          },
          {
            item:        'Lighting & Electrical',
            description: 'Recessed lights, island pendants, undercabinet LED; panel upgrade if 1990 original',
            costBasis:   'Kingwood electrician $65–$95/hr; full kitchen lighting package $2,800–$6,000',
            roiRecovery: 65,
            formula: { nationalAvgCost: 3000, tierMultiplier: 1.00, locationMultiplier: 0.85 }
          }
        ],
        contingency: { percentage: 12, reason: 'Electrical panel upgrade likely needed on 1990 home; plumbing rough-in may need code update' },
        roiEstimate: { estimatedValueIncrease: 38000, recoveryPercentage: 73, roiMessage: 'A mid-range kitchen remodel on a large Kingwood home returns 70–75%, strongly influenced by buyer expectations in this price tier.', source: 'Houston Builders Texas (2025) · Remodeling Magazine 2025 Cost vs. Value — West South-Central Region' }
      },

      // ── BATHROOM ─────────────────────────────────────────────────────────
      // Kingwood bathroom: HomeAdvisor average $11,960 typical ($6,166–$29,000 range)
      // 5 bathrooms — costs below are per bathroom
      Bathroom: {
        tiers: {
          'Budget-Friendly': { cost: 7500,  range: { min: 6000,  max: 9500  } },
          'Mid-Range':       { cost: 14500, range: { min: 12000, max: 18000 } },
          'Premium':         { cost: 25000, range: { min: 21000, max: 31000 } },
          'Luxury':          { cost: 42000, range: { min: 35000, max: 52000 } }
        },
        lineItems: [
          {
            item:        'Vanity, Sink & Mirror',
            description: 'Replace vanity cabinet, countertop, undermount sink, faucet, and mirror',
            costBasis:   'Kingwood: Stock vanity $400–$900 | Semi-custom $1,000–$3,000 | Custom $4,000–$9,000 installed',
            roiRecovery: 65,
            formula: { nationalAvgCost: 3500, tierMultiplier: 1.00, locationMultiplier: 0.85 }
          },
          {
            item:        'Shower / Tub Renovation',
            description: 'Tile shower rebuild or tub replacement; frameless glass enclosure (premium)',
            costBasis:   'Kingwood: Tile shower $6,500–$12,000 | Custom frameless $12,000–$22,000 installed',
            roiRecovery: 68,
            formula: { nationalAvgCost: 8500, tierMultiplier: 1.00, locationMultiplier: 0.85 }
          },
          {
            item:        'Floor & Wall Tile',
            description: 'Porcelain floor and wall tile with waterproofing; Kingwood labor below national avg',
            costBasis:   'Kingwood: Tile install $7–$16/sqft labor + $2–$12/sqft material (porcelain)',
            roiRecovery: 62,
            formula: { nationalAvgCost: 3800, tierMultiplier: 1.00, locationMultiplier: 0.85 }
          },
          {
            item:        'Toilet, Fixtures & Lighting',
            description: 'Comfort-height toilet, new faucets, towel bars, exhaust fan, and vanity lighting',
            costBasis:   'Kingwood: Toilet $300–$1,200 installed | LED vanity light $180–$600 | Fan $250–$600',
            roiRecovery: 60,
            formula: { nationalAvgCost: 2200, tierMultiplier: 1.00, locationMultiplier: 0.85 }
          }
        ],
        contingency: { percentage: 12, reason: '1990 build: galvanized pipes and outdated valves common; Houston area code may require GFCIs and vent upgrades' },
        roiEstimate: { estimatedValueIncrease: 11000, recoveryPercentage: 76, roiMessage: 'Bathroom remodels return 74–80% in Kingwood — with 5 bathrooms, updating primary and guest baths maximizes overall value.', source: 'HomeAdvisor Kingwood TX · Remodeling Magazine 2025 Cost vs. Value — West South-Central Region' }
      },

      // ── LIVING ROOM ──────────────────────────────────────────────────────
      // 4,906 sqft home = large living areas (~500+ sqft living room)
      'Living Room': {
        tiers: {
          'Budget-Friendly': { cost: 6000,  range: { min: 5000,  max: 8000  } },
          'Mid-Range':       { cost: 15000, range: { min: 12500, max: 18500 } },
          'Premium':         { cost: 27000, range: { min: 22000, max: 33000 } },
          'Luxury':          { cost: 46000, range: { min: 38000, max: 56000 } }
        },
        lineItems: [
          {
            item:        'Hardwood / LVP Flooring',
            description: 'Large living area (~500 sqft); engineered hardwood or LVP replacement',
            costBasis:   'Kingwood: Engineered hardwood $4–$10/sqft installed | LVP $3–$8/sqft',
            roiRecovery: 72,
            formula: { nationalAvgCost: 7000, tierMultiplier: 1.00, locationMultiplier: 0.85 }
          },
          {
            item:        'Paint, Trim & Crown Molding',
            description: 'Repaint large living area, new baseboards, crown molding throughout',
            costBasis:   'Kingwood: $350–$700/room repaint | Crown molding $6–$14/lf installed',
            roiRecovery: 65,
            formula: { nationalAvgCost: 3000, tierMultiplier: 1.00, locationMultiplier: 0.85 }
          },
          {
            item:        'Fireplace Update',
            description: 'Update fireplace surround, mantel, and consider gas log conversion',
            costBasis:   'Kingwood: Mantel + surround $1,500–$4,500 | Gas conversion $2,800–$6,000',
            roiRecovery: 65,
            formula: { nationalAvgCost: 5500, tierMultiplier: 1.00, locationMultiplier: 0.85 }
          },
          {
            item:        'Lighting Upgrade',
            description: 'Recessed lighting, chandelier, and dimmer controls for large open-plan space',
            costBasis:   'Kingwood: $65–$95/hr electrician; full package $2,200–$5,000 for large room',
            roiRecovery: 60,
            formula: { nationalAvgCost: 3500, tierMultiplier: 1.00, locationMultiplier: 0.85 }
          }
        ],
        contingency: { percentage: 10, reason: 'Large room scope may require additional electrical circuits; permit needed for wiring work' },
        roiEstimate: { estimatedValueIncrease: 11000, recoveryPercentage: 73, roiMessage: 'Living room updates return 70–75% in Kingwood — flooring and fireplace upgrades are the top buyer priorities.', source: 'NAR 2025 Remodeling Impact Report' }
      },

      // ── BEDROOM ──────────────────────────────────────────────────────────
      // Large home: master suite ~400 sqft; guest bedrooms ~250 sqft each
      Bedroom: {
        tiers: {
          'Budget-Friendly': { cost: 4500,  range: { min: 3600,  max: 6000  } },
          'Mid-Range':       { cost: 11000, range: { min: 9000,  max: 14000 } },
          'Premium':         { cost: 20000, range: { min: 17000, max: 25000 } },
          'Luxury':          { cost: 34000, range: { min: 28000, max: 42000 } }
        },
        lineItems: [
          {
            item:        'Flooring Replacement',
            description: 'Remove carpet; install LVP or engineered hardwood in master suite or guest room',
            costBasis:   'Kingwood: LVP $3–$8/sqft | Engineered hardwood $4–$10/sqft installed',
            roiRecovery: 70,
            formula: { nationalAvgCost: 4500, tierMultiplier: 1.00, locationMultiplier: 0.85 }
          },
          {
            item:        'Paint & Trim',
            description: 'Repaint walls and ceiling, new baseboards and door casings',
            costBasis:   'Kingwood: $300–$600/room repaint | Baseboard/trim $6–$12/lf installed',
            roiRecovery: 65,
            formula: { nationalAvgCost: 1800, tierMultiplier: 1.00, locationMultiplier: 0.85 }
          },
          {
            item:        'Walk-In Closet System',
            description: 'Large home warrants custom or modular walk-in closet for master suite',
            costBasis:   'Kingwood: Modular walk-in $1,500–$4,500 | Custom built-in $5,000–$14,000 installed',
            roiRecovery: 60,
            formula: { nationalAvgCost: 4000, tierMultiplier: 1.00, locationMultiplier: 0.85 }
          }
        ],
        contingency: { percentage: 10, reason: 'Minor permit may be needed for electrical work; flooring removal may reveal subfloor issues in 1990 build' },
        roiEstimate: { estimatedValueIncrease: 8000, recoveryPercentage: 73, roiMessage: 'Bedroom updates return 70–75% in Kingwood — master suite upgrades with walk-in closets are especially valued at this price tier.', source: 'NAR 2025 Remodeling Impact Report' }
      }
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if this propertyId has hardcoded cost data.
 */
const hasHardcodedCosts = (propertyId) =>
  Object.prototype.hasOwnProperty.call(PROPERTY_COSTS, propertyId?.toString());

/**
 * Returns the full hardcoded cost config for a property, or null.
 */
const getPropertyCostConfig = (propertyId) =>
  PROPERTY_COSTS[propertyId?.toString()] ?? null;

/**
 * Build a costAnalysis object in the exact shape expected by the frontend CostDisplay
 * and stored in renovationRequestModel.costAnalysis.
 *
 * @param {string} propertyId
 * @param {object} renovationData  { primaryArea, budgetTier, exteriorFocusAreas?, ... }
 * @returns {object|null}  costAnalysis or null if not found
 */
const buildHardcodedCostAnalysis = (propertyId, renovationData) => {
  const config = getPropertyCostConfig(propertyId);
  if (!config) return null;

  const { primaryArea, budgetTier } = renovationData;
  const areaConfig = config.areas[primaryArea];
  if (!areaConfig) return null;

  const tier = budgetTier || 'Mid-Range';

  // For Exterior: pick the right focusArea sub-config
  let tierData, lineItems, contingency, roiEstimate;

  if (primaryArea === 'Exterior') {
    const focusKey = renovationData.exteriorFocusAreas || areaConfig.defaultFocusArea;
    const focusConfig = areaConfig.focusAreas[focusKey] || areaConfig.focusAreas[areaConfig.defaultFocusArea];

    tierData    = focusConfig.tiers[tier];
    lineItems   = (focusConfig.lineItems || []).map(item => ({
      ...item,
      cost: applyTier(
        item.formula?.nationalAvgCost || item.cost || 1000,
        {
          'Budget-Friendly': 0.60,
          'Mid-Range':       1.00,
          'Premium':         1.55,
          'Luxury':          2.30
        },
        tier
      )
    }));
    contingency = focusConfig.contingency;
    roiEstimate = focusConfig.roiEstimate;
  } else {
    tierData    = areaConfig.tiers[tier];
    lineItems   = (areaConfig.lineItems || []).map(item => ({
      ...item,
      cost: applyTier(
        item.formula?.nationalAvgCost || 1000,
        {
          'Budget-Friendly': 0.55,
          'Mid-Range':       1.00,
          'Premium':         1.70,
          'Luxury':          2.80
        },
        tier
      )
    }));
    contingency = areaConfig.contingency;
    roiEstimate = areaConfig.roiEstimate;
  }

  if (!tierData) return null;

  const contingencyAmount = Math.round(tierData.cost * (contingency.percentage / 100));
  const finalCost         = tierData.cost + contingencyAmount;

  return {
    finalCost,
    costRange: {
      min: Math.round(tierData.range.min * 1.00),
      max: Math.round(tierData.range.max * 1.12)   // +contingency buffer on max
    },
    lineItems,
    contingency: {
      percentage: contingency.percentage,
      amount:     contingencyAmount,
      reason:     contingency.reason
    },
    breakdown: {
      primaryWork:   primaryArea,
      focusArea:     renovationData.exteriorFocusAreas || primaryArea,
      tier,
      location:      `${config.meta.city}, ${config.meta.state}`,
      subtotal:      tierData.cost
    },
    marketContext: {
      state:          config.meta.state,
      city:           config.meta.city,
      regionalFactor: config.meta.regionalFactor,
      message:        config.meta.regionalFactor > 1.2
        ? `${config.meta.city} has above-average renovation costs. Your budget accounts for this premium market.`
        : `${config.meta.city} offers below-average renovation costs — your budget goes further here than in most US cities.`,
      dataSource:     config.meta.dataSource
    },
    roiEstimate: {
      estimatedValueIncrease: roiEstimate.estimatedValueIncrease,
      recoveryPercentage:     roiEstimate.recoveryPercentage,
      roiMessage:             roiEstimate.roiMessage,
      source:                 roiEstimate.source
    }
  };
};

module.exports = {
  OAKLAND_PROPERTY_ID,
  KINGWOOD_PROPERTY_ID,
  hasHardcodedCosts,
  getPropertyCostConfig,
  buildHardcodedCostAnalysis
};
