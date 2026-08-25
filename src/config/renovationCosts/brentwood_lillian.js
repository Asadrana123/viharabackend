/**
 * renovationCosts/brentwood_lillian.js
 *
 * 1649 Lillian St, Brentwood, CA 94513 — Single Family, 6bd/5ba, 4310 sqft, built 2006.
 * regionalFactor 1.38: Outer East Bay — high Bay Area costs, below the urban core.
 * Line items are the single source of truth — see _shared.js for how subtotal,
 * contingency, final cost, range and ROI are derived from them.
 */

const BRENTWOOD_PROPERTY_ID = '6a8da10f8b2b87db213eca4b';

const config = {
  "meta": {
    "address": "1649 Lillian St, Brentwood, CA 94513",
    "city": "Brentwood",
    "state": "California",
    "squareFootage": 4310,
    "bedrooms": 6,
    "bathrooms": 5,
    "yearBuilt": 2006,
    "regionalFactor": 1.38,
    "dataSource": "Contra Costa County / Central & Northern California construction cost data (2025) · Remodeling 2025 Cost vs. Value Report (Pacific Region) · NAR 2025 Remodeling Impact Report"
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
              "costBasis": "Brentwood, CA market: roughly $1,141–$2,947 depending on materials and scope",
              "roiRecovery": 55,
              "tiers": {
                "Budget-Friendly": 1141,
                "Mid-Range": 1901,
                "Premium": 2947,
                "Luxury": 4372
              }
            },
            {
              "item": "Exterior Paint (Walls, Trim & Shutters)",
              "description": "Two-coat application with premium exterior paint on all wall surfaces and trim",
              "costBasis": "Brentwood, CA market: roughly $4,562–$11,786 depending on materials and scope",
              "roiRecovery": 60,
              "tiers": {
                "Budget-Friendly": 4562,
                "Mid-Range": 7604,
                "Premium": 11786,
                "Luxury": 17489
              }
            },
            {
              "item": "Front Door Repaint & Hardware",
              "description": "Strip, prime, and repaint front door with updated exterior hardware",
              "costBasis": "Brentwood, CA market: roughly $414–$1,070 depending on materials and scope",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 414,
                "Mid-Range": 690,
                "Premium": 1070,
                "Luxury": 1587
              }
            }
          ],
          "contingency": {
            "percentage": 12,
            "reason": "Surface prep may reveal minor repairs. California permit required."
          },
          "roiNote": {
            "message": "Fresh exterior paint is the highest-visual-impact, lowest-cost curb-appeal upgrade in Brentwood.",
            "source": "NAR 2025 Remodeling Impact Report"
          }
        },
        "Update roof/siding": {
          "lineItems": [
            {
              "item": "Siding Removal & Disposal",
              "description": "Full tear-off of existing siding, inspection for moisture damage, proper disposal",
              "costBasis": "Brentwood, CA market: roughly $2,161–$5,583 depending on materials and scope",
              "roiRecovery": 76,
              "tiers": {
                "Budget-Friendly": 2161,
                "Mid-Range": 3602,
                "Premium": 5583,
                "Luxury": 8285
              }
            },
            {
              "item": "New Siding Installation",
              "description": "Fiber cement siding installed for durability and moisture resistance",
              "costBasis": "Brentwood, CA market: roughly $16,808–$43,422 depending on materials and scope",
              "roiRecovery": 76,
              "tiers": {
                "Budget-Friendly": 16808,
                "Mid-Range": 28014,
                "Premium": 43422,
                "Luxury": 64432
              }
            },
            {
              "item": "Trim, Flashing & Moisture Barrier",
              "description": "Install weather-resistant barrier, new trim boards, and window/door flashing",
              "costBasis": "Brentwood, CA market: roughly $3,362–$8,685 depending on materials and scope",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 3362,
                "Mid-Range": 5603,
                "Premium": 8685,
                "Luxury": 12887
              }
            }
          ],
          "contingency": {
            "percentage": 15,
            "reason": "Concealed moisture, rot, or sheathing damage risk — newer construction (2006), though foreclosure condition may hide deferred maintenance. California permit required."
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
              "costBasis": "Brentwood, CA market: roughly $1,441–$3,722 depending on materials and scope",
              "roiRecovery": 69,
              "tiers": {
                "Budget-Friendly": 1441,
                "Mid-Range": 2401,
                "Premium": 3722,
                "Luxury": 5522
              }
            },
            {
              "item": "New Window Units (8–10 windows)",
              "description": "Vinyl double-pane (budget) to fiberglass triple-pane (premium); Energy Star rated",
              "costBasis": "Brentwood, CA market: roughly $16,808–$43,422 depending on materials and scope",
              "roiRecovery": 69,
              "tiers": {
                "Budget-Friendly": 16808,
                "Mid-Range": 28014,
                "Premium": 43422,
                "Luxury": 64432
              }
            },
            {
              "item": "Exterior Trim & Caulking",
              "description": "New exterior trim, weather-seal caulking, and touch-up painting around all windows",
              "costBasis": "Brentwood, CA market: roughly $3,001–$7,753 depending on materials and scope",
              "roiRecovery": 65,
              "tiers": {
                "Budget-Friendly": 3001,
                "Mid-Range": 5002,
                "Premium": 7753,
                "Luxury": 11505
              }
            }
          ],
          "contingency": {
            "percentage": 12,
            "reason": "Rough-opening rot and out-of-square framing risk on a 2006 build. California permit required."
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
              "costBasis": "Brentwood, CA market: roughly $1,950–$5,038 depending on materials and scope",
              "roiRecovery": 188,
              "tiers": {
                "Budget-Friendly": 1950,
                "Mid-Range": 3250,
                "Premium": 5038,
                "Luxury": 7475
              }
            },
            {
              "item": "Pathway & Porch Update",
              "description": "Repair or replace pathway pavers/concrete and porch lighting upgrade",
              "costBasis": "Brentwood, CA market: roughly $1,242–$3,209 depending on materials and scope",
              "roiRecovery": 120,
              "tiers": {
                "Budget-Friendly": 1242,
                "Mid-Range": 2070,
                "Premium": 3209,
                "Luxury": 4761
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
              "costBasis": "Brentwood, CA market: roughly $1,950–$5,038 depending on materials and scope",
              "roiRecovery": 150,
              "tiers": {
                "Budget-Friendly": 1950,
                "Mid-Range": 3250,
                "Premium": 5038,
                "Luxury": 7475
              }
            },
            {
              "item": "Porch Lighting & Address Numbers",
              "description": "New porch light fixture, pathway lights, and updated address numbers",
              "costBasis": "Brentwood, CA market: roughly $414–$1,070 depending on materials and scope",
              "roiRecovery": 120,
              "tiers": {
                "Budget-Friendly": 414,
                "Mid-Range": 690,
                "Premium": 1070,
                "Luxury": 1587
              }
            },
            {
              "item": "Pathway & Porch Tile/Pavers",
              "description": "New pathway surface from sidewalk to door; porch tile or stone overlay",
              "costBasis": "Brentwood, CA market: roughly $2,070–$5,348 depending on materials and scope",
              "roiRecovery": 120,
              "tiers": {
                "Budget-Friendly": 2070,
                "Mid-Range": 3450,
                "Premium": 5348,
                "Luxury": 7935
              }
            }
          ],
          "contingency": {
            "percentage": 10,
            "reason": "Minor framing or utility work possible at the entry. California permit required."
          },
          "roiNote": {
            "message": "Front-entrance upgrades deliver outsized curb-appeal ROI in Brentwood.",
            "source": "Remodeling 2025 Cost vs. Value — Pacific Region"
          }
        },
        "Landscaping": {
          "lineItems": [
            {
              "item": "Lawn & Ground Cover",
              "description": "Sod or drought-resistant ground cover",
              "costBasis": "Brentwood, CA market: roughly $2,641–$6,823 depending on materials and scope",
              "roiRecovery": 100,
              "tiers": {
                "Budget-Friendly": 2641,
                "Mid-Range": 4402,
                "Premium": 6823,
                "Luxury": 10125
              }
            },
            {
              "item": "Shrubs, Plants & Mulch",
              "description": "Regionally appropriate, drought-tolerant plantings",
              "costBasis": "Brentwood, CA market: roughly $2,161–$5,583 depending on materials and scope",
              "roiRecovery": 100,
              "tiers": {
                "Budget-Friendly": 2161,
                "Mid-Range": 3602,
                "Premium": 5583,
                "Luxury": 8285
              }
            },
            {
              "item": "Edging, Cleanup & Bark Mulch",
              "description": "Define planting beds, install edging, and a 3-inch bark mulch layer",
              "costBasis": "Brentwood, CA market: roughly $841–$2,172 depending on materials and scope",
              "roiRecovery": 90,
              "tiers": {
                "Budget-Friendly": 841,
                "Mid-Range": 1401,
                "Premium": 2172,
                "Luxury": 3222
              }
            }
          ],
          "contingency": {
            "percentage": 10,
            "reason": "Soil, grading, and irrigation conditions vary on-site in Brentwood."
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
              "costBasis": "Brentwood, CA market: roughly $1,681–$4,342 depending on materials and scope",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 1681,
                "Mid-Range": 2801,
                "Premium": 4342,
                "Luxury": 6442
              }
            },
            {
              "item": "New Driveway Surface",
              "description": "Concrete (standard) to decorative pavers (premium); includes edging and sealer",
              "costBasis": "Brentwood, CA market: roughly $4,202–$10,856 depending on materials and scope",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 4202,
                "Mid-Range": 7004,
                "Premium": 10856,
                "Luxury": 16109
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
              "costBasis": "Brentwood, CA market: roughly $1,081–$2,792 depending on materials and scope",
              "roiRecovery": 80,
              "tiers": {
                "Budget-Friendly": 1081,
                "Mid-Range": 1801,
                "Premium": 2792,
                "Luxury": 4142
              }
            },
            {
              "item": "Patio Surface & Finishing",
              "description": "Concrete, stamped concrete, or natural stone pavers with sealer and edging",
              "costBasis": "Brentwood, CA market: roughly $7,204–$18,609 depending on materials and scope",
              "roiRecovery": 80,
              "tiers": {
                "Budget-Friendly": 7204,
                "Mid-Range": 12006,
                "Premium": 18609,
                "Luxury": 27614
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
              "costBasis": "Brentwood, CA market: roughly $6,003–$15,508 depending on materials and scope",
              "roiRecovery": 60,
              "tiers": {
                "Budget-Friendly": 6003,
                "Mid-Range": 10005,
                "Premium": 15508,
                "Luxury": 23012
              }
            },
            {
              "item": "Landscaping & Curb Appeal",
              "description": "Lawn, plants, mulch, edging, and pathway improvements",
              "costBasis": "Brentwood, CA market: roughly $4,802–$12,406 depending on materials and scope",
              "roiRecovery": 100,
              "tiers": {
                "Budget-Friendly": 4802,
                "Mid-Range": 8004,
                "Premium": 12406,
                "Luxury": 18409
              }
            },
            {
              "item": "New Entry Door & Porch",
              "description": "New fiberglass door, hardware, porch lighting, and pathway",
              "costBasis": "Brentwood, CA market: roughly $4,554–$11,765 depending on materials and scope",
              "roiRecovery": 150,
              "tiers": {
                "Budget-Friendly": 4554,
                "Mid-Range": 7590,
                "Premium": 11765,
                "Luxury": 17457
              }
            },
            {
              "item": "Siding & Trim Update",
              "description": "Fiber cement siding sections with new trim boards and flashing",
              "costBasis": "Brentwood, CA market: roughly $14,407–$37,219 depending on materials and scope",
              "roiRecovery": 80,
              "tiers": {
                "Budget-Friendly": 14407,
                "Mid-Range": 24012,
                "Premium": 37219,
                "Luxury": 55228
              }
            }
          ],
          "contingency": {
            "percentage": 15,
            "reason": "Multi-trade coordination and full-scope permitting — newer construction (2006), though foreclosure condition may hide deferred maintenance. California permit required."
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
          "costBasis": "Brentwood, CA market: roughly $13,207–$40,820 depending on materials and scope",
          "roiRecovery": 67,
          "tiers": {
            "Budget-Friendly": 13207,
            "Mid-Range": 24012,
            "Premium": 40820,
            "Luxury": 67234
          }
        },
        {
          "item": "Countertops (Quartz)",
          "description": "Quartz countertop fabrication and installation",
          "costBasis": "Brentwood, CA market: roughly $6,053–$18,709 depending on materials and scope",
          "roiRecovery": 72,
          "tiers": {
            "Budget-Friendly": 6053,
            "Mid-Range": 11005,
            "Premium": 18709,
            "Luxury": 30814
          }
        },
        {
          "item": "Appliance Package",
          "description": "Mid-range stainless: refrigerator, range, dishwasher, and microwave",
          "costBasis": "Brentwood, CA market: roughly $6,072–$18,768 depending on materials and scope",
          "roiRecovery": 60,
          "tiers": {
            "Budget-Friendly": 6072,
            "Mid-Range": 11040,
            "Premium": 18768,
            "Luxury": 30912
          }
        },
        {
          "item": "Flooring & Backsplash",
          "description": "LVP flooring replacement and tile backsplash installation",
          "costBasis": "Brentwood, CA market: roughly $4,622–$14,287 depending on materials and scope",
          "roiRecovery": 70,
          "tiers": {
            "Budget-Friendly": 4622,
            "Mid-Range": 8404,
            "Premium": 14287,
            "Luxury": 23531
          }
        },
        {
          "item": "Lighting & Electrical",
          "description": "Recessed lights, pendant lighting, undercabinet LED, and panel upgrade if needed",
          "costBasis": "Brentwood, CA market: roughly $1,670–$5,161 depending on materials and scope",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 1670,
            "Mid-Range": 3036,
            "Premium": 5161,
            "Luxury": 8501
          }
        }
      ],
      "contingency": {
        "percentage": 12,
        "reason": "Plumbing and electrical updates often needed — newer construction (2006), though foreclosure condition may hide deferred maintenance. California permit required."
      },
      "roiNote": {
        "message": "A mid-range kitchen remodel is one of the top interior ROI projects in Brentwood.",
        "source": "Remodeling 2025 Cost vs. Value — Pacific Region · NAR 2025"
      }
    },
    "Bathroom": {
      "lineItems": [
        {
          "item": "Vanity, Sink & Mirror",
          "description": "Vanity cabinet replacement, new countertop, undermount sink, faucet, and framed mirror",
          "costBasis": "Brentwood, CA market: roughly $2,657–$8,211 depending on materials and scope",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 2657,
            "Mid-Range": 4830,
            "Premium": 8211,
            "Luxury": 13524
          }
        },
        {
          "item": "Shower / Tub Renovation",
          "description": "Tile shower rebuild or tub replacement with new fixtures and glass enclosure",
          "costBasis": "Brentwood, CA market: roughly $6,452–$19,941 depending on materials and scope",
          "roiRecovery": 68,
          "tiers": {
            "Budget-Friendly": 6452,
            "Mid-Range": 11730,
            "Premium": 19941,
            "Luxury": 32844
          }
        },
        {
          "item": "Floor & Wall Tile",
          "description": "Porcelain floor tile and partial wall tile with waterproofing membrane",
          "costBasis": "Brentwood, CA market: roughly $4,182–$12,927 depending on materials and scope",
          "roiRecovery": 62,
          "tiers": {
            "Budget-Friendly": 4182,
            "Mid-Range": 7604,
            "Premium": 12927,
            "Luxury": 21291
          }
        },
        {
          "item": "Toilet, Fixtures & Lighting",
          "description": "Comfort-height toilet, new faucets, towel bars, exhaust fan, and vanity lighting",
          "costBasis": "Brentwood, CA market: roughly $1,670–$5,161 depending on materials and scope",
          "roiRecovery": 60,
          "tiers": {
            "Budget-Friendly": 1670,
            "Mid-Range": 3036,
            "Premium": 5161,
            "Luxury": 8501
          }
        }
      ],
      "contingency": {
        "percentage": 15,
        "reason": "Bathroom rough-in and waterproofing risk — newer construction (2006), though foreclosure condition may hide deferred maintenance. California permit required."
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
          "costBasis": "Brentwood, CA market: roughly $6,603–$20,410 depending on materials and scope",
          "roiRecovery": 72,
          "tiers": {
            "Budget-Friendly": 6603,
            "Mid-Range": 12006,
            "Premium": 20410,
            "Luxury": 33617
          }
        },
        {
          "item": "Paint, Trim & Crown Molding",
          "description": "Interior repaint, new baseboards, and crown molding installation",
          "costBasis": "Brentwood, CA market: roughly $2,751–$8,503 depending on materials and scope",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 2751,
            "Mid-Range": 5002,
            "Premium": 8503,
            "Luxury": 14006
          }
        },
        {
          "item": "Lighting Upgrade",
          "description": "Recessed lighting installation, dimmer switches, and new ceiling fixtures",
          "costBasis": "Brentwood, CA market: roughly $2,277–$7,038 depending on materials and scope",
          "roiRecovery": 60,
          "tiers": {
            "Budget-Friendly": 2277,
            "Mid-Range": 4140,
            "Premium": 7038,
            "Luxury": 11592
          }
        }
      ],
      "contingency": {
        "percentage": 10,
        "reason": "Possible electrical and permit needs; newer construction (2006), though foreclosure condition may hide deferred maintenance."
      },
      "roiNote": {
        "message": "Living-room updates recover well in Brentwood; flooring delivers the strongest per-dollar ROI.",
        "source": "NAR 2025 Remodeling Impact Report"
      }
    },
    "Bedroom": {
      "lineItems": [
        {
          "item": "Flooring Replacement",
          "description": "Remove carpet; install engineered hardwood or luxury vinyl plank",
          "costBasis": "Brentwood, CA market: roughly $4,952–$15,307 depending on materials and scope",
          "roiRecovery": 70,
          "tiers": {
            "Budget-Friendly": 4952,
            "Mid-Range": 9004,
            "Premium": 15307,
            "Luxury": 25211
          }
        },
        {
          "item": "Paint & Trim",
          "description": "Repaint walls and ceiling, new baseboards and door casings",
          "costBasis": "Brentwood, CA market: roughly $1,981–$6,123 depending on materials and scope",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 1981,
            "Mid-Range": 3602,
            "Premium": 6123,
            "Luxury": 10086
          }
        },
        {
          "item": "Closet Organization System",
          "description": "Custom or modular closet system with shelving, rods, and drawers",
          "costBasis": "Brentwood, CA market: roughly $2,429–$7,507 depending on materials and scope",
          "roiRecovery": 60,
          "tiers": {
            "Budget-Friendly": 2429,
            "Mid-Range": 4416,
            "Premium": 7507,
            "Luxury": 12365
          }
        }
      ],
      "contingency": {
        "percentage": 10,
        "reason": "Minor electrical or permit work possible; newer construction (2006), though foreclosure condition may hide deferred maintenance."
      },
      "roiNote": {
        "message": "Bedroom updates return solid value; flooring and closet upgrades drive buyer appeal.",
        "source": "NAR 2025 Remodeling Impact Report"
      }
    }
  }
};

module.exports = { id: BRENTWOOD_PROPERTY_ID, config, BRENTWOOD_PROPERTY_ID };
