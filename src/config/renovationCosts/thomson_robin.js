/**
 * renovationCosts/thomson.robin.js
 *
 * 714 Robin St, Thomson, GA 30824 — 1,144 sqft · 1 story · built 1977 ·
 * wood-frame siding, no basement, central heating/cooling. McDuffie County,
 * rural east-central Georgia.
 *
 * regionalFactor 0.82: rural central/south Georgia construction and
 * renovation costs run 15-25% below metro-area averages (O'Brien
 * Construction & Restoration Georgia cost guide, Nov 2025); the South region
 * broadly (GA/TX/FL/NC) runs at the moderate end of national ranges (House
 * Remodel Cost 2025 regional guide). 0.82 sits at the deeper-discount end to
 * reflect Thomson's small-town, non-metro labor market specifically.
 *
 * Tier shape follows the portfolio convention (see _shared.js):
 *   Exterior line items : 0.60 / 1.00 / 1.55 / 2.30  x Mid-Range
 *   Interior line items : 0.55 / 1.00 / 1.70 / 2.80  x Mid-Range
 */

const ROBIN_PROPERTY_ID = 'PENDING_REAL_ID_ROBIN';

const config = {
    "meta": {
      "address": "714 Robin St, Thomson, GA 30824",
      "city": "Thomson",
      "state": "Georgia",
      "squareFootage": 1144,
      "bedrooms": 3,
      "bathrooms": 1.5,
      "yearBuilt": 1977,
      "regionalFactor": 0.82,
      "dataSource": "O'Brien Construction & Restoration Georgia Cost Guide (Nov 2025) · House Remodel Cost Regional Price Guide — South Region (2025) · Remodeling 2025 Cost vs. Value Report (South Atlantic Region)"
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
                "description": "Power wash, scrape failing paint, and prime the full wood siding body on a 1977 build",
                "costBasis": "Thomson-area prep/scrape/prime on wood-sided home $650-$1,150; rural GA labor runs below metro rates",
                "roiRecovery": 55,
                "tiers": {
                  "Budget-Friendly": 495,
                  "Mid-Range": 900,
                  "Premium": 1530,
                  "Luxury": 2520
                }
              },
              {
                "item": "Exterior Paint (Full Wood Siding & Trim)",
                "description": "Two-coat exterior acrylic across the full wood-sided body, trim and soffit",
                "costBasis": "Rural GA full wood-siding repaint $2-$4.50/sqft exterior surface; 1,144 sqft home runs $2,000-$3,600",
                "roiRecovery": 55,
                "tiers": {
                  "Budget-Friendly": 1650,
                  "Mid-Range": 3000,
                  "Premium": 5100,
                  "Luxury": 8400
                }
              },
              {
                "item": "Front Door & Hardware",
                "description": "Strip, prime and repaint the front door with updated exterior hardware",
                "costBasis": "Rural GA door repaint $250-$450 | hardware $120-$300",
                "roiRecovery": 70,
                "tiers": {
                  "Budget-Friendly": 275,
                  "Mid-Range": 500,
                  "Premium": 850,
                  "Luxury": 1400
                }
              }
            ],
            "contingency": {
              "percentage": 18,
              "reason": "Pre-1978 build (1977) — this home falls just inside the EPA RRP lead-safe threshold; lead-safe work practices and testing apply to painted wood surfaces. McDuffie County does not require a permit for standard exterior painting."
            },
            "roiNote": {
              "message": "A full-body repaint is the single highest-visual-impact, lowest-cost upgrade available on a small-town Georgia wood-frame home.",
              "source": "Remodeling 2025 Cost vs. Value Report (South Atlantic) · NAR 2025 Remodeling Impact Report"
            }
          },
          "Update roof/siding": {
            "lineItems": [
              {
                "item": "Siding Tear-Off & Disposal",
                "description": "Remove existing wood siding, inspect sheathing for rot and termite damage, haul away debris",
                "costBasis": "Rural GA wood siding removal $1.00-$1.90/sqft on ~1,150 sqft of wall area",
                "roiRecovery": 68,
                "tiers": {
                  "Budget-Friendly": 630,
                  "Mid-Range": 1050,
                  "Premium": 1628,
                  "Luxury": 2415
                }
              },
              {
                "item": "New Vinyl or Fiber Cement Siding",
                "description": "Vinyl siding (budget/mid) through fiber cement (premium/luxury), replacing original wood clapboard",
                "costBasis": "Rural GA vinyl $4-$8/sqft | fiber cement $7-$13/sqft installed",
                "roiRecovery": 75,
                "tiers": {
                  "Budget-Friendly": 4400,
                  "Mid-Range": 8000,
                  "Premium": 13600,
                  "Luxury": 22400
                }
              },
              {
                "item": "Roof Tear-Off & Architectural Shingle Roof",
                "description": "Full tear-off to deck, new architectural shingles with underlayment and ridge vent",
                "costBasis": "Rural GA tear-off + architectural shingle installed $4-$7/sqft on a ~1,200-1,400 sqft roof",
                "roiRecovery": 62,
                "tiers": {
                  "Budget-Friendly": 3300,
                  "Mid-Range": 6000,
                  "Premium": 10200,
                  "Luxury": 16800
                }
              }
            ],
            "contingency": {
              "percentage": 18,
              "reason": "1977 wood-frame in humid Georgia climate — termite damage and moisture-rotted sheathing behind original siding are common findings once removed. County building permit required for roofing and siding replacement."
            },
            "roiNote": {
              "message": "Replacing worn original siding is a meaningful curb-appeal and durability upgrade in a humid climate where wood siding takes real weather exposure.",
              "source": "Remodeling 2025 Cost vs. Value Report (South Atlantic) · NAR 2025 Remodeling Impact Report"
            }
          },
          "New windows": {
            "lineItems": [
              {
                "item": "Window Removal & Disposal",
                "description": "Remove approximately 7-8 existing window units from wood-frame openings",
                "costBasis": "Rural GA $60-$120 per window removal; lead-safe containment adds labor on this pre-1978 build",
                "roiRecovery": 62,
                "tiers": {
                  "Budget-Friendly": 358,
                  "Mid-Range": 650,
                  "Premium": 1105,
                  "Luxury": 1820
                }
              },
              {
                "item": "New Window Units (8 windows)",
                "description": "Vinyl double-pane windows, Energy Star rated for the humid subtropical Zone 3A climate",
                "costBasis": "Rural GA: $450-$900/window vinyl | $1,000-$1,900/window impact-rated installed",
                "roiRecovery": 65,
                "tiers": {
                  "Budget-Friendly": 4400,
                  "Mid-Range": 8000,
                  "Premium": 13600,
                  "Luxury": 22400
                }
              },
              {
                "item": "Exterior Trim & Caulking",
                "description": "New exterior trim, weather-seal caulking and touch-up paint around every wood-frame opening",
                "costBasis": "Rural GA $100-$225 per window for trim and finishing",
                "roiRecovery": 62,
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
              "reason": "Pre-1978 build (1977) — window removal disturbs lead paint on original wood-frame openings; RRP-certified crew required. County permit required."
            },
            "roiNote": {
              "message": "Efficient windows cut cooling load meaningfully in Georgia's long, humid summers — a real utility-cost selling point locally.",
              "source": "Remodeling 2025 Cost vs. Value Report (South Atlantic) · NAR 2025 Remodeling Impact Report"
            }
          },
          "New entrance": {
            "lineItems": [
              {
                "item": "New Entry Door System",
                "description": "New fiberglass or steel entry door, frame and weatherstripping",
                "costBasis": "Rural GA entry door replacement $1,300-$2,700 installed",
                "roiRecovery": 88,
                "tiers": {
                  "Budget-Friendly": 935,
                  "Mid-Range": 1700,
                  "Premium": 2890,
                  "Luxury": 4760
                }
              },
              {
                "item": "Front Steps & Stoop Repair",
                "description": "Repair or rebuild the concrete or wood front steps and stoop, reset handrail",
                "costBasis": "Rural GA step rebuild $1,200-$3,000",
                "roiRecovery": 68,
                "tiers": {
                  "Budget-Friendly": 880,
                  "Mid-Range": 1600,
                  "Premium": 2720,
                  "Luxury": 4480
                }
              },
              {
                "item": "Entry Lighting & Hardware",
                "description": "Exterior sconces, house numbers, and updated lockset/hardware",
                "costBasis": "Rural GA: fixtures $90-$220 each installed | hardware $100-$280",
                "roiRecovery": 72,
                "tiers": {
                  "Budget-Friendly": 358,
                  "Mid-Range": 650,
                  "Premium": 1105,
                  "Luxury": 1820
                }
              }
            ],
            "contingency": {
              "percentage": 15,
              "reason": "Step demo on a 1977 build may expose termite-damaged framing common in humid-climate Georgia construction. County permit required for structural work."
            },
            "roiNote": {
              "message": "Entry replacement is consistently among the highest cost-recovery exterior projects nationally, and Thomson buyers respond well to a clean front approach.",
              "source": "Remodeling 2025 Cost vs. Value Report (South Atlantic) · NAR 2025 Remodeling Impact Report"
            }
          }
        },
        "focusAreas": {
          "Front entrance": {
            "lineItems": [
              {
                "item": "Entry Door Refresh",
                "description": "Strip, prime and repaint the entry door; replace lockset and weatherstripping",
                "costBasis": "Rural GA door refresh $350-$700 | hardware $100-$280",
                "roiRecovery": 72,
                "tiers": {
                  "Budget-Friendly": 385,
                  "Mid-Range": 700,
                  "Premium": 1190,
                  "Luxury": 1960
                }
              },
              {
                "item": "Front Steps & Stoop Repair",
                "description": "Patch and reset the front steps and stoop to code",
                "costBasis": "Rural GA step repair $1,000-$2,200",
                "roiRecovery": 68,
                "tiers": {
                  "Budget-Friendly": 770,
                  "Mid-Range": 1400,
                  "Premium": 2380,
                  "Luxury": 3920
                }
              },
              {
                "item": "Entry Lighting & House Numbers",
                "description": "New exterior sconces and visible house numbering",
                "costBasis": "Rural GA: $90-$220 per fixture installed",
                "roiRecovery": 72,
                "tiers": {
                  "Budget-Friendly": 220,
                  "Mid-Range": 400,
                  "Premium": 680,
                  "Luxury": 1120
                }
              }
            ],
            "contingency": {
              "percentage": 15,
              "reason": "Humidity-driven wood rot on 1977 steps is often deeper than a surface inspection suggests; RRP lead rule applies to painted wood surfaces."
            },
            "roiNote": {
              "message": "A clean front entry is a low-cost, high-visibility upgrade on a small-lot McDuffie County home.",
              "source": "Remodeling 2025 Cost vs. Value Report (South Atlantic) · NAR 2025 Remodeling Impact Report"
            }
          },
          "Landscaping": {
            "lineItems": [
              {
                "item": "Clearing & Grading",
                "description": "Clear overgrowth and regrade for drainage away from the foundation on a 10,019 sqft lot",
                "costBasis": "Rural GA clearing/grading $550-$1,100 on a lot this size",
                "roiRecovery": 88,
                "tiers": {
                  "Budget-Friendly": 385,
                  "Mid-Range": 700,
                  "Premium": 1190,
                  "Luxury": 1960
                }
              },
              {
                "item": "Planting, Mulch & Edging",
                "description": "Foundation plantings, mulch beds and edging at the front yard",
                "costBasis": "Rural GA planting package $900-$1,700",
                "roiRecovery": 100,
                "tiers": {
                  "Budget-Friendly": 660,
                  "Mid-Range": 1200,
                  "Premium": 2040,
                  "Luxury": 3360
                }
              },
              {
                "item": "Walkway & Front Yard",
                "description": "Repair or replace the front walkway and restore the street-facing lawn on this larger 10,019 sqft lot",
                "costBasis": "Rural GA walkway $8-$16/sqft installed",
                "roiRecovery": 80,
                "tiers": {
                  "Budget-Friendly": 825,
                  "Mid-Range": 1500,
                  "Premium": 2550,
                  "Luxury": 4200
                }
              }
            ],
            "contingency": {
              "percentage": 12,
              "reason": "The 10,019 sqft lot is larger than the portfolio norm — scope can expand meaningfully once mature overgrowth is cleared and true grading needs are visible."
            },
            "roiNote": {
              "message": "This lot is genuinely oversized for the block, and landscaping is a low-cost way to make that size read as a feature rather than as deferred yard work.",
              "source": "Remodeling 2025 Cost vs. Value Report (South Atlantic) · NAR 2025 Remodeling Impact Report"
            }
          },
          "Driveway": {
            "lineItems": [
              {
                "item": "Driveway Demo & Grading",
                "description": "Remove existing surface, regrade and compact the subbase",
                "costBasis": "Rural GA demo and prep $600-$1,150",
                "roiRecovery": 62,
                "tiers": {
                  "Budget-Friendly": 495,
                  "Mid-Range": 900,
                  "Premium": 1530,
                  "Luxury": 2520
                }
              },
              {
                "item": "New Driveway Surface",
                "description": "Gravel (budget) through concrete (premium) driveway surface with edging",
                "costBasis": "Rural GA gravel $2-$5/sqft | concrete $5-$9/sqft installed",
                "roiRecovery": 65,
                "tiers": {
                  "Budget-Friendly": 1430,
                  "Mid-Range": 2600,
                  "Premium": 4420,
                  "Luxury": 7280
                }
              }
            ],
            "contingency": {
              "percentage": 10,
              "reason": "McDuffie County permit generally not required for residential driveway resurfacing on an existing footprint; low structural-surprise risk in this scope."
            },
            "roiNote": {
              "message": "A resurfaced drive is expected baseline condition for this price point in Thomson and a broken one reads as deferred maintenance.",
              "source": "Remodeling 2025 Cost vs. Value Report (South Atlantic) · NAR 2025 Remodeling Impact Report"
            }
          },
          "Patio": {
            "lineItems": [
              {
                "item": "Patio Demo & Base Prep",
                "description": "Remove existing surface, excavate and compact a gravel base in the rear yard",
                "costBasis": "Rural GA demo/base prep $400-$800 for a ~180 sqft patio",
                "roiRecovery": 65,
                "tiers": {
                  "Budget-Friendly": 275,
                  "Mid-Range": 500,
                  "Premium": 850,
                  "Luxury": 1400
                }
              },
              {
                "item": "Patio Surface & Finishing",
                "description": "Concrete or paver patio with sealer and edging",
                "costBasis": "Rural GA concrete patio $6-$10/sqft | pavers $12-$24/sqft installed",
                "roiRecovery": 70,
                "tiers": {
                  "Budget-Friendly": 1210,
                  "Mid-Range": 2200,
                  "Premium": 3740,
                  "Luxury": 6160
                }
              }
            ],
            "contingency": {
              "percentage": 10,
              "reason": "Georgia's clay-heavy soil in this county can shift seasonally; a well-compacted base matters more here than in sandier coastal soils."
            },
            "roiNote": {
              "message": "Outdoor living space has real appeal in a mild-winter climate where a patio gets year-round use.",
              "source": "Remodeling 2025 Cost vs. Value Report (South Atlantic) · NAR 2025 Remodeling Impact Report"
            }
          },
          "All": {
            "lineItems": [
              {
                "item": "Complete Exterior Paint",
                "description": "Full repaint of all wood-sided exterior surfaces and trim",
                "costBasis": "Rural GA full wood-siding repaint $2,000-$3,600 on a home this size",
                "roiRecovery": 55,
                "tiers": {
                  "Budget-Friendly": 1650,
                  "Mid-Range": 3000,
                  "Premium": 5100,
                  "Luxury": 8400
                }
              },
              {
                "item": "Landscaping & Curb Appeal",
                "description": "Front and rear yard: clearing, planting, mulch, edging and walkway across a 10,019 sqft lot",
                "costBasis": "Rural GA full landscaping package $1,800-$3,200",
                "roiRecovery": 92,
                "tiers": {
                  "Budget-Friendly": 1320,
                  "Mid-Range": 2400,
                  "Premium": 4080,
                  "Luxury": 6720
                }
              },
              {
                "item": "Entry, Steps & Stoop",
                "description": "New entry door, rebuilt steps and stoop, code-compliant railing and lighting",
                "costBasis": "Rural GA full entrance package $2,200-$4,200",
                "roiRecovery": 82,
                "tiers": {
                  "Budget-Friendly": 1595,
                  "Mid-Range": 2900,
                  "Premium": 4930,
                  "Luxury": 8120
                }
              },
              {
                "item": "Driveway Resurface",
                "description": "Regrade and resurface the existing driveway",
                "costBasis": "Rural GA concrete driveway $5-$9/sqft installed",
                "roiRecovery": 65,
                "tiers": {
                  "Budget-Friendly": 1430,
                  "Mid-Range": 2600,
                  "Premium": 4420,
                  "Luxury": 7280
                }
              }
            ],
            "contingency": {
              "percentage": 18,
              "reason": "Multi-trade coordination on a 1977 wood-frame build in a humid climate; RRP lead rule applies to every painted surface disturbed. County permit required for driveway and structural scope."
            },
            "roiNote": {
              "message": "A full exterior package is the clearest way to make this oversized lot read as a genuine asset rather than a maintenance burden.",
              "source": "Remodeling 2025 Cost vs. Value Report (South Atlantic) · NAR 2025 Remodeling Impact Report"
            }
          }
        }
      },
      "Kitchen": {
        "lineItems": [
          {
            "item": "Cabinets & Hardware",
            "description": "Stock to semi-custom cabinet replacement with soft-close hardware",
            "costBasis": "Rural GA stock $90-$180/linear ft | semi-custom $180-$360/linear ft installed",
            "roiRecovery": 60,
            "tiers": {
              "Budget-Friendly": 3850,
              "Mid-Range": 7000,
              "Premium": 11900,
              "Luxury": 19600
            }
          },
          {
            "item": "Countertops (Quartz)",
            "description": "Quartz fabrication and installation; approximately 30-35 sqft for this kitchen",
            "costBasis": "Rural GA quartz $35-$95/sqft installed",
            "roiRecovery": 65,
            "tiers": {
              "Budget-Friendly": 1210,
              "Mid-Range": 2200,
              "Premium": 3740,
              "Luxury": 6160
            }
          },
          {
            "item": "Appliance Package",
            "description": "Refrigerator, range, dishwasher and microwave (stainless steel)",
            "costBasis": "Rural GA mid-range appliance package $3,800-$9,000 with delivery and install",
            "roiRecovery": 56,
            "tiers": {
              "Budget-Friendly": 2860,
              "Mid-Range": 5200,
              "Premium": 8840,
              "Luxury": 14560
            }
          },
          {
            "item": "Flooring & Backsplash",
            "description": "LVP or tile flooring replacement plus tile backsplash installation",
            "costBasis": "Rural GA LVP $3-$8/sqft installed | tile backsplash $12-$28/sqft",
            "roiRecovery": 64,
            "tiers": {
              "Budget-Friendly": 1210,
              "Mid-Range": 2200,
              "Premium": 3740,
              "Luxury": 6160
            }
          },
          {
            "item": "Lighting & Electrical",
            "description": "Recessed lights, dedicated circuits, GFCI outlets and under-cabinet LED",
            "costBasis": "Rural GA electrician $65-$95/hr; older panels frequently need upgrading",
            "roiRecovery": 58,
            "tiers": {
              "Budget-Friendly": 1100,
              "Mid-Range": 2000,
              "Premium": 3400,
              "Luxury": 5600
            }
          }
        ],
        "contingency": {
          "percentage": 18,
          "reason": "1977 build — aluminum branch-circuit wiring was in wide use across the South through the mid-1970s and may require pigtailing or a partial rewire if present. McDuffie County permit required for plumbing and electrical work."
        },
        "roiNote": {
          "message": "Kitchen remodel costs run meaningfully below metro Georgia in this labor market, making it a strong-value renovation project here.",
          "source": "Remodeling 2025 Cost vs. Value Report (South Atlantic) · NAR 2025 Remodeling Impact Report"
        }
      },
      "Bathroom": {
        "lineItems": [
          {
            "item": "Demo & Rough Plumbing",
            "description": "Strip the full bathroom to studs, replace supply and waste lines within the room",
            "costBasis": "Rural GA demo $550-$1,000 | rough plumbing $1,300-$2,900",
            "roiRecovery": 58,
            "tiers": {
              "Budget-Friendly": 1100,
              "Mid-Range": 2000,
              "Premium": 3400,
              "Luxury": 5600
            }
          },
          {
            "item": "Tile & Tub/Shower Surround",
            "description": "New tub or shower pan with full-height tile surround and waterproofing membrane",
            "costBasis": "Rural GA tile $10-$24/sqft installed | tub/shower unit $600-$2,100",
            "roiRecovery": 63,
            "tiers": {
              "Budget-Friendly": 1980,
              "Mid-Range": 3600,
              "Premium": 6120,
              "Luxury": 10080
            }
          },
          {
            "item": "Vanity, Toilet & Fixtures",
            "description": "New vanity with top, toilet, faucet, shower valve and trim",
            "costBasis": "Rural GA vanity $400-$1,600 | toilet $250-$600 | fixtures $300-$1,000 installed",
            "roiRecovery": 66,
            "tiers": {
              "Budget-Friendly": 1210,
              "Mid-Range": 2200,
              "Premium": 3740,
              "Luxury": 6160
            }
          },
          {
            "item": "Flooring & Waterproofing",
            "description": "Porcelain or LVT flooring over a properly prepped and waterproofed subfloor",
            "costBasis": "Rural GA bath flooring $7-$18/sqft installed including prep",
            "roiRecovery": 63,
            "tiers": {
              "Budget-Friendly": 715,
              "Mid-Range": 1300,
              "Premium": 2210,
              "Luxury": 3640
            }
          },
          {
            "item": "Lighting & Ventilation",
            "description": "Vanity lighting, ceiling fixture and code-compliant exhaust fan ducted to exterior",
            "costBasis": "Rural GA: fan $220-$550 installed | lighting $180-$550",
            "roiRecovery": 58,
            "tiers": {
              "Budget-Friendly": 495,
              "Mid-Range": 900,
              "Premium": 1530,
              "Luxury": 2520
            }
          }
        ],
        "contingency": {
          "percentage": 18,
          "reason": "1977 build — concealed water damage behind original tile and aging cast-iron or galvanized waste lines are common in this era of Southern construction. County plumbing permit required."
        },
        "roiNote": {
          "message": "A full bath remodel is one of the strongest-value renovation projects in this market given the below-metro labor cost base.",
          "source": "Remodeling 2025 Cost vs. Value Report (South Atlantic) · NAR 2025 Remodeling Impact Report"
        }
      },
      "Living Room": {
        "lineItems": [
          {
            "item": "Flooring Replacement",
            "description": "Refinish original hardwood or install engineered hardwood/LVP",
            "costBasis": "Rural GA refinishing $2-$5/sqft | engineered hardwood $4-$9/sqft installed",
            "roiRecovery": 70,
            "tiers": {
              "Budget-Friendly": 1100,
              "Mid-Range": 2000,
              "Premium": 3400,
              "Luxury": 5600
            }
          },
          {
            "item": "Paint & Trim Repair",
            "description": "Repaint walls and ceiling, repair or replace original trim and baseboard",
            "costBasis": "Rural GA interior paint $1.50-$4/sqft",
            "roiRecovery": 63,
            "tiers": {
              "Budget-Friendly": 880,
              "Mid-Range": 1600,
              "Premium": 2720,
              "Luxury": 4480
            }
          },
          {
            "item": "Lighting Upgrade",
            "description": "Ceiling fixture, added circuits and switching",
            "costBasis": "Rural GA electrician $65-$95/hr; adding a ceiling circuit $400-$900",
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
          "reason": "1977 build — original wiring may include aluminum branch circuits common to this era in the South; adding new fixtures can require remediation first."
        },
        "roiNote": {
          "message": "Fresh flooring and paint carry outsized visual impact relative to cost in this labor market.",
          "source": "Remodeling 2025 Cost vs. Value Report (South Atlantic) · NAR 2025 Remodeling Impact Report"
        }
      },
      "Bedroom": {
        "lineItems": [
          {
            "item": "Flooring Replacement",
            "description": "Remove carpet or damaged flooring; refinish original hardwood or install LVP",
            "costBasis": "Rural GA refinishing $2-$5/sqft | LVP $4-$9/sqft installed",
            "roiRecovery": 68,
            "tiers": {
              "Budget-Friendly": 660,
              "Mid-Range": 1200,
              "Premium": 2040,
              "Luxury": 3360
            }
          },
          {
            "item": "Paint & Trim",
            "description": "Repaint walls and ceiling, repair or replace baseboard and casings",
            "costBasis": "Rural GA room repaint $500-$1,000 | trim $4-$9/lf installed",
            "roiRecovery": 63,
            "tiers": {
              "Budget-Friendly": 495,
              "Mid-Range": 900,
              "Premium": 1530,
              "Luxury": 2520
            }
          },
          {
            "item": "Closet System",
            "description": "Modular closet build-out",
            "costBasis": "Rural GA modular closet $600-$1,600 installed",
            "roiRecovery": 56,
            "tiers": {
              "Budget-Friendly": 550,
              "Mid-Range": 1000,
              "Premium": 1700,
              "Luxury": 2800
            }
          }
        ],
        "contingency": {
          "percentage": 15,
          "reason": "Pre-1978 build (1977) — sanding painted trim triggers the RRP lead rule. Flooring removal may reveal subfloor issues from prior moisture exposure."
        },
        "roiNote": {
          "message": "Simple flooring and paint refreshes go furthest per dollar on bedrooms in this market.",
          "source": "Remodeling 2025 Cost vs. Value Report (South Atlantic) · NAR 2025 Remodeling Impact Report"
        }
      }
    }
  };

module.exports = { id: ROBIN_PROPERTY_ID, config, ROBIN_PROPERTY_ID };
