/**
 * renovationCosts/chicago.elizabeth.js
 *
 * 12226 S Elizabeth St, Chicago, IL 60643 — 730 sqft · 1 story · built 1952 ·
 * masonry, unfinished basement, detached garage. West Pullman.
 *
 * regionalFactor 1.15: Chicago remodeling consistently runs 15-25% above national
 * benchmarks on labor and permitting (multiple 2026 Chicago contractor surveys);
 * 1.15 is the conservative end of that band.
 *
 * Tier shape follows the portfolio convention (see _shared.js):
 *   Exterior line items : 0.60 / 1.00 / 1.55 / 2.30  x Mid-Range
 *   Interior line items : 0.55 / 1.00 / 1.70 / 2.80  x Mid-Range
 */

const ELIZABETH_PROPERTY_ID = '6a57391bfc8734787b924f88';

const config = {
    "meta": {
      "address": "12226 S Elizabeth St, Chicago, IL 60643",
      "city": "Chicago",
      "state": "Illinois",
      "squareFootage": 730,
      "bedrooms": 2,
      "bathrooms": 2,
      "yearBuilt": 1952,
      "regionalFactor": 1.15,
      "dataSource": "Angi Chicago Exterior/Interior Painting Cost Data (2026) · Chicago kitchen & bath contractor pricing surveys (2026) · Remodeling 2025 Cost vs. Value Report (East North Central Region)"
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
                "description": "Power wash masonry, scrape failing paint from trim and soffit, prime bare wood on a 1952 build",
                "costBasis": "Chicago prep/paint stripping $0.40-$1.75/sqft; power wash included in most bids",
                "roiRecovery": 55,
                "tiers": {
                  "Budget-Friendly": 540,
                  "Mid-Range": 900,
                  "Premium": 1395,
                  "Luxury": 2070
                }
              },
              {
                "item": "Exterior Paint (Trim, Soffit, Fascia & Garage)",
                "description": "Two-coat mildew-resistant acrylic on trim, soffit, fascia, and the detached garage; brick body left unpainted",
                "costBasis": "Chicago exterior $2-$6/sqft; full-home repaints average $2,773-$3,830",
                "roiRecovery": 55,
                "tiers": {
                  "Budget-Friendly": 1440,
                  "Mid-Range": 2400,
                  "Premium": 3720,
                  "Luxury": 5520
                }
              },
              {
                "item": "Front Door & Hardware",
                "description": "Strip, prime and repaint the front door with updated exterior hardware",
                "costBasis": "Chicago door repaint $350-$600 | hardware $150-$400",
                "roiRecovery": 70,
                "tiers": {
                  "Budget-Friendly": 390,
                  "Mid-Range": 650,
                  "Premium": 1008,
                  "Luxury": 1495
                }
              }
            ],
            "contingency": {
              "percentage": 15,
              "reason": "Pre-1978 build (1952) — EPA RRP lead-safe work practices required; certified renovator plus testing ($250-$500). Chicago does not require a permit for standard exterior painting."
            },
            "roiNote": {
              "message": "A clean trim-and-soffit repaint is the cheapest way to lift curb appeal on a West Pullman masonry bungalow without painting the brick, which buyers here penalize.",
              "source": "Remodeling 2025 Cost vs. Value Report (East North Central) · NAR 2025 Remodeling Impact Report"
            }
          },
          "Update roof/siding": {
            "lineItems": [
              {
                "item": "Roof Tear-Off & Disposal",
                "description": "Strip existing roofing to deck, inspect sheathing, haul away debris",
                "costBasis": "Chicago tear-off $1.25-$2.50/sqft on a ~900-1,100 sqft roof",
                "roiRecovery": 60,
                "tiers": {
                  "Budget-Friendly": 960,
                  "Mid-Range": 1600,
                  "Premium": 2480,
                  "Luxury": 3680
                }
              },
              {
                "item": "Architectural Shingle Roof",
                "description": "New architectural shingles with ice-and-water shield, drip edge and ridge vent",
                "costBasis": "Chicago roofing $5-$8/sqft installed; 100+ freeze-thaw cycles/yr demand full underlayment",
                "roiRecovery": 65,
                "tiers": {
                  "Budget-Friendly": 3900,
                  "Mid-Range": 6500,
                  "Premium": 10075,
                  "Luxury": 14950
                }
              },
              {
                "item": "Masonry Tuckpointing & Repair",
                "description": "Grind and repoint failing mortar joints, replace spalled brick, reseal lintels",
                "costBasis": "Chicago tuckpointing $8-$20/sqft of wall area; the defining maintenance item on brick stock",
                "roiRecovery": 78,
                "tiers": {
                  "Budget-Friendly": 3120,
                  "Mid-Range": 5200,
                  "Premium": 8060,
                  "Luxury": 11960
                }
              }
            ],
            "contingency": {
              "percentage": 20,
              "reason": "1952 masonry — freeze-thaw spalling and hidden lintel rust are common and cannot be assessed from listing photos. Chicago permit required for roofing."
            },
            "roiNote": {
              "message": "Tuckpointing is the single highest-value exterior repair on a Chicago brick home; deferred mortar failure drives water into the wall.",
              "source": "Remodeling 2025 Cost vs. Value Report (East North Central) · NAR 2025 Remodeling Impact Report"
            }
          },
          "New windows": {
            "lineItems": [
              {
                "item": "Window Removal & Disposal",
                "description": "Remove approximately 6-8 existing window units from masonry openings",
                "costBasis": "Chicago $90-$180 per window removal; lead-safe containment adds labor on pre-1978 stock",
                "roiRecovery": 65,
                "tiers": {
                  "Budget-Friendly": 420,
                  "Mid-Range": 700,
                  "Premium": 1085,
                  "Luxury": 1610
                }
              },
              {
                "item": "New Window Units (6-8 windows)",
                "description": "Vinyl double-pane (budget) to fiberglass triple-pane (premium); Energy Star rated for Zone 5A",
                "costBasis": "Chicago: $700-$1,400/window vinyl | $1,500-$2,800/window fiberglass installed",
                "roiRecovery": 67,
                "tiers": {
                  "Budget-Friendly": 4320,
                  "Mid-Range": 7200,
                  "Premium": 11160,
                  "Luxury": 16560
                }
              },
              {
                "item": "Exterior Trim & Caulking",
                "description": "New exterior trim, weather-seal caulking and touch-up paint around every masonry opening",
                "costBasis": "Chicago $150-$350 per window for trim and finishing",
                "roiRecovery": 65,
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
              "reason": "Pre-1978 build (1952) — window removal disturbs lead paint; RRP-certified crew required. Chicago permit required."
            },
            "roiNote": {
              "message": "Energy-efficient windows matter more in Chicago than most metros: Zone 5A winters and lake-effect wind make single-pane a visible utility cost.",
              "source": "Remodeling 2025 Cost vs. Value Report (East North Central) · NAR 2025 Remodeling Impact Report"
            }
          },
          "New entrance": {
            "lineItems": [
              {
                "item": "New Entry Door System",
                "description": "New fiberglass or steel entry door, frame and weatherstripping rated for Zone 5A",
                "costBasis": "Chicago entry door replacement $2,000-$4,200 installed",
                "roiRecovery": 90,
                "tiers": {
                  "Budget-Friendly": 1560,
                  "Mid-Range": 2600,
                  "Premium": 4030,
                  "Luxury": 5980
                }
              },
              {
                "item": "Front Steps & Stoop Repair",
                "description": "Repair or rebuild the concrete front steps and stoop, patch spalling, reset handrail",
                "costBasis": "Chicago concrete step rebuild $2,000-$5,000; freeze-thaw spalling is near-universal",
                "roiRecovery": 70,
                "tiers": {
                  "Budget-Friendly": 1680,
                  "Mid-Range": 2800,
                  "Premium": 4340,
                  "Luxury": 6440
                }
              },
              {
                "item": "Entry Lighting & Hardware",
                "description": "Exterior sconces, house numbers, and updated lockset/hardware",
                "costBasis": "Chicago: fixtures $130-$350 each installed | hardware $150-$400",
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
              "reason": "Concrete step demo on a 1952 build may expose failed footings; Chicago permit required for structural work."
            },
            "roiNote": {
              "message": "Entry replacement is consistently among the highest cost-recovery exterior projects nationally.",
              "source": "Remodeling 2025 Cost vs. Value Report (East North Central) · NAR 2025 Remodeling Impact Report"
            }
          }
        },
        "focusAreas": {
          "Front entrance": {
            "lineItems": [
              {
                "item": "Entry Door Refresh",
                "description": "Strip, prime and repaint the entry door; replace lockset and weatherstripping",
                "costBasis": "Chicago door refresh $500-$1,000 | hardware $150-$400",
                "roiRecovery": 75,
                "tiers": {
                  "Budget-Friendly": 660,
                  "Mid-Range": 1100,
                  "Premium": 1705,
                  "Luxury": 2530
                }
              },
              {
                "item": "Front Steps & Stoop Repair",
                "description": "Patch spalled concrete steps and stoop, reset handrail to code",
                "costBasis": "Chicago concrete step repair $1,800-$3,500",
                "roiRecovery": 70,
                "tiers": {
                  "Budget-Friendly": 1440,
                  "Mid-Range": 2400,
                  "Premium": 3720,
                  "Luxury": 5520
                }
              },
              {
                "item": "Entry Lighting & House Numbers",
                "description": "New exterior sconces and visible house numbering",
                "costBasis": "Chicago: $130-$350 per fixture installed",
                "roiRecovery": 75,
                "tiers": {
                  "Budget-Friendly": 330,
                  "Mid-Range": 550,
                  "Premium": 852,
                  "Luxury": 1265
                }
              }
            ],
            "contingency": {
              "percentage": 15,
              "reason": "Freeze-thaw damage on 1952 concrete steps is often deeper than surface inspection suggests; RRP lead rule applies to painted surfaces."
            },
            "roiNote": {
              "message": "The stoop and entry are the whole streetscape read on a Chicago bungalow block.",
              "source": "Remodeling 2025 Cost vs. Value Report (East North Central) · NAR 2025 Remodeling Impact Report"
            }
          },
          "Landscaping": {
            "lineItems": [
              {
                "item": "Clearing & Grading",
                "description": "Clear overgrowth and regrade for drainage away from the foundation on a 5,250 sqft lot",
                "costBasis": "Chicago clearing/grading $700-$1,400",
                "roiRecovery": 90,
                "tiers": {
                  "Budget-Friendly": 540,
                  "Mid-Range": 900,
                  "Premium": 1395,
                  "Luxury": 2070
                }
              },
              {
                "item": "Planting, Mulch & Edging",
                "description": "Foundation plantings, mulch beds and edging at the front yard",
                "costBasis": "Chicago planting package $1,400-$2,600",
                "roiRecovery": 100,
                "tiers": {
                  "Budget-Friendly": 1080,
                  "Mid-Range": 1800,
                  "Premium": 2790,
                  "Luxury": 4140
                }
              },
              {
                "item": "Walkway & Front Yard",
                "description": "Repair or replace the front walkway and restore the street-facing lawn",
                "costBasis": "Chicago walkway $12-$24/sqft installed",
                "roiRecovery": 85,
                "tiers": {
                  "Budget-Friendly": 1320,
                  "Mid-Range": 2200,
                  "Premium": 3410,
                  "Luxury": 5060
                }
              }
            ],
            "contingency": {
              "percentage": 12,
              "reason": "Grading toward an unfinished basement is a recurring defect on this housing stock; correcting it may expand scope."
            },
            "roiNote": {
              "message": "Curb appeal carries real weight on a bungalow block where every facade is broadly similar.",
              "source": "Remodeling 2025 Cost vs. Value Report (East North Central) · NAR 2025 Remodeling Impact Report"
            }
          },
          "Driveway": {
            "lineItems": [
              {
                "item": "Driveway Demo & Grading",
                "description": "Remove existing surface, regrade and compact the subbase to the detached garage",
                "costBasis": "Chicago demo and prep $900-$1,700",
                "roiRecovery": 65,
                "tiers": {
                  "Budget-Friendly": 720,
                  "Mid-Range": 1200,
                  "Premium": 1860,
                  "Luxury": 2760
                }
              },
              {
                "item": "New Driveway Surface",
                "description": "Concrete (standard) through decorative pavers (premium), with edging and sealer",
                "costBasis": "Chicago concrete $7-$13/sqft | pavers $16-$30/sqft installed",
                "roiRecovery": 70,
                "tiers": {
                  "Budget-Friendly": 2160,
                  "Mid-Range": 3600,
                  "Premium": 5580,
                  "Luxury": 8280
                }
              }
            ],
            "contingency": {
              "percentage": 12,
              "reason": "Chicago permit required for driveway work and any curb cut; alley access may constrain staging."
            },
            "roiNote": {
              "message": "The drive to the detached garage is standard on this stock, and a broken slab reads as deferred maintenance.",
              "source": "Remodeling 2025 Cost vs. Value Report (East North Central) · NAR 2025 Remodeling Impact Report"
            }
          },
          "Patio": {
            "lineItems": [
              {
                "item": "Patio Demo & Base Prep",
                "description": "Remove existing surface, excavate and compact a gravel base in the rear yard",
                "costBasis": "Chicago demo/base prep $650-$1,200 for a ~180 sqft patio",
                "roiRecovery": 70,
                "tiers": {
                  "Budget-Friendly": 480,
                  "Mid-Range": 800,
                  "Premium": 1240,
                  "Luxury": 1840
                }
              },
              {
                "item": "Patio Surface & Finishing",
                "description": "Concrete, stamped concrete, or natural stone pavers with sealer and edging",
                "costBasis": "Chicago concrete patio $8-$14/sqft | pavers $16-$34/sqft installed",
                "roiRecovery": 75,
                "tiers": {
                  "Budget-Friendly": 1920,
                  "Mid-Range": 3200,
                  "Premium": 4960,
                  "Luxury": 7360
                }
              }
            ],
            "contingency": {
              "percentage": 12,
              "reason": "Freeze-thaw demands a deeper compacted base in Zone 5A; drainage may need engineering. Chicago permit required."
            },
            "roiNote": {
              "message": "Outdoor space is a modest but real add on a lot this size, though Chicago's short season caps the return.",
              "source": "Remodeling 2025 Cost vs. Value Report (East North Central) · NAR 2025 Remodeling Impact Report"
            }
          },
          "All": {
            "lineItems": [
              {
                "item": "Complete Exterior Paint",
                "description": "Full repaint of all painted exterior surfaces plus the detached garage",
                "costBasis": "Chicago full repaint $3,000-$6,000 on a bungalow",
                "roiRecovery": 55,
                "tiers": {
                  "Budget-Friendly": 1440,
                  "Mid-Range": 2400,
                  "Premium": 3720,
                  "Luxury": 5520
                }
              },
              {
                "item": "Landscaping & Curb Appeal",
                "description": "Front and rear yard: clearing, planting, mulch, edging and walkway",
                "costBasis": "Chicago full landscaping package $2,200-$4,000",
                "roiRecovery": 95,
                "tiers": {
                  "Budget-Friendly": 1560,
                  "Mid-Range": 2600,
                  "Premium": 4030,
                  "Luxury": 5980
                }
              },
              {
                "item": "Entry, Steps & Stoop",
                "description": "New entry door, rebuilt concrete steps and stoop, code-compliant railing and lighting",
                "costBasis": "Chicago full entrance package $3,000-$6,000",
                "roiRecovery": 85,
                "tiers": {
                  "Budget-Friendly": 2280,
                  "Mid-Range": 3800,
                  "Premium": 5890,
                  "Luxury": 8740
                }
              },
              {
                "item": "Masonry Tuckpointing & Trim",
                "description": "Repoint failing mortar joints, replace spalled brick, and replace rotted trim",
                "costBasis": "Chicago tuckpointing $8-$20/sqft of wall area",
                "roiRecovery": 78,
                "tiers": {
                  "Budget-Friendly": 3120,
                  "Mid-Range": 5200,
                  "Premium": 8060,
                  "Luxury": 11960
                }
              }
            ],
            "contingency": {
              "percentage": 20,
              "reason": "Multi-trade coordination on a 1952 masonry build; RRP lead rule applies to every painted surface disturbed. Chicago permit required for masonry and structural scope."
            },
            "roiNote": {
              "message": "A full exterior package is what moves a distressed bungalow from cash-investor-only to conventionally financeable.",
              "source": "Remodeling 2025 Cost vs. Value Report (East North Central) · NAR 2025 Remodeling Impact Report"
            }
          }
        }
      },
      "Kitchen": {
        "lineItems": [
          {
            "item": "Cabinets & Hardware",
            "description": "Semi-custom cabinet replacement with soft-close hardware for a compact bungalow kitchen",
            "costBasis": "Chicago stock $150-$300/linear ft | semi-custom $300-$600/linear ft installed",
            "roiRecovery": 62,
            "tiers": {
              "Budget-Friendly": 5225,
              "Mid-Range": 9500,
              "Premium": 16150,
              "Luxury": 26600
            }
          },
          {
            "item": "Countertops (Quartz)",
            "description": "Quartz fabrication and installation; approximately 25-30 sqft for this kitchen",
            "costBasis": "Chicago quartz $50-$150/sqft installed",
            "roiRecovery": 68,
            "tiers": {
              "Budget-Friendly": 1650,
              "Mid-Range": 3000,
              "Premium": 5100,
              "Luxury": 8400
            }
          },
          {
            "item": "Appliance Package",
            "description": "Refrigerator, range, dishwasher and microwave (stainless steel)",
            "costBasis": "Chicago mid-range appliance package $5,000-$12,000 with delivery and install",
            "roiRecovery": 58,
            "tiers": {
              "Budget-Friendly": 3575,
              "Mid-Range": 6500,
              "Premium": 11050,
              "Luxury": 18200
            }
          },
          {
            "item": "Flooring & Backsplash",
            "description": "LVP or tile flooring replacement plus tile backsplash installation",
            "costBasis": "Chicago LVP $5-$12/sqft installed | tile backsplash $20-$45/sqft",
            "roiRecovery": 66,
            "tiers": {
              "Budget-Friendly": 1760,
              "Mid-Range": 3200,
              "Premium": 5440,
              "Luxury": 8960
            }
          },
          {
            "item": "Lighting & Electrical",
            "description": "Recessed lights, dedicated circuits, GFCI outlets and under-cabinet LED",
            "costBasis": "Chicago electrician $95-$125/hr; older service panels often need upgrading",
            "roiRecovery": 60,
            "tiers": {
              "Budget-Friendly": 1650,
              "Mid-Range": 3000,
              "Premium": 5100,
              "Luxury": 8400
            }
          }
        ],
        "contingency": {
          "percentage": 18,
          "reason": "1952 build — outdated wiring behind plaster and galvanized supply lines are common. Chicago Department of Buildings permit required for any plumbing or electrical work (minimum building-permit fee $602 as of Jan 2026; trade permits typically add $1,200-$3,500)."
        },
        "roiNote": {
          "message": "Smaller kitchens cost more per square foot in Chicago because fixed costs (appliances, plumbing, electrical) spread over fewer feet.",
          "source": "Remodeling 2025 Cost vs. Value Report (East North Central) · NAR 2025 Remodeling Impact Report"
        }
      },
      "Bathroom": {
        "lineItems": [
          {
            "item": "Demo & Rough Plumbing",
            "description": "Strip the bathroom to studs, replace supply and waste lines within the room",
            "costBasis": "Chicago demo $800-$1,500 | rough plumbing $1,800-$4,000",
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
            "costBasis": "Chicago tile $15-$35/sqft installed | tub/shower unit $800-$2,800",
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
            "costBasis": "Chicago vanity $600-$2,200 | toilet $350-$800 | fixtures $450-$1,400 installed",
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
            "costBasis": "Chicago bath flooring $10-$25/sqft installed including prep",
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
            "costBasis": "Chicago: fan $300-$750 installed | lighting $250-$800",
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
          "percentage": 18,
          "reason": "1952 build — concealed water damage behind tile and cast-iron waste stack corrosion are common. Chicago plumbing permit required."
        },
        "roiNote": {
          "message": "Chicago midrange bath remodels cluster around $15,000-$35,000 and are a top-three ROI project on this stock.",
          "source": "Remodeling 2025 Cost vs. Value Report (East North Central) · NAR 2025 Remodeling Impact Report"
        }
      },
      "Living Room": {
        "lineItems": [
          {
            "item": "Flooring Replacement",
            "description": "Refinish original hardwood or install engineered hardwood/LVP",
            "costBasis": "Chicago refinishing $3-$7/sqft | engineered hardwood $5-$12/sqft installed",
            "roiRecovery": 72,
            "tiers": {
              "Budget-Friendly": 1430,
              "Mid-Range": 2600,
              "Premium": 4420,
              "Luxury": 7280
            }
          },
          {
            "item": "Paint, Trim & Plaster Repair",
            "description": "Patch and skim-coat plaster, repaint walls and ceiling, repair original trim",
            "costBasis": "Chicago interior paint $2-$6/sqft; older homes add $0.50-$0.75/sqft for plaster prep",
            "roiRecovery": 65,
            "tiers": {
              "Budget-Friendly": 1210,
              "Mid-Range": 2200,
              "Premium": 3740,
              "Luxury": 6160
            }
          },
          {
            "item": "Lighting Upgrade",
            "description": "Ceiling fixture, added circuits and switching",
            "costBasis": "Chicago electrician $95-$125/hr; adding a ceiling circuit $600-$1,300",
            "roiRecovery": 60,
            "tiers": {
              "Budget-Friendly": 935,
              "Mid-Range": 1700,
              "Premium": 2890,
              "Luxury": 4760
            }
          }
        ],
        "contingency": {
          "percentage": 15,
          "reason": "1952 plaster hides cracking and prior water damage; older wiring may need replacement before new fixtures can be permitted."
        },
        "roiNote": {
          "message": "Chicago's vintage stock rewards restoring original plaster and trim over replacing it.",
          "source": "Remodeling 2025 Cost vs. Value Report (East North Central) · NAR 2025 Remodeling Impact Report"
        }
      },
      "Bedroom": {
        "lineItems": [
          {
            "item": "Flooring Replacement",
            "description": "Remove carpet or damaged flooring; refinish original hardwood or install LVP",
            "costBasis": "Chicago refinishing $3-$7/sqft | LVP $5-$12/sqft installed",
            "roiRecovery": 70,
            "tiers": {
              "Budget-Friendly": 825,
              "Mid-Range": 1500,
              "Premium": 2550,
              "Luxury": 4200
            }
          },
          {
            "item": "Paint & Trim",
            "description": "Repaint walls and ceiling, patch plaster, repair or replace baseboard and casings",
            "costBasis": "Chicago room repaint $800-$1,500 | trim $6-$12/lf installed",
            "roiRecovery": 65,
            "tiers": {
              "Budget-Friendly": 605,
              "Mid-Range": 1100,
              "Premium": 1870,
              "Luxury": 3080
            }
          },
          {
            "item": "Closet System",
            "description": "Modular closet build-out; bungalow bedrooms typically have minimal closet space",
            "costBasis": "Chicago modular closet $900-$2,400 installed",
            "roiRecovery": 58,
            "tiers": {
              "Budget-Friendly": 715,
              "Mid-Range": 1300,
              "Premium": 2210,
              "Luxury": 3640
            }
          }
        ],
        "contingency": {
          "percentage": 15,
          "reason": "Pre-1978 build (1952) — sanding painted trim triggers the RRP lead rule. Flooring removal may reveal subfloor issues."
        },
        "roiNote": {
          "message": "Closet space is the weak point of pre-war bungalow bedrooms and is the cheapest lift to perceived quality.",
          "source": "Remodeling 2025 Cost vs. Value Report (East North Central) · NAR 2025 Remodeling Impact Report"
        }
      }
    }
  };

module.exports = { id: ELIZABETH_PROPERTY_ID, config, ELIZABETH_PROPERTY_ID };
