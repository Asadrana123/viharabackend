/**
 * renovationCosts/ogdensburg_rensselaer.js
 * 
 *  401 Rensselaer Ave, Ogdensburg, NY 13669 — 2,048 sqft · 1.75 stories · built 1918 ·
 *  WOOD exterior siding, full basement, detached garage, vinyl in-ground pool. St. Lawrence County.
 * 
 *  regionalFactor 0.95: far-north rural upstate NY indexes ~95-105 of the national
 *  average (Build-Folio NY cost guide, 2026); rural St. Lawrence County labor runs
 *  below metro NY, though a thin contractor market limits the discount. 0.95 is the
 *  conservative below-national figure.
 * 
 *  NOTE — pre-1978 build (1918): EPA RRP lead-safe work practices apply to all painted
 *  surfaces. WOOD siding — exterior items price siding repair/replacement, not masonry.
 *  Cold-climate (Zone 6A) roofing prices ice-and-water shield for snow load.
 * 
 *  Tier shape follows the portfolio convention (see _shared.js):
 *    Exterior line items : 0.60 / 1.00 / 1.55 / 2.30  x Mid-Range
 *    Interior line items : 0.55 / 1.00 / 1.70 / 2.80  x Mid-Range
 */

const RENSSELAER_PROPERTY_ID = 'PENDING_REAL_ID_RENSSELAER';

const config = {
  "meta": {
    "address": "401 Rensselaer Ave, Ogdensburg, NY 13669",
    "city": "Ogdensburg",
    "state": "New York",
    "squareFootage": 2048,
    "bedrooms": 3,
    "bathrooms": 1.5,
    "yearBuilt": 1918,
    "regionalFactor": 0.95,
    "dataSource": "Build-Folio New York Home Improvement Cost Guide (2026, upstate index 95-105) · RenoCanvas Upstate NY Renovation Data (2026) · Remodeling 2025 Cost vs. Value Report (Middle Atlantic Region)"
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
              "description": "Power wash, scrape failing paint, caulk and prime bare wood across a 1.75-story 1918 facade",
              "costBasis": "Upstate NY prep/scrape/prime on a full wood-sided 2,048 sqft home $1,100-$1,900",
              "roiRecovery": 55,
              "tiers": {
                "Budget-Friendly": 900,
                "Mid-Range": 1500,
                "Premium": 2325,
                "Luxury": 3450
              }
            },
            {
              "item": "Exterior Paint (Full Wood Siding & Trim)",
              "description": "Two-coat 100% acrylic across the entire wood-sided body, trim and soffit",
              "costBasis": "Upstate NY full wood-siding repaint $2.10-$3.60/sqft exterior surface",
              "roiRecovery": 60,
              "tiers": {
                "Budget-Friendly": 2880,
                "Mid-Range": 4800,
                "Premium": 7440,
                "Luxury": 11040
              }
            },
            {
              "item": "Front Door & Porch Repaint",
              "description": "Strip, prime and repaint the covered front porch woodwork and entry door with updated hardware",
              "costBasis": "Upstate NY door/porch repaint $500-$900 | hardware $150-$400",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 360,
                "Mid-Range": 600,
                "Premium": 930,
                "Luxury": 1380
              }
            }
          ],
          "contingency": {
            "percentage": 18,
            "reason": "Pre-1978 build (1918) — EPA RRP lead-safe practices required; certified renovator, containment and testing ($250-$500). Wood siding under old paint may conceal rot. St. Lawrence County permit not required for standard exterior painting."
          },
          "roiNote": {
            "message": "Fresh exterior paint is the highest-visual-impact, lowest-cost upgrade on a wood-sided Ogdensburg home.",
            "source": "Remodeling 2025 Cost vs. Value Report (Middle Atlantic) · NAR 2025 Remodeling Impact Report"
          }
        },
        "Update roof/siding": {
          "lineItems": [
            {
              "item": "Siding Tear-Off & Disposal",
              "description": "Remove existing wood siding, inspect sheathing for rot, haul away debris",
              "costBasis": "Upstate NY wood siding removal $1.40-$2.60/sqft on the wall area of this 2,048 sqft home",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 1200,
                "Mid-Range": 2000,
                "Premium": 3100,
                "Luxury": 4600
              }
            },
            {
              "item": "New Siding (Vinyl / Fiber Cement)",
              "description": "Vinyl (budget) through fiber cement (premium) replacing original wood clapboard, rated for Zone 6A winters",
              "costBasis": "Upstate NY siding $5-$11/sqft installed",
              "roiRecovery": 75,
              "tiers": {
                "Budget-Friendly": 7200,
                "Mid-Range": 12000,
                "Premium": 18600,
                "Luxury": 27600
              }
            },
            {
              "item": "Roof Tear-Off & Architectural Shingle Roof",
              "description": "Full tear-off to deck, new architectural shingles with ice-and-water shield, drip edge and ridge vent",
              "costBasis": "Upstate NY tear-off + architectural shingle $5.50-$9/sqft on a ~1,200 sqft 1.75-story roof; snow-load region",
              "roiRecovery": 68,
              "tiers": {
                "Budget-Friendly": 4800,
                "Mid-Range": 8000,
                "Premium": 12400,
                "Luxury": 18400
              }
            }
          ],
          "contingency": {
            "percentage": 22,
            "reason": "1918 wood-frame — original siding commonly conceals rot or knob-and-tube runs; full removal frequently exposes additional repairs. St. Lawrence County permit required for roofing and siding."
          },
          "roiNote": {
            "message": "Roof and siding condition is the first thing far-north NY inspectors and buyers scrutinize, given heavy snow load.",
            "source": "Remodeling 2025 Cost vs. Value Report (Middle Atlantic) · NAR 2025 Remodeling Impact Report"
          }
        },
        "New windows": {
          "lineItems": [
            {
              "item": "Window Removal & Disposal",
              "description": "Remove approximately 12-14 existing window units across 1.75 stories",
              "costBasis": "Upstate NY $110-$200 per window removal; lead-safe containment adds labor on 1918 stock",
              "roiRecovery": 65,
              "tiers": {
                "Budget-Friendly": 900,
                "Mid-Range": 1500,
                "Premium": 2325,
                "Luxury": 3450
              }
            },
            {
              "item": "New Window Units (12-14 windows)",
              "description": "Vinyl double-pane (budget) to fiberglass triple-pane (premium); Energy Star rated for Zone 6A",
              "costBasis": "Upstate NY: $650-$1,300/window vinyl | $1,400-$2,600/window fiberglass installed",
              "roiRecovery": 67,
              "tiers": {
                "Budget-Friendly": 7920,
                "Mid-Range": 13200,
                "Premium": 20460,
                "Luxury": 30360
              }
            },
            {
              "item": "Exterior Trim & Caulking",
              "description": "New exterior trim, weather-seal caulking and touch-up paint around every opening",
              "costBasis": "Upstate NY $150-$350 per window for trim and finishing",
              "roiRecovery": 65,
              "tiers": {
                "Budget-Friendly": 1440,
                "Mid-Range": 2400,
                "Premium": 3720,
                "Luxury": 5520
              }
            }
          ],
          "contingency": {
            "percentage": 18,
            "reason": "Pre-1978 build — window removal disturbs lead paint; RRP-certified crew required. St. Lawrence County permit required."
          },
          "roiNote": {
            "message": "Single-pane 1918 sash windows bleed heat; efficient replacements matter more here than most metros given far-north winters.",
            "source": "Remodeling 2025 Cost vs. Value Report (Middle Atlantic) · NAR 2025 Remodeling Impact Report"
          }
        },
        "New entrance": {
          "lineItems": [
            {
              "item": "New Entry Door System",
              "description": "New fiberglass or steel entry door, frame and weatherstripping rated for Zone 6A",
              "costBasis": "Upstate NY entry door replacement $2,000-$4,000 installed",
              "roiRecovery": 90,
              "tiers": {
                "Budget-Friendly": 1560,
                "Mid-Range": 2600,
                "Premium": 4030,
                "Luxury": 5980
              }
            },
            {
              "item": "Covered Porch, Steps & Railing",
              "description": "Repair or rebuild the covered front porch decking and steps, new code-compliant railing",
              "costBasis": "Upstate NY porch/step rebuild $2,800-$5,500",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 2100,
                "Mid-Range": 3500,
                "Premium": 5425,
                "Luxury": 8050
              }
            },
            {
              "item": "Entry Lighting & Hardware",
              "description": "Exterior sconces, house numbers, and updated lockset/hardware",
              "costBasis": "Upstate NY: fixtures $130-$350 each installed | hardware $150-$400",
              "roiRecovery": 75,
              "tiers": {
                "Budget-Friendly": 480,
                "Mid-Range": 800,
                "Premium": 1240,
                "Luxury": 1840
              }
            }
          ],
          "contingency": {
            "percentage": 15,
            "reason": "Porch/step demo on a 1918 build may expose structural rot; St. Lawrence County permit required for structural work."
          },
          "roiNote": {
            "message": "Entry replacement consistently posts one of the highest cost-recovery figures of any exterior project.",
            "source": "Remodeling 2025 Cost vs. Value Report (Middle Atlantic) · NAR 2025 Remodeling Impact Report"
          }
        }
      },
      "focusAreas": {
        "Front entrance": {
          "lineItems": [
            {
              "item": "Entry Door Refresh",
              "description": "Strip, prime and repaint the entry door; replace lockset and weatherstripping",
              "costBasis": "Upstate NY door refresh $500-$1,000 | hardware $150-$400",
              "roiRecovery": 75,
              "tiers": {
                "Budget-Friendly": 600,
                "Mid-Range": 1000,
                "Premium": 1550,
                "Luxury": 2300
              }
            },
            {
              "item": "Porch Steps & Railing Repair",
              "description": "Repair covered-porch steps and decking, bring railing to current code",
              "costBasis": "Upstate NY step/railing repair $1,800-$3,600",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 1560,
                "Mid-Range": 2600,
                "Premium": 4030,
                "Luxury": 5980
              }
            },
            {
              "item": "Entry Lighting & House Numbers",
              "description": "New exterior sconces and visible house numbering",
              "costBasis": "Upstate NY: $130-$350 per fixture installed",
              "roiRecovery": 75,
              "tiers": {
                "Budget-Friendly": 360,
                "Mid-Range": 600,
                "Premium": 930,
                "Luxury": 1380
              }
            }
          ],
          "contingency": {
            "percentage": 15,
            "reason": "1918 porch framing may need more repair than surface inspection reveals; lead-safe practices apply."
          },
          "roiNote": {
            "message": "The covered front porch is a genuine selling feature on this Ogdensburg home; a tidy entry sets the whole first impression.",
            "source": "Remodeling 2025 Cost vs. Value Report (Middle Atlantic) · NAR 2025 Remodeling Impact Report"
          }
        },
        "Landscaping": {
          "lineItems": [
            {
              "item": "Clearing & Grading",
              "description": "Clear overgrowth and regrade for drainage away from the full basement on a 5,750 sqft lot",
              "costBasis": "Upstate NY clearing/grading $800-$1,500",
              "roiRecovery": 90,
              "tiers": {
                "Budget-Friendly": 720,
                "Mid-Range": 1200,
                "Premium": 1860,
                "Luxury": 2760
              }
            },
            {
              "item": "Planting, Mulch & Edging",
              "description": "Foundation plantings, mulch beds and edging at the front and rear yard",
              "costBasis": "Upstate NY planting package $1,200-$2,200",
              "roiRecovery": 100,
              "tiers": {
                "Budget-Friendly": 960,
                "Mid-Range": 1600,
                "Premium": 2480,
                "Luxury": 3680
              }
            },
            {
              "item": "Walkway & Front Yard",
              "description": "Repair or replace the front walkway and restore the street-facing lawn",
              "costBasis": "Upstate NY walkway $12-$24/sqft installed",
              "roiRecovery": 85,
              "tiers": {
                "Budget-Friendly": 1200,
                "Mid-Range": 2000,
                "Premium": 3100,
                "Luxury": 4600
              }
            }
          ],
          "contingency": {
            "percentage": 12,
            "reason": "Grading toward a full basement without a clear drainage path is a recurring defect on this housing stock."
          },
          "roiNote": {
            "message": "Curb appeal and a dry basement approach carry real weight on a quiet residential Ogdensburg street.",
            "source": "Remodeling 2025 Cost vs. Value Report (Middle Atlantic) · NAR 2025 Remodeling Impact Report"
          }
        },
        "Driveway": {
          "lineItems": [
            {
              "item": "Driveway Demo & Grading",
              "description": "Remove the existing surface serving the detached garage, regrade and compact the subbase",
              "costBasis": "Upstate NY demo and prep $1,000-$1,800",
              "roiRecovery": 65,
              "tiers": {
                "Budget-Friendly": 840,
                "Mid-Range": 1400,
                "Premium": 2170,
                "Luxury": 3220
              }
            },
            {
              "item": "New Driveway Surface",
              "description": "Asphalt (standard) through concrete/pavers (premium), with edging and sealer",
              "costBasis": "Upstate NY asphalt $4-$8/sqft | concrete $8-$14/sqft installed",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 2400,
                "Mid-Range": 4000,
                "Premium": 6200,
                "Luxury": 9200
              }
            }
          ],
          "contingency": {
            "percentage": 15,
            "reason": "Frost heave in Zone 6A demands a deeper compacted base; St. Lawrence County permit may apply for apron work."
          },
          "roiNote": {
            "message": "A sound driveway to the detached garage is expected on this block and supports resale.",
            "source": "Remodeling 2025 Cost vs. Value Report (Middle Atlantic) · NAR 2025 Remodeling Impact Report"
          }
        },
        "Patio": {
          "lineItems": [
            {
              "item": "Pool Deck / Patio Demo & Base Prep",
              "description": "Remove existing surface around the in-ground pool, excavate and compact a base",
              "costBasis": "Upstate NY demo/base prep $800-$1,400 for a pool-side patio",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 540,
                "Mid-Range": 900,
                "Premium": 1395,
                "Luxury": 2070
              }
            },
            {
              "item": "Patio Surface & Finishing",
              "description": "Concrete, stamped concrete or pavers with sealer and slip-resistant edging around the pool",
              "costBasis": "Upstate NY concrete patio $9-$15/sqft | pavers $16-$32/sqft installed",
              "roiRecovery": 80,
              "tiers": {
                "Budget-Friendly": 1800,
                "Mid-Range": 3000,
                "Premium": 4650,
                "Luxury": 6900
              }
            }
          ],
          "contingency": {
            "percentage": 12,
            "reason": "Pool-adjacent grading and drainage may need engineering; St. Lawrence County permit required for hardscape."
          },
          "roiNote": {
            "message": "A refreshed pool deck turns the existing in-ground pool from a liability into a genuine differentiator.",
            "source": "Remodeling 2025 Cost vs. Value Report (Middle Atlantic) · NAR 2025 Remodeling Impact Report"
          }
        },
        "All": {
          "lineItems": [
            {
              "item": "Complete Exterior Paint",
              "description": "Full repaint of all wood-sided exterior surfaces, trim and the covered porch",
              "costBasis": "Upstate NY full 1.75-story repaint $4,200-$6,200",
              "roiRecovery": 60,
              "tiers": {
                "Budget-Friendly": 3000,
                "Mid-Range": 5000,
                "Premium": 7750,
                "Luxury": 11500
              }
            },
            {
              "item": "Landscaping & Curb Appeal",
              "description": "Front and rear yard: clearing, planting, mulch, edging and walkway",
              "costBasis": "Upstate NY full landscaping package $2,600-$4,200",
              "roiRecovery": 95,
              "tiers": {
                "Budget-Friendly": 1920,
                "Mid-Range": 3200,
                "Premium": 4960,
                "Luxury": 7360
              }
            },
            {
              "item": "Entry, Porch & Steps",
              "description": "New entry door, rebuilt covered porch and steps, code-compliant railing and lighting",
              "costBasis": "Upstate NY full entrance package $3,500-$6,000",
              "roiRecovery": 85,
              "tiers": {
                "Budget-Friendly": 2700,
                "Mid-Range": 4500,
                "Premium": 6975,
                "Luxury": 10350
              }
            },
            {
              "item": "Siding & Trim Update",
              "description": "Repair/replace failing wood siding with new trim and flashing across the body",
              "costBasis": "Upstate NY partial siding $9,000-$15,000",
              "roiRecovery": 75,
              "tiers": {
                "Budget-Friendly": 7200,
                "Mid-Range": 12000,
                "Premium": 18600,
                "Luxury": 27600
              }
            }
          ],
          "contingency": {
            "percentage": 22,
            "reason": "Multi-trade coordination on a 1918 wood-frame build; RRP lead rule applies to every painted surface disturbed. St. Lawrence County permit required for full scope."
          },
          "roiNote": {
            "message": "A complete exterior renovation moves this distressed pre-war Ogdensburg home from investor-only to broadly marketable.",
            "source": "Remodeling 2025 Cost vs. Value Report (Middle Atlantic) · NAR 2025 Remodeling Impact Report"
          }
        }
      }
    },
    "Kitchen": {
      "lineItems": [
        {
          "item": "Cabinets & Hardware",
          "description": "Semi-custom cabinet replacement with soft-close hardware",
          "costBasis": "Upstate NY stock $140-$280/linear ft | semi-custom $280-$560/linear ft installed",
          "roiRecovery": 62,
          "tiers": {
            "Budget-Friendly": 6050,
            "Mid-Range": 11000,
            "Premium": 18700,
            "Luxury": 30800
          }
        },
        {
          "item": "Countertops (Quartz)",
          "description": "Quartz fabrication and installation; approximately 30-40 sqft",
          "costBasis": "Upstate NY quartz $50-$130/sqft installed",
          "roiRecovery": 68,
          "tiers": {
            "Budget-Friendly": 1870,
            "Mid-Range": 3400,
            "Premium": 5780,
            "Luxury": 9520
          }
        },
        {
          "item": "Appliance Package",
          "description": "Refrigerator, range, dishwasher and microwave (stainless steel)",
          "costBasis": "Upstate NY mid-range appliance package $5,000-$10,000 with delivery and install",
          "roiRecovery": 58,
          "tiers": {
            "Budget-Friendly": 3850,
            "Mid-Range": 7000,
            "Premium": 11900,
            "Luxury": 19600
          }
        },
        {
          "item": "Flooring & Backsplash",
          "description": "LVP or tile flooring replacement plus tile backsplash installation",
          "costBasis": "Upstate NY LVP $4-$10/sqft installed | tile backsplash $18-$40/sqft",
          "roiRecovery": 66,
          "tiers": {
            "Budget-Friendly": 1870,
            "Mid-Range": 3400,
            "Premium": 5780,
            "Luxury": 9520
          }
        },
        {
          "item": "Lighting & Electrical",
          "description": "Recessed lights, dedicated circuits, GFCI outlets and under-cabinet LED",
          "costBasis": "Upstate NY electrician $70-$110/hr; 1918 knob-and-tube replacement often required",
          "roiRecovery": 60,
          "tiers": {
            "Budget-Friendly": 1760,
            "Mid-Range": 3200,
            "Premium": 5440,
            "Luxury": 8960
          }
        }
      ],
      "contingency": {
        "percentage": 20,
        "reason": "1918 build — knob-and-tube wiring and galvanized supply lines are common and frequently must be replaced to pass St. Lawrence County inspection. Permit required."
      },
      "roiNote": {
        "message": "A dated kitchen is the single biggest drag on value for this home; a mid-tier update recovers most of its cost.",
        "source": "Remodeling 2025 Cost vs. Value Report (Middle Atlantic) · NAR 2025 Remodeling Impact Report"
      }
    },
    "Bathroom": {
      "lineItems": [
        {
          "item": "Demo & Rough Plumbing",
          "description": "Strip the bathroom to studs, replace supply and waste lines within the room. Property has 1.5 baths; this prices the full bath",
          "costBasis": "Upstate NY demo $800-$1,500 | rough plumbing $1,800-$3,600",
          "roiRecovery": 60,
          "tiers": {
            "Budget-Friendly": 1540,
            "Mid-Range": 2800,
            "Premium": 4760,
            "Luxury": 7840
          }
        },
        {
          "item": "Tile & Tub/Shower Surround",
          "description": "New tub or shower pan with full-height tile surround and waterproofing membrane",
          "costBasis": "Upstate NY tile $14-$32/sqft installed | tub/shower unit $800-$2,600",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 2750,
            "Mid-Range": 5000,
            "Premium": 8500,
            "Luxury": 14000
          }
        },
        {
          "item": "Vanity, Toilet & Fixtures",
          "description": "New vanity with top, toilet, faucet, shower valve and trim",
          "costBasis": "Upstate NY vanity $600-$2,000 | toilet $350-$800 | fixtures $450-$1,300 installed",
          "roiRecovery": 68,
          "tiers": {
            "Budget-Friendly": 1650,
            "Mid-Range": 3000,
            "Premium": 5100,
            "Luxury": 8400
          }
        },
        {
          "item": "Flooring & Waterproofing",
          "description": "Porcelain or LVT flooring over a properly prepped and waterproofed subfloor",
          "costBasis": "Upstate NY bath flooring $10-$24/sqft installed including prep",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 990,
            "Mid-Range": 1800,
            "Premium": 3060,
            "Luxury": 5040
          }
        },
        {
          "item": "Lighting & Ventilation",
          "description": "Vanity lighting, ceiling fixture and code-compliant exhaust fan ducted to exterior",
          "costBasis": "Upstate NY: fan $300-$700 installed | lighting $250-$700",
          "roiRecovery": 60,
          "tiers": {
            "Budget-Friendly": 715,
            "Mid-Range": 1300,
            "Premium": 2210,
            "Luxury": 3640
          }
        }
      ],
      "contingency": {
        "percentage": 20,
        "reason": "1918 build — cast-iron waste stack corrosion and concealed water damage behind original tile are common. St. Lawrence County plumbing permit required."
      },
      "roiNote": {
        "message": "Bathroom updates are a top-three ROI project; the half-bath is a low-cost add that broadens buyer appeal.",
        "source": "Remodeling 2025 Cost vs. Value Report (Middle Atlantic) · NAR 2025 Remodeling Impact Report"
      }
    },
    "Living Room": {
      "lineItems": [
        {
          "item": "Hardwood Refinish or Replacement",
          "description": "Sand and refinish existing hardwood, or replace with engineered hardwood/LVP",
          "costBasis": "Upstate NY refinishing $3-$7/sqft | engineered hardwood $5-$11/sqft installed",
          "roiRecovery": 72,
          "tiers": {
            "Budget-Friendly": 1540,
            "Mid-Range": 2800,
            "Premium": 4760,
            "Luxury": 7840
          }
        },
        {
          "item": "Paint, Trim & Plaster Repair",
          "description": "Patch and skim-coat plaster, repaint walls and ceiling, repair original trim",
          "costBasis": "Upstate NY plaster repair $3-$6/sqft | room repaint $350-$700",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 1320,
            "Mid-Range": 2400,
            "Premium": 4080,
            "Luxury": 6720
          }
        },
        {
          "item": "Lighting Upgrade",
          "description": "Ceiling fixture, added circuits and switching for a pre-war room",
          "costBasis": "Upstate NY electrician $70-$110/hr; adding a ceiling circuit $600-$1,300",
          "roiRecovery": 60,
          "tiers": {
            "Budget-Friendly": 990,
            "Mid-Range": 1800,
            "Premium": 3060,
            "Luxury": 5040
          }
        }
      ],
      "contingency": {
        "percentage": 18,
        "reason": "1918 plaster and lath conceal cracking and prior water damage; original wiring frequently needs replacement before new fixtures can be permitted."
      },
      "roiNote": {
        "message": "Original hardwood and trim are the selling points of a 1918 home — restoring beats replacing.",
        "source": "Remodeling 2025 Cost vs. Value Report (Middle Atlantic) · NAR 2025 Remodeling Impact Report"
      }
    },
    "Bedroom": {
      "lineItems": [
        {
          "item": "Flooring Replacement",
          "description": "Remove carpet or damaged flooring; refinish original hardwood or install LVP",
          "costBasis": "Upstate NY refinishing $3-$7/sqft | LVP $4-$10/sqft installed",
          "roiRecovery": 70,
          "tiers": {
            "Budget-Friendly": 880,
            "Mid-Range": 1600,
            "Premium": 2720,
            "Luxury": 4480
          }
        },
        {
          "item": "Paint & Trim",
          "description": "Repaint walls and ceiling, patch plaster, repair or replace baseboard and casings",
          "costBasis": "Upstate NY room repaint $350-$700 | trim $6-$12/lf installed",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 660,
            "Mid-Range": 1200,
            "Premium": 2040,
            "Luxury": 3360
          }
        },
        {
          "item": "Closet System",
          "description": "Modular closet build-out; pre-war bedrooms typically have minimal closet space",
          "costBasis": "Upstate NY modular closet $900-$2,200 installed",
          "roiRecovery": 58,
          "tiers": {
            "Budget-Friendly": 825,
            "Mid-Range": 1500,
            "Premium": 2550,
            "Luxury": 4200
          }
        }
      ],
      "contingency": {
        "percentage": 15,
        "reason": "Pre-1978 build (1918) — sanding painted trim triggers the RRP lead rule. Flooring removal may reveal subfloor issues."
      },
      "roiNote": {
        "message": "Closet space is the weak point of pre-war bedrooms and is the cheapest lift to perceived quality.",
        "source": "Remodeling 2025 Cost vs. Value Report (Middle Atlantic) · NAR 2025 Remodeling Impact Report"
      }
    }
  }
};

module.exports = { id: RENSSELAER_PROPERTY_ID, config, RENSSELAER_PROPERTY_ID };
