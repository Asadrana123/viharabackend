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
  ]
};

const getContractorsForCity = (city) => {
  return VERIFIED_CONTRACTORS[city] || [];
};

module.exports = { VERIFIED_CONTRACTORS, getContractorsForCity };
