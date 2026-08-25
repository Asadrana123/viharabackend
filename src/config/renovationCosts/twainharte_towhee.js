/**
 * renovationCosts/twainharte_towhee.js
 *
 * 17895 Towhee Ln, Twain Harte, CA 95383 — Single Family, 3bd/2ba, 864 sqft, built 1974.
 * regionalFactor 1.18: Sierra foothills — California costs plus a rural-access logistics premium.
 * Line items are the single source of truth — see _shared.js for how subtotal,
 * contingency, final cost, range and ROI are derived from them.
 */

const TWAINHARTE_PROPERTY_ID = '6a8d98b744a61f429a97fb29';

const config = {
  "meta": {
    "address": "17895 Towhee Ln, Twain Harte, CA 95383",
    "city": "Twain Harte",
    "state": "California",
    "squareFootage": 864,
    "bedrooms": 3,
    "bathrooms": 2,
    "yearBuilt": 1974,
    "regionalFactor": 1.18,
    "dataSource": "Tuolumne County / Central & Northern California construction cost data (2025) · Remodeling 2025 Cost vs. Value Report (Pacific Region) · NAR 2025 Remodeling Impact Report"
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
              "costBasis": "Twain Harte, CA market: roughly $524–$1,355 depending on materials and scope",
              "roiRecovery": 55,
              "tiers": {
                "Budget-Friendly": 524,
                "Mid-Range": 874,
                "Premium": 1355,
                "Luxury": 2010
              }
            },
            {
              "item": "Exterior Paint (Walls, Trim & Shutters)",
              "description": "Two-coat application with premium exterior paint on all wall surfaces and trim",
              "costBasis": "Twain Harte, CA market: roughly $2,099–$5,422 depending on materials and scope",
              "roiRecovery": 60,
              "tiers": {
                "Budget-Friendly": 2099,
                "Mid-Range": 3498,
                "Premium": 5422,
                "Luxury": 8045
              }
            },
            {
              "item": "Front Door Repaint & Hardware",
              "description": "Strip, prime, and repaint front door with updated exterior hardware",
              "costBasis": "Twain Harte, CA market: roughly $354–$915 depending on materials and scope",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 354,
                "Mid-Range": 590,
                "Premium": 915,
                "Luxury": 1357
              }
            }
          ],
          "contingency": {
            "percentage": 13,
            "reason": "Pre-1978 build — lead-paint testing and prep may be required. California permit required."
          },
          "roiNote": {
            "message": "Fresh exterior paint is the highest-visual-impact, lowest-cost curb-appeal upgrade in Twain Harte.",
            "source": "NAR 2025 Remodeling Impact Report"
          }
        },
        "Update roof/siding": {
          "lineItems": [
            {
              "item": "Siding Removal & Disposal",
              "description": "Full tear-off of existing siding, inspection for moisture damage, proper disposal",
              "costBasis": "Twain Harte, CA market: roughly $994–$2,568 depending on materials and scope",
              "roiRecovery": 76,
              "tiers": {
                "Budget-Friendly": 994,
                "Mid-Range": 1657,
                "Premium": 2568,
                "Luxury": 3811
              }
            },
            {
              "item": "New Siding Installation",
              "description": "Fiber cement siding installed for durability and moisture resistance",
              "costBasis": "Twain Harte, CA market: roughly $7,732–$19,973 depending on materials and scope",
              "roiRecovery": 76,
              "tiers": {
                "Budget-Friendly": 7732,
                "Mid-Range": 12886,
                "Premium": 19973,
                "Luxury": 29638
              }
            },
            {
              "item": "Trim, Flashing & Moisture Barrier",
              "description": "Install weather-resistant barrier, new trim boards, and window/door flashing",
              "costBasis": "Twain Harte, CA market: roughly $1,546–$3,994 depending on materials and scope",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 1546,
                "Mid-Range": 2577,
                "Premium": 3994,
                "Luxury": 5927
              }
            }
          ],
          "contingency": {
            "percentage": 16,
            "reason": "Concealed moisture, rot, or sheathing damage risk — aging mechanical systems and possible galvanized plumbing in a 1974 build. California permit required."
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
              "costBasis": "Twain Harte, CA market: roughly $662–$1,711 depending on materials and scope",
              "roiRecovery": 69,
              "tiers": {
                "Budget-Friendly": 662,
                "Mid-Range": 1104,
                "Premium": 1711,
                "Luxury": 2539
              }
            },
            {
              "item": "New Window Units (8–10 windows)",
              "description": "Vinyl double-pane (budget) to fiberglass triple-pane (premium); Energy Star rated",
              "costBasis": "Twain Harte, CA market: roughly $7,732–$19,973 depending on materials and scope",
              "roiRecovery": 69,
              "tiers": {
                "Budget-Friendly": 7732,
                "Mid-Range": 12886,
                "Premium": 19973,
                "Luxury": 29638
              }
            },
            {
              "item": "Exterior Trim & Caulking",
              "description": "New exterior trim, weather-seal caulking, and touch-up painting around all windows",
              "costBasis": "Twain Harte, CA market: roughly $1,381–$3,567 depending on materials and scope",
              "roiRecovery": 65,
              "tiers": {
                "Budget-Friendly": 1381,
                "Mid-Range": 2301,
                "Premium": 3567,
                "Luxury": 5292
              }
            }
          ],
          "contingency": {
            "percentage": 13,
            "reason": "Rough-opening rot and out-of-square framing risk on a 1974 build. California permit required."
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
              "costBasis": "Twain Harte, CA market: roughly $1,667–$4,307 depending on materials and scope",
              "roiRecovery": 188,
              "tiers": {
                "Budget-Friendly": 1667,
                "Mid-Range": 2779,
                "Premium": 4307,
                "Luxury": 6392
              }
            },
            {
              "item": "Pathway & Porch Update",
              "description": "Repair or replace pathway pavers/concrete and porch lighting upgrade",
              "costBasis": "Twain Harte, CA market: roughly $1,062–$2,744 depending on materials and scope",
              "roiRecovery": 120,
              "tiers": {
                "Budget-Friendly": 1062,
                "Mid-Range": 1770,
                "Premium": 2744,
                "Luxury": 4071
              }
            }
          ],
          "contingency": {
            "percentage": 11,
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
              "costBasis": "Twain Harte, CA market: roughly $1,667–$4,307 depending on materials and scope",
              "roiRecovery": 150,
              "tiers": {
                "Budget-Friendly": 1667,
                "Mid-Range": 2779,
                "Premium": 4307,
                "Luxury": 6392
              }
            },
            {
              "item": "Porch Lighting & Address Numbers",
              "description": "New porch light fixture, pathway lights, and updated address numbers",
              "costBasis": "Twain Harte, CA market: roughly $354–$915 depending on materials and scope",
              "roiRecovery": 120,
              "tiers": {
                "Budget-Friendly": 354,
                "Mid-Range": 590,
                "Premium": 915,
                "Luxury": 1357
              }
            },
            {
              "item": "Pathway & Porch Tile/Pavers",
              "description": "New pathway surface from sidewalk to door; porch tile or stone overlay",
              "costBasis": "Twain Harte, CA market: roughly $1,770–$4,573 depending on materials and scope",
              "roiRecovery": 120,
              "tiers": {
                "Budget-Friendly": 1770,
                "Mid-Range": 2950,
                "Premium": 4573,
                "Luxury": 6785
              }
            }
          ],
          "contingency": {
            "percentage": 11,
            "reason": "Minor framing or utility work possible at the entry. California permit required."
          },
          "roiNote": {
            "message": "Front-entrance upgrades deliver outsized curb-appeal ROI in Twain Harte.",
            "source": "Remodeling 2025 Cost vs. Value — Pacific Region"
          }
        },
        "Landscaping": {
          "lineItems": [
            {
              "item": "Lawn & Ground Cover",
              "description": "Sod or drought-resistant ground cover",
              "costBasis": "Twain Harte, CA market: roughly $1,215–$3,139 depending on materials and scope",
              "roiRecovery": 100,
              "tiers": {
                "Budget-Friendly": 1215,
                "Mid-Range": 2025,
                "Premium": 3139,
                "Luxury": 4658
              }
            },
            {
              "item": "Shrubs, Plants & Mulch",
              "description": "Regionally appropriate, drought-tolerant plantings",
              "costBasis": "Twain Harte, CA market: roughly $994–$2,568 depending on materials and scope",
              "roiRecovery": 100,
              "tiers": {
                "Budget-Friendly": 994,
                "Mid-Range": 1657,
                "Premium": 2568,
                "Luxury": 3811
              }
            },
            {
              "item": "Edging, Cleanup & Bark Mulch",
              "description": "Define planting beds, install edging, and a 3-inch bark mulch layer",
              "costBasis": "Twain Harte, CA market: roughly $386–$998 depending on materials and scope",
              "roiRecovery": 90,
              "tiers": {
                "Budget-Friendly": 386,
                "Mid-Range": 644,
                "Premium": 998,
                "Luxury": 1481
              }
            }
          ],
          "contingency": {
            "percentage": 11,
            "reason": "Soil, grading, and irrigation conditions vary on-site in Twain Harte."
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
              "costBasis": "Twain Harte, CA market: roughly $773–$1,998 depending on materials and scope",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 773,
                "Mid-Range": 1289,
                "Premium": 1998,
                "Luxury": 2965
              }
            },
            {
              "item": "New Driveway Surface",
              "description": "Concrete (standard) to decorative pavers (premium); includes edging and sealer",
              "costBasis": "Twain Harte, CA market: roughly $1,933–$4,993 depending on materials and scope",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 1933,
                "Mid-Range": 3221,
                "Premium": 4993,
                "Luxury": 7408
              }
            }
          ],
          "contingency": {
            "percentage": 13,
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
              "costBasis": "Twain Harte, CA market: roughly $497–$1,283 depending on materials and scope",
              "roiRecovery": 80,
              "tiers": {
                "Budget-Friendly": 497,
                "Mid-Range": 828,
                "Premium": 1283,
                "Luxury": 1904
              }
            },
            {
              "item": "Patio Surface & Finishing",
              "description": "Concrete, stamped concrete, or natural stone pavers with sealer and edging",
              "costBasis": "Twain Harte, CA market: roughly $3,313–$8,559 depending on materials and scope",
              "roiRecovery": 80,
              "tiers": {
                "Budget-Friendly": 3313,
                "Mid-Range": 5522,
                "Premium": 8559,
                "Luxury": 12701
              }
            }
          ],
          "contingency": {
            "percentage": 13,
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
              "costBasis": "Twain Harte, CA market: roughly $2,761–$7,133 depending on materials and scope",
              "roiRecovery": 60,
              "tiers": {
                "Budget-Friendly": 2761,
                "Mid-Range": 4602,
                "Premium": 7133,
                "Luxury": 10585
              }
            },
            {
              "item": "Landscaping & Curb Appeal",
              "description": "Lawn, plants, mulch, edging, and pathway improvements",
              "costBasis": "Twain Harte, CA market: roughly $2,209–$5,707 depending on materials and scope",
              "roiRecovery": 100,
              "tiers": {
                "Budget-Friendly": 2209,
                "Mid-Range": 3682,
                "Premium": 5707,
                "Luxury": 8469
              }
            },
            {
              "item": "New Entry Door & Porch",
              "description": "New fiberglass door, hardware, porch lighting, and pathway",
              "costBasis": "Twain Harte, CA market: roughly $3,894–$10,060 depending on materials and scope",
              "roiRecovery": 150,
              "tiers": {
                "Budget-Friendly": 3894,
                "Mid-Range": 6490,
                "Premium": 10060,
                "Luxury": 14927
              }
            },
            {
              "item": "Siding & Trim Update",
              "description": "Fiber cement siding sections with new trim boards and flashing",
              "costBasis": "Twain Harte, CA market: roughly $6,627–$17,120 depending on materials and scope",
              "roiRecovery": 80,
              "tiers": {
                "Budget-Friendly": 6627,
                "Mid-Range": 11045,
                "Premium": 17120,
                "Luxury": 25403
              }
            }
          ],
          "contingency": {
            "percentage": 16,
            "reason": "Multi-trade coordination and full-scope permitting — aging mechanical systems and possible galvanized plumbing in a 1974 build. California permit required."
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
          "costBasis": "Twain Harte, CA market: roughly $6,075–$18,777 depending on materials and scope",
          "roiRecovery": 67,
          "tiers": {
            "Budget-Friendly": 6075,
            "Mid-Range": 11045,
            "Premium": 18777,
            "Luxury": 30926
          }
        },
        {
          "item": "Countertops (Quartz)",
          "description": "Quartz countertop fabrication and installation",
          "costBasis": "Twain Harte, CA market: roughly $2,784–$8,605 depending on materials and scope",
          "roiRecovery": 72,
          "tiers": {
            "Budget-Friendly": 2784,
            "Mid-Range": 5062,
            "Premium": 8605,
            "Luxury": 14174
          }
        },
        {
          "item": "Appliance Package",
          "description": "Mid-range stainless: refrigerator, range, dishwasher, and microwave",
          "costBasis": "Twain Harte, CA market: roughly $5,192–$16,048 depending on materials and scope",
          "roiRecovery": 60,
          "tiers": {
            "Budget-Friendly": 5192,
            "Mid-Range": 9440,
            "Premium": 16048,
            "Luxury": 26432
          }
        },
        {
          "item": "Flooring & Backsplash",
          "description": "LVP flooring replacement and tile backsplash installation",
          "costBasis": "Twain Harte, CA market: roughly $2,126–$6,572 depending on materials and scope",
          "roiRecovery": 70,
          "tiers": {
            "Budget-Friendly": 2126,
            "Mid-Range": 3866,
            "Premium": 6572,
            "Luxury": 10825
          }
        },
        {
          "item": "Lighting & Electrical",
          "description": "Recessed lights, pendant lighting, undercabinet LED, and panel upgrade if needed",
          "costBasis": "Twain Harte, CA market: roughly $1,428–$4,413 depending on materials and scope",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 1428,
            "Mid-Range": 2596,
            "Premium": 4413,
            "Luxury": 7269
          }
        }
      ],
      "contingency": {
        "percentage": 14,
        "reason": "Plumbing and electrical updates often needed — aging mechanical systems and possible galvanized plumbing in a 1974 build. California permit required. Interior condition could not be fully inspected pre-auction (occupied)."
      },
      "roiNote": {
        "message": "A mid-range kitchen remodel is one of the top interior ROI projects in Twain Harte.",
        "source": "Remodeling 2025 Cost vs. Value — Pacific Region · NAR 2025"
      }
    },
    "Bathroom": {
      "lineItems": [
        {
          "item": "Vanity, Sink & Mirror",
          "description": "Vanity cabinet replacement, new countertop, undermount sink, faucet, and framed mirror",
          "costBasis": "Twain Harte, CA market: roughly $2,272–$7,021 depending on materials and scope",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 2272,
            "Mid-Range": 4130,
            "Premium": 7021,
            "Luxury": 11564
          }
        },
        {
          "item": "Shower / Tub Renovation",
          "description": "Tile shower rebuild or tub replacement with new fixtures and glass enclosure",
          "costBasis": "Twain Harte, CA market: roughly $5,517–$17,051 depending on materials and scope",
          "roiRecovery": 68,
          "tiers": {
            "Budget-Friendly": 5517,
            "Mid-Range": 10030,
            "Premium": 17051,
            "Luxury": 28084
          }
        },
        {
          "item": "Floor & Wall Tile",
          "description": "Porcelain floor tile and partial wall tile with waterproofing membrane",
          "costBasis": "Twain Harte, CA market: roughly $1,924–$5,947 depending on materials and scope",
          "roiRecovery": 62,
          "tiers": {
            "Budget-Friendly": 1924,
            "Mid-Range": 3498,
            "Premium": 5947,
            "Luxury": 9794
          }
        },
        {
          "item": "Toilet, Fixtures & Lighting",
          "description": "Comfort-height toilet, new faucets, towel bars, exhaust fan, and vanity lighting",
          "costBasis": "Twain Harte, CA market: roughly $1,428–$4,413 depending on materials and scope",
          "roiRecovery": 60,
          "tiers": {
            "Budget-Friendly": 1428,
            "Mid-Range": 2596,
            "Premium": 4413,
            "Luxury": 7269
          }
        }
      ],
      "contingency": {
        "percentage": 17,
        "reason": "Bathroom rough-in and waterproofing risk — aging mechanical systems and possible galvanized plumbing in a 1974 build. California permit required. Interior condition could not be fully inspected pre-auction (occupied)."
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
          "costBasis": "Twain Harte, CA market: roughly $3,037–$9,387 depending on materials and scope",
          "roiRecovery": 72,
          "tiers": {
            "Budget-Friendly": 3037,
            "Mid-Range": 5522,
            "Premium": 9387,
            "Luxury": 15462
          }
        },
        {
          "item": "Paint, Trim & Crown Molding",
          "description": "Interior repaint, new baseboards, and crown molding installation",
          "costBasis": "Twain Harte, CA market: roughly $1,266–$3,912 depending on materials and scope",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 1266,
            "Mid-Range": 2301,
            "Premium": 3912,
            "Luxury": 6443
          }
        },
        {
          "item": "Lighting Upgrade",
          "description": "Recessed lighting installation, dimmer switches, and new ceiling fixtures",
          "costBasis": "Twain Harte, CA market: roughly $1,947–$6,018 depending on materials and scope",
          "roiRecovery": 60,
          "tiers": {
            "Budget-Friendly": 1947,
            "Mid-Range": 3540,
            "Premium": 6018,
            "Luxury": 9912
          }
        }
      ],
      "contingency": {
        "percentage": 12,
        "reason": "Possible electrical and permit needs; aging mechanical systems and possible galvanized plumbing in a 1974 build. Interior condition could not be fully inspected pre-auction (occupied)."
      },
      "roiNote": {
        "message": "Living-room updates recover well in Twain Harte; flooring delivers the strongest per-dollar ROI.",
        "source": "NAR 2025 Remodeling Impact Report"
      }
    },
    "Bedroom": {
      "lineItems": [
        {
          "item": "Flooring Replacement",
          "description": "Remove carpet; install engineered hardwood or luxury vinyl plank",
          "costBasis": "Twain Harte, CA market: roughly $2,278–$7,041 depending on materials and scope",
          "roiRecovery": 70,
          "tiers": {
            "Budget-Friendly": 2278,
            "Mid-Range": 4142,
            "Premium": 7041,
            "Luxury": 11598
          }
        },
        {
          "item": "Paint & Trim",
          "description": "Repaint walls and ceiling, new baseboards and door casings",
          "costBasis": "Twain Harte, CA market: roughly $911–$2,817 depending on materials and scope",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 911,
            "Mid-Range": 1657,
            "Premium": 2817,
            "Luxury": 4640
          }
        },
        {
          "item": "Closet Organization System",
          "description": "Custom or modular closet system with shelving, rods, and drawers",
          "costBasis": "Twain Harte, CA market: roughly $2,077–$6,419 depending on materials and scope",
          "roiRecovery": 60,
          "tiers": {
            "Budget-Friendly": 2077,
            "Mid-Range": 3776,
            "Premium": 6419,
            "Luxury": 10573
          }
        }
      ],
      "contingency": {
        "percentage": 12,
        "reason": "Minor electrical or permit work possible; aging mechanical systems and possible galvanized plumbing in a 1974 build. Interior condition could not be fully inspected pre-auction (occupied)."
      },
      "roiNote": {
        "message": "Bedroom updates return solid value; flooring and closet upgrades drive buyer appeal.",
        "source": "NAR 2025 Remodeling Impact Report"
      }
    }
  }
};

module.exports = { id: TWAINHARTE_PROPERTY_ID, config, TWAINHARTE_PROPERTY_ID };
