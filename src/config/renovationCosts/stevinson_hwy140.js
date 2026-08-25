/**
 * renovationCosts/stevinson_hwy140.js
 *
 * 21975 State Highway 140, Stevinson, CA 95374 — Single Family, 2bd/1ba, 1006 sqft, built 1976.
 * regionalFactor 1.1: Merced County Central Valley — among California’s lowest construction costs, still modestly above the national average.
 * Line items are the single source of truth — see _shared.js for how subtotal,
 * contingency, final cost, range and ROI are derived from them.
 */

const STEVINSON_PROPERTY_ID = '6a8d9a1544a61f429a97fb53';

const config = {
  "meta": {
    "address": "21975 State Highway 140, Stevinson, CA 95374",
    "city": "Stevinson",
    "state": "California",
    "squareFootage": 1006,
    "bedrooms": 2,
    "bathrooms": 1,
    "yearBuilt": 1976,
    "regionalFactor": 1.1,
    "dataSource": "Merced County / Central & Northern California construction cost data (2025) · Remodeling 2025 Cost vs. Value Report (Pacific Region) · NAR 2025 Remodeling Impact Report"
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
              "costBasis": "Stevinson, CA market: roughly $565–$1,459 depending on materials and scope",
              "roiRecovery": 55,
              "tiers": {
                "Budget-Friendly": 565,
                "Mid-Range": 941,
                "Premium": 1459,
                "Luxury": 2164
              }
            },
            {
              "item": "Exterior Paint (Walls, Trim & Shutters)",
              "description": "Two-coat application with premium exterior paint on all wall surfaces and trim",
              "costBasis": "Stevinson, CA market: roughly $2,257–$5,831 depending on materials and scope",
              "roiRecovery": 60,
              "tiers": {
                "Budget-Friendly": 2257,
                "Mid-Range": 3762,
                "Premium": 5831,
                "Luxury": 8653
              }
            },
            {
              "item": "Front Door Repaint & Hardware",
              "description": "Strip, prime, and repaint front door with updated exterior hardware",
              "costBasis": "Stevinson, CA market: roughly $330–$853 depending on materials and scope",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 330,
                "Mid-Range": 550,
                "Premium": 853,
                "Luxury": 1265
              }
            }
          ],
          "contingency": {
            "percentage": 13,
            "reason": "Pre-1978 build — lead-paint testing and prep may be required. California permit required."
          },
          "roiNote": {
            "message": "Fresh exterior paint is the highest-visual-impact, lowest-cost curb-appeal upgrade in Stevinson.",
            "source": "NAR 2025 Remodeling Impact Report"
          }
        },
        "Update roof/siding": {
          "lineItems": [
            {
              "item": "Siding Removal & Disposal",
              "description": "Full tear-off of existing siding, inspection for moisture damage, proper disposal",
              "costBasis": "Stevinson, CA market: roughly $1,069–$2,762 depending on materials and scope",
              "roiRecovery": 76,
              "tiers": {
                "Budget-Friendly": 1069,
                "Mid-Range": 1782,
                "Premium": 2762,
                "Luxury": 4099
              }
            },
            {
              "item": "New Siding Installation",
              "description": "Fiber cement siding installed for durability and moisture resistance",
              "costBasis": "Stevinson, CA market: roughly $8,316–$21,483 depending on materials and scope",
              "roiRecovery": 76,
              "tiers": {
                "Budget-Friendly": 8316,
                "Mid-Range": 13860,
                "Premium": 21483,
                "Luxury": 31878
              }
            },
            {
              "item": "Trim, Flashing & Moisture Barrier",
              "description": "Install weather-resistant barrier, new trim boards, and window/door flashing",
              "costBasis": "Stevinson, CA market: roughly $1,663–$4,297 depending on materials and scope",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 1663,
                "Mid-Range": 2772,
                "Premium": 4297,
                "Luxury": 6376
              }
            }
          ],
          "contingency": {
            "percentage": 16,
            "reason": "Concealed moisture, rot, or sheathing damage risk — aging mechanical systems and possible galvanized plumbing in a 1976 build. California permit required."
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
              "costBasis": "Stevinson, CA market: roughly $713–$1,841 depending on materials and scope",
              "roiRecovery": 69,
              "tiers": {
                "Budget-Friendly": 713,
                "Mid-Range": 1188,
                "Premium": 1841,
                "Luxury": 2732
              }
            },
            {
              "item": "New Window Units (8–10 windows)",
              "description": "Vinyl double-pane (budget) to fiberglass triple-pane (premium); Energy Star rated",
              "costBasis": "Stevinson, CA market: roughly $8,316–$21,483 depending on materials and scope",
              "roiRecovery": 69,
              "tiers": {
                "Budget-Friendly": 8316,
                "Mid-Range": 13860,
                "Premium": 21483,
                "Luxury": 31878
              }
            },
            {
              "item": "Exterior Trim & Caulking",
              "description": "New exterior trim, weather-seal caulking, and touch-up painting around all windows",
              "costBasis": "Stevinson, CA market: roughly $1,485–$3,836 depending on materials and scope",
              "roiRecovery": 65,
              "tiers": {
                "Budget-Friendly": 1485,
                "Mid-Range": 2475,
                "Premium": 3836,
                "Luxury": 5693
              }
            }
          ],
          "contingency": {
            "percentage": 13,
            "reason": "Rough-opening rot and out-of-square framing risk on a 1976 build. California permit required."
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
              "costBasis": "Stevinson, CA market: roughly $1,555–$4,016 depending on materials and scope",
              "roiRecovery": 188,
              "tiers": {
                "Budget-Friendly": 1555,
                "Mid-Range": 2591,
                "Premium": 4016,
                "Luxury": 5959
              }
            },
            {
              "item": "Pathway & Porch Update",
              "description": "Repair or replace pathway pavers/concrete and porch lighting upgrade",
              "costBasis": "Stevinson, CA market: roughly $990–$2,558 depending on materials and scope",
              "roiRecovery": 120,
              "tiers": {
                "Budget-Friendly": 990,
                "Mid-Range": 1650,
                "Premium": 2558,
                "Luxury": 3795
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
              "costBasis": "Stevinson, CA market: roughly $1,555–$4,016 depending on materials and scope",
              "roiRecovery": 150,
              "tiers": {
                "Budget-Friendly": 1555,
                "Mid-Range": 2591,
                "Premium": 4016,
                "Luxury": 5959
              }
            },
            {
              "item": "Porch Lighting & Address Numbers",
              "description": "New porch light fixture, pathway lights, and updated address numbers",
              "costBasis": "Stevinson, CA market: roughly $330–$853 depending on materials and scope",
              "roiRecovery": 120,
              "tiers": {
                "Budget-Friendly": 330,
                "Mid-Range": 550,
                "Premium": 853,
                "Luxury": 1265
              }
            },
            {
              "item": "Pathway & Porch Tile/Pavers",
              "description": "New pathway surface from sidewalk to door; porch tile or stone overlay",
              "costBasis": "Stevinson, CA market: roughly $1,650–$4,263 depending on materials and scope",
              "roiRecovery": 120,
              "tiers": {
                "Budget-Friendly": 1650,
                "Mid-Range": 2750,
                "Premium": 4263,
                "Luxury": 6325
              }
            }
          ],
          "contingency": {
            "percentage": 11,
            "reason": "Minor framing or utility work possible at the entry. California permit required."
          },
          "roiNote": {
            "message": "Front-entrance upgrades deliver outsized curb-appeal ROI in Stevinson.",
            "source": "Remodeling 2025 Cost vs. Value — Pacific Region"
          }
        },
        "Landscaping": {
          "lineItems": [
            {
              "item": "Lawn & Ground Cover",
              "description": "Sod or drought-resistant ground cover",
              "costBasis": "Stevinson, CA market: roughly $1,307–$3,376 depending on materials and scope",
              "roiRecovery": 100,
              "tiers": {
                "Budget-Friendly": 1307,
                "Mid-Range": 2178,
                "Premium": 3376,
                "Luxury": 5009
              }
            },
            {
              "item": "Shrubs, Plants & Mulch",
              "description": "Regionally appropriate, drought-tolerant plantings",
              "costBasis": "Stevinson, CA market: roughly $1,069–$2,762 depending on materials and scope",
              "roiRecovery": 100,
              "tiers": {
                "Budget-Friendly": 1069,
                "Mid-Range": 1782,
                "Premium": 2762,
                "Luxury": 4099
              }
            },
            {
              "item": "Edging, Cleanup & Bark Mulch",
              "description": "Define planting beds, install edging, and a 3-inch bark mulch layer",
              "costBasis": "Stevinson, CA market: roughly $416–$1,074 depending on materials and scope",
              "roiRecovery": 90,
              "tiers": {
                "Budget-Friendly": 416,
                "Mid-Range": 693,
                "Premium": 1074,
                "Luxury": 1594
              }
            }
          ],
          "contingency": {
            "percentage": 11,
            "reason": "Soil, grading, and irrigation conditions vary on-site in Stevinson."
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
              "costBasis": "Stevinson, CA market: roughly $832–$2,148 depending on materials and scope",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 832,
                "Mid-Range": 1386,
                "Premium": 2148,
                "Luxury": 3188
              }
            },
            {
              "item": "New Driveway Surface",
              "description": "Concrete (standard) to decorative pavers (premium); includes edging and sealer",
              "costBasis": "Stevinson, CA market: roughly $2,079–$5,371 depending on materials and scope",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 2079,
                "Mid-Range": 3465,
                "Premium": 5371,
                "Luxury": 7969
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
              "costBasis": "Stevinson, CA market: roughly $535–$1,381 depending on materials and scope",
              "roiRecovery": 80,
              "tiers": {
                "Budget-Friendly": 535,
                "Mid-Range": 891,
                "Premium": 1381,
                "Luxury": 2049
              }
            },
            {
              "item": "Patio Surface & Finishing",
              "description": "Concrete, stamped concrete, or natural stone pavers with sealer and edging",
              "costBasis": "Stevinson, CA market: roughly $3,564–$9,207 depending on materials and scope",
              "roiRecovery": 80,
              "tiers": {
                "Budget-Friendly": 3564,
                "Mid-Range": 5940,
                "Premium": 9207,
                "Luxury": 13662
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
              "costBasis": "Stevinson, CA market: roughly $2,970–$7,673 depending on materials and scope",
              "roiRecovery": 60,
              "tiers": {
                "Budget-Friendly": 2970,
                "Mid-Range": 4950,
                "Premium": 7673,
                "Luxury": 11385
              }
            },
            {
              "item": "Landscaping & Curb Appeal",
              "description": "Lawn, plants, mulch, edging, and pathway improvements",
              "costBasis": "Stevinson, CA market: roughly $2,376–$6,138 depending on materials and scope",
              "roiRecovery": 100,
              "tiers": {
                "Budget-Friendly": 2376,
                "Mid-Range": 3960,
                "Premium": 6138,
                "Luxury": 9108
              }
            },
            {
              "item": "New Entry Door & Porch",
              "description": "New fiberglass door, hardware, porch lighting, and pathway",
              "costBasis": "Stevinson, CA market: roughly $3,630–$9,378 depending on materials and scope",
              "roiRecovery": 150,
              "tiers": {
                "Budget-Friendly": 3630,
                "Mid-Range": 6050,
                "Premium": 9378,
                "Luxury": 13915
              }
            },
            {
              "item": "Siding & Trim Update",
              "description": "Fiber cement siding sections with new trim boards and flashing",
              "costBasis": "Stevinson, CA market: roughly $7,128–$18,414 depending on materials and scope",
              "roiRecovery": 80,
              "tiers": {
                "Budget-Friendly": 7128,
                "Mid-Range": 11880,
                "Premium": 18414,
                "Luxury": 27324
              }
            }
          ],
          "contingency": {
            "percentage": 16,
            "reason": "Multi-trade coordination and full-scope permitting — aging mechanical systems and possible galvanized plumbing in a 1976 build. California permit required."
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
          "costBasis": "Stevinson, CA market: roughly $6,534–$20,196 depending on materials and scope",
          "roiRecovery": 67,
          "tiers": {
            "Budget-Friendly": 6534,
            "Mid-Range": 11880,
            "Premium": 20196,
            "Luxury": 33264
          }
        },
        {
          "item": "Countertops (Quartz)",
          "description": "Quartz countertop fabrication and installation",
          "costBasis": "Stevinson, CA market: roughly $2,995–$9,257 depending on materials and scope",
          "roiRecovery": 72,
          "tiers": {
            "Budget-Friendly": 2995,
            "Mid-Range": 5445,
            "Premium": 9257,
            "Luxury": 15246
          }
        },
        {
          "item": "Appliance Package",
          "description": "Mid-range stainless: refrigerator, range, dishwasher, and microwave",
          "costBasis": "Stevinson, CA market: roughly $4,840–$14,960 depending on materials and scope",
          "roiRecovery": 60,
          "tiers": {
            "Budget-Friendly": 4840,
            "Mid-Range": 8800,
            "Premium": 14960,
            "Luxury": 24640
          }
        },
        {
          "item": "Flooring & Backsplash",
          "description": "LVP flooring replacement and tile backsplash installation",
          "costBasis": "Stevinson, CA market: roughly $2,287–$7,069 depending on materials and scope",
          "roiRecovery": 70,
          "tiers": {
            "Budget-Friendly": 2287,
            "Mid-Range": 4158,
            "Premium": 7069,
            "Luxury": 11642
          }
        },
        {
          "item": "Lighting & Electrical",
          "description": "Recessed lights, pendant lighting, undercabinet LED, and panel upgrade if needed",
          "costBasis": "Stevinson, CA market: roughly $1,331–$4,114 depending on materials and scope",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 1331,
            "Mid-Range": 2420,
            "Premium": 4114,
            "Luxury": 6776
          }
        }
      ],
      "contingency": {
        "percentage": 13,
        "reason": "Plumbing and electrical updates often needed — aging mechanical systems and possible galvanized plumbing in a 1976 build. California permit required."
      },
      "roiNote": {
        "message": "A mid-range kitchen remodel is one of the top interior ROI projects in Stevinson.",
        "source": "Remodeling 2025 Cost vs. Value — Pacific Region · NAR 2025"
      }
    },
    "Bathroom": {
      "lineItems": [
        {
          "item": "Vanity, Sink & Mirror",
          "description": "Vanity cabinet replacement, new countertop, undermount sink, faucet, and framed mirror",
          "costBasis": "Stevinson, CA market: roughly $2,118–$6,545 depending on materials and scope",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 2118,
            "Mid-Range": 3850,
            "Premium": 6545,
            "Luxury": 10780
          }
        },
        {
          "item": "Shower / Tub Renovation",
          "description": "Tile shower rebuild or tub replacement with new fixtures and glass enclosure",
          "costBasis": "Stevinson, CA market: roughly $5,143–$15,895 depending on materials and scope",
          "roiRecovery": 68,
          "tiers": {
            "Budget-Friendly": 5143,
            "Mid-Range": 9350,
            "Premium": 15895,
            "Luxury": 26180
          }
        },
        {
          "item": "Floor & Wall Tile",
          "description": "Porcelain floor tile and partial wall tile with waterproofing membrane",
          "costBasis": "Stevinson, CA market: roughly $2,069–$6,395 depending on materials and scope",
          "roiRecovery": 62,
          "tiers": {
            "Budget-Friendly": 2069,
            "Mid-Range": 3762,
            "Premium": 6395,
            "Luxury": 10534
          }
        },
        {
          "item": "Toilet, Fixtures & Lighting",
          "description": "Comfort-height toilet, new faucets, towel bars, exhaust fan, and vanity lighting",
          "costBasis": "Stevinson, CA market: roughly $1,331–$4,114 depending on materials and scope",
          "roiRecovery": 60,
          "tiers": {
            "Budget-Friendly": 1331,
            "Mid-Range": 2420,
            "Premium": 4114,
            "Luxury": 6776
          }
        }
      ],
      "contingency": {
        "percentage": 16,
        "reason": "Bathroom rough-in and waterproofing risk — aging mechanical systems and possible galvanized plumbing in a 1976 build. California permit required."
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
          "costBasis": "Stevinson, CA market: roughly $3,267–$10,098 depending on materials and scope",
          "roiRecovery": 72,
          "tiers": {
            "Budget-Friendly": 3267,
            "Mid-Range": 5940,
            "Premium": 10098,
            "Luxury": 16632
          }
        },
        {
          "item": "Paint, Trim & Crown Molding",
          "description": "Interior repaint, new baseboards, and crown molding installation",
          "costBasis": "Stevinson, CA market: roughly $1,361–$4,208 depending on materials and scope",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 1361,
            "Mid-Range": 2475,
            "Premium": 4208,
            "Luxury": 6930
          }
        },
        {
          "item": "Lighting Upgrade",
          "description": "Recessed lighting installation, dimmer switches, and new ceiling fixtures",
          "costBasis": "Stevinson, CA market: roughly $1,815–$5,610 depending on materials and scope",
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
        "percentage": 11,
        "reason": "Possible electrical and permit needs; aging mechanical systems and possible galvanized plumbing in a 1976 build."
      },
      "roiNote": {
        "message": "Living-room updates recover well in Stevinson; flooring delivers the strongest per-dollar ROI.",
        "source": "NAR 2025 Remodeling Impact Report"
      }
    },
    "Bedroom": {
      "lineItems": [
        {
          "item": "Flooring Replacement",
          "description": "Remove carpet; install engineered hardwood or luxury vinyl plank",
          "costBasis": "Stevinson, CA market: roughly $2,450–$7,574 depending on materials and scope",
          "roiRecovery": 70,
          "tiers": {
            "Budget-Friendly": 2450,
            "Mid-Range": 4455,
            "Premium": 7574,
            "Luxury": 12474
          }
        },
        {
          "item": "Paint & Trim",
          "description": "Repaint walls and ceiling, new baseboards and door casings",
          "costBasis": "Stevinson, CA market: roughly $980–$3,029 depending on materials and scope",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 980,
            "Mid-Range": 1782,
            "Premium": 3029,
            "Luxury": 4990
          }
        },
        {
          "item": "Closet Organization System",
          "description": "Custom or modular closet system with shelving, rods, and drawers",
          "costBasis": "Stevinson, CA market: roughly $1,936–$5,984 depending on materials and scope",
          "roiRecovery": 60,
          "tiers": {
            "Budget-Friendly": 1936,
            "Mid-Range": 3520,
            "Premium": 5984,
            "Luxury": 9856
          }
        }
      ],
      "contingency": {
        "percentage": 11,
        "reason": "Minor electrical or permit work possible; aging mechanical systems and possible galvanized plumbing in a 1976 build."
      },
      "roiNote": {
        "message": "Bedroom updates return solid value; flooring and closet upgrades drive buyer appeal.",
        "source": "NAR 2025 Remodeling Impact Report"
      }
    }
  }
};

module.exports = { id: STEVINSON_PROPERTY_ID, config, STEVINSON_PROPERTY_ID };
