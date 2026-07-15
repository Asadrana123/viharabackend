/**
 * renovationCosts/kingwood.brookside.js
 *
 * 1703 Brookside Pine Ln, Kingwood, TX 77345 — moved verbatim from the previous
 * single-file renovationPropertyCosts.js. No figures were changed in the move.
 * Line items are the single source of truth — see _shared.js for how subtotal,
 * contingency, final cost, range and ROI are derived from them.
 */

const KINGWOOD_PROPERTY_ID = '695236a4acad197a54f80e95';

const config = {
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
  };

module.exports = { id: KINGWOOD_PROPERTY_ID, config, KINGWOOD_PROPERTY_ID };
