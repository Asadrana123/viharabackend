/**
 * renovationCosts/bayonne.cottage.js
 *
 * 13 Cottage St, Bayonne, NJ 07002 — 2,426 sqft · 3 stories · built 1920 · legal 3-family.
 *
 * regionalFactor 1.25: NJ professional painting runs ~22% above the national
 * average on labor (CalcSmart NJ guide, Mar 2026), and Hudson County kitchen/bath
 * work runs a further 10-15% over Central NJ (PS Elite Construction, 2026).
 *
 * NOTE — Kitchen and Bathroom price ONE room each. This is a legal 3-family with
 * three separate kitchens and three full baths; a whole-property scope scales
 * those two areas accordingly.
 *
 * Tier shape follows the portfolio convention (see _shared.js):
 *   Exterior line items : 0.60 / 1.00 / 1.55 / 2.30  x Mid-Range
 *   Interior line items : 0.55 / 1.00 / 1.70 / 2.80  x Mid-Range
 */

const COTTAGE_PROPERTY_ID = '6a57391bfc8734787b924f87';

const config = {
    "meta": {
      "address": "13 Cottage St, Bayonne, NJ 07002",
      "city": "Bayonne",
      "state": "New Jersey",
      "squareFootage": 2426,
      "bedrooms": 7,
      "bathrooms": 3,
      "yearBuilt": 1920,
      "regionalFactor": 1.25,
      "dataSource": "CalcSmart NJ Painting Cost Guide (Mar 2026) · PS Elite Construction Hudson County Kitchen/Bath Guides (2026) · Remodeling 2025 Cost vs. Value Report (Middle Atlantic Region)"
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
                "description": "Power wash, scrape failing paint, caulk, and prime bare wood across a 3-story 1920 facade",
                "costBasis": "Prep is 70-85% of NJ exterior paint labor; $1,500-$2,500 on a 3-story Bayonne home",
                "roiRecovery": 55,
                "tiers": {
                  "Budget-Friendly": 1200,
                  "Mid-Range": 2000,
                  "Premium": 3100,
                  "Luxury": 4600
                }
              },
              {
                "item": "Exterior Paint (Walls, Trim & Shutters)",
                "description": "Two-coat 100% acrylic application on all wall surfaces, trim, and shutters",
                "costBasis": "NJ exterior: $2.20-$4.88/sqft; Jersey City area repaints average $5,201-$6,938",
                "roiRecovery": 60,
                "tiers": {
                  "Budget-Friendly": 3900,
                  "Mid-Range": 6500,
                  "Premium": 10075,
                  "Luxury": 14950
                }
              },
              {
                "item": "Front Door & Porch Repaint",
                "description": "Strip, prime and repaint front door and porch woodwork with updated hardware",
                "costBasis": "NJ door repaint $400-$700 | hardware $150-$450",
                "roiRecovery": 70,
                "tiers": {
                  "Budget-Friendly": 540,
                  "Mid-Range": 900,
                  "Premium": 1395,
                  "Luxury": 2070
                }
              }
            ],
            "contingency": {
              "percentage": 18,
              "reason": "Pre-1978 build (1920) — EPA RRP lead-safe work practices required; certified renovator, containment and testing ($250-$500). Bayonne permit required."
            },
            "roiNote": {
              "message": "Fresh exterior paint is the highest-visual-impact, lowest-cost upgrade for a Bayonne multi-family.",
              "source": "Remodeling 2025 Cost vs. Value Report (Middle Atlantic) · NAR 2025 Remodeling Impact Report"
            }
          },
          "Update roof/siding": {
            "lineItems": [
              {
                "item": "Roof Tear-Off & Disposal",
                "description": "Strip existing roofing to deck, inspect sheathing, haul away debris",
                "costBasis": "NJ tear-off $1.50-$3.00/sqft on a ~1,000 sqft roof footprint",
                "roiRecovery": 60,
                "tiers": {
                  "Budget-Friendly": 2100,
                  "Mid-Range": 3500,
                  "Premium": 5425,
                  "Luxury": 8050
                }
              },
              {
                "item": "Architectural Shingle Roof",
                "description": "New architectural shingles with ice-and-water shield, drip edge and ridge vent",
                "costBasis": "NJ roofing $7-$11/sqft installed; ~1,000 sqft roof on this 3-story footprint",
                "roiRecovery": 68,
                "tiers": {
                  "Budget-Friendly": 5400,
                  "Mid-Range": 9000,
                  "Premium": 13950,
                  "Luxury": 20700
                }
              },
              {
                "item": "Siding Repair & Trim Replacement",
                "description": "Repair/replace failing siding sections and rotted trim boards across three stories",
                "costBasis": "NJ siding $5-$9/sqft; 3-story access adds staging cost",
                "roiRecovery": 75,
                "tiers": {
                  "Budget-Friendly": 8400,
                  "Mid-Range": 14000,
                  "Premium": 21700,
                  "Luxury": 32200
                }
              }
            ],
            "contingency": {
              "percentage": 20,
              "reason": "1920 build — concealed sheathing rot and lead-painted trim are common; RRP rule applies. Bayonne permit and 3-story staging required."
            },
            "roiNote": {
              "message": "Roof and siding condition is the first thing Bayonne inspectors and buyers scrutinize on a pre-war multi-family.",
              "source": "Remodeling 2025 Cost vs. Value Report (Middle Atlantic) · NAR 2025 Remodeling Impact Report"
            }
          },
          "New windows": {
            "lineItems": [
              {
                "item": "Window Removal & Disposal",
                "description": "Remove approximately 12-14 existing window units across three stories",
                "costBasis": "$120-$220 per window removal in Hudson County; lead-safe containment adds labor",
                "roiRecovery": 65,
                "tiers": {
                  "Budget-Friendly": 1080,
                  "Mid-Range": 1800,
                  "Premium": 2790,
                  "Luxury": 4140
                }
              },
              {
                "item": "New Window Units (12-14 windows)",
                "description": "Vinyl double-pane (budget) to fiberglass triple-pane (premium); Energy Star rated",
                "costBasis": "NJ: $900-$1,700/window vinyl | $1,800-$3,200/window fiberglass installed",
                "roiRecovery": 67,
                "tiers": {
                  "Budget-Friendly": 11400,
                  "Mid-Range": 19000,
                  "Premium": 29450,
                  "Luxury": 43700
                }
              },
              {
                "item": "Exterior Trim & Caulking",
                "description": "New exterior trim, weather-seal caulking and touch-up paint around every opening",
                "costBasis": "$200-$450 per window for trim and finishing in North Jersey",
                "roiRecovery": 65,
                "tiers": {
                  "Budget-Friendly": 2160,
                  "Mid-Range": 3600,
                  "Premium": 5580,
                  "Luxury": 8280
                }
              }
            ],
            "contingency": {
              "percentage": 18,
              "reason": "Pre-1978 build — window removal disturbs lead paint; RRP-certified crew required. Bayonne permit required."
            },
            "roiNote": {
              "message": "Energy-efficient windows cut utility costs meaningfully in NJ's climate and are a strong tenant draw.",
              "source": "Remodeling 2025 Cost vs. Value Report (Middle Atlantic) · NAR 2025 Remodeling Impact Report"
            }
          },
          "New entrance": {
            "lineItems": [
              {
                "item": "New Entry Door System",
                "description": "New fiberglass or steel entry door, frame, sidelights and weatherstripping",
                "costBasis": "NJ entry door replacement $2,800-$6,000 installed",
                "roiRecovery": 90,
                "tiers": {
                  "Budget-Friendly": 2520,
                  "Mid-Range": 4200,
                  "Premium": 6510,
                  "Luxury": 9660
                }
              },
              {
                "item": "Porch, Steps & Railing",
                "description": "Rebuild front steps and porch decking, new code-compliant railing",
                "costBasis": "NJ porch/step rebuild $4,000-$8,000 depending on masonry vs wood",
                "roiRecovery": 70,
                "tiers": {
                  "Budget-Friendly": 3300,
                  "Mid-Range": 5500,
                  "Premium": 8525,
                  "Luxury": 12650
                }
              },
              {
                "item": "Entry Lighting & Hardware",
                "description": "Exterior sconces, house numbers, and updated lockset/hardware",
                "costBasis": "NJ: fixtures $150-$400 each installed | hardware $150-$450",
                "roiRecovery": 75,
                "tiers": {
                  "Budget-Friendly": 840,
                  "Mid-Range": 1400,
                  "Premium": 2170,
                  "Luxury": 3220
                }
              }
            ],
            "contingency": {
              "percentage": 15,
              "reason": "Step and porch demo on a 1920 build may expose structural rot; Bayonne permit required for structural work."
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
                "costBasis": "NJ door refresh $600-$1,200 | hardware $150-$450",
                "roiRecovery": 75,
                "tiers": {
                  "Budget-Friendly": 1080,
                  "Mid-Range": 1800,
                  "Premium": 2790,
                  "Luxury": 4140
                }
              },
              {
                "item": "Porch Steps & Railing Repair",
                "description": "Repair front steps, patch masonry, and bring railing to current code",
                "costBasis": "NJ step/railing repair $2,200-$4,500",
                "roiRecovery": 70,
                "tiers": {
                  "Budget-Friendly": 1920,
                  "Mid-Range": 3200,
                  "Premium": 4960,
                  "Luxury": 7360
                }
              },
              {
                "item": "Entry Lighting & House Numbers",
                "description": "New exterior sconces and visible house numbering",
                "costBasis": "NJ: $150-$400 per fixture installed",
                "roiRecovery": 75,
                "tiers": {
                  "Budget-Friendly": 450,
                  "Mid-Range": 750,
                  "Premium": 1162,
                  "Luxury": 1725
                }
              }
            ],
            "contingency": {
              "percentage": 15,
              "reason": "1920 masonry steps may need more repair than surface inspection reveals; lead-safe practices apply."
            },
            "roiNote": {
              "message": "The front entrance sets first impression on a dense Bayonne street where curb frontage is narrow.",
              "source": "Remodeling 2025 Cost vs. Value Report (Middle Atlantic) · NAR 2025 Remodeling Impact Report"
            }
          },
          "Landscaping": {
            "lineItems": [
              {
                "item": "Clearing & Grading",
                "description": "Clear overgrowth from the private backyard, regrade for drainage away from foundation",
                "costBasis": "NJ clearing/grading $1,200-$2,000 on a 2,500 sqft lot",
                "roiRecovery": 90,
                "tiers": {
                  "Budget-Friendly": 900,
                  "Mid-Range": 1500,
                  "Premium": 2325,
                  "Luxury": 3450
                }
              },
              {
                "item": "Planting, Mulch & Edging",
                "description": "Foundation plantings, mulch beds, and edging at the front and rear yard",
                "costBasis": "NJ planting package $2,000-$3,500 for a small urban lot",
                "roiRecovery": 100,
                "tiers": {
                  "Budget-Friendly": 1560,
                  "Mid-Range": 2600,
                  "Premium": 4030,
                  "Luxury": 5980
                }
              },
              {
                "item": "Walkway & Front Yard",
                "description": "Repair or replace the front walkway and tidy the street-facing yard",
                "costBasis": "NJ walkway $14-$28/sqft installed",
                "roiRecovery": 85,
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
              "reason": "Drainage correction may be required on a 2,500 sqft lot; Bayonne permit needed for hardscape."
            },
            "roiNote": {
              "message": "The private backyard is a genuine differentiator for tenants in this part of Bayonne and lifts rentability.",
              "source": "Remodeling 2025 Cost vs. Value Report (Middle Atlantic) · NAR 2025 Remodeling Impact Report"
            }
          },
          "Driveway": {
            "lineItems": [
              {
                "item": "Driveway Demo & Grading",
                "description": "Remove existing surface, regrade and compact the subbase",
                "costBasis": "NJ demo and prep $1,100-$1,900 for a narrow urban driveway",
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
                "description": "Concrete (standard) through decorative pavers (premium), with edging and sealer",
                "costBasis": "NJ concrete $9-$15/sqft | pavers $18-$35/sqft installed",
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
              "reason": "Off-street parking is scarce in Bayonne; curb-cut approval may be required from the city."
            },
            "roiNote": {
              "message": "Off-street parking carries an outsized premium in Bayonne, where street parking is heavily contested.",
              "source": "Remodeling 2025 Cost vs. Value Report (Middle Atlantic) · NAR 2025 Remodeling Impact Report"
            }
          },
          "Patio": {
            "lineItems": [
              {
                "item": "Patio Demo & Base Prep",
                "description": "Remove existing surface, excavate and compact a gravel base in the rear yard",
                "costBasis": "NJ demo/base prep $900-$1,500 for a ~180 sqft urban patio",
                "roiRecovery": 70,
                "tiers": {
                  "Budget-Friendly": 660,
                  "Mid-Range": 1100,
                  "Premium": 1705,
                  "Luxury": 2530
                }
              },
              {
                "item": "Patio Surface & Finishing",
                "description": "Concrete, stamped concrete, or natural stone pavers with sealer and edging",
                "costBasis": "NJ concrete patio $10-$16/sqft | pavers $18-$38/sqft installed",
                "roiRecovery": 80,
                "tiers": {
                  "Budget-Friendly": 3120,
                  "Mid-Range": 5200,
                  "Premium": 8060,
                  "Luxury": 11960
                }
              }
            ],
            "contingency": {
              "percentage": 12,
              "reason": "Rear-yard drainage engineering may be required; Bayonne permit needed."
            },
            "roiNote": {
              "message": "Usable outdoor space in the private backyard is rare on this block and supports higher rents per unit.",
              "source": "Remodeling 2025 Cost vs. Value Report (Middle Atlantic) · NAR 2025 Remodeling Impact Report"
            }
          },
          "All": {
            "lineItems": [
              {
                "item": "Complete Exterior Paint",
                "description": "Full repaint of all exterior surfaces across three stories with premium acrylic",
                "costBasis": "NJ 3-story full repaint $5,500-$8,500",
                "roiRecovery": 60,
                "tiers": {
                  "Budget-Friendly": 3900,
                  "Mid-Range": 6500,
                  "Premium": 10075,
                  "Luxury": 14950
                }
              },
              {
                "item": "Landscaping & Curb Appeal",
                "description": "Front and rear yard: clearing, planting, mulch, edging and walkway",
                "costBasis": "NJ full landscaping package $3,500-$6,000 on a small lot",
                "roiRecovery": 95,
                "tiers": {
                  "Budget-Friendly": 2700,
                  "Mid-Range": 4500,
                  "Premium": 6975,
                  "Luxury": 10350
                }
              },
              {
                "item": "Entry, Porch & Steps",
                "description": "New entry door, rebuilt porch and steps, code-compliant railing and lighting",
                "costBasis": "NJ full entrance package $4,500-$8,500",
                "roiRecovery": 85,
                "tiers": {
                  "Budget-Friendly": 3600,
                  "Mid-Range": 6000,
                  "Premium": 9300,
                  "Luxury": 13800
                }
              },
              {
                "item": "Siding & Trim Update",
                "description": "Repair/replace failing siding sections with new trim boards and flashing",
                "costBasis": "NJ partial siding $11,000-$18,000 on a 3-story facade",
                "roiRecovery": 75,
                "tiers": {
                  "Budget-Friendly": 8400,
                  "Mid-Range": 14000,
                  "Premium": 21700,
                  "Luxury": 32200
                }
              }
            ],
            "contingency": {
              "percentage": 20,
              "reason": "Multi-trade coordination on a 1920 build; RRP lead rule applies to every surface disturbed. Bayonne permit required for full exterior scope."
            },
            "roiNote": {
              "message": "A complete exterior renovation is what moves a distressed pre-war Bayonne multi-family from investor-only to broadly marketable.",
              "source": "Remodeling 2025 Cost vs. Value Report (Middle Atlantic) · NAR 2025 Remodeling Impact Report"
            }
          }
        }
      },
      "Kitchen": {
        "lineItems": [
          {
            "item": "Cabinets & Hardware",
            "description": "Semi-custom cabinet replacement with soft-close hardware for ONE unit kitchen",
            "costBasis": "NJ semi-custom cabinets $800-$1,400/linear ft installed; ~12 lf in a unit kitchen this size",
            "roiRecovery": 65,
            "tiers": {
              "Budget-Friendly": 8250,
              "Mid-Range": 15000,
              "Premium": 25500,
              "Luxury": 42000
            }
          },
          {
            "item": "Countertops (Quartz)",
            "description": "Quartz fabrication and installation; approximately 30-35 sqft for this kitchen",
            "costBasis": "NJ quartz $75-$150/sqft installed ($2,600-$5,300 for ~35 sqft)",
            "roiRecovery": 70,
            "tiers": {
              "Budget-Friendly": 2310,
              "Mid-Range": 4200,
              "Premium": 7140,
              "Luxury": 11760
            }
          },
          {
            "item": "Appliance Package",
            "description": "Refrigerator, range, dishwasher and microwave (stainless steel)",
            "costBasis": "NJ mid-range appliance package $6,000-$11,000 with delivery and install",
            "roiRecovery": 58,
            "tiers": {
              "Budget-Friendly": 4400,
              "Mid-Range": 8000,
              "Premium": 13600,
              "Luxury": 22400
            }
          },
          {
            "item": "Flooring & Backsplash",
            "description": "LVP or tile flooring replacement plus tile backsplash installation",
            "costBasis": "NJ LVP $4-$10/sqft installed | tile backsplash $25-$50/sqft",
            "roiRecovery": 68,
            "tiers": {
              "Budget-Friendly": 3025,
              "Mid-Range": 5500,
              "Premium": 9350,
              "Luxury": 15400
            }
          },
          {
            "item": "Lighting & Electrical",
            "description": "Recessed lights, pendants, under-cabinet LED, dedicated circuits and GFCI",
            "costBasis": "NJ electrician $75-$120/hr; 1920 knob-and-tube replacement often required",
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
          "percentage": 18,
          "reason": "1920 build — knob-and-tube wiring and galvanized supply lines are common and frequently must be replaced to pass Bayonne inspection. Permit required."
        },
        "roiNote": {
          "message": "This figure prices ONE unit kitchen. The property is a legal 3-family with three separate kitchens; renovating all three scales this cost accordingly.",
          "source": "Remodeling 2025 Cost vs. Value Report (Middle Atlantic) · NAR 2025 Remodeling Impact Report"
        }
      },
      "Bathroom": {
        "lineItems": [
          {
            "item": "Demo & Rough Plumbing",
            "description": "Strip the bathroom to studs, replace supply and waste lines within the room",
            "costBasis": "NJ demo $900-$1,600 | rough plumbing $2,000-$4,000 in a pre-war home",
            "roiRecovery": 60,
            "tiers": {
              "Budget-Friendly": 1760,
              "Mid-Range": 3200,
              "Premium": 5440,
              "Luxury": 8960
            }
          },
          {
            "item": "Tile & Tub/Shower Surround",
            "description": "New tub or shower pan with full-height tile surround and waterproofing membrane",
            "costBasis": "NJ tile $18-$40/sqft installed | tub/shower unit $900-$3,000",
            "roiRecovery": 65,
            "tiers": {
              "Budget-Friendly": 3575,
              "Mid-Range": 6500,
              "Premium": 11050,
              "Luxury": 18200
            }
          },
          {
            "item": "Vanity, Toilet & Fixtures",
            "description": "New vanity with top, toilet, faucet, shower valve and trim",
            "costBasis": "NJ vanity $700-$2,500 | toilet $400-$900 | fixtures $500-$1,500 installed",
            "roiRecovery": 68,
            "tiers": {
              "Budget-Friendly": 2090,
              "Mid-Range": 3800,
              "Premium": 6460,
              "Luxury": 10640
            }
          },
          {
            "item": "Flooring & Waterproofing",
            "description": "Porcelain or LVT flooring over a properly prepped and waterproofed subfloor",
            "costBasis": "NJ bath flooring $12-$28/sqft installed including prep",
            "roiRecovery": 65,
            "tiers": {
              "Budget-Friendly": 1320,
              "Mid-Range": 2400,
              "Premium": 4080,
              "Luxury": 6720
            }
          },
          {
            "item": "Lighting & Ventilation",
            "description": "Vanity lighting, ceiling fixture and code-compliant exhaust fan ducted to exterior",
            "costBasis": "NJ: fan $350-$800 installed | lighting $300-$900",
            "roiRecovery": 60,
            "tiers": {
              "Budget-Friendly": 880,
              "Mid-Range": 1600,
              "Premium": 2720,
              "Luxury": 4480
            }
          }
        ],
        "contingency": {
          "percentage": 18,
          "reason": "1920 build — concealed water damage behind tile and cast-iron waste stack corrosion are common. Bayonne plumbing permit required."
        },
        "roiNote": {
          "message": "Bathroom updates are a top-three ROI project and are decisive for per-unit rent in a Bayonne 3-family.",
          "source": "Remodeling 2025 Cost vs. Value Report (Middle Atlantic) · NAR 2025 Remodeling Impact Report"
        }
      },
      "Living Room": {
        "lineItems": [
          {
            "item": "Hardwood Refinish or Replacement",
            "description": "Sand and refinish existing hardwood, or replace with engineered hardwood/LVP",
            "costBasis": "NJ refinishing $4-$8/sqft | engineered hardwood $6-$12/sqft installed",
            "roiRecovery": 72,
            "tiers": {
              "Budget-Friendly": 2310,
              "Mid-Range": 4200,
              "Premium": 7140,
              "Luxury": 11760
            }
          },
          {
            "item": "Paint, Trim & Plaster Repair",
            "description": "Patch and skim-coat plaster, repaint walls and ceiling, repair original trim",
            "costBasis": "NJ plaster repair $3-$7/sqft | room repaint $400-$800",
            "roiRecovery": 65,
            "tiers": {
              "Budget-Friendly": 1760,
              "Mid-Range": 3200,
              "Premium": 5440,
              "Luxury": 8960
            }
          },
          {
            "item": "Lighting Upgrade",
            "description": "Ceiling fixture, added circuits and switching for a pre-war room with no overhead wiring",
            "costBasis": "NJ electrician $75-$120/hr; adding a ceiling circuit $600-$1,400",
            "roiRecovery": 60,
            "tiers": {
              "Budget-Friendly": 1210,
              "Mid-Range": 2200,
              "Premium": 3740,
              "Luxury": 6160
            }
          }
        ],
        "contingency": {
          "percentage": 15,
          "reason": "1920 plaster walls hide cracking and prior water damage; knob-and-tube may need replacement before new fixtures can be permitted."
        },
        "roiNote": {
          "message": "Original hardwood and plaster detail are the selling points of a 1920 Bayonne home — restoring beats replacing.",
          "source": "Remodeling 2025 Cost vs. Value Report (Middle Atlantic) · NAR 2025 Remodeling Impact Report"
        }
      },
      "Bedroom": {
        "lineItems": [
          {
            "item": "Flooring Replacement",
            "description": "Remove carpet or damaged flooring; refinish original hardwood or install LVP",
            "costBasis": "NJ refinishing $4-$8/sqft | LVP $4-$10/sqft installed",
            "roiRecovery": 70,
            "tiers": {
              "Budget-Friendly": 1210,
              "Mid-Range": 2200,
              "Premium": 3740,
              "Luxury": 6160
            }
          },
          {
            "item": "Paint & Trim",
            "description": "Repaint walls and ceiling, patch plaster, repair or replace baseboard and casings",
            "costBasis": "NJ room repaint $400-$800 | trim $7-$14/lf installed",
            "roiRecovery": 65,
            "tiers": {
              "Budget-Friendly": 825,
              "Mid-Range": 1500,
              "Premium": 2550,
              "Luxury": 4200
            }
          },
          {
            "item": "Closet System",
            "description": "Modular closet build-out; pre-war bedrooms typically have minimal closet space",
            "costBasis": "NJ modular closet $1,200-$3,000 installed",
            "roiRecovery": 58,
            "tiers": {
              "Budget-Friendly": 990,
              "Mid-Range": 1800,
              "Premium": 3060,
              "Luxury": 5040
            }
          }
        ],
        "contingency": {
          "percentage": 15,
          "reason": "Pre-1978 build — sanding painted trim triggers the RRP lead rule. Flooring removal may reveal subfloor issues."
        },
        "roiNote": {
          "message": "Closet space is the weak point of pre-war bedrooms and is the cheapest way to lift perceived unit quality.",
          "source": "Remodeling 2025 Cost vs. Value Report (Middle Atlantic) · NAR 2025 Remodeling Impact Report"
        }
      }
    }
  };

module.exports = { id: COTTAGE_PROPERTY_ID, config, COTTAGE_PROPERTY_ID };
