/**
 * renovationCosts/sonora_hillview.js
 *
 * 20521 Upper Hillview Dr, Sonora, CA 95370 — Single Family, 3bd/3ba, 2816 sqft, built 1975.
 * regionalFactor 1.18: Sierra foothills — California costs plus a rural-access logistics premium.
 * Line items are the single source of truth — see _shared.js for how subtotal,
 * contingency, final cost, range and ROI are derived from them.
 */

const SONORA_HILLVIEW_PROPERTY_ID = '6a8d996444a61f429a97fb3e';

const config = {
  "meta": {
    "address": "20521 Upper Hillview Dr, Sonora, CA 95370",
    "city": "Sonora",
    "state": "California",
    "squareFootage": 2816,
    "bedrooms": 3,
    "bathrooms": 3,
    "yearBuilt": 1975,
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
              "costBasis": "Sonora, CA market: roughly $861–$2,224 depending on materials and scope",
              "roiRecovery": 55,
              "tiers": {
                "Budget-Friendly": 861,
                "Mid-Range": 1435,
                "Premium": 2224,
                "Luxury": 3300
              }
            },
            {
              "item": "Exterior Paint (Walls, Trim & Shutters)",
              "description": "Two-coat application with premium exterior paint on all wall surfaces and trim",
              "costBasis": "Sonora, CA market: roughly $3,444–$8,897 depending on materials and scope",
              "roiRecovery": 60,
              "tiers": {
                "Budget-Friendly": 3444,
                "Mid-Range": 5740,
                "Premium": 8897,
                "Luxury": 13202
              }
            },
            {
              "item": "Front Door Repaint & Hardware",
              "description": "Strip, prime, and repaint front door with updated exterior hardware",
              "costBasis": "Sonora, CA market: roughly $354–$915 depending on materials and scope",
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
            "message": "Fresh exterior paint is the highest-visual-impact, lowest-cost curb-appeal upgrade in Sonora.",
            "source": "NAR 2025 Remodeling Impact Report"
          }
        },
        "Update roof/siding": {
          "lineItems": [
            {
              "item": "Siding Removal & Disposal",
              "description": "Full tear-off of existing siding, inspection for moisture damage, proper disposal",
              "costBasis": "Sonora, CA market: roughly $1,631–$4,214 depending on materials and scope",
              "roiRecovery": 76,
              "tiers": {
                "Budget-Friendly": 1631,
                "Mid-Range": 2719,
                "Premium": 4214,
                "Luxury": 6254
              }
            },
            {
              "item": "New Siding Installation",
              "description": "Fiber cement siding installed for durability and moisture resistance",
              "costBasis": "Sonora, CA market: roughly $12,688–$32,776 depending on materials and scope",
              "roiRecovery": 76,
              "tiers": {
                "Budget-Friendly": 12688,
                "Mid-Range": 21146,
                "Premium": 32776,
                "Luxury": 48636
              }
            },
            {
              "item": "Trim, Flashing & Moisture Barrier",
              "description": "Install weather-resistant barrier, new trim boards, and window/door flashing",
              "costBasis": "Sonora, CA market: roughly $2,537–$6,555 depending on materials and scope",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 2537,
                "Mid-Range": 4229,
                "Premium": 6555,
                "Luxury": 9727
              }
            }
          ],
          "contingency": {
            "percentage": 16,
            "reason": "Concealed moisture, rot, or sheathing damage risk — aging mechanical systems and possible galvanized plumbing in a 1975 build. California permit required."
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
              "costBasis": "Sonora, CA market: roughly $1,087–$2,809 depending on materials and scope",
              "roiRecovery": 69,
              "tiers": {
                "Budget-Friendly": 1087,
                "Mid-Range": 1812,
                "Premium": 2809,
                "Luxury": 4168
              }
            },
            {
              "item": "New Window Units (8–10 windows)",
              "description": "Vinyl double-pane (budget) to fiberglass triple-pane (premium); Energy Star rated",
              "costBasis": "Sonora, CA market: roughly $12,688–$32,776 depending on materials and scope",
              "roiRecovery": 69,
              "tiers": {
                "Budget-Friendly": 12688,
                "Mid-Range": 21146,
                "Premium": 32776,
                "Luxury": 48636
              }
            },
            {
              "item": "Exterior Trim & Caulking",
              "description": "New exterior trim, weather-seal caulking, and touch-up painting around all windows",
              "costBasis": "Sonora, CA market: roughly $2,266–$5,853 depending on materials and scope",
              "roiRecovery": 65,
              "tiers": {
                "Budget-Friendly": 2266,
                "Mid-Range": 3776,
                "Premium": 5853,
                "Luxury": 8685
              }
            }
          ],
          "contingency": {
            "percentage": 13,
            "reason": "Rough-opening rot and out-of-square framing risk on a 1975 build. California permit required."
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
              "costBasis": "Sonora, CA market: roughly $1,667–$4,307 depending on materials and scope",
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
              "costBasis": "Sonora, CA market: roughly $1,062–$2,744 depending on materials and scope",
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
              "costBasis": "Sonora, CA market: roughly $1,667–$4,307 depending on materials and scope",
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
              "costBasis": "Sonora, CA market: roughly $354–$915 depending on materials and scope",
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
              "costBasis": "Sonora, CA market: roughly $1,770–$4,573 depending on materials and scope",
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
            "message": "Front-entrance upgrades deliver outsized curb-appeal ROI in Sonora.",
            "source": "Remodeling 2025 Cost vs. Value — Pacific Region"
          }
        },
        "Landscaping": {
          "lineItems": [
            {
              "item": "Lawn & Ground Cover",
              "description": "Sod or drought-resistant ground cover",
              "costBasis": "Sonora, CA market: roughly $1,994–$5,151 depending on materials and scope",
              "roiRecovery": 100,
              "tiers": {
                "Budget-Friendly": 1994,
                "Mid-Range": 3323,
                "Premium": 5151,
                "Luxury": 7643
              }
            },
            {
              "item": "Shrubs, Plants & Mulch",
              "description": "Regionally appropriate, drought-tolerant plantings",
              "costBasis": "Sonora, CA market: roughly $1,631–$4,214 depending on materials and scope",
              "roiRecovery": 100,
              "tiers": {
                "Budget-Friendly": 1631,
                "Mid-Range": 2719,
                "Premium": 4214,
                "Luxury": 6254
              }
            },
            {
              "item": "Edging, Cleanup & Bark Mulch",
              "description": "Define planting beds, install edging, and a 3-inch bark mulch layer",
              "costBasis": "Sonora, CA market: roughly $634–$1,638 depending on materials and scope",
              "roiRecovery": 90,
              "tiers": {
                "Budget-Friendly": 634,
                "Mid-Range": 1057,
                "Premium": 1638,
                "Luxury": 2431
              }
            }
          ],
          "contingency": {
            "percentage": 11,
            "reason": "Soil, grading, and irrigation conditions vary on-site in Sonora."
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
              "costBasis": "Sonora, CA market: roughly $1,269–$3,278 depending on materials and scope",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 1269,
                "Mid-Range": 2115,
                "Premium": 3278,
                "Luxury": 4865
              }
            },
            {
              "item": "New Driveway Surface",
              "description": "Concrete (standard) to decorative pavers (premium); includes edging and sealer",
              "costBasis": "Sonora, CA market: roughly $3,172–$8,193 depending on materials and scope",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 3172,
                "Mid-Range": 5286,
                "Premium": 8193,
                "Luxury": 12158
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
              "costBasis": "Sonora, CA market: roughly $815–$2,106 depending on materials and scope",
              "roiRecovery": 80,
              "tiers": {
                "Budget-Friendly": 815,
                "Mid-Range": 1359,
                "Premium": 2106,
                "Luxury": 3126
              }
            },
            {
              "item": "Patio Surface & Finishing",
              "description": "Concrete, stamped concrete, or natural stone pavers with sealer and edging",
              "costBasis": "Sonora, CA market: roughly $5,437–$14,046 depending on materials and scope",
              "roiRecovery": 80,
              "tiers": {
                "Budget-Friendly": 5437,
                "Mid-Range": 9062,
                "Premium": 14046,
                "Luxury": 20843
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
              "costBasis": "Sonora, CA market: roughly $4,531–$11,706 depending on materials and scope",
              "roiRecovery": 60,
              "tiers": {
                "Budget-Friendly": 4531,
                "Mid-Range": 7552,
                "Premium": 11706,
                "Luxury": 17370
              }
            },
            {
              "item": "Landscaping & Curb Appeal",
              "description": "Lawn, plants, mulch, edging, and pathway improvements",
              "costBasis": "Sonora, CA market: roughly $3,625–$9,365 depending on materials and scope",
              "roiRecovery": 100,
              "tiers": {
                "Budget-Friendly": 3625,
                "Mid-Range": 6042,
                "Premium": 9365,
                "Luxury": 13897
              }
            },
            {
              "item": "New Entry Door & Porch",
              "description": "New fiberglass door, hardware, porch lighting, and pathway",
              "costBasis": "Sonora, CA market: roughly $3,894–$10,060 depending on materials and scope",
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
              "costBasis": "Sonora, CA market: roughly $10,875–$28,094 depending on materials and scope",
              "roiRecovery": 80,
              "tiers": {
                "Budget-Friendly": 10875,
                "Mid-Range": 18125,
                "Premium": 28094,
                "Luxury": 41688
              }
            }
          ],
          "contingency": {
            "percentage": 16,
            "reason": "Multi-trade coordination and full-scope permitting — aging mechanical systems and possible galvanized plumbing in a 1975 build. California permit required."
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
          "costBasis": "Sonora, CA market: roughly $9,969–$30,813 depending on materials and scope",
          "roiRecovery": 67,
          "tiers": {
            "Budget-Friendly": 9969,
            "Mid-Range": 18125,
            "Premium": 30813,
            "Luxury": 50750
          }
        },
        {
          "item": "Countertops (Quartz)",
          "description": "Quartz countertop fabrication and installation",
          "costBasis": "Sonora, CA market: roughly $4,569–$14,122 depending on materials and scope",
          "roiRecovery": 72,
          "tiers": {
            "Budget-Friendly": 4569,
            "Mid-Range": 8307,
            "Premium": 14122,
            "Luxury": 23260
          }
        },
        {
          "item": "Appliance Package",
          "description": "Mid-range stainless: refrigerator, range, dishwasher, and microwave",
          "costBasis": "Sonora, CA market: roughly $5,192–$16,048 depending on materials and scope",
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
          "costBasis": "Sonora, CA market: roughly $3,489–$10,785 depending on materials and scope",
          "roiRecovery": 70,
          "tiers": {
            "Budget-Friendly": 3489,
            "Mid-Range": 6344,
            "Premium": 10785,
            "Luxury": 17763
          }
        },
        {
          "item": "Lighting & Electrical",
          "description": "Recessed lights, pendant lighting, undercabinet LED, and panel upgrade if needed",
          "costBasis": "Sonora, CA market: roughly $1,428–$4,413 depending on materials and scope",
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
        "percentage": 13,
        "reason": "Plumbing and electrical updates often needed — aging mechanical systems and possible galvanized plumbing in a 1975 build. California permit required."
      },
      "roiNote": {
        "message": "A mid-range kitchen remodel is one of the top interior ROI projects in Sonora.",
        "source": "Remodeling 2025 Cost vs. Value — Pacific Region · NAR 2025"
      }
    },
    "Bathroom": {
      "lineItems": [
        {
          "item": "Vanity, Sink & Mirror",
          "description": "Vanity cabinet replacement, new countertop, undermount sink, faucet, and framed mirror",
          "costBasis": "Sonora, CA market: roughly $2,272–$7,021 depending on materials and scope",
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
          "costBasis": "Sonora, CA market: roughly $5,517–$17,051 depending on materials and scope",
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
          "costBasis": "Sonora, CA market: roughly $3,157–$9,758 depending on materials and scope",
          "roiRecovery": 62,
          "tiers": {
            "Budget-Friendly": 3157,
            "Mid-Range": 5740,
            "Premium": 9758,
            "Luxury": 16072
          }
        },
        {
          "item": "Toilet, Fixtures & Lighting",
          "description": "Comfort-height toilet, new faucets, towel bars, exhaust fan, and vanity lighting",
          "costBasis": "Sonora, CA market: roughly $1,428–$4,413 depending on materials and scope",
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
        "percentage": 16,
        "reason": "Bathroom rough-in and waterproofing risk — aging mechanical systems and possible galvanized plumbing in a 1975 build. California permit required."
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
          "costBasis": "Sonora, CA market: roughly $4,984–$15,405 depending on materials and scope",
          "roiRecovery": 72,
          "tiers": {
            "Budget-Friendly": 4984,
            "Mid-Range": 9062,
            "Premium": 15405,
            "Luxury": 25374
          }
        },
        {
          "item": "Paint, Trim & Crown Molding",
          "description": "Interior repaint, new baseboards, and crown molding installation",
          "costBasis": "Sonora, CA market: roughly $2,077–$6,419 depending on materials and scope",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 2077,
            "Mid-Range": 3776,
            "Premium": 6419,
            "Luxury": 10573
          }
        },
        {
          "item": "Lighting Upgrade",
          "description": "Recessed lighting installation, dimmer switches, and new ceiling fixtures",
          "costBasis": "Sonora, CA market: roughly $1,947–$6,018 depending on materials and scope",
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
        "percentage": 11,
        "reason": "Possible electrical and permit needs; aging mechanical systems and possible galvanized plumbing in a 1975 build."
      },
      "roiNote": {
        "message": "Living-room updates recover well in Sonora; flooring delivers the strongest per-dollar ROI.",
        "source": "NAR 2025 Remodeling Impact Report"
      }
    },
    "Bedroom": {
      "lineItems": [
        {
          "item": "Flooring Replacement",
          "description": "Remove carpet; install engineered hardwood or luxury vinyl plank",
          "costBasis": "Sonora, CA market: roughly $3,738–$11,555 depending on materials and scope",
          "roiRecovery": 70,
          "tiers": {
            "Budget-Friendly": 3738,
            "Mid-Range": 6797,
            "Premium": 11555,
            "Luxury": 19032
          }
        },
        {
          "item": "Paint & Trim",
          "description": "Repaint walls and ceiling, new baseboards and door casings",
          "costBasis": "Sonora, CA market: roughly $1,495–$4,622 depending on materials and scope",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 1495,
            "Mid-Range": 2719,
            "Premium": 4622,
            "Luxury": 7613
          }
        },
        {
          "item": "Closet Organization System",
          "description": "Custom or modular closet system with shelving, rods, and drawers",
          "costBasis": "Sonora, CA market: roughly $2,077–$6,419 depending on materials and scope",
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
        "percentage": 11,
        "reason": "Minor electrical or permit work possible; aging mechanical systems and possible galvanized plumbing in a 1975 build."
      },
      "roiNote": {
        "message": "Bedroom updates return solid value; flooring and closet upgrades drive buyer appeal.",
        "source": "NAR 2025 Remodeling Impact Report"
      }
    }
  }
};

module.exports = { id: SONORA_HILLVIEW_PROPERTY_ID, config, SONORA_HILLVIEW_PROPERTY_ID };
