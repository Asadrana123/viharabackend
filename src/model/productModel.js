const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
    // ============================================
    // CORE AUCTION & PROPERTY FIELDS
    // ============================================
    productName: {
        type: String,
        required: true,
    },
    auctionStartDate: {
        type: Date,
        required: true,
    },
    auctionStartTime: {
        type: String,
        required: true,
    },
    auctionEndDate: {
        type: Date,
        required: true,
    },
    auctionEndTime: {
        type: String,
        required: true,
    },
    reservePrice: {
        type: Number,
        required: true,
    },
    minIncrement: {
        type: Number,
        required: true,
    },
    emd: {
        type: Number,
        required: true,
    },
    commission: {
        type: Number,
        required: true,
    },
    startBid: {
        type: Number,
        required: true,
    },
    currentBid: {
        type: Number,
        default: function () {
            return this.startBid;
        }
    },
    currentBidder: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "userModel",
        default: null
    },
    propertyDescription: {
        type: String,
        required: true,
    },
    assetType: {
        type: String,
        enum: ['Reo Bank Owned', 'Foreclosure Homes', 'Short Sale'],
        required: false,
    },
    propertyType: {
        type: String,
        enum: ['Single Family', 'Condo, Townhouse, other single unit', 'Multi-family', 'Land'],
        required: true,
    },
    occupancyStatus: {
        type: String,
        enum: ['Vacant', 'Occupied', 'Reported Vacant'],
        required: false,
    },
    street: {
        type: String,
        required: true,
    },
    city: {
        type: String,
        required: true,
    },
    county: {
        type: String,
        required: true,
    },
    state: {
        type: String,
        required: true,
    },
    zipCode: {
        type: String,
        required: true,
    },
    beds: {
        type: Number,
        required: true,
    },
    baths: {
        type: Number,
        required: true,
    },
    squareFootage: {
        type: Number,
        required: true,
    },
    lotSize: {
        type: Number,
        required: true,
    },
    yearBuilt: {
        type: Number,
        required: true,
    },
    monthlyHOADues: {
        type: Number,
        required: true,
    },
    apn: {
        type: String,
        required: true,
    },
    eventID: {
        type: String,
        required: true,
    },
    trusteeSaleNumber: {
        type: String,
        required: true,
    },
    image: {
        type: String,
        required: false,
    },
    otherImages: [
        {
            type: String,
        }
    ],
    onlineOrInPerson: {
        type: String,
        enum: ['Online', 'In Person'],
        required: true,
    },
    bidderEmails: [
        {
            type: String,
        }
    ],
    threeDTourId: {
        type: String,
        required: false,
        default: null
    },
    threeDTourMetadata: {
        title: {
            type: String,
            default: null
        },
        description: {
            type: String,
            default: null
        },
        isActive: {
            type: Boolean,
            default: true
        }
    },
    status: {
        type: String,
        enum: ['active', 'sold', 'cancelled', 'pending'],
        default: 'active'
    },
    featured: {
        type: Boolean,
        default: false
    },

    // ============================================
    // COORDINATES (For Map Display - CoreLogic Integration)
    // Priority: Parcel > Block > City Approximation
    // ============================================
    coordinates: {
        parcel: {
            lat: {
                type: Number,
                required: false
            },
            lng: {
                type: Number,
                required: false
            }
        },
        block: {
            lat: {
                type: Number,
                required: false
            },
            lng: {
                type: Number,
                required: false
            }
        },
        // Tracks which coordinate source was used as primary
        sourceData: {
            type: String,
            enum: ['parcel', 'block', 'city'],
            default: 'city'
        },
        lastUpdated: {
            type: Date,
            default: Date.now
        }
    },

    // ============================================
    // PROPERTY DETAILS (PropertyDescription, PropertyAmenities)
    // ============================================
    propertyDetails: {
        architecturalStyle: String,  // "Traditional 2-Story"
        buildingClassType: String,  // "Traditional"
        constructionType: String,  // "Frame"
        numberOfStories: Number,
        interiorFeatures: [String],  // ["High ceilings", "Custom millwork"]
        appliancesIncluded: [String],  // ["Convection Oven", "Double Oven"]
        bathroomFixtures: Number,
        numFireplaces: Number,
        hasPool: Boolean,
        poolType: String,  // "Gunite in-ground pool"
        garageType: String,  // "3-car attached garage"
        heatingType: String,  // "Central Gas Heat"
        coolingType: String,  // "Central Electric Cooling"
        waterType: String,  // "Public Water"
        sewerType: String,  // "Public Sewer"
        lotSizeAcres: Number,
        subdivision: String  // "KINGS POINT VILLAGE SEC 4"
    },

    // ============================================
    // LISTING AGENT INFO (ListingAgentInfo)
    // ============================================
    listingAgent: {
        name: String,
        company: String,
        phone: String,
        email: String,
        licenseNumber: String
    },

    // ============================================
    // INVESTMENT CALCULATOR DATA
    // ============================================
    investmentData: {
        // Valuation (PropertyValuation component)
        valuation: {
            ViharaValue: Number,  // Propstream: 961,000
            highRange: Number,  // ATTOM: 1,119,540
            lowRange: Number,  // ATTOM: 844,565
            confidenceScore: Number,  // 86
            evaluatedDate: Date
        },

        // Rental (RevenueSection component)
        rental: {
            estimatedMonthlyRent: Number,  // 6,457
            estimatedAnnualRent: Number,  // 77,484
            rentalValue: Number,  // 6,457 (display value)
            highRange: Number,
            lowRange: Number,
            averageRentalTrend: Number,  // % change
            vacancyRate: Number  // 8%
        },

        // Tax (TaxCalculator component)
        taxData: {
            annualPropertyTax: Number,  // 24,384.52
            assessedValue: Number,  // 1,041,771
            assessmentYear: Number,  // 2025
            landValue: Number,  // 176,400
            improvementValue: Number  // 865,371
        },

        // Comparables (ComparablesSection component)
        comparables: [
            {
                address: String,
                beds: Number,
                baths: Number,
                sqft: Number,
                salePrice: Number,
                pricePerSqft: Number,
                saleDate: Date
            }
        ],

        // Price History (PriceTaxHistory component)
        priceHistory: [
            {
                year: Number,
                event: String,  // "Listed", "Sold"
                price: Number,
                pricePerSqft: Number
            }
        ],

        // Tax History (PriceTaxHistory component)
        taxHistory: [
            {
                year: Number,
                propertyTax: Number,
                taxChange: String,
                taxAssessment: Number,
                assessmentChange: String
            }
        ]
    },

    // ============================================
    // MARKET INSIGHTS (MarketTrendsTab component)
    // ============================================
    marketInsights: {
        medianListPrice: Number,
        medianSoldPrice: Number,
        daysOnMarket: Number,
        salesListPrice: Number,  // 101.3 (percentage)
        trends: {
            listPrice: String,  // "up", "down", "stable"
            soldPrice: String,
            daysOnMarket: String,
            salesRatio: String
        }
    },

    // ============================================
    // SCHOOLS & NEIGHBORHOOD (SchoolNeighborhoodTab)
    // ============================================
    schools: {
        public: [
            {
                name: String,
                rating: String,  // "1/10"
                grades: String,  // "PK-6"
                distance: String  // "0.34 mi"
            }
        ],
        private: [
            {
                name: String,
                rating: String,
                grades: String,
                distance: String
            }
        ]
    },

    walkScores: {
        walkScore: Number,  // 67
        transitScore: Number,  // 49
        bikeScore: Number  // 40
    },

    // ============================================
    // COMPARABLE MARKET DATA (ComparableMarketTab)
    // ============================================
    comparableMarket: [
        {
            address: String,
            listPrice: Number,
            listDate: String,
            soldPrice: Number,
            soldDate: String,
            beds: Number,
            baths: Number,
            sqft: Number,
            pricePerSqft: String
        }
    ],

    // ============================================
    // AREA STATISTICS (AreaStatistics component)
    // ============================================
    areaStatistics: {
        property: {
            address: String,
            beds: Number,
            baths: Number,
            sqft: Number
        },
        areaStats: {
            zip: {
                population: Number,
                populationDensity: Number,
                peoplePerHousehold: Number,
                medianAge: Number,
                medianHouseholdIncome: Number,
                averageIncome: Number
            },
            city: {
                population: Number,
                populationDensity: Number,
                peoplePerHousehold: Number,
                medianAge: Number,
                medianHouseholdIncome: Number,
                averageIncome: Number
            },
            county: {
                population: String,
                populationDensity: Number,
                peoplePerHousehold: Number,
                medianAge: Number,
                medianHouseholdIncome: Number,
                averageIncome: Number
            },
            national: {
                population: String,
                populationDensity: Number,
                peoplePerHousehold: Number,
                medianAge: Number,
                medianHouseholdIncome: Number,
                averageIncome: Number
            }
        }
    },

    // ============================================
    // TIMESTAMPS
    // ============================================
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Middleware to update lastUpdated when coordinates change
productSchema.pre('save', async function (next) {
    this.updatedAt = Date.now();

    // Update coordinates lastUpdated if coordinates changed
    if (this.isModified('coordinates.parcel') || this.isModified('coordinates.block')) {
        this.coordinates.lastUpdated = Date.now();
    }

    next();
});

module.exports = mongoose.model("productModel", productSchema);