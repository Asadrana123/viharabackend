/**
 * renovationCosts/southsf_rockwood.js
 *
 * 227 Rockwood Dr, South San Francisco, CA 94080 — Single Family, 3bd/2ba, 1390 sqft, built 1946.
 * regionalFactor 1.55: San Mateo Peninsula — at or slightly above core East Bay; among the highest construction costs in the US.
 * Line items are the single source of truth — see _shared.js for how subtotal,
 * contingency, final cost, range and ROI are derived from them.
 */

const SOUTHSF_PROPERTY_ID = '6a8d94494e6a9f474a016884';

const config = {
  "meta": {
    "address": "227 Rockwood Dr, South San Francisco, CA 94080",
    "city": "South San Francisco",
    "state": "California",
    "squareFootage": 1390,
    "bedrooms": 3,
    "bathrooms": 2,
    "yearBuilt": 1946,
    "regionalFactor": 1.55,
    "dataSource": "San Mateo County / Central & Northern California construction cost data (2025) · Remodeling 2025 Cost vs. Value Report (Pacific Region) · NAR 2025 Remodeling Impact Report"
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
              "costBasis": "South San Francisco, CA market: roughly $795–$2,054 depending on materials and scope",
              "roiRecovery": 55,
              "tiers": {
                "Budget-Friendly": 795,
                "Mid-Range": 1325,
                "Premium": 2054,
                "Luxury": 3047
              }
            },
            {
              "item": "Exterior Paint (Walls, Trim & Shutters)",
              "description": "Two-coat application with premium exterior paint on all wall surfaces and trim",
              "costBasis": "South San Francisco, CA market: roughly $3,181–$8,217 depending on materials and scope",
              "roiRecovery": 60,
              "tiers": {
                "Budget-Friendly": 3181,
                "Mid-Range": 5301,
                "Premium": 8217,
                "Luxury": 12192
              }
            },
            {
              "item": "Front Door Repaint & Hardware",
              "description": "Strip, prime, and repaint front door with updated exterior hardware",
              "costBasis": "South San Francisco, CA market: roughly $465–$1,201 depending on materials and scope",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 465,
                "Mid-Range": 775,
                "Premium": 1201,
                "Luxury": 1782
              }
            }
          ],
          "contingency": {
            "percentage": 14,
            "reason": "Pre-1978 build — lead-paint testing and prep may be required. California permit required."
          },
          "roiNote": {
            "message": "Fresh exterior paint is the highest-visual-impact, lowest-cost curb-appeal upgrade in South San Francisco.",
            "source": "NAR 2025 Remodeling Impact Report"
          }
        },
        "Update roof/siding": {
          "lineItems": [
            {
              "item": "Siding Removal & Disposal",
              "description": "Full tear-off of existing siding, inspection for moisture damage, proper disposal",
              "costBasis": "South San Francisco, CA market: roughly $1,507–$3,892 depending on materials and scope",
              "roiRecovery": 76,
              "tiers": {
                "Budget-Friendly": 1507,
                "Mid-Range": 2511,
                "Premium": 3892,
                "Luxury": 5775
              }
            },
            {
              "item": "New Siding Installation",
              "description": "Fiber cement siding installed for durability and moisture resistance",
              "costBasis": "South San Francisco, CA market: roughly $11,718–$30,272 depending on materials and scope",
              "roiRecovery": 76,
              "tiers": {
                "Budget-Friendly": 11718,
                "Mid-Range": 19530,
                "Premium": 30272,
                "Luxury": 44919
              }
            },
            {
              "item": "Trim, Flashing & Moisture Barrier",
              "description": "Install weather-resistant barrier, new trim boards, and window/door flashing",
              "costBasis": "South San Francisco, CA market: roughly $2,344–$6,054 depending on materials and scope",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 2344,
                "Mid-Range": 3906,
                "Premium": 6054,
                "Luxury": 8984
              }
            }
          ],
          "contingency": {
            "percentage": 17,
            "reason": "Concealed moisture, rot, or sheathing damage risk — lead paint, galvanized plumbing, and dated wiring common in a 1946 build. California permit required."
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
              "costBasis": "South San Francisco, CA market: roughly $1,004–$2,595 depending on materials and scope",
              "roiRecovery": 69,
              "tiers": {
                "Budget-Friendly": 1004,
                "Mid-Range": 1674,
                "Premium": 2595,
                "Luxury": 3850
              }
            },
            {
              "item": "New Window Units (8–10 windows)",
              "description": "Vinyl double-pane (budget) to fiberglass triple-pane (premium); Energy Star rated",
              "costBasis": "South San Francisco, CA market: roughly $11,718–$30,272 depending on materials and scope",
              "roiRecovery": 69,
              "tiers": {
                "Budget-Friendly": 11718,
                "Mid-Range": 19530,
                "Premium": 30272,
                "Luxury": 44919
              }
            },
            {
              "item": "Exterior Trim & Caulking",
              "description": "New exterior trim, weather-seal caulking, and touch-up painting around all windows",
              "costBasis": "South San Francisco, CA market: roughly $2,093–$5,406 depending on materials and scope",
              "roiRecovery": 65,
              "tiers": {
                "Budget-Friendly": 2093,
                "Mid-Range": 3488,
                "Premium": 5406,
                "Luxury": 8022
              }
            }
          ],
          "contingency": {
            "percentage": 14,
            "reason": "Rough-opening rot and out-of-square framing risk on a 1946 build. California permit required."
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
              "costBasis": "South San Francisco, CA market: roughly $2,190–$5,658 depending on materials and scope",
              "roiRecovery": 188,
              "tiers": {
                "Budget-Friendly": 2190,
                "Mid-Range": 3650,
                "Premium": 5658,
                "Luxury": 8395
              }
            },
            {
              "item": "Pathway & Porch Update",
              "description": "Repair or replace pathway pavers/concrete and porch lighting upgrade",
              "costBasis": "South San Francisco, CA market: roughly $1,395–$3,604 depending on materials and scope",
              "roiRecovery": 120,
              "tiers": {
                "Budget-Friendly": 1395,
                "Mid-Range": 2325,
                "Premium": 3604,
                "Luxury": 5348
              }
            }
          ],
          "contingency": {
            "percentage": 12,
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
              "costBasis": "South San Francisco, CA market: roughly $2,190–$5,658 depending on materials and scope",
              "roiRecovery": 150,
              "tiers": {
                "Budget-Friendly": 2190,
                "Mid-Range": 3650,
                "Premium": 5658,
                "Luxury": 8395
              }
            },
            {
              "item": "Porch Lighting & Address Numbers",
              "description": "New porch light fixture, pathway lights, and updated address numbers",
              "costBasis": "South San Francisco, CA market: roughly $465–$1,201 depending on materials and scope",
              "roiRecovery": 120,
              "tiers": {
                "Budget-Friendly": 465,
                "Mid-Range": 775,
                "Premium": 1201,
                "Luxury": 1782
              }
            },
            {
              "item": "Pathway & Porch Tile/Pavers",
              "description": "New pathway surface from sidewalk to door; porch tile or stone overlay",
              "costBasis": "South San Francisco, CA market: roughly $2,325–$6,006 depending on materials and scope",
              "roiRecovery": 120,
              "tiers": {
                "Budget-Friendly": 2325,
                "Mid-Range": 3875,
                "Premium": 6006,
                "Luxury": 8913
              }
            }
          ],
          "contingency": {
            "percentage": 12,
            "reason": "Minor framing or utility work possible at the entry. California permit required."
          },
          "roiNote": {
            "message": "Front-entrance upgrades deliver outsized curb-appeal ROI in South San Francisco.",
            "source": "Remodeling 2025 Cost vs. Value — Pacific Region"
          }
        },
        "Landscaping": {
          "lineItems": [
            {
              "item": "Lawn & Ground Cover",
              "description": "Sod or drought-resistant ground cover",
              "costBasis": "South San Francisco, CA market: roughly $1,841–$4,757 depending on materials and scope",
              "roiRecovery": 100,
              "tiers": {
                "Budget-Friendly": 1841,
                "Mid-Range": 3069,
                "Premium": 4757,
                "Luxury": 7059
              }
            },
            {
              "item": "Shrubs, Plants & Mulch",
              "description": "Regionally appropriate, drought-tolerant plantings",
              "costBasis": "South San Francisco, CA market: roughly $1,507–$3,892 depending on materials and scope",
              "roiRecovery": 100,
              "tiers": {
                "Budget-Friendly": 1507,
                "Mid-Range": 2511,
                "Premium": 3892,
                "Luxury": 5775
              }
            },
            {
              "item": "Edging, Cleanup & Bark Mulch",
              "description": "Define planting beds, install edging, and a 3-inch bark mulch layer",
              "costBasis": "South San Francisco, CA market: roughly $586–$1,514 depending on materials and scope",
              "roiRecovery": 90,
              "tiers": {
                "Budget-Friendly": 586,
                "Mid-Range": 977,
                "Premium": 1514,
                "Luxury": 2247
              }
            }
          ],
          "contingency": {
            "percentage": 12,
            "reason": "Soil, grading, and irrigation conditions vary on-site in South San Francisco."
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
              "costBasis": "South San Francisco, CA market: roughly $1,172–$3,027 depending on materials and scope",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 1172,
                "Mid-Range": 1953,
                "Premium": 3027,
                "Luxury": 4492
              }
            },
            {
              "item": "New Driveway Surface",
              "description": "Concrete (standard) to decorative pavers (premium); includes edging and sealer",
              "costBasis": "South San Francisco, CA market: roughly $2,930–$7,569 depending on materials and scope",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 2930,
                "Mid-Range": 4883,
                "Premium": 7569,
                "Luxury": 11231
              }
            }
          ],
          "contingency": {
            "percentage": 14,
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
              "costBasis": "South San Francisco, CA market: roughly $754–$1,947 depending on materials and scope",
              "roiRecovery": 80,
              "tiers": {
                "Budget-Friendly": 754,
                "Mid-Range": 1256,
                "Premium": 1947,
                "Luxury": 2889
              }
            },
            {
              "item": "Patio Surface & Finishing",
              "description": "Concrete, stamped concrete, or natural stone pavers with sealer and edging",
              "costBasis": "South San Francisco, CA market: roughly $5,022–$12,974 depending on materials and scope",
              "roiRecovery": 80,
              "tiers": {
                "Budget-Friendly": 5022,
                "Mid-Range": 8370,
                "Premium": 12974,
                "Luxury": 19251
              }
            }
          ],
          "contingency": {
            "percentage": 14,
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
              "costBasis": "South San Francisco, CA market: roughly $4,185–$10,811 depending on materials and scope",
              "roiRecovery": 60,
              "tiers": {
                "Budget-Friendly": 4185,
                "Mid-Range": 6975,
                "Premium": 10811,
                "Luxury": 16042
              }
            },
            {
              "item": "Landscaping & Curb Appeal",
              "description": "Lawn, plants, mulch, edging, and pathway improvements",
              "costBasis": "South San Francisco, CA market: roughly $3,348–$8,649 depending on materials and scope",
              "roiRecovery": 100,
              "tiers": {
                "Budget-Friendly": 3348,
                "Mid-Range": 5580,
                "Premium": 8649,
                "Luxury": 12834
              }
            },
            {
              "item": "New Entry Door & Porch",
              "description": "New fiberglass door, hardware, porch lighting, and pathway",
              "costBasis": "South San Francisco, CA market: roughly $5,115–$13,214 depending on materials and scope",
              "roiRecovery": 150,
              "tiers": {
                "Budget-Friendly": 5115,
                "Mid-Range": 8525,
                "Premium": 13214,
                "Luxury": 19608
              }
            },
            {
              "item": "Siding & Trim Update",
              "description": "Fiber cement siding sections with new trim boards and flashing",
              "costBasis": "South San Francisco, CA market: roughly $10,044–$25,947 depending on materials and scope",
              "roiRecovery": 80,
              "tiers": {
                "Budget-Friendly": 10044,
                "Mid-Range": 16740,
                "Premium": 25947,
                "Luxury": 38502
              }
            }
          ],
          "contingency": {
            "percentage": 17,
            "reason": "Multi-trade coordination and full-scope permitting — lead paint, galvanized plumbing, and dated wiring common in a 1946 build. California permit required."
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
          "costBasis": "South San Francisco, CA market: roughly $9,207–$28,458 depending on materials and scope",
          "roiRecovery": 67,
          "tiers": {
            "Budget-Friendly": 9207,
            "Mid-Range": 16740,
            "Premium": 28458,
            "Luxury": 46872
          }
        },
        {
          "item": "Countertops (Quartz)",
          "description": "Quartz countertop fabrication and installation",
          "costBasis": "South San Francisco, CA market: roughly $4,220–$13,044 depending on materials and scope",
          "roiRecovery": 72,
          "tiers": {
            "Budget-Friendly": 4220,
            "Mid-Range": 7673,
            "Premium": 13044,
            "Luxury": 21484
          }
        },
        {
          "item": "Appliance Package",
          "description": "Mid-range stainless: refrigerator, range, dishwasher, and microwave",
          "costBasis": "South San Francisco, CA market: roughly $6,820–$21,080 depending on materials and scope",
          "roiRecovery": 60,
          "tiers": {
            "Budget-Friendly": 6820,
            "Mid-Range": 12400,
            "Premium": 21080,
            "Luxury": 34720
          }
        },
        {
          "item": "Flooring & Backsplash",
          "description": "LVP flooring replacement and tile backsplash installation",
          "costBasis": "South San Francisco, CA market: roughly $3,222–$9,960 depending on materials and scope",
          "roiRecovery": 70,
          "tiers": {
            "Budget-Friendly": 3222,
            "Mid-Range": 5859,
            "Premium": 9960,
            "Luxury": 16405
          }
        },
        {
          "item": "Lighting & Electrical",
          "description": "Recessed lights, pendant lighting, undercabinet LED, and panel upgrade if needed",
          "costBasis": "South San Francisco, CA market: roughly $1,876–$5,797 depending on materials and scope",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 1876,
            "Mid-Range": 3410,
            "Premium": 5797,
            "Luxury": 9548
          }
        }
      ],
      "contingency": {
        "percentage": 15,
        "reason": "Plumbing and electrical updates often needed — lead paint, galvanized plumbing, and dated wiring common in a 1946 build. California permit required. Interior condition could not be fully inspected pre-auction (occupied)."
      },
      "roiNote": {
        "message": "A mid-range kitchen remodel is one of the top interior ROI projects in South San Francisco.",
        "source": "Remodeling 2025 Cost vs. Value — Pacific Region · NAR 2025"
      }
    },
    "Bathroom": {
      "lineItems": [
        {
          "item": "Vanity, Sink & Mirror",
          "description": "Vanity cabinet replacement, new countertop, undermount sink, faucet, and framed mirror",
          "costBasis": "South San Francisco, CA market: roughly $2,984–$9,223 depending on materials and scope",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 2984,
            "Mid-Range": 5425,
            "Premium": 9223,
            "Luxury": 15190
          }
        },
        {
          "item": "Shower / Tub Renovation",
          "description": "Tile shower rebuild or tub replacement with new fixtures and glass enclosure",
          "costBasis": "South San Francisco, CA market: roughly $7,246–$22,398 depending on materials and scope",
          "roiRecovery": 68,
          "tiers": {
            "Budget-Friendly": 7246,
            "Mid-Range": 13175,
            "Premium": 22398,
            "Luxury": 36890
          }
        },
        {
          "item": "Floor & Wall Tile",
          "description": "Porcelain floor tile and partial wall tile with waterproofing membrane",
          "costBasis": "South San Francisco, CA market: roughly $2,916–$9,012 depending on materials and scope",
          "roiRecovery": 62,
          "tiers": {
            "Budget-Friendly": 2916,
            "Mid-Range": 5301,
            "Premium": 9012,
            "Luxury": 14843
          }
        },
        {
          "item": "Toilet, Fixtures & Lighting",
          "description": "Comfort-height toilet, new faucets, towel bars, exhaust fan, and vanity lighting",
          "costBasis": "South San Francisco, CA market: roughly $1,876–$5,797 depending on materials and scope",
          "roiRecovery": 60,
          "tiers": {
            "Budget-Friendly": 1876,
            "Mid-Range": 3410,
            "Premium": 5797,
            "Luxury": 9548
          }
        }
      ],
      "contingency": {
        "percentage": 18,
        "reason": "Bathroom rough-in and waterproofing risk — lead paint, galvanized plumbing, and dated wiring common in a 1946 build. California permit required. Interior condition could not be fully inspected pre-auction (occupied)."
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
          "costBasis": "South San Francisco, CA market: roughly $4,604–$14,229 depending on materials and scope",
          "roiRecovery": 72,
          "tiers": {
            "Budget-Friendly": 4604,
            "Mid-Range": 8370,
            "Premium": 14229,
            "Luxury": 23436
          }
        },
        {
          "item": "Paint, Trim & Crown Molding",
          "description": "Interior repaint, new baseboards, and crown molding installation",
          "costBasis": "South San Francisco, CA market: roughly $1,918–$5,930 depending on materials and scope",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 1918,
            "Mid-Range": 3488,
            "Premium": 5930,
            "Luxury": 9766
          }
        },
        {
          "item": "Lighting Upgrade",
          "description": "Recessed lighting installation, dimmer switches, and new ceiling fixtures",
          "costBasis": "South San Francisco, CA market: roughly $2,558–$7,905 depending on materials and scope",
          "roiRecovery": 60,
          "tiers": {
            "Budget-Friendly": 2558,
            "Mid-Range": 4650,
            "Premium": 7905,
            "Luxury": 13020
          }
        }
      ],
      "contingency": {
        "percentage": 13,
        "reason": "Possible electrical and permit needs; lead paint, galvanized plumbing, and dated wiring common in a 1946 build. Interior condition could not be fully inspected pre-auction (occupied)."
      },
      "roiNote": {
        "message": "Living-room updates recover well in South San Francisco; flooring delivers the strongest per-dollar ROI.",
        "source": "NAR 2025 Remodeling Impact Report"
      }
    },
    "Bedroom": {
      "lineItems": [
        {
          "item": "Flooring Replacement",
          "description": "Remove carpet; install engineered hardwood or luxury vinyl plank",
          "costBasis": "South San Francisco, CA market: roughly $3,453–$10,673 depending on materials and scope",
          "roiRecovery": 70,
          "tiers": {
            "Budget-Friendly": 3453,
            "Mid-Range": 6278,
            "Premium": 10673,
            "Luxury": 17578
          }
        },
        {
          "item": "Paint & Trim",
          "description": "Repaint walls and ceiling, new baseboards and door casings",
          "costBasis": "South San Francisco, CA market: roughly $1,381–$4,269 depending on materials and scope",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 1381,
            "Mid-Range": 2511,
            "Premium": 4269,
            "Luxury": 7031
          }
        },
        {
          "item": "Closet Organization System",
          "description": "Custom or modular closet system with shelving, rods, and drawers",
          "costBasis": "South San Francisco, CA market: roughly $2,728–$8,432 depending on materials and scope",
          "roiRecovery": 60,
          "tiers": {
            "Budget-Friendly": 2728,
            "Mid-Range": 4960,
            "Premium": 8432,
            "Luxury": 13888
          }
        }
      ],
      "contingency": {
        "percentage": 13,
        "reason": "Minor electrical or permit work possible; lead paint, galvanized plumbing, and dated wiring common in a 1946 build. Interior condition could not be fully inspected pre-auction (occupied)."
      },
      "roiNote": {
        "message": "Bedroom updates return solid value; flooring and closet upgrades drive buyer appeal.",
        "source": "NAR 2025 Remodeling Impact Report"
      }
    }
  }
};

module.exports = { id: SOUTHSF_PROPERTY_ID, config, SOUTHSF_PROPERTY_ID };
