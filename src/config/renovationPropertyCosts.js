/**
 * renovationPropertyCosts.js
 *
 * Hardcoded, hand-verified renovation costs for specific Vihara properties,
 * keyed by MongoDB propertyId string.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SINGLE SOURCE OF TRUTH: line items.
 * ─────────────────────────────────────────────────────────────────────────────
 * Each line item carries an explicit dollar cost for all four budget tiers.
 * Nothing else is hardcoded. Subtotal, contingency, final cost, cost range and
 * ROI are all DERIVED from the line items at build time. This makes it
 * impossible for the on-screen breakdown to disagree with its own total — the
 * class of bug that plagued the previous version, where a separately hardcoded
 * `tiers.cost` drifted away from the sum of its line items.
 *
 * Public API is unchanged, so renovationController.js requires this file
 * exactly as before:
 *   hasHardcodedCosts(propertyId)              -> boolean
 *   getPropertyCostConfig(propertyId)          -> config | null
 *   buildHardcodedCostAnalysis(id, renoData)   -> costAnalysis | null
 *
 * ─── EXTERIOR: two independent choices ───────────────────────────────────────
 * The exterior form collects TWO fields, and both are now priced and merged:
 *   architecturalElements  (Repaint only | Update roof/siding | New windows | New entrance)
 *   exteriorFocusAreas     (Front entrance | Landscaping | Driveway | Patio | All)
 * A repaint PLUS new landscaping genuinely costs more than either alone, so the
 * two line-item sets are merged (deduped by item name, element wins on clash).
 *
 * ─── DISTRESSED-PROPERTY RISK ────────────────────────────────────────────────
 * These are REO / auction properties that cannot be deeply inspected before
 * bidding. Hidden conditions (foundation, wiring, plumbing, mold) skew costs
 * upward, so the displayed range is deliberately asymmetric: the top end is
 * widened well beyond the bottom. The estimate is a starting point to verify
 * with a contractor, never a quote.
 */

// ── Budget-tier vocabulary ───────────────────────────────────────────────────
const BUDGET_TIERS = ['Budget-Friendly', 'Mid-Range', 'Premium', 'Luxury'];
const DEFAULT_TIER = 'Mid-Range';

// Distressed-property range spread applied to the derived final cost.
// Asymmetric on purpose: −12% floor, +35% ceiling for surprise-heavy REO work.
const RANGE_SPREAD = { min: 0.88, max: 1.35 };

const round = (n) => Math.round(n);

const resolveTier = (tier) => (BUDGET_TIERS.includes(tier) ? tier : DEFAULT_TIER);

/**
 * Cost-weighted average of a per-line-item percentage. Weighting by cost keeps
 * a blended ROI honest: a $19k roof at 68% must outweigh a $1k fixture at 120%.
 */
const weightedAverage = (items, valueKey, weightKey) => {
  const totalWeight = items.reduce((s, i) => s + i[weightKey], 0);
  if (totalWeight <= 0) return 0;
  return items.reduce((s, i) => s + i[valueKey] * i[weightKey], 0) / totalWeight;
};

// ── PROPERTY IDs ──────────────────────────────────────────────────────────────
const OAKLAND_PROPERTY_ID  = '69cf9ec217e006f5c4437c62'; // 1496 Adeline St, Oakland CA 94607
const KINGWOOD_PROPERTY_ID = '695236a4acad197a54f80e95'; // 1703 Brookside Pine Ln, Kingwood TX 77345


// ─────────────────────────────────────────────────────────────────────────────
//  PROPERTY COST DATA — line items are the single source of truth
//  Every tier amount below was derived from your original researched figures
//  (nationalAvgCost x tierMultiplier x regionalFactor). Edit these to update.
// ─────────────────────────────────────────────────────────────────────────────
const PROPERTY_COSTS = {
  [OAKLAND_PROPERTY_ID]: {
    "meta": {
      "address": "1496 Adeline St, Oakland, CA 94607",
      "city": "Oakland",
      "state": "California",
      "squareFootage": 1300,
      "bedrooms": 3,
      "bathrooms": 2.5,
      "yearBuilt": 1996,
      "regionalFactor": 1.5,
      "dataSource": "Project Cost Atlas Oakland CA (Dec 2025) · Remodeling Magazine 2025 Cost vs. Value Report (Pacific Region)"
    },
    "areas": {
      "Exterior": {
        "defaultElement": "Repaint only",
        "defaultFocusArea": "Front entrance",
        "architecturalElements": {
          "Repaint only": {
            "lineItems": [
              {
                "item": "Surface Preparation & Power Washing",
                "description": "Pressure washing, scraping, caulking, and priming exterior surfaces",
                "costBasis": "~$800–$1,200 for a 1,300 sqft townhome in Oakland",
                "roiRecovery": 55,
                "tiers": {
                  "Budget-Friendly": 855,
                  "Mid-Range": 1425,
                  "Premium": 2209,
                  "Luxury": 3278
                }
              },
              {
                "item": "Exterior Paint (Walls, Trim & Shutters)",
                "description": "Two-coat application with premium exterior paint on all wall surfaces and trim",
                "costBasis": "$1.75–$4.50/sqft labor + materials in Oakland (25–30% above national avg)",
                "roiRecovery": 60,
                "tiers": {
                  "Budget-Friendly": 3420,
                  "Mid-Range": 5700,
                  "Premium": 8835,
                  "Luxury": 13110
                }
              },
              {
                "item": "Front Door Repaint & Hardware",
                "description": "Strip, prime, and repaint front door with updated exterior hardware",
                "costBasis": "Door repaint: $350–$600 | Hardware: $150–$400 in Oakland market",
                "roiRecovery": 70,
                "tiers": {
                  "Budget-Friendly": 450,
                  "Mid-Range": 750,
                  "Premium": 1163,
                  "Luxury": 1725
                }
              }
            ],
            "contingency": {
              "percentage": 12,
              "reason": "Lead paint testing/remediation risk on 1996 build; permit required for Oakland exterior work"
            },
            "roiNote": {
              "message": "Fresh exterior paint is the highest-visual-impact, lowest-cost upgrade for a West Oakland townhome.",
              "source": "NAR 2025 Remodeling Impact Report"
            }
          },
          "Update roof/siding": {
            "lineItems": [
              {
                "item": "Siding Removal & Disposal",
                "description": "Full tear-off of existing siding, inspection for moisture damage, proper disposal",
                "costBasis": "Demo/haul-away: $1,500–$2,500 in Oakland (union labor rates apply)",
                "roiRecovery": 76,
                "tiers": {
                  "Budget-Friendly": 1620,
                  "Mid-Range": 2700,
                  "Premium": 4185,
                  "Luxury": 6210
                }
              },
              {
                "item": "New Siding Installation",
                "description": "Fiber cement siding (James Hardie preferred in Bay Area for moisture resistance)",
                "costBasis": "Fiber cement: $10–$18/sqft installed in Oakland (vs $7–$12 national avg)",
                "roiRecovery": 76,
                "tiers": {
                  "Budget-Friendly": 12600,
                  "Mid-Range": 21000,
                  "Premium": 32550,
                  "Luxury": 48300
                }
              },
              {
                "item": "Trim, Flashing & Moisture Barrier",
                "description": "Install weather-resistant barrier, new trim boards, and window/door flashing",
                "costBasis": "Critical for Bay Area fog/moisture; $2,000–$4,500 for this property size",
                "roiRecovery": 70,
                "tiers": {
                  "Budget-Friendly": 2520,
                  "Mid-Range": 4200,
                  "Premium": 6510,
                  "Luxury": 9660
                }
              }
            ],
            "contingency": {
              "percentage": 15,
              "reason": "Hidden moisture damage is common in 1996 Bay Area builds; asbestos testing may be required"
            },
            "roiNote": {
              "message": "Fiber cement siding consistently ranks in the top 5 ROI projects in the Pacific region.",
              "source": "Remodeling Magazine 2025 Cost vs. Value — Pacific Region"
            }
          },
          "New windows": {
            "lineItems": [
              {
                "item": "Window Removal & Disposal",
                "description": "Removal of 8–10 existing windows (estimated for 1,300 sqft townhome)",
                "costBasis": "$100–$200 per window removal in Oakland",
                "roiRecovery": 69,
                "tiers": {
                  "Budget-Friendly": 1080,
                  "Mid-Range": 1800,
                  "Premium": 2790,
                  "Luxury": 4140
                }
              },
              {
                "item": "New Window Units (8–10 windows)",
                "description": "Vinyl double-pane (budget) to fiberglass triple-pane (premium); Energy Star rated",
                "costBasis": "Oakland: $900–$1,800/window vinyl | $1,800–$3,500/window fiberglass installed",
                "roiRecovery": 69,
                "tiers": {
                  "Budget-Friendly": 12600,
                  "Mid-Range": 21000,
                  "Premium": 32550,
                  "Luxury": 48300
                }
              },
              {
                "item": "Exterior Trim & Caulking",
                "description": "New exterior trim, weather-seal caulking, and touch-up painting around all windows",
                "costBasis": "$200–$500 per window for trim and finishing in the Bay Area",
                "roiRecovery": 65,
                "tiers": {
                  "Budget-Friendly": 2250,
                  "Mid-Range": 3750,
                  "Premium": 5813,
                  "Luxury": 8625
                }
              }
            ],
            "contingency": {
              "percentage": 12,
              "reason": "Oakland building permit required; lead paint disturb testing on 1996 build"
            },
            "roiNote": {
              "message": "Energy-efficient windows are highly valued by Bay Area buyers and reduce utility costs significantly.",
              "source": "Remodeling Magazine 2025 Cost vs. Value — Pacific Region"
            }
          },
          "New entrance": {
            "lineItems": [
              {
                "item": "New Entry Door (Steel or Fiberglass)",
                "description": "Pre-hung steel or fiberglass door with weather-stripping, deadbolt, and finish hardware",
                "costBasis": "Steel door installed Oakland: $1,500–$3,000 | Fiberglass: $3,000–$7,000",
                "roiRecovery": 188,
                "tiers": {
                  "Budget-Friendly": 2120,
                  "Mid-Range": 3533,
                  "Premium": 5475,
                  "Luxury": 8125
                }
              },
              {
                "item": "Pathway & Porch Update",
                "description": "Repair or replace pathway pavers/concrete and porch lighting upgrade",
                "costBasis": "$800–$2,500 for pathway + $300–$700 for new porch fixtures in Oakland",
                "roiRecovery": 120,
                "tiers": {
                  "Budget-Friendly": 1350,
                  "Mid-Range": 2250,
                  "Premium": 3488,
                  "Luxury": 5175
                }
              }
            ],
            "contingency": {
              "percentage": 10,
              "reason": "Minor permit may be required for structural door frame modifications"
            },
            "roiNote": {
              "message": "Front door replacement delivers the highest ROI of any single exterior project per Remodeling Magazine 2025.",
              "source": "Remodeling Magazine 2025 Cost vs. Value Report"
            }
          }
        },
        "focusAreas": {
          "Front entrance": {
            "lineItems": [
              {
                "item": "New Entry Door & Hardware",
                "description": "Replace entry door, add smart lock, new exterior hardware set",
                "costBasis": "Steel door + install Oakland: $2,000–$3,500 | Fiberglass: $3,500–$7,500",
                "roiRecovery": 150,
                "tiers": {
                  "Budget-Friendly": 2120,
                  "Mid-Range": 3533,
                  "Premium": 5475,
                  "Luxury": 8125
                }
              },
              {
                "item": "Porch Lighting & Address Numbers",
                "description": "New porch light fixture, pathway lights, and updated address numbers",
                "costBasis": "$400–$900 in Oakland for fixtures and electrician time",
                "roiRecovery": 120,
                "tiers": {
                  "Budget-Friendly": 450,
                  "Mid-Range": 750,
                  "Premium": 1163,
                  "Luxury": 1725
                }
              },
              {
                "item": "Pathway & Porch Tile/Pavers",
                "description": "New pathway surface from sidewalk to door; porch tile or stone overlay",
                "costBasis": "$1,500–$4,500 for pathway and porch area in Oakland",
                "roiRecovery": 120,
                "tiers": {
                  "Budget-Friendly": 2250,
                  "Mid-Range": 3750,
                  "Premium": 5813,
                  "Luxury": 8625
                }
              }
            ],
            "contingency": {
              "percentage": 10,
              "reason": "Minor Oakland building permit may be required for structural modifications"
            },
            "roiNote": {
              "message": "Front entrance upgrades deliver outsized ROI in the competitive Oakland resale market.",
              "source": "Remodeling Magazine 2025 Cost vs. Value — Pacific Region"
            }
          },
          "Landscaping": {
            "lineItems": [
              {
                "item": "Lawn & Ground Cover",
                "description": "Sod or drought-resistant ground cover (California water restrictions apply)",
                "costBasis": "Drought-tolerant sod Oakland: $0.50–$1.20/sqft installed; ~400 sqft front yard estimate",
                "roiRecovery": 100,
                "tiers": {
                  "Budget-Friendly": 1980,
                  "Mid-Range": 3300,
                  "Premium": 5115,
                  "Luxury": 7590
                }
              },
              {
                "item": "Shrubs, Plants & Mulch",
                "description": "Native California plants preferred (drought resistant, lower water bill)",
                "costBasis": "$35–$180 per shrub; 8–12 plants typical for West Oakland townhome lot",
                "roiRecovery": 100,
                "tiers": {
                  "Budget-Friendly": 1620,
                  "Mid-Range": 2700,
                  "Premium": 4185,
                  "Luxury": 6210
                }
              },
              {
                "item": "Edging, Cleanup & Bark Mulch",
                "description": "Define planting beds, install edging, 3-inch bark mulch layer for moisture retention",
                "costBasis": "$600–$1,200 for labor and materials at this property size",
                "roiRecovery": 90,
                "tiers": {
                  "Budget-Friendly": 630,
                  "Mid-Range": 1050,
                  "Premium": 1628,
                  "Luxury": 2415
                }
              }
            ],
            "contingency": {
              "percentage": 10,
              "reason": "Soil quality varies in West Oakland; irrigation cost may vary"
            },
            "roiNote": {
              "message": "Professional landscaping recovers 100% of cost on average in the Oakland market.",
              "source": "NAR 2025 Remodeling Impact Report"
            }
          },
          "Driveway": {
            "lineItems": [
              {
                "item": "Driveway Demo & Grading",
                "description": "Remove existing driveway surface, regrade base, compact subbase",
                "costBasis": "$1,200–$2,200 for demo and prep of typical townhome driveway in Oakland",
                "roiRecovery": 70,
                "tiers": {
                  "Budget-Friendly": 1260,
                  "Mid-Range": 2100,
                  "Premium": 3255,
                  "Luxury": 4830
                }
              },
              {
                "item": "New Driveway Surface",
                "description": "Concrete (standard) to decorative pavers (premium); includes edging and sealer",
                "costBasis": "Concrete Oakland: $8–$14/sqft | Pavers: $18–$35/sqft installed",
                "roiRecovery": 70,
                "tiers": {
                  "Budget-Friendly": 3150,
                  "Mid-Range": 5250,
                  "Premium": 8138,
                  "Luxury": 12075
                }
              }
            ],
            "contingency": {
              "percentage": 12,
              "reason": "Oakland permit required for driveway work; access constraints may add cost"
            },
            "roiNote": {
              "message": "Driveway condition is a top factor in buyer first impressions in competitive Oakland market.",
              "source": "HomeAdvisor True Cost Guide 2025"
            }
          },
          "Patio": {
            "lineItems": [
              {
                "item": "Patio Demo & Base Prep",
                "description": "Remove existing surface, excavate and compact gravel base",
                "costBasis": "$800–$1,500 for a ~200 sqft townhome patio in Oakland",
                "roiRecovery": 80,
                "tiers": {
                  "Budget-Friendly": 810,
                  "Mid-Range": 1350,
                  "Premium": 2093,
                  "Luxury": 3105
                }
              },
              {
                "item": "Patio Surface & Finishing",
                "description": "Concrete, stamped concrete, or natural stone pavers with sealer and edging",
                "costBasis": "Concrete patio Oakland: $9–$15/sqft | Pavers: $18–$40/sqft installed",
                "roiRecovery": 80,
                "tiers": {
                  "Budget-Friendly": 5400,
                  "Mid-Range": 9000,
                  "Premium": 13950,
                  "Luxury": 20700
                }
              }
            ],
            "contingency": {
              "percentage": 12,
              "reason": "Drainage engineering may be required; Oakland permit needed"
            },
            "roiNote": {
              "message": "Outdoor living spaces command a premium in the Bay Area where mild climate makes patios year-round usable.",
              "source": "NAR 2025 Remodeling Impact Report"
            }
          },
          "All": {
            "lineItems": [
              {
                "item": "Complete Exterior Paint",
                "description": "Full repaint of all exterior surfaces with premium paint",
                "costBasis": "Oakland mid-range exterior paint: $6,500–$9,000",
                "roiRecovery": 60,
                "tiers": {
                  "Budget-Friendly": 4500,
                  "Mid-Range": 7500,
                  "Premium": 11625,
                  "Luxury": 17250
                }
              },
              {
                "item": "Landscaping & Curb Appeal",
                "description": "Lawn, plants, mulch, edging, and pathway improvements",
                "costBasis": "Oakland mid-range landscaping: $5,500–$8,000",
                "roiRecovery": 100,
                "tiers": {
                  "Budget-Friendly": 3600,
                  "Mid-Range": 6000,
                  "Premium": 9300,
                  "Luxury": 13800
                }
              },
              {
                "item": "New Entry Door & Porch",
                "description": "New fiberglass door, hardware, porch lighting, and pathway",
                "costBasis": "Oakland mid-range entrance: $7,000–$10,000",
                "roiRecovery": 150,
                "tiers": {
                  "Budget-Friendly": 4950,
                  "Mid-Range": 8250,
                  "Premium": 12788,
                  "Luxury": 18975
                }
              },
              {
                "item": "Siding & Trim Update",
                "description": "Fiber cement siding sections with new trim boards and flashing",
                "costBasis": "Oakland mid-range partial siding: $15,000–$22,000",
                "roiRecovery": 80,
                "tiers": {
                  "Budget-Friendly": 10800,
                  "Mid-Range": 18000,
                  "Premium": 27900,
                  "Luxury": 41400
                }
              }
            ],
            "contingency": {
              "percentage": 15,
              "reason": "Multi-trade coordination; Oakland permit required for full exterior scope; lead paint testing on 1996 build"
            },
            "roiNote": {
              "message": "Complete exterior renovation averages 81% cost recovery and significantly reduces time-on-market in Oakland.",
              "source": "Remodeling Magazine 2025 Cost vs. Value — Pacific Region · NAR 2025"
            }
          }
        }
      },
      "Kitchen": {
        "lineItems": [
          {
            "item": "Cabinets & Hardware",
            "description": "Semi-custom cabinet replacement with soft-close hardware; Oakland labor premium applies",
            "costBasis": "Oakland: Semi-custom cabinets $15K–$22K | Custom: $28K–$55K installed",
            "roiRecovery": 67,
            "tiers": {
              "Budget-Friendly": 11550,
              "Mid-Range": 21000,
              "Premium": 35700,
              "Luxury": 58800
            }
          },
          {
            "item": "Countertops (Quartz)",
            "description": "Quartz countertop fabrication and installation; ~30 sqft for this kitchen size",
            "costBasis": "Oakland: Quartz $65–$120/sqft installed ($1,950–$3,600 for ~30 sqft)",
            "roiRecovery": 72,
            "tiers": {
              "Budget-Friendly": 4538,
              "Mid-Range": 8250,
              "Premium": 14025,
              "Luxury": 23100
            }
          },
          {
            "item": "Appliance Package",
            "description": "Mid-range: refrigerator, range, dishwasher, microwave (stainless steel)",
            "costBasis": "Oakland mid-range appliance package: $7,500–$13,000 with delivery/install",
            "roiRecovery": 60,
            "tiers": {
              "Budget-Friendly": 6600,
              "Mid-Range": 12000,
              "Premium": 20400,
              "Luxury": 33600
            }
          },
          {
            "item": "Flooring & Backsplash",
            "description": "LVP flooring replacement and tile backsplash installation",
            "costBasis": "Oakland: LVP $4–$11/sqft installed | Tile backsplash $25–$50/sqft labor+material",
            "roiRecovery": 70,
            "tiers": {
              "Budget-Friendly": 3465,
              "Mid-Range": 6300,
              "Premium": 10710,
              "Luxury": 17640
            }
          },
          {
            "item": "Lighting & Electrical",
            "description": "Recessed lights, pendant lighting, undercabinet LED, panel upgrade if needed",
            "costBasis": "Oakland electrician rate: $85–$130/hr; total lighting package $2,500–$5,000",
            "roiRecovery": 65,
            "tiers": {
              "Budget-Friendly": 1815,
              "Mid-Range": 3300,
              "Premium": 5610,
              "Luxury": 9240
            }
          }
        ],
        "contingency": {
          "percentage": 12,
          "reason": "Plumbing and electrical upgrades often required in 1996 Oakland homes; permit required"
        },
        "roiNote": {
          "message": "A mid-range kitchen remodel returns 70–80% in Oakland — one of the top interior ROI projects in the Bay Area.",
          "source": "Project Cost Atlas Oakland CA (Dec 2025) · Remodeling Magazine 2025 Cost vs. Value — Pacific Region"
        }
      },
      "Bathroom": {
        "lineItems": [
          {
            "item": "Vanity, Sink & Mirror",
            "description": "Vanity cabinet replacement, new countertop, undermount sink, faucet, and framed mirror",
            "costBasis": "Oakland: Semi-custom vanity $1,200–$3,500 | Custom: $4,500–$12,000 installed",
            "roiRecovery": 65,
            "tiers": {
              "Budget-Friendly": 2888,
              "Mid-Range": 5250,
              "Premium": 8925,
              "Luxury": 14700
            }
          },
          {
            "item": "Shower / Tub Renovation",
            "description": "Tile shower rebuild or tub replacement with new fixtures and glass enclosure",
            "costBasis": "Oakland: Tile shower $9,000–$16,000 | Custom frameless glass: $16,000–$28,000",
            "roiRecovery": 68,
            "tiers": {
              "Budget-Friendly": 7013,
              "Mid-Range": 12750,
              "Premium": 21675,
              "Luxury": 35700
            }
          },
          {
            "item": "Floor & Wall Tile",
            "description": "Porcelain floor tile and partial wall tile with waterproofing membrane",
            "costBasis": "Oakland tile install: $10–$22/sqft labor + $3–$18/sqft material (porcelain)",
            "roiRecovery": 62,
            "tiers": {
              "Budget-Friendly": 3135,
              "Mid-Range": 5700,
              "Premium": 9690,
              "Luxury": 15960
            }
          },
          {
            "item": "Toilet, Fixtures & Lighting",
            "description": "Comfort-height toilet, new faucets, towel bars, exhaust fan, and vanity lighting",
            "costBasis": "Oakland: Toilet $400–$1,800 installed | LED vanity light $250–$900 | Fan $350–$700",
            "roiRecovery": 60,
            "tiers": {
              "Budget-Friendly": 1815,
              "Mid-Range": 3300,
              "Premium": 5610,
              "Luxury": 9240
            }
          }
        ],
        "contingency": {
          "percentage": 15,
          "reason": "Plumbing roughed in 1996; galvanized pipe replacement common in Oakland homes of this era"
        },
        "roiNote": {
          "message": "Bathroom remodels return 65–74% in Oakland — strong ROI given the competitive Bay Area buyer market.",
          "source": "Project Cost Atlas Oakland CA (Dec 2025) · Remodeling Magazine 2025 Cost vs. Value Report"
        }
      },
      "Living Room": {
        "lineItems": [
          {
            "item": "Hardwood / LVP Flooring",
            "description": "Replace carpet or old flooring with engineered hardwood or luxury vinyl plank",
            "costBasis": "Oakland: Engineered hardwood $6–$14/sqft installed | LVP $4–$11/sqft",
            "roiRecovery": 72,
            "tiers": {
              "Budget-Friendly": 4950,
              "Mid-Range": 9000,
              "Premium": 15300,
              "Luxury": 25200
            }
          },
          {
            "item": "Paint, Trim & Crown Molding",
            "description": "Interior repaint, new baseboards, and crown molding installation",
            "costBasis": "Oakland: $400–$1,000/room paint | Crown molding $8–$18/lf installed",
            "roiRecovery": 65,
            "tiers": {
              "Budget-Friendly": 2063,
              "Mid-Range": 3750,
              "Premium": 6375,
              "Luxury": 10500
            }
          },
          {
            "item": "Lighting Upgrade",
            "description": "Recessed lighting installation, dimmer switches, and new ceiling fixtures",
            "costBasis": "Oakland electrician: $85–$130/hr; recessed light install $200–$400 each",
            "roiRecovery": 60,
            "tiers": {
              "Budget-Friendly": 2475,
              "Mid-Range": 4500,
              "Premium": 7650,
              "Luxury": 12600
            }
          }
        ],
        "contingency": {
          "percentage": 10,
          "reason": "Electrical upgrades may require panel permit in Oakland"
        },
        "roiNote": {
          "message": "Living room updates return 60–70% in Oakland — flooring delivers the strongest per-dollar ROI.",
          "source": "NAR 2025 Remodeling Impact Report"
        }
      },
      "Bedroom": {
        "lineItems": [
          {
            "item": "Flooring Replacement",
            "description": "Remove carpet; install engineered hardwood or luxury vinyl plank",
            "costBasis": "Oakland: LVP $4–$11/sqft | Engineered hardwood $6–$14/sqft installed (~200 sqft)",
            "roiRecovery": 70,
            "tiers": {
              "Budget-Friendly": 3713,
              "Mid-Range": 6750,
              "Premium": 11475,
              "Luxury": 18900
            }
          },
          {
            "item": "Paint & Trim",
            "description": "Repaint walls and ceiling, new baseboards and door casings",
            "costBasis": "Oakland: $350–$800/room repaint | Trim/baseboard $8–$16/lf installed",
            "roiRecovery": 65,
            "tiers": {
              "Budget-Friendly": 1485,
              "Mid-Range": 2700,
              "Premium": 4590,
              "Luxury": 7560
            }
          },
          {
            "item": "Closet Organization System",
            "description": "Custom or modular closet system with shelving, rods, and drawers",
            "costBasis": "Oakland: Wire shelving $300–$700 | Modular $1,200–$3,500 | Custom $6,000–$14,000",
            "roiRecovery": 60,
            "tiers": {
              "Budget-Friendly": 2640,
              "Mid-Range": 4800,
              "Premium": 8160,
              "Luxury": 13440
            }
          }
        ],
        "contingency": {
          "percentage": 10,
          "reason": "Minor permit may be needed for electrical work in Oakland"
        },
        "roiNote": {
          "message": "Bedroom updates return 60–65% in Oakland. Flooring and closet upgrades drive the most buyer appeal.",
          "source": "NAR 2025 Remodeling Impact Report"
        }
      }
    }
  },

  [KINGWOOD_PROPERTY_ID]: {
    "meta": {
      "address": "1703 Brookside Pine Ln, Kingwood, TX 77345",
      "city": "Kingwood",
      "state": "Texas",
      "squareFootage": 4906,
      "bedrooms": 5,
      "bathrooms": 5,
      "yearBuilt": 1990,
      "regionalFactor": 0.85,
      "dataSource": "HomeAdvisor Kingwood TX · Houston Builders Texas (2025) · Remodeling Magazine 2025 Cost vs. Value Report (West South-Central Region)"
    },
    "areas": {
      "Exterior": {
        "defaultElement": "Repaint only",
        "defaultFocusArea": "Front entrance",
        "architecturalElements": {
          "Repaint only": {
            "lineItems": [
              {
                "item": "Surface Prep & Power Washing",
                "description": "Pressure wash, scrape loose paint, caulk gaps, prime bare wood on large 4,906 sqft home",
                "costBasis": "$1,200–$2,000 for prep on a large Kingwood/Houston area home",
                "roiRecovery": 55,
                "tiers": {
                  "Budget-Friendly": 612,
                  "Mid-Range": 1020,
                  "Premium": 1581,
                  "Luxury": 2346
                }
              },
              {
                "item": "Exterior Paint (Full Home)",
                "description": "Two-coat application on all exterior walls, trim, and shutters of 4,906 sqft home",
                "costBasis": "Kingwood/Houston: $1.25–$3.00/sqft exterior; larger home = more total but lower $/sqft",
                "roiRecovery": 55,
                "tiers": {
                  "Budget-Friendly": 3570,
                  "Mid-Range": 5950,
                  "Premium": 9223,
                  "Luxury": 13685
                }
              },
              {
                "item": "Front Door, Trim & Shutters",
                "description": "Repaint front door, all exterior trim boards, window shutters, and garage door",
                "costBasis": "$800–$1,800 for trim and accent painting in Kingwood",
                "roiRecovery": 65,
                "tiers": {
                  "Budget-Friendly": 510,
                  "Mid-Range": 850,
                  "Premium": 1318,
                  "Luxury": 1955
                }
              }
            ],
            "contingency": {
              "percentage": 10,
              "reason": "Asbestos testing recommended on 1990 build; Houston-area humidity may require additional sealer coat"
            },
            "roiNote": {
              "message": "Exterior repaint on a large Kingwood home dramatically improves curb appeal at one of the lowest cost-per-dollar ratios.",
              "source": "NAR 2025 Remodeling Impact Report"
            }
          },
          "Update roof/siding": {
            "lineItems": [
              {
                "item": "Siding Removal & Disposal",
                "description": "Full tear-off of existing siding on large 4,906 sqft home; includes haul-away",
                "costBasis": "$2,500–$4,000 for demo at this home size in Kingwood area",
                "roiRecovery": 76,
                "tiers": {
                  "Budget-Friendly": 1275,
                  "Mid-Range": 2125,
                  "Premium": 3294,
                  "Luxury": 4888
                }
              },
              {
                "item": "New Siding (Vinyl or Fiber Cement)",
                "description": "Vinyl (budget/mid) or fiber cement (premium/luxury) siding installation",
                "costBasis": "Kingwood: Vinyl siding $5–$9/sqft | Fiber cement $8–$15/sqft installed",
                "roiRecovery": 76,
                "tiers": {
                  "Budget-Friendly": 9180,
                  "Mid-Range": 15300,
                  "Premium": 23715,
                  "Luxury": 35190
                }
              },
              {
                "item": "Trim, House Wrap & Flashing",
                "description": "Weather-resistant barrier, new trim boards, and all flashing around openings",
                "costBasis": "$3,500–$6,500 for a large home of this size in Houston area",
                "roiRecovery": 70,
                "tiers": {
                  "Budget-Friendly": 1785,
                  "Mid-Range": 2975,
                  "Premium": 4611,
                  "Luxury": 6842
                }
              }
            ],
            "contingency": {
              "percentage": 12,
              "reason": "High humidity and storm exposure in Kingwood may reveal hidden moisture damage during demo"
            },
            "roiNote": {
              "message": "Siding replacement on a large Kingwood home delivers strong ROI due to storm protection value buyers pay premium for.",
              "source": "Remodeling Magazine 2025 Cost vs. Value — West South-Central Region"
            }
          },
          "New windows": {
            "lineItems": [
              {
                "item": "Window Removal (est. 18–22 windows)",
                "description": "Remove existing windows; 5 bed / 5 bath home estimated at 18–22 window openings",
                "costBasis": "$75–$150 per window removal in Kingwood/Houston area",
                "roiRecovery": 69,
                "tiers": {
                  "Budget-Friendly": 765,
                  "Mid-Range": 1275,
                  "Premium": 1976,
                  "Luxury": 2932
                }
              },
              {
                "item": "New Window Units",
                "description": "Double-pane Low-E vinyl (budget) to triple-pane fiberglass (luxury); all openings",
                "costBasis": "Kingwood: Vinyl window installed $600–$1,200 | Fiberglass $1,200–$2,800 each",
                "roiRecovery": 69,
                "tiers": {
                  "Budget-Friendly": 8670,
                  "Mid-Range": 14450,
                  "Premium": 22398,
                  "Luxury": 33235
                }
              },
              {
                "item": "Exterior Trim & Caulking",
                "description": "New exterior casing, weather-seal caulk, and touch-up paint at all windows",
                "costBasis": "$150–$350 per window for trim and finishing in Kingwood",
                "roiRecovery": 65,
                "tiers": {
                  "Budget-Friendly": 1785,
                  "Mid-Range": 2975,
                  "Premium": 4611,
                  "Luxury": 6842
                }
              }
            ],
            "contingency": {
              "percentage": 10,
              "reason": "Energy code compliance (Texas 2021 IECC) may require specific glazing ratings"
            },
            "roiNote": {
              "message": "Energy-efficient windows provide significant cooling cost savings — a major selling point for large Kingwood homes.",
              "source": "Remodeling Magazine 2025 Cost vs. Value Report"
            }
          },
          "New entrance": {
            "lineItems": [
              {
                "item": "New Entry Door (Double or Grand)",
                "description": "Pre-hung steel or fiberglass double entry door appropriate for a large 5-bed home",
                "costBasis": "Kingwood: Steel double door $2,000–$4,000 installed | Fiberglass grand entry $5,000–$12,000",
                "roiRecovery": 188,
                "tiers": {
                  "Budget-Friendly": 1201,
                  "Mid-Range": 2002,
                  "Premium": 3103,
                  "Luxury": 4604
                }
              },
              {
                "item": "Portico / Entry Lighting",
                "description": "New exterior entry lighting and address numbers appropriate for home scale",
                "costBasis": "$500–$1,200 in Kingwood for fixtures and electrician",
                "roiRecovery": 120,
                "tiers": {
                  "Budget-Friendly": 408,
                  "Mid-Range": 680,
                  "Premium": 1054,
                  "Luxury": 1564
                }
              }
            ],
            "contingency": {
              "percentage": 10,
              "reason": "Grand entrance may require structural header work on 1990 build"
            },
            "roiNote": {
              "message": "Entry door replacement returns the highest ROI of any exterior project — buyers pay outsized attention to first impressions.",
              "source": "Remodeling Magazine 2025 Cost vs. Value Report"
            }
          }
        },
        "focusAreas": {
          "Front entrance": {
            "lineItems": [
              {
                "item": "Grand Entry Door Replacement",
                "description": "Double fiberglass or wood entry door with sidelights; appropriate for 5-bed home scale",
                "costBasis": "Kingwood: Fiberglass double door $3,500–$8,500 | Custom wood $8,000–$18,000 installed",
                "roiRecovery": 150,
                "tiers": {
                  "Budget-Friendly": 2040,
                  "Mid-Range": 3400,
                  "Premium": 5270,
                  "Luxury": 7820
                }
              },
              {
                "item": "Entry Lighting & Hardware",
                "description": "Exterior coach lights, smart lock/keypad, address plaque update",
                "costBasis": "$600–$1,500 in Kingwood for fixtures and installation",
                "roiRecovery": 120,
                "tiers": {
                  "Budget-Friendly": 408,
                  "Mid-Range": 680,
                  "Premium": 1054,
                  "Luxury": 1564
                }
              }
            ],
            "contingency": {
              "percentage": 10,
              "reason": "Custom door sizing may be needed on 1990 build; verify rough opening dimensions"
            },
            "roiNote": {
              "message": "Grand entry upgrades deliver exceptional ROI on large Kingwood homes where first impressions set buyer expectations.",
              "source": "Remodeling Magazine 2025 Cost vs. Value — West South-Central Region"
            }
          },
          "Landscaping": {
            "lineItems": [
              {
                "item": "Lawn Restoration & Sod",
                "description": "St. Augustine or Bermuda sod (Kingwood standard); large lot size for 5-bed home",
                "costBasis": "Kingwood: Sod $0.30–$0.75/sqft installed; large front yard ~1,500–2,500 sqft estimated",
                "roiRecovery": 100,
                "tiers": {
                  "Budget-Friendly": 1785,
                  "Mid-Range": 2975,
                  "Premium": 4611,
                  "Luxury": 6842
                }
              },
              {
                "item": "Shrubs, Trees & Planting Beds",
                "description": "Native Texas plants: Crape myrtles, Indian hawthorn, Asian jasmine groundcover",
                "costBasis": "$25–$120/shrub | $200–$600/tree; ~15–20 plants for this size lot in Kingwood",
                "roiRecovery": 100,
                "tiers": {
                  "Budget-Friendly": 1275,
                  "Mid-Range": 2125,
                  "Premium": 3294,
                  "Luxury": 4888
                }
              },
              {
                "item": "Irrigation System (Repair/Upgrade)",
                "description": "1990 home likely has existing irrigation; upgrade controller and repair heads",
                "costBasis": "Kingwood: Irrigation repair $500–$1,500 | Full replacement $2,800–$5,500",
                "roiRecovery": 90,
                "tiers": {
                  "Budget-Friendly": 1020,
                  "Mid-Range": 1700,
                  "Premium": 2635,
                  "Luxury": 3910
                }
              }
            ],
            "contingency": {
              "percentage": 10,
              "reason": "Post-flood soil assessment may be needed; Kingwood has history of flooding events"
            },
            "roiNote": {
              "message": "Landscaping is a top ROI project in Kingwood where large lots and curb appeal drive buyer decisions.",
              "source": "NAR 2025 Remodeling Impact Report"
            }
          },
          "Driveway": {
            "lineItems": [
              {
                "item": "Driveway Demo & Base Prep",
                "description": "Break up and haul away existing concrete/asphalt; regrade and compact base",
                "costBasis": "$1,800–$3,200 for large home driveway demo in Kingwood",
                "roiRecovery": 70,
                "tiers": {
                  "Budget-Friendly": 1020,
                  "Mid-Range": 1700,
                  "Premium": 2635,
                  "Luxury": 3910
                }
              },
              {
                "item": "New Concrete Driveway",
                "description": "Reinforced concrete driveway; large home may have 3-car garage approach",
                "costBasis": "Kingwood: Concrete $5–$10/sqft | Stamped concrete $8–$18/sqft installed",
                "roiRecovery": 70,
                "tiers": {
                  "Budget-Friendly": 2805,
                  "Mid-Range": 4675,
                  "Premium": 7246,
                  "Luxury": 10752
                }
              }
            ],
            "contingency": {
              "percentage": 12,
              "reason": "Drainage engineering critical in Kingwood flood-prone area; may require French drain integration"
            },
            "roiNote": {
              "message": "Driveway replacement with proper drainage is especially valuable in Kingwood given flooding history.",
              "source": "HomeAdvisor True Cost Guide 2025"
            }
          },
          "Patio": {
            "lineItems": [
              {
                "item": "Patio Demo & Grading",
                "description": "Remove existing surface; regrade for drainage (critical in Kingwood)",
                "costBasis": "$1,000–$2,000 for patio demo at a large Kingwood property",
                "roiRecovery": 80,
                "tiers": {
                  "Budget-Friendly": 612,
                  "Mid-Range": 1020,
                  "Premium": 1581,
                  "Luxury": 2346
                }
              },
              {
                "item": "Covered Patio / Outdoor Living",
                "description": "Concrete or paver patio; large 5-bed home warrants 400–600 sqft outdoor space",
                "costBasis": "Kingwood: Concrete patio $6–$11/sqft | Pavers $12–$22/sqft | Pergola $4,000–$12,000",
                "roiRecovery": 80,
                "tiers": {
                  "Budget-Friendly": 4080,
                  "Mid-Range": 6800,
                  "Premium": 10540,
                  "Luxury": 15640
                }
              }
            ],
            "contingency": {
              "percentage": 12,
              "reason": "Covered patio may need building permit; drainage engineering required in Kingwood"
            },
            "roiNote": {
              "message": "Outdoor living spaces are extremely valuable in Kingwood — mild winters make patios nearly year-round usable.",
              "source": "NAR 2025 Remodeling Impact Report"
            }
          },
          "All": {
            "lineItems": [
              {
                "item": "Full Exterior Repaint",
                "description": "All exterior walls, trim, shutters, and garage door repaint",
                "costBasis": "Kingwood mid-range: $8,800–$12,800",
                "roiRecovery": 55,
                "tiers": {
                  "Budget-Friendly": 4080,
                  "Mid-Range": 6800,
                  "Premium": 10540,
                  "Luxury": 15640
                }
              },
              {
                "item": "Landscaping & Sod",
                "description": "Lawn restoration, native plantings, irrigation repair",
                "costBasis": "Kingwood mid-range: $7,500–$11,500",
                "roiRecovery": 100,
                "tiers": {
                  "Budget-Friendly": 3570,
                  "Mid-Range": 5950,
                  "Premium": 9223,
                  "Luxury": 13685
                }
              },
              {
                "item": "Grand Entry & Lighting",
                "description": "Double fiberglass door, coach lights, smart lock, updated hardware",
                "costBasis": "Kingwood mid-range: $5,400–$8,200",
                "roiRecovery": 150,
                "tiers": {
                  "Budget-Friendly": 2550,
                  "Mid-Range": 4250,
                  "Premium": 6588,
                  "Luxury": 9775
                }
              },
              {
                "item": "Driveway & Walkway",
                "description": "Concrete driveway replacement and pathway resurfacing",
                "costBasis": "Kingwood mid-range: $6,500–$9,800",
                "roiRecovery": 70,
                "tiers": {
                  "Budget-Friendly": 3060,
                  "Mid-Range": 5100,
                  "Premium": 7905,
                  "Luxury": 11730
                }
              },
              {
                "item": "Covered Patio Installation",
                "description": "Large outdoor living area with pergola or patio cover",
                "costBasis": "Kingwood mid-range: $10,000–$15,000",
                "roiRecovery": 88,
                "tiers": {
                  "Budget-Friendly": 4590,
                  "Mid-Range": 7650,
                  "Premium": 11858,
                  "Luxury": 17595
                }
              }
            ],
            "contingency": {
              "percentage": 15,
              "reason": "Multi-trade full exterior scope; drainage engineering required; flood zone considerations"
            },
            "roiNote": {
              "message": "A complete exterior renovation on a large Kingwood home dramatically boosts market value and reduces time-on-market.",
              "source": "Remodeling Magazine 2025 Cost vs. Value — West South-Central Region · NAR 2025"
            }
          }
        }
      },
      "Kitchen": {
        "lineItems": [
          {
            "item": "Cabinets & Hardware",
            "description": "Semi-custom cabinetry replacement for large open-concept Kingwood kitchen",
            "costBasis": "Kingwood/Houston: Semi-custom $12K–$20K | Custom $22K–$45K installed (large kitchen)",
            "roiRecovery": 67,
            "tiers": {
              "Budget-Friendly": 6545,
              "Mid-Range": 11900,
              "Premium": 20230,
              "Luxury": 33320
            }
          },
          {
            "item": "Countertops (Quartz or Granite)",
            "description": "Quartz or granite countertops; large kitchen = ~80–120 sqft of counter surface",
            "costBasis": "Kingwood: Quartz $40–$80/sqft | Granite $35–$75/sqft installed",
            "roiRecovery": 72,
            "tiers": {
              "Budget-Friendly": 3740,
              "Mid-Range": 6800,
              "Premium": 11560,
              "Luxury": 19040
            }
          },
          {
            "item": "Appliance Package",
            "description": "Full appliance suite for large kitchen: refrigerator, double oven, dishwasher, microwave",
            "costBasis": "Kingwood mid-range: $8,000–$14,000 for complete appliance package with install",
            "roiRecovery": 60,
            "tiers": {
              "Budget-Friendly": 4208,
              "Mid-Range": 7650,
              "Premium": 13005,
              "Luxury": 21420
            }
          },
          {
            "item": "Flooring & Backsplash",
            "description": "Tile or LVP flooring and tile backsplash for large kitchen area",
            "costBasis": "Kingwood: Tile $5–$12/sqft installed | LVP $3–$8/sqft; large area increases total",
            "roiRecovery": 70,
            "tiers": {
              "Budget-Friendly": 2805,
              "Mid-Range": 5100,
              "Premium": 8670,
              "Luxury": 14280
            }
          },
          {
            "item": "Lighting & Electrical",
            "description": "Recessed lights, island pendants, undercabinet LED; panel upgrade if 1990 original",
            "costBasis": "Kingwood electrician $65–$95/hr; full kitchen lighting package $2,800–$6,000",
            "roiRecovery": 65,
            "tiers": {
              "Budget-Friendly": 1403,
              "Mid-Range": 2550,
              "Premium": 4335,
              "Luxury": 7140
            }
          }
        ],
        "contingency": {
          "percentage": 12,
          "reason": "Electrical panel upgrade likely needed on 1990 home; plumbing rough-in may need code update"
        },
        "roiNote": {
          "message": "A mid-range kitchen remodel on a large Kingwood home returns 70–75%, strongly influenced by buyer expectations in this price tier.",
          "source": "Houston Builders Texas (2025) · Remodeling Magazine 2025 Cost vs. Value — West South-Central Region"
        }
      },
      "Bathroom": {
        "lineItems": [
          {
            "item": "Vanity, Sink & Mirror",
            "description": "Replace vanity cabinet, countertop, undermount sink, faucet, and mirror",
            "costBasis": "Kingwood: Stock vanity $400–$900 | Semi-custom $1,000–$3,000 | Custom $4,000–$9,000 installed",
            "roiRecovery": 65,
            "tiers": {
              "Budget-Friendly": 1636,
              "Mid-Range": 2975,
              "Premium": 5058,
              "Luxury": 8330
            }
          },
          {
            "item": "Shower / Tub Renovation",
            "description": "Tile shower rebuild or tub replacement; frameless glass enclosure (premium)",
            "costBasis": "Kingwood: Tile shower $6,500–$12,000 | Custom frameless $12,000–$22,000 installed",
            "roiRecovery": 68,
            "tiers": {
              "Budget-Friendly": 3974,
              "Mid-Range": 7225,
              "Premium": 12283,
              "Luxury": 20230
            }
          },
          {
            "item": "Floor & Wall Tile",
            "description": "Porcelain floor and wall tile with waterproofing; Kingwood labor below national avg",
            "costBasis": "Kingwood: Tile install $7–$16/sqft labor + $2–$12/sqft material (porcelain)",
            "roiRecovery": 62,
            "tiers": {
              "Budget-Friendly": 1777,
              "Mid-Range": 3230,
              "Premium": 5491,
              "Luxury": 9044
            }
          },
          {
            "item": "Toilet, Fixtures & Lighting",
            "description": "Comfort-height toilet, new faucets, towel bars, exhaust fan, and vanity lighting",
            "costBasis": "Kingwood: Toilet $300–$1,200 installed | LED vanity light $180–$600 | Fan $250–$600",
            "roiRecovery": 60,
            "tiers": {
              "Budget-Friendly": 1029,
              "Mid-Range": 1870,
              "Premium": 3179,
              "Luxury": 5236
            }
          }
        ],
        "contingency": {
          "percentage": 12,
          "reason": "1990 build: galvanized pipes and outdated valves common; Houston area code may require GFCIs and vent upgrades"
        },
        "roiNote": {
          "message": "Bathroom remodels return 74–80% in Kingwood — with 5 bathrooms, updating primary and guest baths maximizes overall value.",
          "source": "HomeAdvisor Kingwood TX · Remodeling Magazine 2025 Cost vs. Value — West South-Central Region"
        }
      },
      "Living Room": {
        "lineItems": [
          {
            "item": "Hardwood / LVP Flooring",
            "description": "Large living area (~500 sqft); engineered hardwood or LVP replacement",
            "costBasis": "Kingwood: Engineered hardwood $4–$10/sqft installed | LVP $3–$8/sqft",
            "roiRecovery": 72,
            "tiers": {
              "Budget-Friendly": 3273,
              "Mid-Range": 5950,
              "Premium": 10115,
              "Luxury": 16660
            }
          },
          {
            "item": "Paint, Trim & Crown Molding",
            "description": "Repaint large living area, new baseboards, crown molding throughout",
            "costBasis": "Kingwood: $350–$700/room repaint | Crown molding $6–$14/lf installed",
            "roiRecovery": 65,
            "tiers": {
              "Budget-Friendly": 1403,
              "Mid-Range": 2550,
              "Premium": 4335,
              "Luxury": 7140
            }
          },
          {
            "item": "Fireplace Update",
            "description": "Update fireplace surround, mantel, and consider gas log conversion",
            "costBasis": "Kingwood: Mantel + surround $1,500–$4,500 | Gas conversion $2,800–$6,000",
            "roiRecovery": 65,
            "tiers": {
              "Budget-Friendly": 2571,
              "Mid-Range": 4675,
              "Premium": 7948,
              "Luxury": 13090
            }
          },
          {
            "item": "Lighting Upgrade",
            "description": "Recessed lighting, chandelier, and dimmer controls for large open-plan space",
            "costBasis": "Kingwood: $65–$95/hr electrician; full package $2,200–$5,000 for large room",
            "roiRecovery": 60,
            "tiers": {
              "Budget-Friendly": 1636,
              "Mid-Range": 2975,
              "Premium": 5058,
              "Luxury": 8330
            }
          }
        ],
        "contingency": {
          "percentage": 10,
          "reason": "Large room scope may require additional electrical circuits; permit needed for wiring work"
        },
        "roiNote": {
          "message": "Living room updates return 70–75% in Kingwood — flooring and fireplace upgrades are the top buyer priorities.",
          "source": "NAR 2025 Remodeling Impact Report"
        }
      },
      "Bedroom": {
        "lineItems": [
          {
            "item": "Flooring Replacement",
            "description": "Remove carpet; install LVP or engineered hardwood in master suite or guest room",
            "costBasis": "Kingwood: LVP $3–$8/sqft | Engineered hardwood $4–$10/sqft installed",
            "roiRecovery": 70,
            "tiers": {
              "Budget-Friendly": 2104,
              "Mid-Range": 3825,
              "Premium": 6503,
              "Luxury": 10710
            }
          },
          {
            "item": "Paint & Trim",
            "description": "Repaint walls and ceiling, new baseboards and door casings",
            "costBasis": "Kingwood: $300–$600/room repaint | Baseboard/trim $6–$12/lf installed",
            "roiRecovery": 65,
            "tiers": {
              "Budget-Friendly": 842,
              "Mid-Range": 1530,
              "Premium": 2601,
              "Luxury": 4284
            }
          },
          {
            "item": "Walk-In Closet System",
            "description": "Large home warrants custom or modular walk-in closet for master suite",
            "costBasis": "Kingwood: Modular walk-in $1,500–$4,500 | Custom built-in $5,000–$14,000 installed",
            "roiRecovery": 60,
            "tiers": {
              "Budget-Friendly": 1870,
              "Mid-Range": 3400,
              "Premium": 5780,
              "Luxury": 9520
            }
          }
        ],
        "contingency": {
          "percentage": 10,
          "reason": "Minor permit may be needed for electrical work; flooring removal may reveal subfloor issues in 1990 build"
        },
        "roiNote": {
          "message": "Bedroom updates return 70–75% in Kingwood — master suite upgrades with walk-in closets are especially valued at this price tier.",
          "source": "NAR 2025 Remodeling Impact Report"
        }
      }
    }
  }
};


// ─────────────────────────────────────────────────────────────────────────────
//  BUILDER — everything derives from line items
// ─────────────────────────────────────────────────────────────────────────────

const EXTERIOR = 'Exterior';

/** Resolve a line item's cost at a tier and drop the tier table from output. */
const priceLineItem = (li, tier) => {
  const cost = round(li.tiers[tier] ?? li.tiers[DEFAULT_TIER] ?? 0);
  return {
    item: li.item,
    description: li.description,
    costBasis: li.costBasis,
    cost,
    costRange: {
      min: round(cost * RANGE_SPREAD.min),
      max: round(cost * RANGE_SPREAD.max)
    },
    roiRecovery: li.roiRecovery
  };
};

/** Merge two priced lists, keeping the first occurrence of any duplicate item. */
const mergeLineItems = (primary, secondary) => {
  const seen = new Set(primary.map((i) => i.item));
  return [...primary, ...secondary.filter((i) => !seen.has(i.item))];
};

/**
 * Resolve priced line items + contingency + ROI narrative for an area/tier,
 * handling the Exterior element+focus merge.
 */
const resolveScope = (areaConfig, areaName, renovationData, tier) => {
  if (areaName !== EXTERIOR) {
    return {
      lineItems: areaConfig.lineItems.map((li) => priceLineItem(li, tier)),
      contingency: areaConfig.contingency,
      roiNote: areaConfig.roiNote,
      primaryWork: areaName,
      focusArea: areaName
    };
  }

  // Exterior: pick the architectural element and the focus area independently,
  // falling back to defaults when the form field is absent or unrecognized.
  const elementKey =
    renovationData.architecturalElements &&
    areaConfig.architecturalElements[renovationData.architecturalElements]
      ? renovationData.architecturalElements
      : areaConfig.defaultElement;

  const focusKey =
    renovationData.exteriorFocusAreas &&
    areaConfig.focusAreas[renovationData.exteriorFocusAreas]
      ? renovationData.exteriorFocusAreas
      : areaConfig.defaultFocusArea;

  const element = areaConfig.architecturalElements[elementKey];
  const focus = areaConfig.focusAreas[focusKey];

  const lineItems = mergeLineItems(
    element.lineItems.map((li) => priceLineItem(li, tier)),
    focus.lineItems.map((li) => priceLineItem(li, tier))
  );

  // Combined scope carries the stricter (higher) contingency.
  const contingency =
    focus.contingency.percentage > element.contingency.percentage
      ? focus.contingency
      : element.contingency;

  return {
    lineItems,
    contingency,
    roiNote: {
      message: `${element.roiNote.message} ${focus.roiNote.message}`.trim(),
      source: [...new Set([element.roiNote.source, focus.roiNote.source].filter(Boolean))].join(' · ')
    },
    primaryWork: elementKey,
    focusArea: focusKey
  };
};

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
 * Build a costAnalysis object in the exact shape the frontend CostDisplay
 * renders and renovationRequestModel.costAnalysis stores.
 *
 * @param {string} propertyId
 * @param {object} renovationData { primaryArea, budgetTier, architecturalElements?, exteriorFocusAreas? }
 * @returns {object|null} costAnalysis, or null when property/area is not configured
 */
const buildHardcodedCostAnalysis = (propertyId, renovationData) => {
  const config = getPropertyCostConfig(propertyId);
  if (!config) return null;

  const areaConfig = config.areas[renovationData.primaryArea];
  if (!areaConfig) return null;

  const tier = resolveTier(renovationData.budgetTier);
  const { lineItems, contingency, roiNote, primaryWork, focusArea } =
    resolveScope(areaConfig, renovationData.primaryArea, renovationData, tier);

  if (!lineItems.length) return null;

  // ── Everything below is DERIVED from the line items ────────────────────────
  const subtotal = lineItems.reduce((s, i) => s + i.cost, 0);
  const contingencyAmount = round(subtotal * (contingency.percentage / 100));
  const finalCost = subtotal + contingencyAmount;

  const recoveryPercentage = round(weightedAverage(lineItems, 'roiRecovery', 'cost'));
  const estimatedValueIncrease = round((finalCost * recoveryPercentage) / 100);

  const { city, state, regionalFactor, dataSource } = config.meta;

  const contextMessage =
    regionalFactor > 1.05
      ? `${city} renovation costs run about ${round((regionalFactor - 1) * 100)}% above the national average. This estimate already reflects that premium.`
      : regionalFactor < 0.95
        ? `${city} renovation costs run about ${round((1 - regionalFactor) * 100)}% below the national average — your budget goes further here than in most US metros.`
        : `${city} renovation costs track close to the national average.`;

  return {
    finalCost,
    costRange: {
      min: round(finalCost * RANGE_SPREAD.min),
      max: round(finalCost * RANGE_SPREAD.max)
    },
    lineItems,
    contingency: {
      percentage: contingency.percentage,
      amount: contingencyAmount,
      reason: contingency.reason
    },
    breakdown: {
      primaryWork,
      focusArea,
      tier,
      location: `${city}, ${state}`,
      subtotal
    },
    marketContext: {
      state,
      city,
      regionalFactor,
      message: contextMessage,
      dataSource
    },
    roiEstimate: {
      estimatedValueIncrease,
      recoveryPercentage,
      roiMessage: `${roiNote.message} At this scope and tier, the blended recovery across all line items is about ${recoveryPercentage}%.`.trim(),
      source: roiNote.source
    },
    // Distressed-property honesty flag — the frontend can surface this as a
    // "verify before bidding" note. Costs shown are AI-assisted estimates, not
    // quotes, and cannot account for concealed structural/mechanical issues.
    disclaimer:
      'Estimate only — not a contractor quote. REO/auction properties may have concealed issues (foundation, plumbing, electrical, mold) that are not visible in listing photos. Verify with a licensed contractor before bidding.'
  };
};

module.exports = {
  OAKLAND_PROPERTY_ID,
  KINGWOOD_PROPERTY_ID,
  hasHardcodedCosts,
  getPropertyCostConfig,
  buildHardcodedCostAnalysis
};
