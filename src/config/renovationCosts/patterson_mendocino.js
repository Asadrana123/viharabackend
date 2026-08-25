/**
 * renovationCosts/patterson_mendocino.js
 *
 * 1444 Mendocino Creek Dr, Patterson, CA 95363 — Single Family, 4bd/3ba, 3251 sqft, built 2004.
 * regionalFactor 1.12: Northern San Joaquin Valley — one of California’s more affordable construction markets, above the national average.
 * Line items are the single source of truth — see _shared.js for how subtotal,
 * contingency, final cost, range and ROI are derived from them.
 */

const PATTERSON_PROPERTY_ID = '6a8d9aa244a61f429a97fb63';

const config = {
  "meta": {
    "address": "1444 Mendocino Creek Dr, Patterson, CA 95363",
    "city": "Patterson",
    "state": "California",
    "squareFootage": 3251,
    "bedrooms": 4,
    "bathrooms": 3,
    "yearBuilt": 2004,
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
              "costBasis": "Patterson, CA market: roughly $817–$2,111 depending on materials and scope",
              "roiRecovery": 55,
              "tiers": {
                "Budget-Friendly": 817,
                "Mid-Range": 1362,
                "Premium": 2111,
                "Luxury": 3133
              }
            },
            {
              "item": "Exterior Paint (Walls, Trim & Shutters)",
              "description": "Two-coat application with premium exterior paint on all wall surfaces and trim",
              "costBasis": "Patterson, CA market: roughly $3,269–$8,444 depending on materials and scope",
              "roiRecovery": 60,
              "tiers": {
                "Budget-Friendly": 3269,
                "Mid-Range": 5448,
                "Premium": 8444,
                "Luxury": 12530
              }
            },
            {
              "item": "Front Door Repaint & Hardware",
              "description": "Strip, prime, and repaint front door with updated exterior hardware",
              "costBasis": "Patterson, CA market: roughly $336–$868 depending on materials and scope",
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
            "message": "Fresh exterior paint is the highest-visual-impact, lowest-cost curb-appeal upgrade in Patterson.",
            "source": "NAR 2025 Remodeling Impact Report"
          }
        },
        "Update roof/siding": {
          "lineItems": [
            {
              "item": "Siding Removal & Disposal",
              "description": "Full tear-off of existing siding, inspection for moisture damage, proper disposal",
              "costBasis": "Patterson, CA market: roughly $1,548–$3,999 depending on materials and scope",
              "roiRecovery": 76,
              "tiers": {
                "Budget-Friendly": 1548,
                "Mid-Range": 2580,
                "Premium": 3999,
                "Luxury": 5934
              }
            },
            {
              "item": "New Siding Installation",
              "description": "Fiber cement siding installed for durability and moisture resistance",
              "costBasis": "Patterson, CA market: roughly $12,042–$31,109 depending on materials and scope",
              "roiRecovery": 76,
              "tiers": {
                "Budget-Friendly": 12042,
                "Mid-Range": 20070,
                "Premium": 31109,
                "Luxury": 46161
              }
            },
            {
              "item": "Trim, Flashing & Moisture Barrier",
              "description": "Install weather-resistant barrier, new trim boards, and window/door flashing",
              "costBasis": "Patterson, CA market: roughly $2,408–$6,222 depending on materials and scope",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 2408,
                "Mid-Range": 4014,
                "Premium": 6222,
                "Luxury": 9232
              }
            }
          ],
          "contingency": {
            "percentage": 15,
            "reason": "Concealed moisture, rot, or sheathing damage risk — newer construction (2004), though foreclosure condition may hide deferred maintenance. California permit required."
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
              "costBasis": "Patterson, CA market: roughly $1,032–$2,666 depending on materials and scope",
              "roiRecovery": 69,
              "tiers": {
                "Budget-Friendly": 1032,
                "Mid-Range": 1720,
                "Premium": 2666,
                "Luxury": 3956
              }
            },
            {
              "item": "New Window Units (8–10 windows)",
              "description": "Vinyl double-pane (budget) to fiberglass triple-pane (premium); Energy Star rated",
              "costBasis": "Patterson, CA market: roughly $12,042–$31,109 depending on materials and scope",
              "roiRecovery": 69,
              "tiers": {
                "Budget-Friendly": 12042,
                "Mid-Range": 20070,
                "Premium": 31109,
                "Luxury": 46161
              }
            },
            {
              "item": "Exterior Trim & Caulking",
              "description": "New exterior trim, weather-seal caulking, and touch-up painting around all windows",
              "costBasis": "Patterson, CA market: roughly $2,150–$5,555 depending on materials and scope",
              "roiRecovery": 65,
              "tiers": {
                "Budget-Friendly": 2150,
                "Mid-Range": 3584,
                "Premium": 5555,
                "Luxury": 8243
              }
            }
          ],
          "contingency": {
            "percentage": 12,
            "reason": "Rough-opening rot and out-of-square framing risk on a 2004 build. California permit required."
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
              "costBasis": "Patterson, CA market: roughly $1,583–$4,089 depending on materials and scope",
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
              "costBasis": "Patterson, CA market: roughly $1,008–$2,604 depending on materials and scope",
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
              "costBasis": "Patterson, CA market: roughly $1,583–$4,089 depending on materials and scope",
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
              "costBasis": "Patterson, CA market: roughly $336–$868 depending on materials and scope",
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
              "costBasis": "Patterson, CA market: roughly $1,680–$4,340 depending on materials and scope",
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
            "message": "Front-entrance upgrades deliver outsized curb-appeal ROI in Patterson.",
            "source": "Remodeling 2025 Cost vs. Value — Pacific Region"
          }
        },
        "Landscaping": {
          "lineItems": [
            {
              "item": "Lawn & Ground Cover",
              "description": "Sod or drought-resistant ground cover",
              "costBasis": "Patterson, CA market: roughly $1,892–$4,889 depending on materials and scope",
              "roiRecovery": 100,
              "tiers": {
                "Budget-Friendly": 1892,
                "Mid-Range": 3154,
                "Premium": 4889,
                "Luxury": 7254
              }
            },
            {
              "item": "Shrubs, Plants & Mulch",
              "description": "Regionally appropriate, drought-tolerant plantings",
              "costBasis": "Patterson, CA market: roughly $1,548–$3,999 depending on materials and scope",
              "roiRecovery": 100,
              "tiers": {
                "Budget-Friendly": 1548,
                "Mid-Range": 2580,
                "Premium": 3999,
                "Luxury": 5934
              }
            },
            {
              "item": "Edging, Cleanup & Bark Mulch",
              "description": "Define planting beds, install edging, and a 3-inch bark mulch layer",
              "costBasis": "Patterson, CA market: roughly $602–$1,556 depending on materials and scope",
              "roiRecovery": 90,
              "tiers": {
                "Budget-Friendly": 602,
                "Mid-Range": 1004,
                "Premium": 1556,
                "Luxury": 2309
              }
            }
          ],
          "contingency": {
            "percentage": 10,
            "reason": "Soil, grading, and irrigation conditions vary on-site in Patterson."
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
              "costBasis": "Patterson, CA market: roughly $1,204–$3,111 depending on materials and scope",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 1204,
                "Mid-Range": 2007,
                "Premium": 3111,
                "Luxury": 4616
              }
            },
            {
              "item": "New Driveway Surface",
              "description": "Concrete (standard) to decorative pavers (premium); includes edging and sealer",
              "costBasis": "Patterson, CA market: roughly $3,011–$7,778 depending on materials and scope",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 3011,
                "Mid-Range": 5018,
                "Premium": 7778,
                "Luxury": 11541
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
              "costBasis": "Patterson, CA market: roughly $774–$2,000 depending on materials and scope",
              "roiRecovery": 80,
              "tiers": {
                "Budget-Friendly": 774,
                "Mid-Range": 1290,
                "Premium": 2000,
                "Luxury": 2967
              }
            },
            {
              "item": "Patio Surface & Finishing",
              "description": "Concrete, stamped concrete, or natural stone pavers with sealer and edging",
              "costBasis": "Patterson, CA market: roughly $5,161–$13,333 depending on materials and scope",
              "roiRecovery": 80,
              "tiers": {
                "Budget-Friendly": 5161,
                "Mid-Range": 8602,
                "Premium": 13333,
                "Luxury": 19785
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
              "costBasis": "Patterson, CA market: roughly $4,301–$11,110 depending on materials and scope",
              "roiRecovery": 60,
              "tiers": {
                "Budget-Friendly": 4301,
                "Mid-Range": 7168,
                "Premium": 11110,
                "Luxury": 16486
              }
            },
            {
              "item": "Landscaping & Curb Appeal",
              "description": "Lawn, plants, mulch, edging, and pathway improvements",
              "costBasis": "Patterson, CA market: roughly $3,440–$8,888 depending on materials and scope",
              "roiRecovery": 100,
              "tiers": {
                "Budget-Friendly": 3440,
                "Mid-Range": 5734,
                "Premium": 8888,
                "Luxury": 13188
              }
            },
            {
              "item": "New Entry Door & Porch",
              "description": "New fiberglass door, hardware, porch lighting, and pathway",
              "costBasis": "Patterson, CA market: roughly $3,696–$9,548 depending on materials and scope",
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
              "costBasis": "Patterson, CA market: roughly $10,322–$26,665 depending on materials and scope",
              "roiRecovery": 80,
              "tiers": {
                "Budget-Friendly": 10322,
                "Mid-Range": 17203,
                "Premium": 26665,
                "Luxury": 39567
              }
            }
          ],
          "contingency": {
            "percentage": 15,
            "reason": "Multi-trade coordination and full-scope permitting — newer construction (2004), though foreclosure condition may hide deferred maintenance. California permit required."
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
          "costBasis": "Patterson, CA market: roughly $9,462–$29,245 depending on materials and scope",
          "roiRecovery": 67,
          "tiers": {
            "Budget-Friendly": 9462,
            "Mid-Range": 17203,
            "Premium": 29245,
            "Luxury": 48168
          }
        },
        {
          "item": "Countertops (Quartz)",
          "description": "Quartz countertop fabrication and installation",
          "costBasis": "Patterson, CA market: roughly $4,337–$13,405 depending on materials and scope",
          "roiRecovery": 72,
          "tiers": {
            "Budget-Friendly": 4337,
            "Mid-Range": 7885,
            "Premium": 13405,
            "Luxury": 22078
          }
        },
        {
          "item": "Appliance Package",
          "description": "Mid-range stainless: refrigerator, range, dishwasher, and microwave",
          "costBasis": "Patterson, CA market: roughly $4,928–$15,232 depending on materials and scope",
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
          "costBasis": "Patterson, CA market: roughly $3,312–$10,236 depending on materials and scope",
          "roiRecovery": 70,
          "tiers": {
            "Budget-Friendly": 3312,
            "Mid-Range": 6021,
            "Premium": 10236,
            "Luxury": 16859
          }
        },
        {
          "item": "Lighting & Electrical",
          "description": "Recessed lights, pendant lighting, undercabinet LED, and panel upgrade if needed",
          "costBasis": "Patterson, CA market: roughly $1,355–$4,189 depending on materials and scope",
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
        "reason": "Plumbing and electrical updates often needed — newer construction (2004), though foreclosure condition may hide deferred maintenance. California permit required. Interior condition could not be fully inspected pre-auction (occupied)."
      },
      "roiNote": {
        "message": "A mid-range kitchen remodel is one of the top interior ROI projects in Patterson.",
        "source": "Remodeling 2025 Cost vs. Value — Pacific Region · NAR 2025"
      }
    },
    "Bathroom": {
      "lineItems": [
        {
          "item": "Vanity, Sink & Mirror",
          "description": "Vanity cabinet replacement, new countertop, undermount sink, faucet, and framed mirror",
          "costBasis": "Patterson, CA market: roughly $2,156–$6,664 depending on materials and scope",
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
          "costBasis": "Patterson, CA market: roughly $5,236–$16,184 depending on materials and scope",
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
          "costBasis": "Patterson, CA market: roughly $2,996–$9,262 depending on materials and scope",
          "roiRecovery": 62,
          "tiers": {
            "Budget-Friendly": 2996,
            "Mid-Range": 5448,
            "Premium": 9262,
            "Luxury": 15254
          }
        },
        {
          "item": "Toilet, Fixtures & Lighting",
          "description": "Comfort-height toilet, new faucets, towel bars, exhaust fan, and vanity lighting",
          "costBasis": "Patterson, CA market: roughly $1,355–$4,189 depending on materials and scope",
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
        "reason": "Bathroom rough-in and waterproofing risk — newer construction (2004), though foreclosure condition may hide deferred maintenance. California permit required. Interior condition could not be fully inspected pre-auction (occupied)."
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
          "costBasis": "Patterson, CA market: roughly $4,731–$14,623 depending on materials and scope",
          "roiRecovery": 72,
          "tiers": {
            "Budget-Friendly": 4731,
            "Mid-Range": 8602,
            "Premium": 14623,
            "Luxury": 24086
          }
        },
        {
          "item": "Paint, Trim & Crown Molding",
          "description": "Interior repaint, new baseboards, and crown molding installation",
          "costBasis": "Patterson, CA market: roughly $1,971–$6,093 depending on materials and scope",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 1971,
            "Mid-Range": 3584,
            "Premium": 6093,
            "Luxury": 10035
          }
        },
        {
          "item": "Lighting Upgrade",
          "description": "Recessed lighting installation, dimmer switches, and new ceiling fixtures",
          "costBasis": "Patterson, CA market: roughly $1,848–$5,712 depending on materials and scope",
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
        "reason": "Possible electrical and permit needs; newer construction (2004), though foreclosure condition may hide deferred maintenance. Interior condition could not be fully inspected pre-auction (occupied)."
      },
      "roiNote": {
        "message": "Living-room updates recover well in Patterson; flooring delivers the strongest per-dollar ROI.",
        "source": "NAR 2025 Remodeling Impact Report"
      }
    },
    "Bedroom": {
      "lineItems": [
        {
          "item": "Flooring Replacement",
          "description": "Remove carpet; install engineered hardwood or luxury vinyl plank",
          "costBasis": "Patterson, CA market: roughly $3,548–$10,967 depending on materials and scope",
          "roiRecovery": 70,
          "tiers": {
            "Budget-Friendly": 3548,
            "Mid-Range": 6451,
            "Premium": 10967,
            "Luxury": 18063
          }
        },
        {
          "item": "Paint & Trim",
          "description": "Repaint walls and ceiling, new baseboards and door casings",
          "costBasis": "Patterson, CA market: roughly $1,419–$4,386 depending on materials and scope",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 1419,
            "Mid-Range": 2580,
            "Premium": 4386,
            "Luxury": 7224
          }
        },
        {
          "item": "Closet Organization System",
          "description": "Custom or modular closet system with shelving, rods, and drawers",
          "costBasis": "Patterson, CA market: roughly $1,971–$6,093 depending on materials and scope",
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
        "reason": "Minor electrical or permit work possible; newer construction (2004), though foreclosure condition may hide deferred maintenance. Interior condition could not be fully inspected pre-auction (occupied)."
      },
      "roiNote": {
        "message": "Bedroom updates return solid value; flooring and closet upgrades drive buyer appeal.",
        "source": "NAR 2025 Remodeling Impact Report"
      }
    }
  }
};

module.exports = { id: PATTERSON_PROPERTY_ID, config, PATTERSON_PROPERTY_ID };
