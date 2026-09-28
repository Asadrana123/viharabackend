// config/marketing/buyerTypeRules.js
//
// Point system for suggesting a property's buyer type (no AI).
// Tune the numbers here; buyerTypeService.js holds no magic values.

const BUYER_TYPE_RULES = Object.freeze({
    // productModel assetType values that mean a distressed sale.
    distressedAssetTypes: ["Reo Bank Owned", "Foreclosure Homes", "Short Sale"],

    // productModel propertyType values that are almost always investor buys.
    investorPropertyTypes: ["Multi-family", "Land"],

    points: {
        // toward investor
        distressed: 3,
        occupied: 3,
        investorPropertyType: 3,
        majorRepairs: 2,
        strongRent: 1,
        // toward owner-occupant
        vacant: 1,
        homePropertyType: 1,
        moveInReady: 2,
    },

    // rehabEstimate / Vihara estimate
    majorRepairShare: 0.15,
    moveInReadyShare: 0.05,

    // (rentEstimate x 12) / startBid
    strongRentYield: 0.08,

    // If the two scores are this close or closer, the admin must choose.
    tieMargin: 1,
});

module.exports = { BUYER_TYPE_RULES };
