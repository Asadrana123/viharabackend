/**
 * renovationCosts/oakdale_2nd.js
 *
 * 334 S 2nd Ave, Oakdale, CA 95361 — Single Family, 3bd/2ba, 1195 sqft, built 1900.
 * regionalFactor 1.12: Northern San Joaquin Valley — one of California’s more affordable construction markets, above the national average.
 * Line items are the single source of truth — see _shared.js for how subtotal,
 * contingency, final cost, range and ROI are derived from them.
 */

const OAKDALE_PROPERTY_ID = '6a8d93884e6a9f474a01684d';

const config = {
  "meta": {
    "address": "334 S 2nd Ave, Oakdale, CA 95361",
    "city": "Oakdale",
    "state": "California",
    "squareFootage": 1195,
    "bedrooms": 3,
    "bathrooms": 2,
    "yearBuilt": 1900,
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
              "costBasis": "Oakdale, CA market: roughly $575–$1,485 depending on materials and scope",
              "roiRecovery": 55,
              "tiers": {
                "Budget-Friendly": 575,
                "Mid-Range": 958,
                "Premium": 1485,
                "Luxury": 2203
              }
            },
            {
              "item": "Exterior Paint (Walls, Trim & Shutters)",
              "description": "Two-coat application with premium exterior paint on all wall surfaces and trim",
              "costBasis": "Oakdale, CA market: roughly $2,298–$5,937 depending on materials and scope",
              "roiRecovery": 60,
              "tiers": {
                "Budget-Friendly": 2298,
                "Mid-Range": 3830,
                "Premium": 5937,
                "Luxury": 8809
              }
            },
            {
              "item": "Front Door Repaint & Hardware",
              "description": "Strip, prime, and repaint front door with updated exterior hardware",
              "costBasis": "Oakdale, CA market: roughly $336–$868 depending on materials and scope",
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
            "percentage": 15,
            "reason": "Pre-1978 build — lead-paint testing and prep may be required. California permit required."
          },
          "roiNote": {
            "message": "Fresh exterior paint is the highest-visual-impact, lowest-cost curb-appeal upgrade in Oakdale.",
            "source": "NAR 2025 Remodeling Impact Report"
          }
        },
        "Update roof/siding": {
          "lineItems": [
            {
              "item": "Siding Removal & Disposal",
              "description": "Full tear-off of existing siding, inspection for moisture damage, proper disposal",
              "costBasis": "Oakdale, CA market: roughly $1,088–$2,812 depending on materials and scope",
              "roiRecovery": 76,
              "tiers": {
                "Budget-Friendly": 1088,
                "Mid-Range": 1814,
                "Premium": 2812,
                "Luxury": 4172
              }
            },
            {
              "item": "New Siding Installation",
              "description": "Fiber cement siding installed for durability and moisture resistance",
              "costBasis": "Oakdale, CA market: roughly $8,467–$21,874 depending on materials and scope",
              "roiRecovery": 76,
              "tiers": {
                "Budget-Friendly": 8467,
                "Mid-Range": 14112,
                "Premium": 21874,
                "Luxury": 32458
              }
            },
            {
              "item": "Trim, Flashing & Moisture Barrier",
              "description": "Install weather-resistant barrier, new trim boards, and window/door flashing",
              "costBasis": "Oakdale, CA market: roughly $1,693–$4,374 depending on materials and scope",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 1693,
                "Mid-Range": 2822,
                "Premium": 4374,
                "Luxury": 6491
              }
            }
          ],
          "contingency": {
            "percentage": 18,
            "reason": "Concealed moisture, rot, or sheathing damage risk — concealed structural, knob-and-tube wiring, and cast-iron plumbing risk common in a 1900 build. California permit required."
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
              "costBasis": "Oakdale, CA market: roughly $726–$1,876 depending on materials and scope",
              "roiRecovery": 69,
              "tiers": {
                "Budget-Friendly": 726,
                "Mid-Range": 1210,
                "Premium": 1876,
                "Luxury": 2783
              }
            },
            {
              "item": "New Window Units (8–10 windows)",
              "description": "Vinyl double-pane (budget) to fiberglass triple-pane (premium); Energy Star rated",
              "costBasis": "Oakdale, CA market: roughly $8,467–$21,874 depending on materials and scope",
              "roiRecovery": 69,
              "tiers": {
                "Budget-Friendly": 8467,
                "Mid-Range": 14112,
                "Premium": 21874,
                "Luxury": 32458
              }
            },
            {
              "item": "Exterior Trim & Caulking",
              "description": "New exterior trim, weather-seal caulking, and touch-up painting around all windows",
              "costBasis": "Oakdale, CA market: roughly $1,512–$3,906 depending on materials and scope",
              "roiRecovery": 65,
              "tiers": {
                "Budget-Friendly": 1512,
                "Mid-Range": 2520,
                "Premium": 3906,
                "Luxury": 5796
              }
            }
          ],
          "contingency": {
            "percentage": 15,
            "reason": "Rough-opening rot and out-of-square framing risk on a 1900 build. California permit required."
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
              "costBasis": "Oakdale, CA market: roughly $1,583–$4,089 depending on materials and scope",
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
              "costBasis": "Oakdale, CA market: roughly $1,008–$2,604 depending on materials and scope",
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
            "percentage": 13,
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
              "costBasis": "Oakdale, CA market: roughly $1,583–$4,089 depending on materials and scope",
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
              "costBasis": "Oakdale, CA market: roughly $336–$868 depending on materials and scope",
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
              "costBasis": "Oakdale, CA market: roughly $1,680–$4,340 depending on materials and scope",
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
            "percentage": 13,
            "reason": "Minor framing or utility work possible at the entry. California permit required."
          },
          "roiNote": {
            "message": "Front-entrance upgrades deliver outsized curb-appeal ROI in Oakdale.",
            "source": "Remodeling 2025 Cost vs. Value — Pacific Region"
          }
        },
        "Landscaping": {
          "lineItems": [
            {
              "item": "Lawn & Ground Cover",
              "description": "Sod or drought-resistant ground cover",
              "costBasis": "Oakdale, CA market: roughly $1,331–$3,438 depending on materials and scope",
              "roiRecovery": 100,
              "tiers": {
                "Budget-Friendly": 1331,
                "Mid-Range": 2218,
                "Premium": 3438,
                "Luxury": 5101
              }
            },
            {
              "item": "Shrubs, Plants & Mulch",
              "description": "Regionally appropriate, drought-tolerant plantings",
              "costBasis": "Oakdale, CA market: roughly $1,088–$2,812 depending on materials and scope",
              "roiRecovery": 100,
              "tiers": {
                "Budget-Friendly": 1088,
                "Mid-Range": 1814,
                "Premium": 2812,
                "Luxury": 4172
              }
            },
            {
              "item": "Edging, Cleanup & Bark Mulch",
              "description": "Define planting beds, install edging, and a 3-inch bark mulch layer",
              "costBasis": "Oakdale, CA market: roughly $424–$1,094 depending on materials and scope",
              "roiRecovery": 90,
              "tiers": {
                "Budget-Friendly": 424,
                "Mid-Range": 706,
                "Premium": 1094,
                "Luxury": 1624
              }
            }
          ],
          "contingency": {
            "percentage": 13,
            "reason": "Soil, grading, and irrigation conditions vary on-site in Oakdale."
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
              "costBasis": "Oakdale, CA market: roughly $847–$2,187 depending on materials and scope",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 847,
                "Mid-Range": 1411,
                "Premium": 2187,
                "Luxury": 3245
              }
            },
            {
              "item": "New Driveway Surface",
              "description": "Concrete (standard) to decorative pavers (premium); includes edging and sealer",
              "costBasis": "Oakdale, CA market: roughly $2,117–$5,468 depending on materials and scope",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 2117,
                "Mid-Range": 3528,
                "Premium": 5468,
                "Luxury": 8114
              }
            }
          ],
          "contingency": {
            "percentage": 15,
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
              "costBasis": "Oakdale, CA market: roughly $544–$1,406 depending on materials and scope",
              "roiRecovery": 80,
              "tiers": {
                "Budget-Friendly": 544,
                "Mid-Range": 907,
                "Premium": 1406,
                "Luxury": 2086
              }
            },
            {
              "item": "Patio Surface & Finishing",
              "description": "Concrete, stamped concrete, or natural stone pavers with sealer and edging",
              "costBasis": "Oakdale, CA market: roughly $3,629–$9,374 depending on materials and scope",
              "roiRecovery": 80,
              "tiers": {
                "Budget-Friendly": 3629,
                "Mid-Range": 6048,
                "Premium": 9374,
                "Luxury": 13910
              }
            }
          ],
          "contingency": {
            "percentage": 15,
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
              "costBasis": "Oakdale, CA market: roughly $3,024–$7,812 depending on materials and scope",
              "roiRecovery": 60,
              "tiers": {
                "Budget-Friendly": 3024,
                "Mid-Range": 5040,
                "Premium": 7812,
                "Luxury": 11592
              }
            },
            {
              "item": "Landscaping & Curb Appeal",
              "description": "Lawn, plants, mulch, edging, and pathway improvements",
              "costBasis": "Oakdale, CA market: roughly $2,419–$6,250 depending on materials and scope",
              "roiRecovery": 100,
              "tiers": {
                "Budget-Friendly": 2419,
                "Mid-Range": 4032,
                "Premium": 6250,
                "Luxury": 9274
              }
            },
            {
              "item": "New Entry Door & Porch",
              "description": "New fiberglass door, hardware, porch lighting, and pathway",
              "costBasis": "Oakdale, CA market: roughly $3,696–$9,548 depending on materials and scope",
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
              "costBasis": "Oakdale, CA market: roughly $7,258–$18,749 depending on materials and scope",
              "roiRecovery": 80,
              "tiers": {
                "Budget-Friendly": 7258,
                "Mid-Range": 12096,
                "Premium": 18749,
                "Luxury": 27821
              }
            }
          ],
          "contingency": {
            "percentage": 18,
            "reason": "Multi-trade coordination and full-scope permitting — concealed structural, knob-and-tube wiring, and cast-iron plumbing risk common in a 1900 build. California permit required."
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
          "costBasis": "Oakdale, CA market: roughly $6,653–$20,563 depending on materials and scope",
          "roiRecovery": 67,
          "tiers": {
            "Budget-Friendly": 6653,
            "Mid-Range": 12096,
            "Premium": 20563,
            "Luxury": 33869
          }
        },
        {
          "item": "Countertops (Quartz)",
          "description": "Quartz countertop fabrication and installation",
          "costBasis": "Oakdale, CA market: roughly $3,049–$9,425 depending on materials and scope",
          "roiRecovery": 72,
          "tiers": {
            "Budget-Friendly": 3049,
            "Mid-Range": 5544,
            "Premium": 9425,
            "Luxury": 15523
          }
        },
        {
          "item": "Appliance Package",
          "description": "Mid-range stainless: refrigerator, range, dishwasher, and microwave",
          "costBasis": "Oakdale, CA market: roughly $4,928–$15,232 depending on materials and scope",
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
          "costBasis": "Oakdale, CA market: roughly $2,329–$7,198 depending on materials and scope",
          "roiRecovery": 70,
          "tiers": {
            "Budget-Friendly": 2329,
            "Mid-Range": 4234,
            "Premium": 7198,
            "Luxury": 11855
          }
        },
        {
          "item": "Lighting & Electrical",
          "description": "Recessed lights, pendant lighting, undercabinet LED, and panel upgrade if needed",
          "costBasis": "Oakdale, CA market: roughly $1,355–$4,189 depending on materials and scope",
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
        "percentage": 16,
        "reason": "Plumbing and electrical updates often needed — concealed structural, knob-and-tube wiring, and cast-iron plumbing risk common in a 1900 build. California permit required. Interior condition could not be fully inspected pre-auction (occupied)."
      },
      "roiNote": {
        "message": "A mid-range kitchen remodel is one of the top interior ROI projects in Oakdale.",
        "source": "Remodeling 2025 Cost vs. Value — Pacific Region · NAR 2025"
      }
    },
    "Bathroom": {
      "lineItems": [
        {
          "item": "Vanity, Sink & Mirror",
          "description": "Vanity cabinet replacement, new countertop, undermount sink, faucet, and framed mirror",
          "costBasis": "Oakdale, CA market: roughly $2,156–$6,664 depending on materials and scope",
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
          "costBasis": "Oakdale, CA market: roughly $5,236–$16,184 depending on materials and scope",
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
          "costBasis": "Oakdale, CA market: roughly $2,107–$6,511 depending on materials and scope",
          "roiRecovery": 62,
          "tiers": {
            "Budget-Friendly": 2107,
            "Mid-Range": 3830,
            "Premium": 6511,
            "Luxury": 10724
          }
        },
        {
          "item": "Toilet, Fixtures & Lighting",
          "description": "Comfort-height toilet, new faucets, towel bars, exhaust fan, and vanity lighting",
          "costBasis": "Oakdale, CA market: roughly $1,355–$4,189 depending on materials and scope",
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
        "percentage": 19,
        "reason": "Bathroom rough-in and waterproofing risk — concealed structural, knob-and-tube wiring, and cast-iron plumbing risk common in a 1900 build. California permit required. Interior condition could not be fully inspected pre-auction (occupied)."
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
          "costBasis": "Oakdale, CA market: roughly $3,326–$10,282 depending on materials and scope",
          "roiRecovery": 72,
          "tiers": {
            "Budget-Friendly": 3326,
            "Mid-Range": 6048,
            "Premium": 10282,
            "Luxury": 16934
          }
        },
        {
          "item": "Paint, Trim & Crown Molding",
          "description": "Interior repaint, new baseboards, and crown molding installation",
          "costBasis": "Oakdale, CA market: roughly $1,386–$4,284 depending on materials and scope",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 1386,
            "Mid-Range": 2520,
            "Premium": 4284,
            "Luxury": 7056
          }
        },
        {
          "item": "Lighting Upgrade",
          "description": "Recessed lighting installation, dimmer switches, and new ceiling fixtures",
          "costBasis": "Oakdale, CA market: roughly $1,848–$5,712 depending on materials and scope",
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
        "percentage": 14,
        "reason": "Possible electrical and permit needs; concealed structural, knob-and-tube wiring, and cast-iron plumbing risk common in a 1900 build. Interior condition could not be fully inspected pre-auction (occupied)."
      },
      "roiNote": {
        "message": "Living-room updates recover well in Oakdale; flooring delivers the strongest per-dollar ROI.",
        "source": "NAR 2025 Remodeling Impact Report"
      }
    },
    "Bedroom": {
      "lineItems": [
        {
          "item": "Flooring Replacement",
          "description": "Remove carpet; install engineered hardwood or luxury vinyl plank",
          "costBasis": "Oakdale, CA market: roughly $2,495–$7,711 depending on materials and scope",
          "roiRecovery": 70,
          "tiers": {
            "Budget-Friendly": 2495,
            "Mid-Range": 4536,
            "Premium": 7711,
            "Luxury": 12701
          }
        },
        {
          "item": "Paint & Trim",
          "description": "Repaint walls and ceiling, new baseboards and door casings",
          "costBasis": "Oakdale, CA market: roughly $998–$3,084 depending on materials and scope",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 998,
            "Mid-Range": 1814,
            "Premium": 3084,
            "Luxury": 5079
          }
        },
        {
          "item": "Closet Organization System",
          "description": "Custom or modular closet system with shelving, rods, and drawers",
          "costBasis": "Oakdale, CA market: roughly $1,971–$6,093 depending on materials and scope",
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
        "percentage": 14,
        "reason": "Minor electrical or permit work possible; concealed structural, knob-and-tube wiring, and cast-iron plumbing risk common in a 1900 build. Interior condition could not be fully inspected pre-auction (occupied)."
      },
      "roiNote": {
        "message": "Bedroom updates return solid value; flooring and closet upgrades drive buyer appeal.",
        "source": "NAR 2025 Remodeling Impact Report"
      }
    }
  }
};

module.exports = { id: OAKDALE_PROPERTY_ID, config, OAKDALE_PROPERTY_ID };
