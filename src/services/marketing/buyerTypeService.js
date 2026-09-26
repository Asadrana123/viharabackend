// services/marketing/buyerTypeService.js
//
// Suggests a property's buyer type with a point system (no AI). The admin
// confirms or changes the suggestion before a run. Retail is never suggested;
// the admin picks it manually.

const { BUYER_TYPE_RULES } = require("../../config/marketing/buyerTypeRules");
const { BUYER_TYPES } = require("../../config/marketing/marketingConstants");

const toPositiveNumber = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
};
const toNonNegativeNumber = (v) => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * @param {object} property  productModel document (or plain object).
 * @returns {{
 *   suggestion: "investor"|"owner-occupant"|null,
 *   scores: { investor: number, ownerOccupant: number },
 *   reasons: Array<{ label: string, side: "investor"|"owner-occupant", points: number }>
 * }}
 * suggestion is null when the scores are too close; the admin must choose.
 */
function suggestBuyerType(property = {}) {
    const r = BUYER_TYPE_RULES;
    const reasons = [];
    let investor = 0;
    let owner = 0;

    const addInvestor = (label, points) => { investor += points; reasons.push({ label, side: BUYER_TYPES.INVESTOR, points }); };
    const addOwner = (label, points) => { owner += points; reasons.push({ label, side: BUYER_TYPES.OWNER_OCCUPANT, points }); };

    // 1. Distressed sale
    if (r.distressedAssetTypes.includes(property.assetType)) {
        addInvestor(`Distressed sale (${property.assetType})`, r.points.distressed);
    }

    // 2. Occupancy
    if (property.occupancyStatus === "Occupied") {
        addInvestor("Occupied", r.points.occupied);
    } else if (property.occupancyStatus === "Vacant") {
        addOwner("Vacant", r.points.vacant);
    }

    // 3. Property type
    if (r.investorPropertyTypes.includes(property.propertyType)) {
        addInvestor(property.propertyType, r.points.investorPropertyType);
    } else if (property.propertyType) {
        addOwner(property.propertyType, r.points.homePropertyType);
    }

    // 4. Repair cost vs Vihara estimate
    const value = toPositiveNumber(property.investmentData?.valuation?.ViharaValue);
    const rehab = toNonNegativeNumber(property.rehabEstimate);
    if (value && rehab != null) {
        const share = rehab / value;
        if (share > r.majorRepairShare) addInvestor("Major repairs", r.points.majorRepairs);
        else if (share < r.moveInReadyShare) addOwner("Move-in ready", r.points.moveInReady);
    }

    // 5. Rent vs starting bid
    const rent = toPositiveNumber(property.rentEstimate);
    const startBid = toPositiveNumber(property.startBid);
    if (rent && startBid && (rent * 12) / startBid >= r.strongRentYield) {
        addInvestor("Strong rent", r.points.strongRent);
    }

    let suggestion = null;
    if (Math.abs(investor - owner) > r.tieMargin) {
        suggestion = investor > owner ? BUYER_TYPES.INVESTOR : BUYER_TYPES.OWNER_OCCUPANT;
    }

    return { suggestion, scores: { investor, ownerOccupant: owner }, reasons };
}

module.exports = { suggestBuyerType };
