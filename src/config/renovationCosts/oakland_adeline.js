/**
 * renovationCosts/oakland.adeline.js
 *
 * 1496 Adeline St, Oakland, CA 94607 — moved verbatim from the previous
 * single-file renovationPropertyCosts.js. No figures were changed in the move.
 * Line items are the single source of truth — see _shared.js for how subtotal,
 * contingency, final cost, range and ROI are derived from them.
 */

const OAKLAND_PROPERTY_ID = '69cf9ec217e006f5c4437c62';

const config = {
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
  };

module.exports = { id: OAKLAND_PROPERTY_ID, config, OAKLAND_PROPERTY_ID };
