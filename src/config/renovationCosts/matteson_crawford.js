/**
 * renovationCosts/matteson.crawford.js
 *
 * 20520 Crawford Ave, Matteson, IL 60443 — 950 sqft · 1 story · built 1955 ·
 * wood-frame siding, unfinished basement, attached 2-car garage, oversized
 * 20,037 sqft lot with a $100/yr HOA. South Cook County suburb.
 *
 * regionalFactor 1.08: south/west Chicago suburbs run a real premium over
 * national averages but below Chicago proper — Alpha Development Group's
 * 2026 south/west suburb pricing (Cook/Will/DuPage) and Matylac
 * Development's Matteson-specific data both price meaningfully under
 * Chicago-city rates. 1.08 sits below the city's 1.15 factor used for the
 * Elizabeth/Colfax/72nd Chicago-proper properties.
 *
 * NOTE — this lot (20,037 sqft) is roughly 4x the portfolio norm; landscaping
 * figures are scaled up accordingly. Parking Type is Attached Garage (2
 * spaces), unlike the detached/no-parking Chicago-proper properties.
 *
 * Tier shape follows the portfolio convention (see _shared.js):
 *   Exterior line items : 0.60 / 1.00 / 1.55 / 2.30  x Mid-Range
 *   Interior line items : 0.55 / 1.00 / 1.70 / 2.80  x Mid-Range
 */

const CRAWFORD_PROPERTY_ID = 'PENDING_REAL_ID_CRAWFORD';

const config = {
    "meta": {
      "address": "20520 Crawford Ave, Matteson, IL 60443",
      "city": "Matteson",
      "state": "Illinois",
      "squareFootage": 950,
      "bedrooms": 4,
      "bathrooms": 2,
      "yearBuilt": 1955,
      "regionalFactor": 1.08,
      "dataSource": "Alpha Development Group South/West Chicago Suburbs Pricing (2026) · Matylac Development Matteson Service Area Data (2026) · Remodeling 2025 Cost vs. Value Report (East North Central Region)"
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
                "description": "Power wash, scrape failing paint, and prime the full wood siding body on a 1955 build",
                "costBasis": "South suburban Cook County prep/scrape/prime on wood-sided home $750-$1,350",
                "roiRecovery": 55,
                "tiers": {
                  "Budget-Friendly": 578,
                  "Mid-Range": 1050,
                  "Premium": 1785,
                  "Luxury": 2940
                }
              },
              {
                "item": "Exterior Paint (Full Wood Siding & Trim)",
                "description": "Two-coat mildew-resistant acrylic across the full wood-sided body, trim, soffit and attached garage",
                "costBasis": "South Cook County full wood-siding repaint $2.75-$5.50/sqft exterior surface; 950 sqft home plus attached garage runs $2,600-$4,600",
                "roiRecovery": 55,
                "tiers": {
                  "Budget-Friendly": 2035,
                  "Mid-Range": 3700,
                  "Premium": 6290,
                  "Luxury": 10360
                }
              },
              {
                "item": "Front Door & Hardware",
                "description": "Strip, prime and repaint the front door with updated exterior hardware",
                "costBasis": "South Cook County door repaint $300-$550 | hardware $140-$380",
                "roiRecovery": 70,
                "tiers": {
                  "Budget-Friendly": 330,
                  "Mid-Range": 600,
                  "Premium": 1020,
                  "Luxury": 1680
                }
              }
            ],
            "contingency": {
              "percentage": 18,
              "reason": "Pre-1978 build (1955) — EPA RRP lead-safe work practices required across the full wood siding. Village of Matteson does not require a permit for standard exterior painting."
            },
            "roiNote": {
              "message": "A full-body repaint is the highest-visual-impact, lowest-cost upgrade on Matteson's 1970s-80s-era-adjacent wood-frame housing stock.",
              "source": "Remodeling 2025 Cost vs. Value Report (East North Central) · NAR 2025 Remodeling Impact Report"
            }
          },
          "Update roof/siding": {
            "lineItems": [
              {
                "item": "Siding Tear-Off & Disposal",
                "description": "Remove existing wood siding, inspect sheathing for rot, haul away debris",
                "costBasis": "South Cook County wood siding removal $1.30-$2.40/sqft on ~1,000 sqft of wall area",
                "roiRecovery": 70,
                "tiers": {
                  "Budget-Friendly": 990,
                  "Mid-Range": 1800,
                  "Premium": 3060,
                  "Luxury": 5040
                }
              },
              {
                "item": "New Fiber Cement Siding",
                "description": "Fiber cement siding replacing original wood clapboard, moisture-resistant for Zone 5A winters",
                "costBasis": "South Cook County fiber cement $8-$14/sqft installed",
                "roiRecovery": 76,
                "tiers": {
                  "Budget-Friendly": 7150,
                  "Mid-Range": 13000,
                  "Premium": 22100,
                  "Luxury": 36400
                }
              },
              {
                "item": "Roof Tear-Off & Architectural Shingle Roof",
                "description": "Full tear-off to deck, new architectural shingles with ice-and-water shield and ridge vent",
                "costBasis": "South Cook County tear-off + architectural shingle installed $5.50-$9/sqft on a ~1,100-1,300 sqft roof",
                "roiRecovery": 63,
                "tiers": {
                  "Budget-Friendly": 3960,
                  "Mid-Range": 7200,
                  "Premium": 12240,
                  "Luxury": 20160
                }
              }
            ],
            "contingency": {
              "percentage": 20,
              "reason": "1955 wood-frame — original siding commonly conceals rot or insect damage; a full removal often exposes additional repairs. Village of Matteson permit required for roofing and siding replacement."
            },
            "roiNote": {
              "message": "Replacing original wood siding with fiber cement is a durability upgrade that reads well against Matteson's predominantly newer (1970s-80s) housing stock.",
              "source": "Remodeling 2025 Cost vs. Value Report (East North Central) · NAR 2025 Remodeling Impact Report"
            }
          },
          "New windows": {
            "lineItems": [
              {
                "item": "Window Removal & Disposal",
                "description": "Remove approximately 6-7 existing window units from wood-frame openings",
                "costBasis": "South Cook County $80-$160 per window removal; lead-safe containment adds labor on this pre-1978 build",
                "roiRecovery": 63,
                "tiers": {
                  "Budget-Friendly": 385,
                  "Mid-Range": 700,
                  "Premium": 1190,
                  "Luxury": 1960
                }
              },
              {
                "item": "New Window Units (7 windows)",
                "description": "Vinyl double-pane (budget) to fiberglass triple-pane (premium); Energy Star rated for Zone 5A",
                "costBasis": "South Cook County: $650-$1,300/window vinyl | $1,400-$2,600/window fiberglass installed",
                "roiRecovery": 66,
                "tiers": {
                  "Budget-Friendly": 4180,
                  "Mid-Range": 7600,
                  "Premium": 12920,
                  "Luxury": 21280
                }
              },
              {
                "item": "Exterior Trim & Caulking",
                "description": "New exterior trim, weather-seal caulking and touch-up paint around every wood-frame opening",
                "costBasis": "South Cook County $135-$320 per window for trim and finishing",
                "roiRecovery": 63,
                "tiers": {
                  "Budget-Friendly": 770,
                  "Mid-Range": 1400,
                  "Premium": 2380,
                  "Luxury": 3920
                }
              }
            ],
            "contingency": {
              "percentage": 18,
              "reason": "Pre-1978 build (1955) — window removal disturbs lead paint on wood-frame openings; RRP-certified crew required. Village of Matteson permit required."
            },
            "roiNote": {
              "message": "Energy-efficient windows matter in a Zone 5A market with real winter heating costs, and are a strong resale point against Matteson's mostly younger housing stock.",
              "source": "Remodeling 2025 Cost vs. Value Report (East North Central) · NAR 2025 Remodeling Impact Report"
            }
          },
          "New entrance": {
            "lineItems": [
              {
                "item": "New Entry Door System",
                "description": "New fiberglass or steel entry door, frame and weatherstripping rated for Zone 5A",
                "costBasis": "South Cook County entry door replacement $1,800-$3,800 installed",
                "roiRecovery": 88,
                "tiers": {
                  "Budget-Friendly": 1320,
                  "Mid-Range": 2400,
                  "Premium": 4080,
                  "Luxury": 6720
                }
              },
              {
                "item": "Front Steps & Stoop Repair",
                "description": "Repair or rebuild the concrete front steps and stoop, patch spalling, reset handrail",
                "costBasis": "South Cook County concrete step rebuild $1,800-$4,600; freeze-thaw spalling is common",
                "roiRecovery": 68,
                "tiers": {
                  "Budget-Friendly": 1320,
                  "Mid-Range": 2400,
                  "Premium": 4080,
                  "Luxury": 6720
                }
              },
              {
                "item": "Entry Lighting & Hardware",
                "description": "Exterior sconces, house numbers, and updated lockset/hardware",
                "costBasis": "South Cook County: fixtures $120-$320 each installed | hardware $140-$380",
                "roiRecovery": 72,
                "tiers": {
                  "Budget-Friendly": 440,
                  "Mid-Range": 800,
                  "Premium": 1360,
                  "Luxury": 2240
                }
              }
            ],
            "contingency": {
              "percentage": 15,
              "reason": "Concrete step demo on a 1955 build may expose failed footings; Village of Matteson permit required for structural work."
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
                "costBasis": "South Cook County door refresh $450-$900 | hardware $140-$380",
                "roiRecovery": 72,
                "tiers": {
                  "Budget-Friendly": 550,
                  "Mid-Range": 1000,
                  "Premium": 1700,
                  "Luxury": 2800
                }
              },
              {
                "item": "Front Steps & Stoop Repair",
                "description": "Patch spalled concrete steps and stoop, reset handrail to code",
                "costBasis": "South Cook County concrete step repair $1,600-$3,200",
                "roiRecovery": 68,
                "tiers": {
                  "Budget-Friendly": 1210,
                  "Mid-Range": 2200,
                  "Premium": 3740,
                  "Luxury": 6160
                }
              },
              {
                "item": "Entry Lighting & House Numbers",
                "description": "New exterior sconces and visible house numbering",
                "costBasis": "South Cook County: $120-$320 per fixture installed",
                "roiRecovery": 72,
                "tiers": {
                  "Budget-Friendly": 275,
                  "Mid-Range": 500,
                  "Premium": 850,
                  "Luxury": 1400
                }
              }
            ],
            "contingency": {
              "percentage": 15,
              "reason": "Freeze-thaw damage on 1955 concrete steps is often deeper than surface inspection suggests; RRP lead rule applies to painted wood surfaces."
            },
            "roiNote": {
              "message": "The entry sets the first impression on a block of predominantly newer homes, where a dated approach stands out.",
              "source": "Remodeling 2025 Cost vs. Value Report (East North Central) · NAR 2025 Remodeling Impact Report"
            }
          },
          "Landscaping": {
            "lineItems": [
              {
                "item": "Clearing & Grading",
                "description": "Clear overgrowth and regrade for drainage away from the foundation across a 20,037 sqft lot — roughly 4x the portfolio norm",
                "costBasis": "South Cook County clearing/grading $1,800-$3,400 given the oversized lot",
                "roiRecovery": 85,
                "tiers": {
                  "Budget-Friendly": 1320,
                  "Mid-Range": 2400,
                  "Premium": 4080,
                  "Luxury": 6720
                }
              },
              {
                "item": "Planting, Mulch & Edging",
                "description": "Foundation plantings, mulch beds and edging scaled to a lot of this size",
                "costBasis": "South Cook County planting package $2,600-$4,800 for an oversized lot",
                "roiRecovery": 100,
                "tiers": {
                  "Budget-Friendly": 1980,
                  "Mid-Range": 3600,
                  "Premium": 6120,
                  "Luxury": 10080
                }
              },
              {
                "item": "Walkway & Front Yard",
                "description": "Repair or replace the front walkway and restore the street-facing lawn across the larger frontage",
                "costBasis": "South Cook County walkway $11-$22/sqft installed",
                "roiRecovery": 82,
                "tiers": {
                  "Budget-Friendly": 1595,
                  "Mid-Range": 2900,
                  "Premium": 4930,
                  "Luxury": 8120
                }
              }
            ],
            "contingency": {
              "percentage": 14,
              "reason": "At 20,037 sqft, this lot is roughly 4x the portfolio norm — scope and cost can expand meaningfully once mature overgrowth is cleared and true grading needs across the full site are visible."
            },
            "roiNote": {
              "message": "The oversized lot is this property's clearest differentiator on the block; landscaping is what turns that size into a visible selling point rather than a maintenance burden.",
              "source": "Remodeling 2025 Cost vs. Value Report (East North Central) · NAR 2025 Remodeling Impact Report"
            }
          },
          "Driveway": {
            "lineItems": [
              {
                "item": "Driveway Demo & Grading",
                "description": "Remove existing surface, regrade and compact the subbase to the attached 2-car garage",
                "costBasis": "South Cook County demo and prep $1,000-$1,900",
                "roiRecovery": 65,
                "tiers": {
                  "Budget-Friendly": 825,
                  "Mid-Range": 1500,
                  "Premium": 2550,
                  "Luxury": 4200
                }
              },
              {
                "item": "New Driveway Surface",
                "description": "Concrete (standard) through decorative pavers (premium), sized for 2-car attached garage access",
                "costBasis": "South Cook County concrete $6.50-$12/sqft | pavers $15-$28/sqft installed",
                "roiRecovery": 70,
                "tiers": {
                  "Budget-Friendly": 2310,
                  "Mid-Range": 4200,
                  "Premium": 7140,
                  "Luxury": 11760
                }
              }
            ],
            "contingency": {
              "percentage": 12,
              "reason": "Village of Matteson permit required for driveway work; a 2-car attached garage means a wider slab than the portfolio's typical single-car scope."
            },
            "roiNote": {
              "message": "A clean drive to a 2-car attached garage is a real amenity in this market — attached garages are a strong local buyer preference.",
              "source": "Remodeling 2025 Cost vs. Value Report (East North Central) · NAR 2025 Remodeling Impact Report"
            }
          },
          "Patio": {
            "lineItems": [
              {
                "item": "Patio Demo & Base Prep",
                "description": "Remove existing surface, excavate and compact a gravel base in the expansive rear yard",
                "costBasis": "South Cook County demo/base prep $600-$1,150 for a ~200 sqft patio",
                "roiRecovery": 70,
                "tiers": {
                  "Budget-Friendly": 440,
                  "Mid-Range": 800,
                  "Premium": 1360,
                  "Luxury": 2240
                }
              },
              {
                "item": "Patio Surface & Finishing",
                "description": "Concrete, stamped concrete, or natural stone pavers with sealer and edging",
                "costBasis": "South Cook County concrete patio $7.50-$13/sqft | pavers $15-$32/sqft installed",
                "roiRecovery": 75,
                "tiers": {
                  "Budget-Friendly": 2145,
                  "Mid-Range": 3900,
                  "Premium": 6630,
                  "Luxury": 10920
                }
              }
            ],
            "contingency": {
              "percentage": 12,
              "reason": "Freeze-thaw demands a deeper compacted base in Zone 5A. Village of Matteson permit required."
            },
            "roiNote": {
              "message": "The oversized lot supports genuinely larger outdoor living space than most portfolio properties can offer.",
              "source": "Remodeling 2025 Cost vs. Value Report (East North Central) · NAR 2025 Remodeling Impact Report"
            }
          },
          "All": {
            "lineItems": [
              {
                "item": "Complete Exterior Paint",
                "description": "Full repaint of all wood-sided exterior surfaces, trim and attached garage",
                "costBasis": "South Cook County full repaint $2,600-$4,600 on a home this size",
                "roiRecovery": 55,
                "tiers": {
                  "Budget-Friendly": 2035,
                  "Mid-Range": 3700,
                  "Premium": 6290,
                  "Luxury": 10360
                }
              },
              {
                "item": "Landscaping & Curb Appeal",
                "description": "Front and rear yard: clearing, planting, mulch, edging and walkway across the full 20,037 sqft lot",
                "costBasis": "South Cook County full landscaping package $3,800-$6,800 given the oversized lot",
                "roiRecovery": 95,
                "tiers": {
                  "Budget-Friendly": 2860,
                  "Mid-Range": 5200,
                  "Premium": 8840,
                  "Luxury": 14560
                }
              },
              {
                "item": "Entry, Steps & Stoop",
                "description": "New entry door, rebuilt concrete steps and stoop, code-compliant railing and lighting",
                "costBasis": "South Cook County full entrance package $2,800-$5,600",
                "roiRecovery": 82,
                "tiers": {
                  "Budget-Friendly": 2145,
                  "Mid-Range": 3900,
                  "Premium": 6630,
                  "Luxury": 10920
                }
              },
              {
                "item": "Driveway Resurface",
                "description": "Regrade and resurface the driveway to the attached 2-car garage",
                "costBasis": "South Cook County concrete driveway $6.50-$12/sqft installed",
                "roiRecovery": 70,
                "tiers": {
                  "Budget-Friendly": 2310,
                  "Mid-Range": 4200,
                  "Premium": 7140,
                  "Luxury": 11760
                }
              }
            ],
            "contingency": {
              "percentage": 20,
              "reason": "Multi-trade coordination on a 1955 wood-frame build across an oversized lot; RRP lead rule applies to every painted surface disturbed. Village of Matteson permit required for driveway and structural scope."
            },
            "roiNote": {
              "message": "A full exterior package is what turns this property's oversized lot from an outlier into its strongest selling point on the block.",
              "source": "Remodeling 2025 Cost vs. Value Report (East North Central) · NAR 2025 Remodeling Impact Report"
            }
          }
        }
      },
      "Kitchen": {
        "lineItems": [
          {
            "item": "Cabinets & Hardware",
            "description": "Semi-custom cabinet replacement with soft-close hardware for a compact ranch kitchen",
            "costBasis": "South Cook County stock $135-$270/linear ft | semi-custom $270-$540/linear ft installed",
            "roiRecovery": 62,
            "tiers": {
              "Budget-Friendly": 4950,
              "Mid-Range": 9000,
              "Premium": 15300,
              "Luxury": 25200
            }
          },
          {
            "item": "Countertops (Quartz)",
            "description": "Quartz fabrication and installation; approximately 25-30 sqft for this kitchen",
            "costBasis": "South Cook County quartz $45-$140/sqft installed",
            "roiRecovery": 67,
            "tiers": {
              "Budget-Friendly": 1595,
              "Mid-Range": 2900,
              "Premium": 4930,
              "Luxury": 8120
            }
          },
          {
            "item": "Appliance Package",
            "description": "Refrigerator, range, dishwasher and microwave (stainless steel)",
            "costBasis": "South Cook County mid-range appliance package $4,700-$11,200 with delivery and install",
            "roiRecovery": 58,
            "tiers": {
              "Budget-Friendly": 3300,
              "Mid-Range": 6000,
              "Premium": 10200,
              "Luxury": 16800
            }
          },
          {
            "item": "Flooring & Backsplash",
            "description": "LVP or tile flooring replacement plus tile backsplash installation",
            "costBasis": "South Cook County LVP $4.50-$11/sqft installed | tile backsplash $18-$42/sqft",
            "roiRecovery": 65,
            "tiers": {
              "Budget-Friendly": 1650,
              "Mid-Range": 3000,
              "Premium": 5100,
              "Luxury": 8400
            }
          },
          {
            "item": "Lighting & Electrical",
            "description": "Recessed lights, dedicated circuits, GFCI outlets and under-cabinet LED",
            "costBasis": "South Cook County electrician $85-$115/hr; older service panels frequently need upgrading",
            "roiRecovery": 60,
            "tiers": {
              "Budget-Friendly": 1540,
              "Mid-Range": 2800,
              "Premium": 4760,
              "Luxury": 7840
            }
          }
        ],
        "contingency": {
          "percentage": 18,
          "reason": "1955 build — original wiring and galvanized supply lines are common behind plaster on this vintage of Cook County construction. Village of Matteson permit required for plumbing and electrical work."
        },
        "roiNote": {
          "message": "Smaller kitchens cost more per square foot because fixed costs (appliances, plumbing, electrical) spread over fewer feet, but south-suburban labor rates keep this below Chicago-proper pricing.",
          "source": "Remodeling 2025 Cost vs. Value Report (East North Central) · NAR 2025 Remodeling Impact Report"
        }
      },
      "Bathroom": {
        "lineItems": [
          {
            "item": "Demo & Rough Plumbing",
            "description": "Strip one bathroom to studs, replace supply and waste lines within the room. Property has 2 full baths; this prices one",
            "costBasis": "South Cook County demo $700-$1,300 | rough plumbing $1,600-$3,600",
            "roiRecovery": 60,
            "tiers": {
              "Budget-Friendly": 1430,
              "Mid-Range": 2600,
              "Premium": 4420,
              "Luxury": 7280
            }
          },
          {
            "item": "Tile & Tub/Shower Surround",
            "description": "New tub or shower pan with full-height tile surround and waterproofing membrane",
            "costBasis": "South Cook County tile $13-$32/sqft installed | tub/shower unit $750-$2,600",
            "roiRecovery": 65,
            "tiers": {
              "Budget-Friendly": 2475,
              "Mid-Range": 4500,
              "Premium": 7650,
              "Luxury": 12600
            }
          },
          {
            "item": "Vanity, Toilet & Fixtures",
            "description": "New vanity with top, toilet, faucet, shower valve and trim",
            "costBasis": "South Cook County vanity $550-$2,000 | toilet $320-$750 | fixtures $400-$1,300 installed",
            "roiRecovery": 68,
            "tiers": {
              "Budget-Friendly": 1540,
              "Mid-Range": 2800,
              "Premium": 4760,
              "Luxury": 7840
            }
          },
          {
            "item": "Flooring & Waterproofing",
            "description": "Porcelain or LVT flooring over a properly prepped and waterproofed subfloor",
            "costBasis": "South Cook County bath flooring $9-$22/sqft installed including prep",
            "roiRecovery": 65,
            "tiers": {
              "Budget-Friendly": 935,
              "Mid-Range": 1700,
              "Premium": 2890,
              "Luxury": 4760
            }
          },
          {
            "item": "Lighting & Ventilation",
            "description": "Vanity lighting, ceiling fixture and code-compliant exhaust fan ducted to exterior",
            "costBasis": "South Cook County: fan $280-$700 installed | lighting $230-$700",
            "roiRecovery": 60,
            "tiers": {
              "Budget-Friendly": 660,
              "Mid-Range": 1200,
              "Premium": 2040,
              "Luxury": 3360
            }
          }
        ],
        "contingency": {
          "percentage": 18,
          "reason": "1955 build — concealed water damage behind original tile and aging waste-line corrosion are common on this vintage. Village of Matteson plumbing permit required."
        },
        "roiNote": {
          "message": "A full bath remodel is a top-three ROI project here, and south-suburban labor rates make it more attainable than an equivalent Chicago-city scope.",
          "source": "Remodeling 2025 Cost vs. Value Report (East North Central) · NAR 2025 Remodeling Impact Report"
        }
      },
      "Living Room": {
        "lineItems": [
          {
            "item": "Flooring Replacement",
            "description": "Refinish original hardwood or install engineered hardwood/LVP",
            "costBasis": "South Cook County refinishing $2.75-$6.50/sqft | engineered hardwood $4.50-$11/sqft installed",
            "roiRecovery": 72,
            "tiers": {
              "Budget-Friendly": 1320,
              "Mid-Range": 2400,
              "Premium": 4080,
              "Luxury": 6720
            }
          },
          {
            "item": "Paint, Trim & Wall Repair",
            "description": "Patch and repair walls, repaint walls and ceiling, repair original trim",
            "costBasis": "South Cook County interior paint $1.75-$5.50/sqft",
            "roiRecovery": 65,
            "tiers": {
              "Budget-Friendly": 1045,
              "Mid-Range": 1900,
              "Premium": 3230,
              "Luxury": 5320
            }
          },
          {
            "item": "Lighting Upgrade",
            "description": "Ceiling fixture, added circuits and switching",
            "costBasis": "South Cook County electrician $85-$115/hr; adding a ceiling circuit $550-$1,200",
            "roiRecovery": 60,
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
          "reason": "1955 construction may include original wiring needing evaluation before new fixtures can be permitted; older wall assemblies can conceal prior water intrusion."
        },
        "roiNote": {
          "message": "Fresh flooring and paint carry strong visual impact against Matteson's mostly newer housing stock.",
          "source": "Remodeling 2025 Cost vs. Value Report (East North Central) · NAR 2025 Remodeling Impact Report"
        }
      },
      "Bedroom": {
        "lineItems": [
          {
            "item": "Flooring Replacement",
            "description": "Remove carpet or damaged flooring; refinish original hardwood or install LVP",
            "costBasis": "South Cook County refinishing $2.75-$6.50/sqft | LVP $4.50-$11/sqft installed",
            "roiRecovery": 70,
            "tiers": {
              "Budget-Friendly": 715,
              "Mid-Range": 1300,
              "Premium": 2210,
              "Luxury": 3640
            }
          },
          {
            "item": "Paint & Trim",
            "description": "Repaint walls and ceiling, repair or replace baseboard and casings",
            "costBasis": "South Cook County room repaint $700-$1,350 | trim $5.50-$11/lf installed",
            "roiRecovery": 65,
            "tiers": {
              "Budget-Friendly": 550,
              "Mid-Range": 1000,
              "Premium": 1700,
              "Luxury": 2800
            }
          },
          {
            "item": "Closet System",
            "description": "Modular closet build-out; this vintage of ranch typically has minimal closet space",
            "costBasis": "South Cook County modular closet $800-$2,100 installed",
            "roiRecovery": 58,
            "tiers": {
              "Budget-Friendly": 660,
              "Mid-Range": 1200,
              "Premium": 2040,
              "Luxury": 3360
            }
          }
        ],
        "contingency": {
          "percentage": 15,
          "reason": "Pre-1978 build (1955) — sanding painted trim triggers the RRP lead rule. Flooring removal may reveal subfloor issues."
        },
        "roiNote": {
          "message": "With 4 bedrooms on only 950 sqft, closet space is likely the tightest constraint in the home and the cheapest lift to perceived quality.",
          "source": "Remodeling 2025 Cost vs. Value Report (East North Central) · NAR 2025 Remodeling Impact Report"
        }
      }
    }
  };

module.exports = { id: CRAWFORD_PROPERTY_ID, config, CRAWFORD_PROPERTY_ID };
