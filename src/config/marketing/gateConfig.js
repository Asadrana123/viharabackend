// config/marketing/gateConfig.js
//
// Every property field the verification gate looks at.
//
//   path              - dot path on the productModel document
//   type              - "string" | "number" | "date" | "list"
//   positive          - numbers must be > 0 (0 means "not set" for money fields)
//   requiredForBrief  - the run stops at the brief stage if this is Blocked
//
// "photos" is computed from image + otherImages, so it has no path.

const VERIFIED_FIELDS = Object.freeze([
    { key: "street", label: "Street address", path: "street", type: "string", requiredForBrief: true },
    { key: "city", label: "City", path: "city", type: "string", requiredForBrief: true },
    { key: "state", label: "State", path: "state", type: "string", requiredForBrief: true },
    { key: "zipCode", label: "ZIP code", path: "zipCode", type: "string", requiredForBrief: true },
    { key: "propertyType", label: "Property type", path: "propertyType", type: "string", requiredForBrief: true },
    { key: "beds", label: "Bedrooms", path: "beds", type: "number", requiredForBrief: true },
    { key: "baths", label: "Bathrooms", path: "baths", type: "number", requiredForBrief: true },
    { key: "squareFootage", label: "Living area (sq ft)", path: "squareFootage", type: "number", positive: true, requiredForBrief: true },
    { key: "lotSize", label: "Lot size (sq ft)", path: "lotSize", type: "number", positive: true },
    { key: "yearBuilt", label: "Year built", path: "yearBuilt", type: "number", positive: true },
    { key: "occupancyStatus", label: "Occupancy", path: "occupancyStatus", type: "string" },
    { key: "assetType", label: "Asset type", path: "assetType", type: "string" },
    { key: "monthlyHOADues", label: "Monthly HOA dues", path: "monthlyHOADues", type: "number" },
    { key: "startBid", label: "Starting bid", path: "startBid", type: "number", positive: true },
    { key: "viharaEstimate", label: "Vihara estimate", path: "investmentData.valuation.ViharaValue", type: "number", positive: true },
    { key: "rentEstimate", label: "Rent estimate (monthly)", path: "rentEstimate", type: "number", positive: true },
    { key: "rehabEstimate", label: "Rehab estimate", path: "rehabEstimate", type: "number" },
    { key: "auctionStartDate", label: "Auction start date", path: "auctionStartDate", type: "date" },
    { key: "auctionEndDate", label: "Auction end date", path: "auctionEndDate", type: "date" },
    { key: "features", label: "Features", path: "features", type: "list" },
    { key: "photos", label: "Photos", type: "list" },
]);

// Values the importer uses as "unknown" for text fields.
const BLANK_STRING_VALUES = Object.freeze(["", "tbd", "n/a", "na", "unknown"]);

module.exports = { VERIFIED_FIELDS, BLANK_STRING_VALUES };
