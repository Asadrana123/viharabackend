/**
 * renovationCosts/bigbear_georgia.js
 * 
 *  449 Georgia St, Big Bear Lake, CA 92315 — 3,271 sqft · 1 story · built 1924 ·
 *  MULTI-FAMILY: 5 cabins (MFR). Wood cabin construction, floor/wall heat, no cooling,
 *  16,390 sqft lot. San Bernardino County.
 * 
 *  regionalFactor 1.30: California renovation runs ~35% above the national average
 *  (RenoCanvas CA data, 2026); Big Bear is a mountain resort market where remote
 *  access and San Bernardino County mountain permitting add logistics, though it sits
 *  below top-tier coastal metros. 1.30 is the conservative CA-mountain figure.
 * 
 *  NOTE — this is a 5-cabin MULTI-FAMILY. Kitchen and Bathroom price ONE cabin unit;
 *  a whole-property scope scales those two areas across the occupied cabins.
 *  NOTE — pre-1978 build (1924): EPA RRP lead-safe practices apply. Mountain (CA Zone 16)
 *  roofing prices for snow load; Landscaping includes wildfire defensible-space clearing.
 * 
 *  Tier shape follows the portfolio convention (see _shared.js):
 *    Exterior line items : 0.60 / 1.00 / 1.55 / 2.30  x Mid-Range
 *    Interior line items : 0.55 / 1.00 / 1.70 / 2.80  x Mid-Range
 */

const GEORGIA_PROPERTY_ID = 'PENDING_REAL_ID_GEORGIA';

const config = {
  "meta": {
    "address": "449 Georgia St, Big Bear Lake, CA 92315",
    "city": "Big Bear Lake",
    "state": "California",
    "squareFootage": 3271,
    "bedrooms": 5,
    "bathrooms": 5,
    "yearBuilt": 1924,
    "regionalFactor": 1.3,
    "dataSource": "RenoCanvas California Whole-Home Renovation Data (2026, ~35% above national) · HomeYou Big Bear Lake Remodeling Cost Data (2026) · CaliFirst San Bernardino County Remodeling Guide (2026) · Remodeling 2025 Cost vs. Value Report (Pacific Region)"
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
              "description": "Power wash, scrape failing paint and prime the wood exteriors across multiple cabins",
              "costBasis": "Big Bear prep/scrape/prime across a 5-cabin compound $2,200-$3,800",
              "roiRecovery": 55,
              "tiers": {
                "Budget-Friendly": 1800,
                "Mid-Range": 3000,
                "Premium": 4650,
                "Luxury": 6900
              }
            },
            {
              "item": "Exterior Paint (Wood Cabin Siding & Trim)",
              "description": "Two-coat mildew-resistant acrylic across all cabin bodies, trim and soffit",
              "costBasis": "Big Bear full wood-siding repaint $3.50-$7/sqft; a multi-cabin compound this size runs $6,500-$11,500",
              "roiRecovery": 55,
              "tiers": {
                "Budget-Friendly": 5400,
                "Mid-Range": 9000,
                "Premium": 13950,
                "Luxury": 20700
              }
            },
            {
              "item": "Cabin Doors & Hardware",
              "description": "Strip, prime and repaint each cabin's entry door with updated exterior hardware",
              "costBasis": "Big Bear door repaint $350-$600 each | hardware $150-$400 across multiple units",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 900,
                "Mid-Range": 1500,
                "Premium": 2325,
                "Luxury": 3450
              }
            }
          ],
          "contingency": {
            "percentage": 18,
            "reason": "Pre-1978 build (1924) — EPA RRP lead-safe practices required across all cabins. Original wood may conceal rot; mountain access adds mobilization. San Bernardino County does not require a permit for standard exterior painting."
          },
          "roiNote": {
            "message": "A cohesive full-body repaint across the cabins is the highest-visual-impact upgrade for a multi-cabin mountain compound.",
            "source": "Remodeling 2025 Cost vs. Value Report (Pacific) · NAR 2025 Remodeling Impact Report"
          }
        },
        "Update roof/siding": {
          "lineItems": [
            {
              "item": "Siding Tear-Off & Disposal",
              "description": "Remove failing wood siding across cabins, inspect sheathing for rot, haul away debris",
              "costBasis": "Big Bear wood siding removal $1.75-$3/sqft across the compound",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 2100,
                "Mid-Range": 3500,
                "Premium": 5425,
                "Luxury": 8050
              }
            },
            {
              "item": "New Fiber Cement Cabin Siding",
              "description": "Fiber cement replacing original wood clapboard, moisture- and pest-resistant for the mountain climate",
              "costBasis": "Big Bear fiber cement $10-$18/sqft installed",
              "roiRecovery": 76,
              "tiers": {
                "Budget-Friendly": 12000,
                "Mid-Range": 20000,
                "Premium": 31000,
                "Luxury": 46000
              }
            },
            {
              "item": "Roof Tear-Off & Architectural Shingle Roofs",
              "description": "Full tear-off to deck on each cabin, new architectural shingles with ice-and-water shield and ridge vent for snow load",
              "costBasis": "Big Bear tear-off + architectural shingle $7-$12/sqft across multiple cabin roofs",
              "roiRecovery": 63,
              "tiers": {
                "Budget-Friendly": 9000,
                "Mid-Range": 15000,
                "Premium": 23250,
                "Luxury": 34500
              }
            }
          ],
          "contingency": {
            "percentage": 25,
            "reason": "1924 wood-frame cabins — original siding commonly conceals rot, insect damage or knob-and-tube; multiple structures multiply surprises. Mountain snow-load roofing and San Bernardino County permits required."
          },
          "roiNote": {
            "message": "Replacing failing wood siding and snow-worn roofs with durable systems is the highest-impact durability upgrade on a mountain compound.",
            "source": "Remodeling 2025 Cost vs. Value Report (Pacific) · NAR 2025 Remodeling Impact Report"
          }
        },
        "New windows": {
          "lineItems": [
            {
              "item": "Window Removal & Disposal",
              "description": "Remove approximately 18-20 existing window units across the cabins",
              "costBasis": "Big Bear $100-$200 per window removal; lead-safe containment adds labor on 1924 stock",
              "roiRecovery": 65,
              "tiers": {
                "Budget-Friendly": 1320,
                "Mid-Range": 2200,
                "Premium": 3410,
                "Luxury": 5060
              }
            },
            {
              "item": "New Window Units (18-20 windows)",
              "description": "Vinyl double-pane (budget) to fiberglass (premium); Energy Star rated for mountain temperature swings",
              "costBasis": "Big Bear: $700-$1,400/window vinyl | $1,500-$2,900/window fiberglass installed",
              "roiRecovery": 67,
              "tiers": {
                "Budget-Friendly": 13200,
                "Mid-Range": 22000,
                "Premium": 34100,
                "Luxury": 50600
              }
            },
            {
              "item": "Exterior Trim & Caulking",
              "description": "New exterior trim, weather-seal caulking and touch-up paint around every opening on every cabin",
              "costBasis": "Big Bear $150-$350 per window for trim and finishing",
              "roiRecovery": 65,
              "tiers": {
                "Budget-Friendly": 2160,
                "Mid-Range": 3600,
                "Premium": 5580,
                "Luxury": 8280
              }
            }
          ],
          "contingency": {
            "percentage": 20,
            "reason": "Pre-1978 build — window removal disturbs lead paint; RRP-certified crew required across multiple cabins. San Bernardino County permit required."
          },
          "roiNote": {
            "message": "Single-pane 1924 sashes are a real drawback at 6,700 ft elevation; efficient windows cut heating load and lift rentability of every cabin.",
            "source": "Remodeling 2025 Cost vs. Value Report (Pacific) · NAR 2025 Remodeling Impact Report"
          }
        },
        "New entrance": {
          "lineItems": [
            {
              "item": "New Entry Door Systems",
              "description": "New fiberglass or steel entry doors, frames and weatherstripping for the primary and unit entries",
              "costBasis": "Big Bear entry door replacement $2,000-$4,200 each installed",
              "roiRecovery": 90,
              "tiers": {
                "Budget-Friendly": 2700,
                "Mid-Range": 4500,
                "Premium": 6975,
                "Luxury": 10350
              }
            },
            {
              "item": "Steps, Decking & Railing",
              "description": "Repair or rebuild cabin steps and decking, new code-compliant railing rated for snow",
              "costBasis": "Big Bear step/deck rebuild $4,000-$8,000 across the compound",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 3300,
                "Mid-Range": 5500,
                "Premium": 8525,
                "Luxury": 12650
              }
            },
            {
              "item": "Entry Lighting & Hardware",
              "description": "Exterior sconces, house numbers, and updated locksets across units",
              "costBasis": "Big Bear: fixtures $130-$400 each installed | hardware $150-$400",
              "roiRecovery": 75,
              "tiers": {
                "Budget-Friendly": 840,
                "Mid-Range": 1400,
                "Premium": 2170,
                "Luxury": 3220
              }
            }
          ],
          "contingency": {
            "percentage": 18,
            "reason": "Step and deck demo on 1924 cabins may expose structural rot or failed footings; San Bernardino County permit required for structural work."
          },
          "roiNote": {
            "message": "Entry and deck replacement consistently posts one of the highest cost-recovery figures of any exterior project.",
            "source": "Remodeling 2025 Cost vs. Value Report (Pacific) · NAR 2025 Remodeling Impact Report"
          }
        }
      },
      "focusAreas": {
        "Front entrance": {
          "lineItems": [
            {
              "item": "Entry Door Refresh",
              "description": "Strip, prime and repaint the primary entry door; replace lockset and weatherstripping",
              "costBasis": "Big Bear door refresh $500-$1,000 | hardware $150-$400",
              "roiRecovery": 75,
              "tiers": {
                "Budget-Friendly": 1080,
                "Mid-Range": 1800,
                "Premium": 2790,
                "Luxury": 4140
              }
            },
            {
              "item": "Steps & Railing Repair",
              "description": "Repair primary cabin steps and decking, reset railing to code",
              "costBasis": "Big Bear step/railing repair $2,200-$4,500",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 1920,
                "Mid-Range": 3200,
                "Premium": 4960,
                "Luxury": 7360
              }
            },
            {
              "item": "Entry Lighting & House Numbers",
              "description": "New exterior sconces and visible house/unit numbering",
              "costBasis": "Big Bear: $130-$400 per fixture installed",
              "roiRecovery": 75,
              "tiers": {
                "Budget-Friendly": 450,
                "Mid-Range": 750,
                "Premium": 1163,
                "Luxury": 1725
              }
            }
          ],
          "contingency": {
            "percentage": 15,
            "reason": "1924 deck framing may need more repair than surface inspection reveals; lead-safe practices apply."
          },
          "roiNote": {
            "message": "The main entry sets the read for the whole compound off Big Bear Blvd, where curb visibility drives short-term-rental bookings.",
            "source": "Remodeling 2025 Cost vs. Value Report (Pacific) · NAR 2025 Remodeling Impact Report"
          }
        },
        "Landscaping": {
          "lineItems": [
            {
              "item": "Clearing, Defensible Space & Grading",
              "description": "Clear brush to meet wildfire defensible-space rules and regrade for drainage on the 16,390 sqft lot",
              "costBasis": "Big Bear clearing/defensible-space/grading $1,800-$3,200",
              "roiRecovery": 90,
              "tiers": {
                "Budget-Friendly": 1500,
                "Mid-Range": 2500,
                "Premium": 3875,
                "Luxury": 5750
              }
            },
            {
              "item": "Planting, Mulch & Edging",
              "description": "Fire-wise foundation plantings, mulch beds and edging around the cabins",
              "costBasis": "Big Bear planting package $2,000-$3,400",
              "roiRecovery": 100,
              "tiers": {
                "Budget-Friendly": 1560,
                "Mid-Range": 2600,
                "Premium": 4030,
                "Luxury": 5980
              }
            },
            {
              "item": "Walkway & Common Yard",
              "description": "Repair or replace cabin walkways and tidy the mature-tree common area",
              "costBasis": "Big Bear walkway $14-$28/sqft installed",
              "roiRecovery": 85,
              "tiers": {
                "Budget-Friendly": 1800,
                "Mid-Range": 3000,
                "Premium": 4650,
                "Luxury": 6900
              }
            }
          ],
          "contingency": {
            "percentage": 15,
            "reason": "CA mountain wildfire defensible-space compliance may expand clearing scope; drainage on a sloped mountain lot can require engineering. San Bernardino County permit for hardscape."
          },
          "roiNote": {
            "message": "Mature trees and a fire-wise, walkable common area are a genuine differentiator for a mountain rental compound.",
            "source": "Remodeling 2025 Cost vs. Value Report (Pacific) · NAR 2025 Remodeling Impact Report"
          }
        },
        "Driveway": {
          "lineItems": [
            {
              "item": "Shared Drive Demo & Grading",
              "description": "Remove the existing surface, regrade and compact the shared parking/drive area serving the cabins",
              "costBasis": "Big Bear demo and prep $1,800-$3,200 for a multi-space mountain drive",
              "roiRecovery": 65,
              "tiers": {
                "Budget-Friendly": 1500,
                "Mid-Range": 2500,
                "Premium": 3875,
                "Luxury": 5750
              }
            },
            {
              "item": "New Drive / Parking Surface",
              "description": "Asphalt (standard) through pavers (premium) with edging and sealer across the shared parking area",
              "costBasis": "Big Bear asphalt $6-$11/sqft | concrete/pavers $12-$26/sqft installed",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 3600,
                "Mid-Range": 6000,
                "Premium": 9300,
                "Luxury": 13800
              }
            }
          ],
          "contingency": {
            "percentage": 15,
            "reason": "Freeze-thaw at elevation demands a deeper compacted base; drainage and snow-storage layout may require engineering. San Bernardino County permit may apply."
          },
          "roiNote": {
            "message": "Ample, sound off-street parking is essential for a multi-unit short-term-rental compound and supports higher occupancy.",
            "source": "Remodeling 2025 Cost vs. Value Report (Pacific) · NAR 2025 Remodeling Impact Report"
          }
        },
        "Patio": {
          "lineItems": [
            {
              "item": "Patio / Fire-Pit Area Demo & Base Prep",
              "description": "Remove existing surface, excavate and compact a base in the rear open area",
              "costBasis": "Big Bear demo/base prep $1,100-$1,900 for a shared outdoor area",
              "roiRecovery": 70,
              "tiers": {
                "Budget-Friendly": 900,
                "Mid-Range": 1500,
                "Premium": 2325,
                "Luxury": 3450
              }
            },
            {
              "item": "Patio Surface & Finishing",
              "description": "Concrete, stamped concrete or natural-stone pavers with sealer and edging for a shared gathering space",
              "costBasis": "Big Bear concrete patio $10-$16/sqft | pavers $18-$38/sqft installed",
              "roiRecovery": 80,
              "tiers": {
                "Budget-Friendly": 3120,
                "Mid-Range": 5200,
                "Premium": 8060,
                "Luxury": 11960
              }
            }
          ],
          "contingency": {
            "percentage": 12,
            "reason": "Sloped mountain grading and drainage may require engineering; San Bernardino County permit required for hardscape."
          },
          "roiNote": {
            "message": "A shared outdoor gathering space is a strong booking driver for a Big Bear rental compound near the resorts.",
            "source": "Remodeling 2025 Cost vs. Value Report (Pacific) · NAR 2025 Remodeling Impact Report"
          }
        },
        "All": {
          "lineItems": [
            {
              "item": "Complete Exterior Paint",
              "description": "Full repaint of all cabin exteriors, trim and decking",
              "costBasis": "Big Bear full multi-cabin repaint $6,500-$11,500",
              "roiRecovery": 55,
              "tiers": {
                "Budget-Friendly": 5400,
                "Mid-Range": 9000,
                "Premium": 13950,
                "Luxury": 20700
              }
            },
            {
              "item": "Landscaping, Defensible Space & Curb Appeal",
              "description": "Clearing to fire code, fire-wise planting, mulch, edging and walkways across the compound",
              "costBasis": "Big Bear full landscaping/defensible-space package $3,800-$6,500",
              "roiRecovery": 95,
              "tiers": {
                "Budget-Friendly": 3000,
                "Mid-Range": 5000,
                "Premium": 7750,
                "Luxury": 11500
              }
            },
            {
              "item": "Entry, Steps & Decking",
              "description": "New entry doors, rebuilt cabin steps and decking, code-compliant railing and lighting",
              "costBasis": "Big Bear full entrance/deck package $4,500-$8,500",
              "roiRecovery": 85,
              "tiers": {
                "Budget-Friendly": 3600,
                "Mid-Range": 6000,
                "Premium": 9300,
                "Luxury": 13800
              }
            },
            {
              "item": "Siding & Trim Update",
              "description": "Repair/replace failing wood siding with new trim and flashing across the cabins",
              "costBasis": "Big Bear partial siding $15,000-$26,000 across the compound",
              "roiRecovery": 75,
              "tiers": {
                "Budget-Friendly": 12000,
                "Mid-Range": 20000,
                "Premium": 31000,
                "Luxury": 46000
              }
            }
          ],
          "contingency": {
            "percentage": 25,
            "reason": "Multi-trade coordination across five 1924 cabins; RRP lead rule applies to every surface disturbed. San Bernardino County permits required for full scope; mountain access adds mobilization."
          },
          "roiNote": {
            "message": "A complete exterior renovation is what moves this distressed mountain compound from investor-only to broadly financeable and rentable.",
            "source": "Remodeling 2025 Cost vs. Value Report (Pacific) · NAR 2025 Remodeling Impact Report"
          }
        }
      }
    },
    "Kitchen": {
      "lineItems": [
        {
          "item": "Cabinets & Hardware",
          "description": "Semi-custom cabinet replacement with soft-close hardware for ONE cabin kitchen",
          "costBasis": "Big Bear semi-custom cabinets $300-$650/linear ft installed",
          "roiRecovery": 62,
          "tiers": {
            "Budget-Friendly": 7150,
            "Mid-Range": 13000,
            "Premium": 22100,
            "Luxury": 36400
          }
        },
        {
          "item": "Countertops (Quartz)",
          "description": "Quartz fabrication and installation; approximately 25-30 sqft for a cabin kitchen",
          "costBasis": "Big Bear quartz $65-$150/sqft installed",
          "roiRecovery": 68,
          "tiers": {
            "Budget-Friendly": 2310,
            "Mid-Range": 4200,
            "Premium": 7140,
            "Luxury": 11760
          }
        },
        {
          "item": "Appliance Package",
          "description": "Refrigerator, range, dishwasher and microwave (stainless steel)",
          "costBasis": "Big Bear mid-range appliance package $6,000-$12,000 with delivery and mountain install",
          "roiRecovery": 58,
          "tiers": {
            "Budget-Friendly": 4675,
            "Mid-Range": 8500,
            "Premium": 14450,
            "Luxury": 23800
          }
        },
        {
          "item": "Flooring & Backsplash",
          "description": "LVP or tile flooring replacement plus tile backsplash installation",
          "costBasis": "Big Bear LVP $6-$13/sqft installed | tile backsplash $22-$48/sqft",
          "roiRecovery": 66,
          "tiers": {
            "Budget-Friendly": 2750,
            "Mid-Range": 5000,
            "Premium": 8500,
            "Luxury": 14000
          }
        },
        {
          "item": "Lighting & Electrical",
          "description": "Recessed lights, dedicated circuits, GFCI outlets and under-cabinet LED",
          "costBasis": "Big Bear electrician $90-$130/hr; 1924 wiring often needs replacement",
          "roiRecovery": 60,
          "tiers": {
            "Budget-Friendly": 2310,
            "Mid-Range": 4200,
            "Premium": 7140,
            "Luxury": 11760
          }
        }
      ],
      "contingency": {
        "percentage": 20,
        "reason": "1924 build — original knob-and-tube wiring and galvanized supply lines are common; a rewire is frequently required before new circuits can be permitted. San Bernardino County permit required; mountain freight adds appliance/material cost."
      },
      "roiNote": {
        "message": "This figure prices ONE cabin kitchen. The property is a 5-cabin multi-family; renovating each occupied unit's kitchen scales this cost accordingly.",
        "source": "Remodeling 2025 Cost vs. Value Report (Pacific) · NAR 2025 Remodeling Impact Report"
      }
    },
    "Bathroom": {
      "lineItems": [
        {
          "item": "Demo & Rough Plumbing",
          "description": "Strip one cabin bathroom to studs, replace supply and waste lines within the room",
          "costBasis": "Big Bear demo $900-$1,600 | rough plumbing $2,000-$4,000",
          "roiRecovery": 60,
          "tiers": {
            "Budget-Friendly": 1760,
            "Mid-Range": 3200,
            "Premium": 5440,
            "Luxury": 8960
          }
        },
        {
          "item": "Tile & Tub/Shower Surround",
          "description": "New tub or shower pan with full-height tile surround and waterproofing membrane",
          "costBasis": "Big Bear tile $16-$38/sqft installed | tub/shower unit $900-$3,000",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 3300,
            "Mid-Range": 6000,
            "Premium": 10200,
            "Luxury": 16800
          }
        },
        {
          "item": "Vanity, Toilet & Fixtures",
          "description": "New vanity with top, toilet, faucet, shower valve and trim",
          "costBasis": "Big Bear vanity $700-$2,400 | toilet $400-$900 | fixtures $500-$1,500 installed",
          "roiRecovery": 68,
          "tiers": {
            "Budget-Friendly": 1980,
            "Mid-Range": 3600,
            "Premium": 6120,
            "Luxury": 10080
          }
        },
        {
          "item": "Flooring & Waterproofing",
          "description": "Porcelain or LVT flooring over a properly prepped and waterproofed subfloor",
          "costBasis": "Big Bear bath flooring $12-$28/sqft installed including prep",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 1210,
            "Mid-Range": 2200,
            "Premium": 3740,
            "Luxury": 6160
          }
        },
        {
          "item": "Lighting & Ventilation",
          "description": "Vanity lighting, ceiling fixture and code-compliant exhaust fan ducted to exterior",
          "costBasis": "Big Bear: fan $350-$800 installed | lighting $300-$900",
          "roiRecovery": 60,
          "tiers": {
            "Budget-Friendly": 825,
            "Mid-Range": 1500,
            "Premium": 2550,
            "Luxury": 4200
          }
        }
      ],
      "contingency": {
        "percentage": 20,
        "reason": "1924 build — cast-iron waste stack corrosion and concealed water damage behind original tile are common. San Bernardino County plumbing permit required. Prices ONE cabin bath; the property has multiple."
      },
      "roiNote": {
        "message": "Bathroom updates are a top-three ROI project and are decisive for the nightly rate of each cabin unit.",
        "source": "Remodeling 2025 Cost vs. Value Report (Pacific) · NAR 2025 Remodeling Impact Report"
      }
    },
    "Living Room": {
      "lineItems": [
        {
          "item": "Flooring Replacement",
          "description": "Refinish or install LVP/engineered flooring in a cabin living space",
          "costBasis": "Big Bear refinishing $4-$8/sqft | LVP/engineered $6-$13/sqft installed",
          "roiRecovery": 72,
          "tiers": {
            "Budget-Friendly": 1760,
            "Mid-Range": 3200,
            "Premium": 5440,
            "Luxury": 8960
          }
        },
        {
          "item": "Paint, Trim & Wall Repair",
          "description": "Patch and repaint walls and ceiling, repair trim and any wood-panel detail",
          "costBasis": "Big Bear interior paint $3-$7/sqft including prep",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 1430,
            "Mid-Range": 2600,
            "Premium": 4420,
            "Luxury": 7280
          }
        },
        {
          "item": "Heat & Lighting Upgrade",
          "description": "Add a ductless mini-split (heat/AC) and updated lighting; cabins have only floor/wall heat and no cooling",
          "costBasis": "Big Bear mini-split $3,500-$6,500 installed | lighting $600-$1,400",
          "roiRecovery": 62,
          "tiers": {
            "Budget-Friendly": 1320,
            "Mid-Range": 2400,
            "Premium": 4080,
            "Luxury": 6720
          }
        }
      ],
      "contingency": {
        "percentage": 18,
        "reason": "1924 cabins have minimal insulation and dated wiring; adding a mini-split and fixtures often requires electrical upgrades before permitting."
      },
      "roiNote": {
        "message": "Adding cooling via a mini-split materially raises each cabin's rentability — the compound currently has no cooling.",
        "source": "Remodeling 2025 Cost vs. Value Report (Pacific) · NAR 2025 Remodeling Impact Report"
      }
    },
    "Bedroom": {
      "lineItems": [
        {
          "item": "Flooring Replacement",
          "description": "Remove damaged flooring; install LVP or refinish existing flooring in a cabin bedroom",
          "costBasis": "Big Bear refinishing $4-$8/sqft | LVP $6-$13/sqft installed",
          "roiRecovery": 70,
          "tiers": {
            "Budget-Friendly": 990,
            "Mid-Range": 1800,
            "Premium": 3060,
            "Luxury": 5040
          }
        },
        {
          "item": "Paint & Trim",
          "description": "Repaint walls and ceiling, repair or replace baseboard and casings",
          "costBasis": "Big Bear room repaint $500-$1,000 | trim $7-$13/lf installed",
          "roiRecovery": 65,
          "tiers": {
            "Budget-Friendly": 715,
            "Mid-Range": 1300,
            "Premium": 2210,
            "Luxury": 3640
          }
        },
        {
          "item": "Closet / Storage Build-Out",
          "description": "Modular closet or storage build-out; cabin bedrooms typically have minimal storage",
          "costBasis": "Big Bear modular closet $1,000-$2,600 installed",
          "roiRecovery": 58,
          "tiers": {
            "Budget-Friendly": 825,
            "Mid-Range": 1500,
            "Premium": 2550,
            "Luxury": 4200
          }
        }
      ],
      "contingency": {
        "percentage": 15,
        "reason": "Pre-1978 build (1924) — sanding painted trim triggers the RRP lead rule. Flooring removal may reveal subfloor issues in a mountain cabin."
      },
      "roiNote": {
        "message": "Storage is the weak point of small cabin bedrooms and is the cheapest lift to perceived quality and nightly rate.",
        "source": "Remodeling 2025 Cost vs. Value Report (Pacific) · NAR 2025 Remodeling Impact Report"
      }
    }
  }
};

module.exports = { id: GEORGIA_PROPERTY_ID, config, GEORGIA_PROPERTY_ID };
