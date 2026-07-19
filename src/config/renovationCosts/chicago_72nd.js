/**
 * renovationCosts/chicago.72nd.js
 *
 * 1508 W 72nd St #1, Chicago, IL 60636 — 1,079 sqft · 1 story · built 1913 ·
 * WOOD-FRAME siding (not masonry — confirmed via county CMA), unfinished
 * basement, no existing off-street parking. West Englewood.
 *
 * regionalFactor 1.15: same basis as 12226 S Elizabeth St and 9141 S Colfax
 * Ave — Chicago remodeling consistently runs 15-25% above national
 * benchmarks on labor and permitting (Majestic Tiles Chicago 2026 guide;
 * Assembly Squad Chicago 2026 whole-house data). 1.15 is the conservative
 * end of that band.
 *
 * NOTE — this property has WOOD siding, unlike the masonry Elizabeth/Colfax
 * configs. Exterior line items price siding replacement, not tuckpointing.
 * NOTE — county record shows Parking Type: None. The "Driveway" focus area
 * therefore prices adding a NEW parking pad, not resurfacing an existing one.
 *
 * Tier shape follows the portfolio convention (see _shared.js):
 *   Exterior line items : 0.60 / 1.00 / 1.55 / 2.30  x Mid-Range
 *   Interior line items : 0.55 / 1.00 / 1.70 / 2.80  x Mid-Range
 */

const CHICAGO_72ND_PROPERTY_ID = 'PENDING_REAL_ID_72ND';

const config = {
    "meta": {
      "address": "1508 W 72nd St #1, Chicago, IL 60636",
      "city": "Chicago",
      "state": "Illinois",
      "squareFootage": 1079,
      "bedrooms": 3,
      "bathrooms": 2,
      "yearBuilt": 1913,
      "regionalFactor": 1.15,
      "dataSource": "Majestic Tiles Chicago Renovation Cost Guide (2026) · Assembly Squad Chicago Whole-House Remodel Data (2026) · Remodeling 2025 Cost vs. Value Report (East North Central Region)"
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
                "description": "Power wash, scrape failing paint, and prime the full wood siding body on a 1913 build",
                "costBasis": "Chicago prep/scrape/prime on full wood-sided bungalow $1,000-$1,900",
                "roiRecovery": 55,
                "tiers": {
                  "Budget-Friendly": 743,
                  "Mid-Range": 1350,
                  "Premium": 2295,
                  "Luxury": 3780
                }
              },
              {
                "item": "Exterior Paint (Full Wood Siding & Trim)",
                "description": "Two-coat mildew-resistant acrylic across the entire wood-sided body, trim and soffit",
                "costBasis": "Chicago full wood-siding repaint $3-$7/sqft exterior surface; 1,079 sqft bungalow runs $3,200-$5,800",
                "roiRecovery": 55,
                "tiers": {
                  "Budget-Friendly": 2310,
                  "Mid-Range": 4200,
                  "Premium": 7140,
                  "Luxury": 11760
                }
              },
              {
                "item": "Front Door & Hardware",
                "description": "Strip, prime and repaint the front door with updated exterior hardware",
                "costBasis": "Chicago door repaint $350-$600 | hardware $150-$400",
                "roiRecovery": 70,
                "tiers": {
                  "Budget-Friendly": 358,
                  "Mid-Range": 650,
                  "Premium": 1105,
                  "Luxury": 1820
                }
              }
            ],
            "contingency": {
              "percentage": 18,
              "reason": "Pre-1978 build (1913) — EPA RRP lead-safe work practices required across the full wood siding. Original siding may conceal rot or insect damage under old paint layers. Chicago does not require a permit for standard exterior painting."
            },
            "roiNote": {
              "message": "A full-body repaint is the highest-visual-impact upgrade on a wood-sided West Englewood bungalow, where brick is the neighborhood norm and a neglected wood exterior reads as high-maintenance.",
              "source": "Remodeling 2025 Cost vs. Value Report (East North Central) · NAR 2025 Remodeling Impact Report"
            }
          },
          "Update roof/siding": {
            "lineItems": [
              {
                "item": "Siding Tear-Off & Disposal",
                "description": "Remove existing wood siding, inspect sheathing for rot, haul away debris",
                "costBasis": "Chicago wood siding removal $1.50-$2.75/sqft on ~1,100 sqft of wall area",
                "roiRecovery": 70,
                "tiers": {
                  "Budget-Friendly": 1080,
                  "Mid-Range": 1800,
                  "Premium": 2790,
                  "Luxury": 4140
                }
              },
              {
                "item": "New Fiber Cement Siding",
                "description": "Fiber cement siding replacing original wood clapboard, moisture-resistant for Zone 5A winters",
                "costBasis": "Chicago fiber cement $9-$16/sqft installed",
                "roiRecovery": 76,
                "tiers": {
                  "Budget-Friendly": 8100,
                  "Mid-Range": 13500,
                  "Premium": 20925,
                  "Luxury": 31050
                }
              },
              {
                "item": "Roof Tear-Off & Architectural Shingle Roof",
                "description": "Full tear-off to deck, new architectural shingles with ice-and-water shield and ridge vent",
                "costBasis": "Chicago tear-off + architectural shingle installed $6-$10/sqft on a ~1,100-1,300 sqft roof",
                "roiRecovery": 63,
                "tiers": {
                  "Budget-Friendly": 4320,
                  "Mid-Range": 7200,
                  "Premium": 11160,
                  "Luxury": 16560
                }
              }
            ],
            "contingency": {
              "percentage": 22,
              "reason": "1913 wood-frame — original siding commonly conceals rot, insect damage, or knob-and-tube wiring runs; full removal frequently exposes additional repairs. Chicago permit required for roofing and siding replacement."
            },
            "roiNote": {
              "message": "Replacing failing original wood siding with fiber cement is the highest-durability upgrade available on a pre-war Chicago bungalow, cutting future maintenance to near zero.",
              "source": "Remodeling 2025 Cost vs. Value Report (East North Central) · NAR 2025 Remodeling Impact Report"
            }
          },
          "New windows": {
            "lineItems": [
              {
                "item": "Window Removal & Disposal",
                "description": "Remove approximately 7 existing window units from wood-frame openings",
                "costBasis": "Chicago $90-$180 per window removal; lead-safe containment adds labor on pre-1978 stock (built 1913)",
                "roiRecovery": 65,
                "tiers": {
                  "Budget-Friendly": 413,
                  "Mid-Range": 750,
                  "Premium": 1275,
                  "Luxury": 2100
                }
              },
              {
                "item": "New Window Units (7 windows)",
                "description": "Vinyl double-pane (budget) to fiberglass triple-pane (premium); Energy Star rated for Zone 5A",
                "costBasis": "Chicago: $700-$1,400/window vinyl | $1,500-$2,800/window fiberglass installed",
                "roiRecovery": 67,
                "tiers": {
                  "Budget-Friendly": 4235,
                  "Mid-Range": 7700,
                  "Premium": 13090,
                  "Luxury": 21560
                }
              },
              {
                "item": "Exterior Trim & Caulking",
                "description": "New exterior trim, weather-seal caulking and touch-up paint around every wood-frame opening",
                "costBasis": "Chicago $150-$350 per window for trim and finishing",
                "roiRecovery": 65,
                "tiers": {
                  "Budget-Friendly": 825,
                  "Mid-Range": 1500,
                  "Premium": 2550,
                  "Luxury": 4200
                }
              }
            ],
            "contingency": {
              "percentage": 18,
              "reason": "Pre-1978 build (1913) — window removal disturbs lead paint on wood-frame openings; RRP-certified crew required. Chicago permit required."
            },
            "roiNote": {
              "message": "Original 1913 wood-sash windows are single-pane; efficient replacements matter more here than most metros given Zone 5A winters and lake-effect wind.",
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
                  "Budget-Friendly": 1430,
                  "Mid-Range": 2600,
                  "Premium": 4420,
                  "Luxury": 7280
                }
              },
              {
                "item": "Front Steps & Stoop Repair",
                "description": "Repair or rebuild the concrete front steps and stoop, patch spalling, reset handrail",
                "costBasis": "Chicago concrete step rebuild $2,000-$5,000; freeze-thaw spalling is near-universal",
                "roiRecovery": 70,
                "tiers": {
                  "Budget-Friendly": 1430,
                  "Mid-Range": 2600,
                  "Premium": 4420,
                  "Luxury": 7280
                }
              },
              {
                "item": "Entry Lighting & Hardware",
                "description": "Exterior sconces, house numbers, and updated lockset/hardware",
                "costBasis": "Chicago: fixtures $130-$350 each installed | hardware $150-$400",
                "roiRecovery": 75,
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
              "reason": "Concrete step demo on a 1913 build may expose failed footings or utility runs beneath the stoop. Chicago permit required for structural work."
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
                  "Budget-Friendly": 605,
                  "Mid-Range": 1100,
                  "Premium": 1870,
                  "Luxury": 3080
                }
              },
              {
                "item": "Front Steps & Stoop Repair",
                "description": "Patch spalled concrete steps and stoop, reset handrail to code",
                "costBasis": "Chicago concrete step repair $1,800-$3,500",
                "roiRecovery": 70,
                "tiers": {
                  "Budget-Friendly": 1320,
                  "Mid-Range": 2400,
                  "Premium": 4080,
                  "Luxury": 6720
                }
              },
              {
                "item": "Entry Lighting & House Numbers",
                "description": "New exterior sconces and visible house numbering",
                "costBasis": "Chicago: $130-$350 per fixture installed",
                "roiRecovery": 75,
                "tiers": {
                  "Budget-Friendly": 303,
                  "Mid-Range": 550,
                  "Premium": 935,
                  "Luxury": 1540
                }
              }
            ],
            "contingency": {
              "percentage": 15,
              "reason": "Freeze-thaw damage on 1913 concrete steps is often deeper than surface inspection suggests; RRP lead rule applies to painted wood surfaces."
            },
            "roiNote": {
              "message": "The stoop and entry set the whole streetscape read on a West Englewood block of similar wood-frame bungalows.",
              "source": "Remodeling 2025 Cost vs. Value Report (East North Central) · NAR 2025 Remodeling Impact Report"
            }
          },
          "Landscaping": {
            "lineItems": [
              {
                "item": "Clearing & Grading",
                "description": "Clear overgrowth and regrade for drainage away from the foundation on a 3,920 sqft lot",
                "costBasis": "Chicago clearing/grading $600-$1,200 on a lot this size",
                "roiRecovery": 90,
                "tiers": {
                  "Budget-Friendly": 413,
                  "Mid-Range": 750,
                  "Premium": 1275,
                  "Luxury": 2100
                }
              },
              {
                "item": "Planting, Mulch & Edging",
                "description": "Foundation plantings, mulch beds and edging at the front yard",
                "costBasis": "Chicago planting package $1,200-$2,200",
                "roiRecovery": 100,
                "tiers": {
                  "Budget-Friendly": 825,
                  "Mid-Range": 1500,
                  "Premium": 2550,
                  "Luxury": 4200
                }
              },
              {
                "item": "Walkway & Front Yard",
                "description": "Repair or replace the front walkway and restore the street-facing lawn",
                "costBasis": "Chicago walkway $12-$24/sqft installed",
                "roiRecovery": 85,
                "tiers": {
                  "Budget-Friendly": 1045,
                  "Mid-Range": 1900,
                  "Premium": 3230,
                  "Luxury": 5320
                }
              }
            ],
            "contingency": {
              "percentage": 12,
              "reason": "Grading toward an unfinished basement with no dedicated drainage path off the roofline is a recurring defect on this housing stock."
            },
            "roiNote": {
              "message": "Curb appeal carries real weight on a block where every facade reads similarly.",
              "source": "Remodeling 2025 Cost vs. Value Report (East North Central) · NAR 2025 Remodeling Impact Report"
            }
          },
          "Driveway": {
            "lineItems": [
              {
                "item": "New Parking Pad Excavation & Base Prep",
                "description": "Excavate and compact a subbase for a new single-car parking pad — county record shows no existing off-street parking",
                "costBasis": "Chicago new parking-pad excavation/base $1,100-$1,800",
                "roiRecovery": 65,
                "tiers": {
                  "Budget-Friendly": 840,
                  "Mid-Range": 1400,
                  "Premium": 2170,
                  "Luxury": 3220
                }
              },
              {
                "item": "New Concrete Parking Pad",
                "description": "Concrete (standard) through decorative pavers (premium) single-car pad, edging and sealer",
                "costBasis": "Chicago concrete $7-$13/sqft | pavers $16-$30/sqft installed",
                "roiRecovery": 72,
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
              "reason": "Chicago permit and curb-cut approval required to add a new driveway/parking pad where none currently exists; alley access may apply."
            },
            "roiNote": {
              "message": "Adding off-street parking removes a genuine buyer objection on this block — this property currently has none.",
              "source": "Remodeling 2025 Cost vs. Value Report (East North Central) · NAR 2025 Remodeling Impact Report"
            }
          },
          "Patio": {
            "lineItems": [
              {
                "item": "Patio Demo & Base Prep",
                "description": "Remove existing surface, excavate and compact a gravel base in the rear yard",
                "costBasis": "Chicago demo/base prep $550-$1,000 for a ~150 sqft patio",
                "roiRecovery": 70,
                "tiers": {
                  "Budget-Friendly": 385,
                  "Mid-Range": 700,
                  "Premium": 1190,
                  "Luxury": 1960
                }
              },
              {
                "item": "Patio Surface & Finishing",
                "description": "Concrete, stamped concrete, or natural stone pavers with sealer and edging",
                "costBasis": "Chicago concrete patio $8-$14/sqft | pavers $16-$34/sqft installed",
                "roiRecovery": 75,
                "tiers": {
                  "Budget-Friendly": 1680,
                  "Mid-Range": 2800,
                  "Premium": 4340,
                  "Luxury": 6440
                }
              }
            ],
            "contingency": {
              "percentage": 12,
              "reason": "Freeze-thaw demands a deeper compacted base in Zone 5A; drainage may need engineering given the small lot. Chicago permit required."
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
                "description": "Full repaint of all wood-sided exterior surfaces and trim",
                "costBasis": "Chicago full wood-siding repaint $3,200-$5,800 on a bungalow this size",
                "roiRecovery": 55,
                "tiers": {
                  "Budget-Friendly": 2310,
                  "Mid-Range": 4200,
                  "Premium": 7140,
                  "Luxury": 11760
                }
              },
              {
                "item": "Landscaping & Curb Appeal",
                "description": "Front and rear yard: clearing, planting, mulch, edging and walkway",
                "costBasis": "Chicago full landscaping package $2,000-$3,600",
                "roiRecovery": 95,
                "tiers": {
                  "Budget-Friendly": 1430,
                  "Mid-Range": 2600,
                  "Premium": 4420,
                  "Luxury": 7280
                }
              },
              {
                "item": "Entry, Steps & Stoop",
                "description": "New entry door, rebuilt concrete steps and stoop, code-compliant railing and lighting",
                "costBasis": "Chicago full entrance package $3,000-$6,000",
                "roiRecovery": 85,
                "tiers": {
                  "Budget-Friendly": 2090,
                  "Mid-Range": 3800,
                  "Premium": 6460,
                  "Luxury": 10640
                }
              },
              {
                "item": "New Parking Pad",
                "description": "New single-car concrete parking pad — property currently has no off-street parking",
                "costBasis": "Chicago concrete pad $7-$13/sqft installed",
                "roiRecovery": 72,
                "tiers": {
                  "Budget-Friendly": 2520,
                  "Mid-Range": 4200,
                  "Premium": 6510,
                  "Luxury": 9660
                }
              }
            ],
            "contingency": {
              "percentage": 22,
              "reason": "Multi-trade coordination on a 1913 wood-frame build; RRP lead rule applies to every painted surface disturbed. Chicago permit required for driveway and structural scope."
            },
            "roiNote": {
              "message": "A full exterior package including new off-street parking is what moves this distressed bungalow from cash-only to conventionally financeable.",
              "source": "Remodeling 2025 Cost vs. Value Report (East North Central) · NAR 2025 Remodeling Impact Report"
            }
          }
        }
      },
      "Kitchen": {
        "lineItems": [
          {
            "item": "Cabinets & Hardware",
            "description": "Semi-custom cabinet replacement with soft-close hardware for a bungalow kitchen",
            "costBasis": "Chicago stock $150-$300/linear ft | semi-custom $300-$600/linear ft installed",
            "roiRecovery": 62,
            "tiers": {
              "Budget-Friendly": 5775,
              "Mid-Range": 10500,
              "Premium": 17850,
              "Luxury": 29400
            }
          },
          {
            "item": "Countertops (Quartz)",
            "description": "Quartz fabrication and installation; approximately 30-35 sqft for this kitchen",
            "costBasis": "Chicago quartz $50-$150/sqft installed",
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
            "costBasis": "Chicago mid-range appliance package $5,000-$12,000 with delivery and install",
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
            "costBasis": "Chicago LVP $5-$12/sqft installed | tile backsplash $20-$45/sqft",
            "roiRecovery": 66,
            "tiers": {
              "Budget-Friendly": 1925,
              "Mid-Range": 3500,
              "Premium": 5950,
              "Luxury": 9800
            }
          },
          {
            "item": "Lighting & Electrical",
            "description": "Recessed lights, dedicated circuits, GFCI outlets and under-cabinet LED",
            "costBasis": "Chicago electrician $95-$125/hr; older service panels often need upgrading",
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
          "reason": "1913 build — original knob-and-tube wiring and galvanized supply lines are common behind plaster; a full rewire is frequently required before new circuits can be permitted. Chicago Department of Buildings permit required (minimum building-permit fee $602 as of Jan 2026; trade permits typically add $1,200-$3,500)."
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
            "description": "Strip one bathroom to studs, replace supply and waste lines within the room. Property has 2 full baths; this prices one",
            "costBasis": "Chicago demo $800-$1,500 | rough plumbing $1,800-$4,000",
            "roiRecovery": 60,
            "tiers": {
              "Budget-Friendly": 1650,
              "Mid-Range": 3000,
              "Premium": 5100,
              "Luxury": 8400
            }
          },
          {
            "item": "Tile & Tub/Shower Surround",
            "description": "New tub or shower pan with full-height tile surround and waterproofing membrane",
            "costBasis": "Chicago tile $15-$35/sqft installed | tub/shower unit $800-$2,800",
            "roiRecovery": 65,
            "tiers": {
              "Budget-Friendly": 2860,
              "Mid-Range": 5200,
              "Premium": 8840,
              "Luxury": 14560
            }
          },
          {
            "item": "Vanity, Toilet & Fixtures",
            "description": "New vanity with top, toilet, faucet, shower valve and trim",
            "costBasis": "Chicago vanity $600-$2,200 | toilet $350-$800 | fixtures $450-$1,400 installed",
            "roiRecovery": 68,
            "tiers": {
              "Budget-Friendly": 1760,
              "Mid-Range": 3200,
              "Premium": 5440,
              "Luxury": 8960
            }
          },
          {
            "item": "Flooring & Waterproofing",
            "description": "Porcelain or LVT flooring over a properly prepped and waterproofed subfloor",
            "costBasis": "Chicago bath flooring $10-$25/sqft installed including prep",
            "roiRecovery": 65,
            "tiers": {
              "Budget-Friendly": 1045,
              "Mid-Range": 1900,
              "Premium": 3230,
              "Luxury": 5320
            }
          },
          {
            "item": "Lighting & Ventilation",
            "description": "Vanity lighting, ceiling fixture and code-compliant exhaust fan ducted to exterior",
            "costBasis": "Chicago: fan $300-$750 installed | lighting $250-$800",
            "roiRecovery": 60,
            "tiers": {
              "Budget-Friendly": 743,
              "Mid-Range": 1350,
              "Premium": 2295,
              "Luxury": 3780
            }
          }
        ],
        "contingency": {
          "percentage": 20,
          "reason": "1913 build — cast-iron waste stack corrosion and concealed water damage behind original tile are common; full rough plumbing replacement is frequently required. Chicago plumbing permit required."
        },
        "roiNote": {
          "message": "Chicago midrange bath remodels cluster around $15,000-$35,000 and are a top-three ROI project on this housing stock.",
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
              "Budget-Friendly": 1540,
              "Mid-Range": 2800,
              "Premium": 4760,
              "Luxury": 7840
            }
          },
          {
            "item": "Paint, Trim & Plaster Repair",
            "description": "Patch and skim-coat plaster, repaint walls and ceiling, repair original trim",
            "costBasis": "Chicago interior paint $2-$6/sqft; older homes add $0.50-$0.75/sqft for plaster prep",
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
            "description": "Ceiling fixture, added circuits and switching",
            "costBasis": "Chicago electrician $95-$125/hr; adding a ceiling circuit $600-$1,300",
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
          "reason": "1913 plaster and lath conceal cracking and prior water damage; original wiring frequently needs replacement before new fixtures can be permitted."
        },
        "roiNote": {
          "message": "Chicago's pre-war stock rewards restoring original plaster and trim over replacing it.",
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
              "Budget-Friendly": 880,
              "Mid-Range": 1600,
              "Premium": 2720,
              "Luxury": 4480
            }
          },
          {
            "item": "Paint & Trim",
            "description": "Repaint walls and ceiling, patch plaster, repair or replace baseboard and casings",
            "costBasis": "Chicago room repaint $800-$1,500 | trim $6-$12/lf installed",
            "roiRecovery": 65,
            "tiers": {
              "Budget-Friendly": 633,
              "Mid-Range": 1150,
              "Premium": 1955,
              "Luxury": 3220
            }
          },
          {
            "item": "Closet System",
            "description": "Modular closet build-out; bungalow bedrooms typically have minimal closet space",
            "costBasis": "Chicago modular closet $900-$2,400 installed",
            "roiRecovery": 58,
            "tiers": {
              "Budget-Friendly": 770,
              "Mid-Range": 1400,
              "Premium": 2380,
              "Luxury": 3920
            }
          }
        ],
        "contingency": {
          "percentage": 15,
          "reason": "Pre-1978 build (1913) — sanding painted trim triggers the RRP lead rule. Flooring removal may reveal subfloor issues."
        },
        "roiNote": {
          "message": "Closet space is the weak point of pre-war bungalow bedrooms and is the cheapest lift to perceived quality.",
          "source": "Remodeling 2025 Cost vs. Value Report (East North Central) · NAR 2025 Remodeling Impact Report"
        }
      }
    }
  };

module.exports = { id: CHICAGO_72ND_PROPERTY_ID, config, CHICAGO_72ND_PROPERTY_ID };
