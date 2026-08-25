const VERIFIED_CONTRACTORS = {
  'Oakland': [
    {
      name: "Integrity Remodeling",
      phone: "415-302-0829",
      address: "PO Box 3508, Oakland, CA 94609",
      rating: 5.0,
      reviewCount: 33,
      specialty: "Full residential home renovations and expansions",
      yearsInBusiness: 25,
      source: "Yelp · BBB"
    },
    {
      name: "E&F Construction Services",
      phone: "510-388-9250",
      address: "851 Trestle Glen Rd, Oakland, CA 94610",
      rating: 4.9,
      reviewCount: 155,
      specialty: "Kitchen and bathroom remodeling, seismic retrofitting",
      yearsInBusiness: 14,
      source: "Yelp · Angi"
    },
    {
      name: "Geico Builders",
      phone: "510-800-6202",
      address: "1901 Harrison St, Ste 1100, Oakland, CA 94612",
      rating: 5.0,
      reviewCount: 31,
      specialty: "Kitchen, bathroom, and deck remodeling",
      yearsInBusiness: 12,
      source: "Yelp · Google"
    },
    {
      name: "Happy Bay Construction",
      phone: "510-603-5758",
      address: "Oakland, CA 94607",
      rating: 5.0,
      reviewCount: 13,
      specialty: "Full kitchen and bathroom remodels",
      yearsInBusiness: 6,
      source: "Yelp"
    },
    {
      name: "DC Construction",
      phone: "510-536-1068",
      address: "1068 44th Ave, Oakland, CA 94601",
      rating: 5.0,
      reviewCount: 4,
      specialty: "Major residential remodels and historic restoration",
      yearsInBusiness: 38,
      source: "BBB · Yelp · HomeGuide"
    },
    {
      name: "Ethos Built",
      phone: "415-531-0040",
      address: "3134 Fruitvale Ave, Oakland, CA 94602",
      rating: 4.9,
      reviewCount: 25,
      specialty: "Interior residential remodeling and custom cabinetry",
      yearsInBusiness: 11,
      source: "Yelp"
    }
  ],
  'Kingwood': [
    {
      name: "BoldREMO",
      phone: "832-513-5737",
      address: "Kingwood, TX 77339",
      rating: 5.0,
      reviewCount: 18,
      specialty: "Luxury bathroom remodeling and general contracting",
      yearsInBusiness: 6,
      source: "Yelp"
    },
    {
      name: "Superior Home Renovations",
      phone: "281-825-5591",
      address: "900 Rockmead Dr, Ste 142, Kingwood, TX 77339",
      rating: 4.9,
      reviewCount: 59,
      specialty: "Kitchen, bathroom, and home additions",
      yearsInBusiness: 32,
      source: "Google · Yelp"
    },
    {
      name: "Kingwood Renovations",
      phone: "832-330-4951",
      address: "2018 Woodford Green Dr, Kingwood, TX 77339",
      rating: 5.0,
      reviewCount: 14,
      specialty: "Home restoration, flood remediation, and remodeling",
      yearsInBusiness: 25,
      source: "Google · Yelp"
    },
    {
      name: "Handy Home Repair",
      phone: "832-412-9320",
      address: "2261 Northpark Dr, Ste 410, Kingwood, TX 77339",
      rating: 4.3,
      reviewCount: 16,
      specialty: "General home repairs, siding, and painting",
      yearsInBusiness: 15,
      source: "Yelp"
    },
    {
      name: "Kingwood Homes",
      phone: "281-713-0660",
      address: "4025 Feather Lakes Way, Ste 5177, Kingwood, TX 77325",
      rating: 4.9,
      reviewCount: 48,
      specialty: "Full home renovations and custom designs",
      yearsInBusiness: 10,
      source: "Google · Yelp"
    },
    {
      name: "Trademark Kitchens, Baths, & Remodeling Inc.",
      phone: "281-358-3600",
      address: "1133 Kingwood Dr, Kingwood, TX 77339",
      rating: 4.1,
      reviewCount: 22,
      specialty: "Kitchen and bathroom design and remodeling",
      yearsInBusiness: 20,
      source: "Google · Yelp"
    }
  ],
  'Bayonne': [
    {
      name: "Construction by Slawek LLC",
      phone: "201-463-4038",
      address: "Bayonne, NJ 07002",
      rating: null,
      reviewCount: null,
      specialty: "Kitchen and bathroom remodeling, siding, window installation",
      yearsInBusiness: 14,
      source: "BBB"
    },
    {
      name: "Calop Restoration and Remodelling LLC",
      phone: "201-620-4779",
      address: "566 Avenue C, Bayonne, NJ 07002",
      rating: null,
      reviewCount: null,
      specialty: "General contracting and restoration",
      yearsInBusiness: null,
      source: "BBB"
    }
  ],
  'Chicago': [
    {
      name: "A & J General Construction, Inc.",
      phone: "773-734-2040",
      address: "8848 S Houston Ave, Chicago, IL 60617",
      rating: null,
      reviewCount: null,
      specialty: "Bathroom and kitchen remodeling, garages, and home additions",
      yearsInBusiness: 23,
      source: "BBB"
    },
    {
      name: "A-Masonry Group Inc.",
      phone: "708-656-2400",
      address: "10958 S Halsted St, Chicago, IL 60628",
      rating: null,
      reviewCount: null,
      specialty: "Tuckpointing, brick restoration, lintel replacement, parapet rebuilding",
      yearsInBusiness: null,
      source: "BBB"
    },
    {
      name: "DMG Home Services",
      phone: "773-629-2825",
      address: "10212 S Indianapolis Ave, Chicago, IL 60617",
      rating: null,
      reviewCount: null,
      specialty: "General contracting, interior and exterior renovations, roofing, decks",
      yearsInBusiness: 19,
      source: "BBB"
    },
    {
      name: "Quinlan Construction - Decks & Renovations",
      phone: "773-374-4507",
      address: "10720 S Hoxie Ave, Chicago, IL 60617",
      rating: null,
      reviewCount: null,
      specialty: "Home remodeling, kitchens, bathrooms, vinyl replacement windows",
      yearsInBusiness: 16,
      source: "BBB"
    }
  ],
  'Thomson': [
    {
      name: "Construction Residental",
      phone: "706-361-0376",
      address: "219 White Oak St, Thomson, GA 30824",
      rating: null,
      reviewCount: null,
      specialty: "General residential construction and renovation",
      yearsInBusiness: 19,
      source: "Yellow Pages"
    },
    {
      name: "Two State Construction Co",
      phone: "706-595-2863",
      address: "2292 Washington Rd, Thomson, GA 30824",
      rating: null,
      reviewCount: null,
      specialty: "General contracting, roofing, project estimation (est. 1970)",
      yearsInBusiness: 56,
      source: "Yellow Pages"
    },
    {
      name: "B B Construction",
      phone: "706-361-0875",
      address: "1540 Harrison Rd, Thomson, GA 30824",
      rating: null,
      reviewCount: null,
      specialty: "Building construction and consulting",
      yearsInBusiness: 14,
      source: "Yellow Pages"
    },
    {
      name: "Sims Roofing Co",
      phone: "706-595-1472",
      address: "630 Lakewood Dr, Thomson, GA 30824",
      rating: null,
      reviewCount: null,
      specialty: "Roofing and home improvements",
      yearsInBusiness: 76,
      source: "Yellow Pages"
    },
    {
      name: "Stewart-Corbitt General Construction",
      phone: "706-595-4010",
      address: "146 Railroad St Ste B, Thomson, GA 30824",
      rating: null,
      reviewCount: null,
      specialty: "General construction and home building",
      yearsInBusiness: null,
      source: "Yellow Pages"
    }
  ],
  'Matteson': [
    {
      name: "BFB Remodeling",
      phone: "708-412-7802",
      address: "Matteson, IL 60443",
      rating: null,
      reviewCount: null,
      specialty: "Residential remodeling: painting, drywall, flooring, kitchen and bathroom",
      yearsInBusiness: null,
      source: "Yellow Pages"
    },
    {
      name: "C C Remodelers Inc",
      phone: "708-813-3553",
      address: "4710 211th St, Matteson, IL 60443",
      rating: null,
      reviewCount: null,
      specialty: "Kitchen planning and remodeling, general home improvements",
      yearsInBusiness: null,
      source: "Yellow Pages"
    }
  ],
  'Big Bear Lake': [
    {
      name: "High Mountain Construction Inc.",
      phone: "909-205-1669",
      address: "41656 Big Bear Blvd, Big Bear Lake, CA 92315",
      rating: 5.0,
      reviewCount: null,
      specialty: "General contracting, custom mountain homes, and major remodels",
      yearsInBusiness: 10,
      source: "Chamber of Commerce · CSLB"
    },
    {
      name: "Bill Kawa Construction",
      phone: "909-866-7378",
      address: "39181 Peak Ln, Big Bear Lake, CA 92315",
      rating: 5.0,
      reviewCount: null,
      specialty: "General home building and custom remodeling",
      yearsInBusiness: null,
      source: "Chamber of Commerce"
    },
    {
      name: "Don Meyer Construction",
      phone: "909-436-9117",
      address: "PO Box 3103, Big Bear Lake, CA 92315",
      rating: 5.0,
      reviewCount: null,
      specialty: "General contracting and residential building",
      yearsInBusiness: null,
      source: "BBB"
    },
    {
      name: "Beckett Roofing",
      phone: "909-991-9537",
      address: "PO Box 897, Big Bear Lake, CA 92315",
      rating: 5.0,
      reviewCount: 20,
      specialty: "Roof installation, repair, and ice/water protection",
      yearsInBusiness: null,
      source: "Yelp · Google"
    },
    {
      name: "Herrera General Contractor",
      phone: "951-965-3442",
      address: "PO Box 890, Big Bear Lake, CA 92315",
      rating: 5.0,
      reviewCount: null,
      specialty: "General contracting, remodeling, and home additions",
      yearsInBusiness: null,
      source: "BBB"
    }
  ],
  'Ogdensburg': [
    {
      name: "Wayne Latham General Contractor",
      phone: "315-375-4063",
      address: "9264 State Highway 58, Ogdensburg, NY 13669",
      rating: null,
      reviewCount: null,
      specialty: "General construction, home renovations, and roofing",
      yearsInBusiness: null,
      source: "Neighbors of Watertown"
    },
    {
      name: "Bertrand's Construction, Inc.",
      phone: "315-323-6219",
      address: "540 English Settlement Rd, Ogdensburg, NY 13669",
      rating: 5.0,
      reviewCount: null,
      specialty: "Home additions, roofing, electrical, plumbing, and general remodeling",
      yearsInBusiness: null,
      source: "Houzz"
    },
    {
      "name": "Morley Bay Construction LLC",
      "phone": null,
      "address": "5881 State Highway 37, Ogdensburg, NY 13669",
      "rating": null,
      "reviewCount": null,
      "specialty": "Bathroom design, custom building, and residential construction",
      "yearsInBusiness": null,
      "source": "BBB"
    },
    {
      name: "Max Beggs Builders and Movers",
      phone: "315-375-6653",
      address: "431 Center Rd, Ogdensburg, NY 13669",
      rating: null,
      reviewCount: null,
      specialty: "General construction, renovations, foundations, house lifting/moving",
      yearsInBusiness: null,
      source: "Neighbors of Watertown"
    },
    {
      name: "Forrest & Richardson Inc.",
      phone: "315-276-5364",
      address: "Ogdensburg, NY 13669",
      rating: null,
      reviewCount: null,
      specialty: "Concrete contracting, driveways, and tree services",
      yearsInBusiness: null,
      source: "BBB"
    }
  ],

  'Atwater': [
    {
      name: "M-Mig Construction Inc",
      phone: "209-724-9488",
      address: "291 Business Park Way, Atwater, CA 95301",
      rating: null,
      reviewCount: null,
      specialty: "Commercial and residential general contracting and construction",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    },
    {
      name: "Hightower & Sons Inc",
      phone: "209-602-8774",
      address: "Winton, CA 95388",
      rating: null,
      reviewCount: null,
      specialty: "General contracting, roofing, and painting; serves Merced and Stanislaus counties",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    },
    {
      name: "Femur Construction",
      phone: "209-850-7616",
      address: "Merced, CA 95348",
      rating: null,
      reviewCount: null,
      specialty: "General contracting, home building, and bathroom remodeling",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    },
    {
      name: "Top Notch Construction",
      phone: "209-631-1675",
      address: "3312 Bridal Veil Ct, Merced, CA 95340",
      rating: null,
      reviewCount: null,
      specialty: "General contracting and bathroom remodeling",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    },
    {
      name: "Mike Stevens Construction",
      phone: "209-756-1136",
      address: "Merced County, CA",
      rating: null,
      reviewCount: null,
      specialty: "Residential remodel and renovation (CSLB #726846)",
      yearsInBusiness: 30,
      source: "CSLB · mikestevensconstruction.com"
    }
  ],
  'Sonora': [
    {
      name: "J.F. Conlin Building Company",
      phone: "209-559-6766",
      address: "Sonora, CA 95370",
      rating: null,
      reviewCount: null,
      specialty: "Construction, general contracting, and siding",
      yearsInBusiness: null,
      source: "BBB · A- Accredited"
    },
    {
      name: "Rodgers Construction",
      phone: "209-352-9600",
      address: "19016 Birch St, Tuolumne, CA 95379",
      rating: null,
      reviewCount: null,
      specialty: "Bathroom remodeling, general contracting, and remodeling",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    },
    {
      name: "Radetich Construction",
      phone: "209-352-4176",
      address: "Twain Harte, CA 95383",
      rating: null,
      reviewCount: null,
      specialty: "General contracting, decks, framing, and home additions",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    },
    {
      name: "ASC Builders",
      phone: "209-602-9013",
      address: "9779 Caracol Cir, La Grange, CA 95329",
      rating: null,
      reviewCount: null,
      specialty: "General contracting, concrete, and bathroom remodeling",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    },
    {
      name: "Comphel Heating & Air Conditioning, Inc.",
      phone: "209-532-0387",
      address: "16020 Via Este Rd, Sonora, CA 95370",
      rating: null,
      reviewCount: null,
      specialty: "General contracting and HVAC",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    }
  ],
  'Oakdale': [
    {
      name: "Ross F Carroll, Inc.",
      phone: "209-848-5959",
      address: "8873 Warnerville Rd, Oakdale, CA 95361",
      rating: null,
      reviewCount: null,
      specialty: "General engineering and general contracting (site work, paving)",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    },
    {
      name: "Mg Construction & Remodeling LLC",
      phone: null,
      address: "Oakdale, CA 95361",
      rating: null,
      reviewCount: null,
      specialty: "Construction and home remodeling",
      yearsInBusiness: 3,
      source: "BBB · A+ Accredited"
    },
    {
      name: "Andalon Construction",
      phone: "209-595-2485",
      address: "2230 Barger Way, Riverbank, CA 95367",
      rating: null,
      reviewCount: null,
      specialty: "General contracting, bathroom remodeling, and remodel contracting",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    },
    {
      name: "Adrian Construction",
      phone: "209-409-8075",
      address: "3424 Oakdale Rd Ste 2, Modesto, CA 95355",
      rating: null,
      reviewCount: null,
      specialty: "General contracting, construction services, and kitchen remodeling",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    },
    {
      name: "Reyes Construction",
      phone: "209-605-7181",
      address: "Riverbank, CA 95367",
      rating: null,
      reviewCount: null,
      specialty: "General contracting, plumbing, and handyman services",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    }
  ],
  'Turlock': [
    {
      name: "Hammer Hill Handyman LLC",
      phone: "209-216-7625",
      address: "Turlock, CA 95382",
      rating: null,
      reviewCount: null,
      specialty: "Remodel contracting, general contracting, and construction services",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    },
    {
      name: "Aria General Building",
      phone: "209-416-6755",
      address: "Turlock, CA 95380",
      rating: null,
      reviewCount: null,
      specialty: "General contracting, remodel contracting, and building",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    },
    {
      name: "Filippone Construction Company",
      phone: "408-229-3494",
      address: "Turlock, CA 95382",
      rating: null,
      reviewCount: null,
      specialty: "General contracting, construction services, and bathroom remodeling",
      yearsInBusiness: null,
      source: "BBB · A- Accredited"
    },
    {
      name: "Turlock Construction Company",
      phone: "209-667-9484",
      address: "2930 Geer Rd Ste 202, Turlock, CA 95382",
      rating: null,
      reviewCount: null,
      specialty: "General contracting (CSLB #493056)",
      yearsInBusiness: null,
      source: "BBB · CSLB"
    },
    {
      name: "Blades General Contracting, Inc.",
      phone: "209-678-3952",
      address: "1925 S Faith Home Rd, Turlock, CA 95380",
      rating: null,
      reviewCount: null,
      specialty: "General contracting",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    }
  ],
  'South San Francisco': [
    {
      name: "Robison-Nieri-White Construction",
      phone: "650-737-1600",
      address: "45 S Linden Ave, South San Francisco, CA 94080",
      rating: null,
      reviewCount: null,
      specialty: "General contracting, bathroom and kitchen remodeling",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    },
    {
      name: "Nino Company",
      phone: "650-869-9200",
      address: "South San Francisco, CA 94080",
      rating: null,
      reviewCount: null,
      specialty: "General contracting, bathroom and kitchen remodeling",
      yearsInBusiness: null,
      source: "BBB · A Accredited"
    },
    {
      name: "Amador General Construction",
      phone: "650-834-6137",
      address: "South San Francisco, CA 94080",
      rating: null,
      reviewCount: null,
      specialty: "Remodel contracting and general contracting",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    },
    {
      name: "Vermont Solutions",
      phone: "628-310-5558",
      address: "235 Grand Ave Ste 201, South San Francisco, CA 94080",
      rating: null,
      reviewCount: null,
      specialty: "General contracting, drywall, and bathroom remodeling",
      yearsInBusiness: null,
      source: "BBB · A Accredited"
    },
    {
      name: "Handy Construction Team, Inc.",
      phone: "650-273-1500",
      address: "South San Francisco, CA 94080",
      rating: null,
      reviewCount: null,
      specialty: "General contracting, building, and foundation repair",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    }
  ],
  'Twain Harte': [
    {
      name: "Radetich Construction",
      phone: "209-352-4176",
      address: "Twain Harte, CA 95383",
      rating: null,
      reviewCount: null,
      specialty: "General contracting, decks, framing, and home additions",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    },
    {
      name: "Rodgers Construction",
      phone: "209-352-9600",
      address: "19016 Birch St, Tuolumne, CA 95379",
      rating: null,
      reviewCount: null,
      specialty: "Bathroom remodeling, general contracting, and remodeling",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    },
    {
      name: "J.F. Conlin Building Company",
      phone: "209-559-6766",
      address: "Sonora, CA 95370",
      rating: null,
      reviewCount: null,
      specialty: "Construction, general contracting, and siding; serves Tuolumne County",
      yearsInBusiness: null,
      source: "BBB · A- Accredited"
    },
    {
      name: "ASC Builders",
      phone: "209-602-9013",
      address: "9779 Caracol Cir, La Grange, CA 95329",
      rating: null,
      reviewCount: null,
      specialty: "General contracting, concrete, and bathroom remodeling",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    },
    {
      name: "Comphel Heating & Air Conditioning, Inc.",
      phone: "209-532-0387",
      address: "16020 Via Este Rd, Sonora, CA 95370",
      rating: null,
      reviewCount: null,
      specialty: "General contracting and HVAC; serves Tuolumne County",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    }
  ],
  'Stevinson': [
    {
      name: "Samano Construction",
      phone: "209-917-0389",
      address: "Merced, CA 95341",
      rating: null,
      reviewCount: null,
      specialty: "General contracting, construction, and home renovation; serves the Los Banos area",
      yearsInBusiness: null,
      source: "BBB · A Accredited"
    },
    {
      name: "Mike Stevens Construction",
      phone: "209-756-1136",
      address: "Merced County, CA",
      rating: null,
      reviewCount: null,
      specialty: "Residential remodel and renovation; serves Los Banos and Gustine (CSLB #726846)",
      yearsInBusiness: 30,
      source: "CSLB · mikestevensconstruction.com"
    },
    {
      name: "Hightower & Sons Inc",
      phone: "209-602-8774",
      address: "Winton, CA 95388",
      rating: null,
      reviewCount: null,
      specialty: "General contracting, roofing, and painting; serves Merced and Stanislaus counties",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    },
    {
      name: "Filippone Construction Company",
      phone: "408-229-3494",
      address: "Turlock, CA 95382",
      rating: null,
      reviewCount: null,
      specialty: "General contracting and bathroom remodeling; serves Crows Landing and Newman",
      yearsInBusiness: null,
      source: "BBB · A- Accredited"
    },
    {
      name: "M-Mig Construction Inc",
      phone: "209-724-9488",
      address: "291 Business Park Way, Atwater, CA 95301",
      rating: null,
      reviewCount: null,
      specialty: "General contracting and construction; serves Merced County",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    }
  ],
  'Patterson': [
    {
      name: "Allworld Construction, Inc.",
      phone: "209-456-0552",
      address: "530 Chesterfield Dr, Patterson, CA 95363",
      rating: null,
      reviewCount: null,
      specialty: "General contracting and electrical",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    },
    {
      name: "DGO General Contractors, Inc.",
      phone: "408-854-2672",
      address: "Patterson, CA 95363",
      rating: null,
      reviewCount: null,
      specialty: "Home remodeling, roofing, additions, and new construction",
      yearsInBusiness: 2,
      source: "BBB · A Accredited"
    },
    {
      name: "Upscale Construction",
      phone: "209-860-2921",
      address: "2037 L St Ste 101, Newman, CA 95360",
      rating: null,
      reviewCount: null,
      specialty: "General contracting, bathroom remodeling, and remodel contracting",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    },
    {
      name: "Licea Pro Construction",
      phone: "818-438-0353",
      address: "3928 Willow Pond Ct, Ceres, CA 95307",
      rating: null,
      reviewCount: null,
      specialty: "Construction, roofing, and general contracting",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    },
    {
      name: "Customer's Choice Construction, Inc",
      phone: "209-345-9181",
      address: "Ceres, CA 95307",
      rating: null,
      reviewCount: null,
      specialty: "Building contracting, general contracting, and construction",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    }
  ],
  'Brentwood': [
    {
      name: "Marchio Construction, Inc.",
      phone: "925-727-7083",
      address: "804 Fieldstone Ct, Brentwood, CA 94513",
      rating: null,
      reviewCount: null,
      specialty: "General contracting, home improvement, and decks",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    },
    {
      name: "East Bay PC Construction",
      phone: "925-727-4602",
      address: "Brentwood, CA 94513",
      rating: null,
      reviewCount: null,
      specialty: "Remodel contracting, general contracting, and bathroom remodeling",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    },
    {
      name: "A. Ramos Construction, Inc.",
      phone: "925-766-7960",
      address: "Brentwood, CA 94513",
      rating: null,
      reviewCount: null,
      specialty: "General contracting, bathroom remodeling, and remodel contracting",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    },
    {
      name: "Parenti Construction",
      phone: "925-383-7793",
      address: "Brentwood, CA 94513",
      rating: null,
      reviewCount: null,
      specialty: "General contracting, kitchen remodeling, and home improvement",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    },
    {
      name: "HandyDads Construction Inc.",
      phone: "925-587-3237",
      address: "9010 Brentwood Blvd Ste E, Brentwood, CA 94513",
      rating: null,
      reviewCount: null,
      specialty: "General contracting, handyman, and home improvement",
      yearsInBusiness: null,
      source: "BBB · A+ Accredited"
    }
  ]
};

const getContractorsForCity = (city) => {
  return VERIFIED_CONTRACTORS[city] || [];
};

module.exports = { VERIFIED_CONTRACTORS, getContractorsForCity };