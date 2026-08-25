/**
 * renovationCosts/turlock_violet.js
 *
 * 1282 Violet Way, Turlock, CA 95382 — Single Family, 3bd/2ba, 1811 sqft, built 2016.
 * regionalFactor 1.12: Northern San Joaquin Valley — one of California’s more affordable construction markets, above the national average.
 * Line items are the single source of truth — see _shared.js for how subtotal,
 * contingency, final cost, range and ROI are derived from them.
 */

const TURLOCK_VIOLET_PROPERTY_ID = '6a8d957f4e6a9f474a0168a8';

const config = {
  "meta": {
    "address": "1282 Violet Way, Turlock, CA 95382",
    "city": "Turlock",
    "state": "California",
    "squareFootage": 1811,
    "bedrooms": 3,
    "bathrooms": 2,
    "yearBuilt": 2016,
    "regionalFactor": 1.12,
    "dataSource": "Stanislaus County / Central & Northern California construction cost data (2025) · Remodeling 2025 Cost vs. Value Report (Pacific Region) · NAR 2025 Remodeling Impact Report"
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
              "costBasis": "Turlock, CA market: roughly $638–$1,649 depending on materials and scope",
              "roiRecovery": 55,
              "tiers": {
                "Budget-Friendly": 638,
                "Mid-Range": 1064,
                "Premium": 1649,
                "Luxury": 2447
              }
            },
            {
              "item": "Exterior Paint (Walls, Trim & Shutters)",
              "description": "Two-coat application with premium exterior paint on all wall surfaces and trim",
              "costBasis": "Turlock, CA market: roughly $2,554–$6,597 depending on materials and scope",
              "roiRecovery": 60,
              "tiers": {
                "Budget-Friendly": 2554,
                "Mid-Range": 4256,
                "Premium": 6597,
                "Luxury": 9789
              }
            },
            {
              "item": "Front Door Repaint & Hardware",
              "description": "Strip, prime, and repaint front door with updated exterior hardware",
              "costBasis": "Turlock, CA market: roughly $336–$868 depending on materials and scope",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 336,
                "Mid-Range": 560,
                "Premium": 868,
                "Luxury": 1288
              }
            }
          ],
          "contingency": {
            "percentage": 12,
            "reason": "Surface prep may reveal minor repairs. California permit required."
          },
          "roiNote": {
            "message": "Fresh exterior paint is the highest-visual-impact, lowest-cost curb-appeal upgrade in Turlock.",
            "source": "NAR 2025 Remodeling Impact Report"
          }
        },
        "Update roof/siding": {
          "lineItems": [
            {
              "item": "Siding Removal & Disposal",
              "description": "Full tear-off of existing siding, inspection for moisture damage, proper disposal",
              "costBasis": "Turlock, CA market: roughly $1,210–$3,125 depending on materials and scope",
              "roiRecovery": 76,
              "tiers": {
                "Budget-Friendly": 1210,
                "Mid-Range": 2016,
                "Premium": 3125,
                "Luxury": 4637
              }
            },
            {
              "item": "New Siding Installation",
              "description": "Fiber cement siding installed for durability and moisture resistance",
              "costBasis": "Turlock, CA market: roughly $9,408–$24,304 depending on materials and scope",
              "roiRecovery": 76,
              "tiers": {
                "Budget-Friendly": 9408,
                "Mid-Range": 15680,
                "Premium": 24304,
                "Luxury": 36064
              }
            },
            {
              "item": "Trim, Flashing & Moisture Barrier",
              "description": "Install weather-resistant barrier, new trim boards, and window/door flashing",
              "costBasis": "Turlock, CA market: roughly $1,882–$4,861 depending on materials and scope",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 1882,
                "Mid-Range": 3136,
                "Premium": 4861,
                "Luxury": 7213
              }
            }
          ],
          "contingency": {
            "percentage": 15,
            "reason": "Concealed moisture, rot, or sheathing damage risk — newer construction (2016), though foreclosure condition may hide deferred maintenance. California permit required."
          },
          "roiNote": {
            "message": "Fiber cement siding is consistently a top-ranked ROI project in the Pacific region.",
            "source": "Remodeling 2025 Cost vs. Value — Pacific Region"
          }
        },
        "New windows": {
          "lineItems": [
            {
              "item": "Window Removal & Disposal",
              "description": "Removal and disposal of existing window units",
              "costBasis": "Turlock, CA market: roughly $806–$2,083 depending on materials and scope",
              "roiRecovery": 69,
              "tiers": {
                "Budget-Friendly": 806,
                "Mid-Range": 1344,
                "Premium": 2083,
                "Luxury": 3091
              }
            },
            {
              "item": "New Window Units (8–10 windows)",
              "description": "Vinyl double-pane (budget) to fiberglass triple-pane (premium); Energy Star rated",
              "costBasis": "Turlock, CA market: roughly $9,408–$24,304 depending on materials and scope",
              "roiRecovery": 69,
              "tiers": {
                "Budget-Friendly": 9408,
                "Mid-Range": 15680,
                "Premium": 24304,
                "Luxury": 36064
              }
            },
            {
              "item": "Exterior Trim & Caulking",
              "description": "New exterior trim, weather-seal caulking, and touch-up painting around all windows",
              "costBasis": "Turlock, CA market: roughly $1,680–$4,340 depending on materials and scope",
              "roiRecovery": 65,
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
            "reason": "Rough-opening rot and out-of-square framing risk on a 2016 build. California permit required."
          },
          "roiNote": {
            "message": "Energy-efficient windows are valued by California buyers and lower utility costs.",
            "source": "Remodeling 2025 Cost vs. Value — Pacific Region"
          }
        },
        "New entrance": {
          "lineItems": [
            {
              "item": "New Entry Door (Steel or Fiberglass)",
              "description": "Pre-hung steel or fiberglass door with weather-stripping, deadbolt, and finish hardware",
              "costBasis": "Turlock, CA market: roughly $1,583–$4,089 depending on materials and scope",
              "roiRecovery": 188,
              "tiers": {
                "Budget-Friendly": 1583,
                "Mid-Range": 2638,
                "Premium": 4089,
                "Luxury": 6067
              }
            },
            {
              "item": "Pathway & Porch Update",
              "description": "Repair or replace pathway pavers/concrete and porch lighting upgrade",
              "costBasis": "Turlock, CA market: roughly $1,008–$2,604 depending on materials and scope",
              "roiRecovery": 120,
              "tiers": {
                "Budget-Friendly": 1008,
                "Mid-Range": 1680,
                "Premium": 2604,
                "Luxury": 3864
              }
            }
          ],
          "contingency": {
            "percentage": 10,
            "reason": "Minor framing modifications possible at the entry. California permit required."
          },
          "roiNote": {
            "message": "Entry-door replacement delivers the highest ROI of any single exterior project.",
            "source": "Remodeling 2025 Cost vs. Value Report"
          }
        }
      },
      "focusAreas": {
        "Front entrance": {
          "lineItems": [
            {
              "item": "New Entry Door & Hardware",
              "description": "Replace entry door, add smart lock, new exterior hardware set",
              "costBasis": "Turlock, CA market: roughly $1,583–$4,089 depending on materials and scope",
              "roiRecovery": 150,
              "tiers": {
                "Budget-Friendly": 1583,
                "Mid-Range": 2638,
                "Premium": 4089,
                "Luxury": 6067
              }
            },
            {
              "item": "Porch Lighting & Address Numbers",
              "description": "New porch light fixture, pathway lights, and updated address numbers",
              "costBasis": "Turlock, CA market: roughly $336–$868 depending on materials and scope",
              "roiRecovery": 120,
              "tiers": {
                "Budget-Friendly": 336,
                "Mid-Range": 560,
                "Premium": 868,
                "Luxury": 1288
              }
            },
            {
              "item": "Pathway & Porch Tile/Pavers",
              "description": "New pathway surface from sidewalk to door; porch tile or stone overlay",
              "costBasis": "Turlock, CA market: roughly $1,680–$4,340 depending on materials and scope",
              "roiRecovery": 120,
              "tiers": {
                "Budget-Friendly": 1680,
                "Mid-Range": 2800,
                "Premium": 4340,
                "Luxury": 6440
              }
            }
          ],
          "contingency": {
            "percentage": 10,
            "reason": "Minor framing or utility work possible at the entry. California permit required."
          },
          "roiNote": {
            "message": "Front-entrance upgrades deliver outsized curb-appeal ROI in Turlock.",
            "source": "Remodeling 2025 Cost vs. Value — Pacific Region"
          }
        },
        "Landscaping": {
          "lineItems": [
            {
              "item": "Lawn & Ground Cover",
              "description": "Sod or drought-resistant ground cover",
              "costBasis": "Turlock, CA market: roughly $1,478–$3,819 depending on materials and scope",
              "roiRecovery": 100,
              "tiers": {
                "Budget-Friendly": 1478,
                "Mid-Range": 2464,
                "Premium": 3819,
                "Luxury": 5667
              }
            },
            {
              "item": "Shrubs, Plants & Mulch",
              "description": "Regionally appropriate, drought-tolerant plantings",
              "costBasis": "Turlock, CA market: roughly $1,210–$3,125 depending on materials and scope",
              "roiRecovery": 100,
              "tiers": {
                "Budget-Friendly": 1210,
                "Mid-Range": 2016,
                "Premium": 3125,
                "Luxury": 4637
              }
            },
            {
              "item": "Edging, Cleanup & Bark Mulch",
              "description": "Define planting beds, install edging, and a 3-inch bark mulch layer",
              "costBasis": "Turlock, CA market: roughly $470–$1,215 depending on materials and scope",
              "roiRecovery": 90,
              "tiers": {
                "Budget-Friendly": 470,
                "Mid-Range": 784,
                "Premium": 1215,
                "Luxury": 1803
              }
            }
          ],
          "contingency": {
            "percentage": 10,
            "reason": "Soil, grading, and irrigation conditions vary on-site in Turlock."
          },
          "roiNote": {
            "message": "Professional landscaping recovers close to 100% of its cost on average.",
            "source": "NAR 2025 Remodeling Impact Report"
          }
        },
        "Driveway": {
          "lineItems": [
            {
              "item": "Driveway Demo & Grading",
              "description": "Remove existing driveway surface, regrade base, compact subbase",
              "costBasis": "Turlock, CA market: roughly $941–$2,430 depending on materials and scope",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 941,
                "Mid-Range": 1568,
                "Premium": 2430,
                "Luxury": 3606
              }
            },
            {
              "item": "New Driveway Surface",
              "description": "Concrete (standard) to decorative pavers (premium); includes edging and sealer",
              "costBasis": "Turlock, CA market: roughly $2,352–$6,076 depending on materials and scope",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 2352,
                "Mid-Range": 3920,
                "Premium": 6076,
                "Luxury": 9016
              }
            }
          ],
          "contingency": {
            "percentage": 12,
            "reason": "Base and subgrade condition unknown until demo. California permit required."
          },
          "roiNote": {
            "message": "Driveway condition strongly shapes buyer first impressions.",
            "source": "HomeAdvisor True Cost Guide 2025"
          }
        },
        "Patio": {
          "lineItems": [
            {
              "item": "Patio Demo & Base Prep",
              "description": "Remove existing surface, excavate and compact gravel base",
              "costBasis": "Turlock, CA market: roughly $605–$1,562 depending on materials and scope",
              "roiRecovery": 80,
              "tiers": {
                "Budget-Friendly": 605,
                "Mid-Range": 1008,
                "Premium": 1562,
                "Luxury": 2318
              }
            },
            {
              "item": "Patio Surface & Finishing",
              "description": "Concrete, stamped concrete, or natural stone pavers with sealer and edging",
              "costBasis": "Turlock, CA market: roughly $4,032–$10,416 depending on materials and scope",
              "roiRecovery": 80,
              "tiers": {
                "Budget-Friendly": 4032,
                "Mid-Range": 6720,
                "Premium": 10416,
                "Luxury": 15456
              }
            }
          ],
          "contingency": {
            "percentage": 12,
            "reason": "Drainage and base prep may add scope. California permit required."
          },
          "roiNote": {
            "message": "Outdoor living space adds value in California’s mild-climate markets.",
            "source": "NAR 2025 Remodeling Impact Report"
          }
        },
        "All": {
          "lineItems": [
            {
              "item": "Complete Exterior Paint",
              "description": "Full repaint of all exterior surfaces with premium paint",
              "costBasis": "Turlock, CA market: roughly $3,360–$8,680 depending on materials and scope",
              "roiRecovery": 60,
              "tiers": {
                "Budget-Friendly": 3360,
                "Mid-Range": 5600,
                "Premium": 8680,
                "Luxury": 12880
              }
            },
            {
              "item": "Landscaping & Curb Appeal",
              "description": "Lawn, plants, mulch, edging, and pathway improvements",
              "costBasis": "Turlock, CA market: roughly $2,688–$6,944 depending on materials and scope",
              "roiRecovery": 100,
              "tiers": {
                "Budget-Friendly": 2688,
                "Mid-Range": 4480,
                "Premium": 6944,
                "Luxury": 10304
              }
            },
            {
              "item": "New Entry Door & Porch",
              "description": "New fiberglass door, hardware, porch lighting, and pathway",
              "costBasis": "Turlock, CA market: roughly $3,696–$9,548 depending on materials and scope",
              "roiRecovery": 150,
              "tiers": {
                "Budget-Friendly": 3696,
                "Mid-Range": 6160,
                "Premium": 9548,
                "Luxury": 14168
              }
            },
            {
              "item": "Siding & Trim Update",
              "description": "Fiber cement siding sections with new trim boards and flashing",
              "costBasis": "Turlock, CA market: roughly $8,064–$20,832 depending on materials and scope",
              "roiRecovery": 80,
              "tiers": {
                "Budget-Friendly": 8064,
                "Mid-Range": 13440,
                "Premium": 20832,
                "Luxury": 30912
              }
            }
          ],
          "contingency": {
            "percentage": 15,
            "reason": "Multi-trade coordination and full-scope permitting — newer construction (2016), though foreclosure condition may hide deferred maintenance. California permit required."
          },
          "roiNote": {
            "message": "A complete exterior renovation improves cost recovery and reduces time-on-market.",
            "source": "Remodeling 2025 Cost vs. Value — Pacific Region · NAR 2025"
          }
        }
      }
    },
    "Kitchen": {
      "lineItems": [
        {
          "item": "Cabinets & Hardware",
          "description": "Semi-custom cabinet replacement with soft-close hardware",
          "costBasis": "Turlock, CA market: roughly $7,392–$22,848 depending on materials and scope",
          "roiRecovery": 67,
          "tiers": {
            "Budget-Friendly": 7392,
            "Mid-Range": 13440,
            "Premium": 22848,
            "Luxury": 37632
          }
        },
        {
          "item": "Countertops (Quartz)",
          "description": "Quartz countertop fabrication and installation",
          "costBasis": "Turlock, CA market: roughly $3,388–$10,472 depending on materials and scope",
          "roiRecovery": 72,
          "tiers": {
            "Budget-Friendly": 3388,
            "Mid-Range": 6160,
            "Premium": 10472,
            "Luxury": 17248
          }
        },
        {
          "item": "Appliance Package",
          "description": "Mid-range stainless: refrigerator, range, dishwasher, and microwave",
          "costBasis": "Turlock, CA market: roughly $4,928–$15,232 depending on materials and scope",
          "roiRecovery": 60,
          "tiers": {
            "Budget-Friendly": 4928,
            "Mid-Range": 8960,
            "Premium": 15232,
            "Luxury": 25088
          }
        },
        {
          "item": "Flooring & Backsplash",
          "description": "LVP flooring replacement and tile backsplash installation",
          "costBasis": "Turlock, CA market: roughly $2,587–$7,997 depending on materials and scope",
          "roiRecovery": 70,
          "tiers": {
            "Budget-Friendly": 2587,
            "Mid-Range": 4704,
            "Premium": 7997,
            "Luxury": 13171
          }
        },
        {
          "item": "Lighting & Electrical",
          "description": "Recessed lights, pendant lighting, undercabinet LED, and panel upgrade if needed",
          "costBasis": "Turlock, CA market: roughly $1,355–$4,189 depending on materials and scope",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 1355,
            "Mid-Range": 2464,
            "Premium": 4189,
            "Luxury": 6899
          }
        }
      ],
      "contingency": {
        "percentage": 13,
        "reason": "Plumbing and electrical updates often needed — newer construction (2016), though foreclosure condition may hide deferred maintenance. California permit required. Interior condition could not be fully inspected pre-auction (occupied)."
      },
      "roiNote": {
        "message": "A mid-range kitchen remodel is one of the top interior ROI projects in Turlock.",
        "source": "Remodeling 2025 Cost vs. Value — Pacific Region · NAR 2025"
      }
    },
    "Bathroom": {
      "lineItems": [
        {
          "item": "Vanity, Sink & Mirror",
          "description": "Vanity cabinet replacement, new countertop, undermount sink, faucet, and framed mirror",
          "costBasis": "Turlock, CA market: roughly $2,156–$6,664 depending on materials and scope",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 2156,
            "Mid-Range": 3920,
            "Premium": 6664,
            "Luxury": 10976
          }
        },
        {
          "item": "Shower / Tub Renovation",
          "description": "Tile shower rebuild or tub replacement with new fixtures and glass enclosure",
          "costBasis": "Turlock, CA market: roughly $5,236–$16,184 depending on materials and scope",
          "roiRecovery": 68,
          "tiers": {
            "Budget-Friendly": 5236,
            "Mid-Range": 9520,
            "Premium": 16184,
            "Luxury": 26656
          }
        },
        {
          "item": "Floor & Wall Tile",
          "description": "Porcelain floor tile and partial wall tile with waterproofing membrane",
          "costBasis": "Turlock, CA market: roughly $2,341–$7,235 depending on materials and scope",
          "roiRecovery": 62,
          "tiers": {
            "Budget-Friendly": 2341,
            "Mid-Range": 4256,
            "Premium": 7235,
            "Luxury": 11917
          }
        },
        {
          "item": "Toilet, Fixtures & Lighting",
          "description": "Comfort-height toilet, new faucets, towel bars, exhaust fan, and vanity lighting",
          "costBasis": "Turlock, CA market: roughly $1,355–$4,189 depending on materials and scope",
          "roiRecovery": 60,
          "tiers": {
            "Budget-Friendly": 1355,
            "Mid-Range": 2464,
            "Premium": 4189,
            "Luxury": 6899
          }
        }
      ],
      "contingency": {
        "percentage": 16,
        "reason": "Bathroom rough-in and waterproofing risk — newer construction (2016), though foreclosure condition may hide deferred maintenance. California permit required. Interior condition could not be fully inspected pre-auction (occupied)."
      },
      "roiNote": {
        "message": "Bathroom remodels return a strong share of cost in the competitive California market.",
        "source": "Remodeling 2025 Cost vs. Value — Pacific Region"
      }
    },
    "Living Room": {
      "lineItems": [
        {
          "item": "Hardwood / LVP Flooring",
          "description": "Replace carpet or old flooring with engineered hardwood or luxury vinyl plank",
          "costBasis": "Turlock, CA market: roughly $3,696–$11,424 depending on materials and scope",
          "roiRecovery": 72,
          "tiers": {
            "Budget-Friendly": 3696,
            "Mid-Range": 6720,
            "Premium": 11424,
            "Luxury": 18816
          }
        },
        {
          "item": "Paint, Trim & Crown Molding",
          "description": "Interior repaint, new baseboards, and crown molding installation",
          "costBasis": "Turlock, CA market: roughly $1,540–$4,760 depending on materials and scope",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 1540,
            "Mid-Range": 2800,
            "Premium": 4760,
            "Luxury": 7840
          }
        },
        {
          "item": "Lighting Upgrade",
          "description": "Recessed lighting installation, dimmer switches, and new ceiling fixtures",
          "costBasis": "Turlock, CA market: roughly $1,848–$5,712 depending on materials and scope",
          "roiRecovery": 60,
          "tiers": {
            "Budget-Friendly": 1848,
            "Mid-Range": 3360,
            "Premium": 5712,
            "Luxury": 9408
          }
        }
      ],
      "contingency": {
        "percentage": 11,
        "reason": "Possible electrical and permit needs; newer construction (2016), though foreclosure condition may hide deferred maintenance. Interior condition could not be fully inspected pre-auction (occupied)."
      },
      "roiNote": {
        "message": "Living-room updates recover well in Turlock; flooring delivers the strongest per-dollar ROI.",
        "source": "NAR 2025 Remodeling Impact Report"
      }
    },
    "Bedroom": {
      "lineItems": [
        {
          "item": "Flooring Replacement",
          "description": "Remove carpet; install engineered hardwood or luxury vinyl plank",
          "costBasis": "Turlock, CA market: roughly $2,772–$8,568 depending on materials and scope",
          "roiRecovery": 70,
          "tiers": {
            "Budget-Friendly": 2772,
            "Mid-Range": 5040,
            "Premium": 8568,
            "Luxury": 14112
          }
        },
        {
          "item": "Paint & Trim",
          "description": "Repaint walls and ceiling, new baseboards and door casings",
          "costBasis": "Turlock, CA market: roughly $1,109–$3,427 depending on materials and scope",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 1109,
            "Mid-Range": 2016,
            "Premium": 3427,
            "Luxury": 5645
          }
        },
        {
          "item": "Closet Organization System",
          "description": "Custom or modular closet system with shelving, rods, and drawers",
          "costBasis": "Turlock, CA market: roughly $1,971–$6,093 depending on materials and scope",
          "roiRecovery": 60,
          "tiers": {
            "Budget-Friendly": 1971,
            "Mid-Range": 3584,
            "Premium": 6093,
            "Luxury": 10035
          }
        }
      ],
      "contingency": {
        "percentage": 11,
        "reason": "Minor electrical or permit work possible; newer construction (2016), though foreclosure condition may hide deferred maintenance. Interior condition could not be fully inspected pre-auction (occupied)."
      },
      "roiNote": {
        "message": "Bedroom updates return solid value; flooring and closet upgrades drive buyer appeal.",
        "source": "NAR 2025 Remodeling Impact Report"
      }
    }
  }
};

module.exports = { id: TURLOCK_VIOLET_PROPERTY_ID, config, TURLOCK_VIOLET_PROPERTY_ID };
