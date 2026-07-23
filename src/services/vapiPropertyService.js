const mongoose = require("mongoose");
const productModel = require("../model/productModel");
const { PROPERTY: DEFAULT_PROPERTY } = require("./vapiService");

// ─── Listing URLs ─────────────────────────────────────────────────────────────
// productModel has no slug field, and an ObjectId read aloud is unusable.
// Map _id → landing page slug as you build them. Unmapped properties fall back
// to the site root so the agent never reads out a broken URL.
const LISTING_SLUGS = {
  // "68a4c9...": "oakland-auction",
};

const SITE_DOMAIN = "vihara.ai";

// ─── Speech-friendly labels ───────────────────────────────────────────────────
const PROPERTY_TYPE_SPEECH = {
  "Single Family": "Single Family Home",
  "Condo, Townhouse, other single unit": "Townhome",
  "Multi-family": "Multi-Family Property",
  Land: "Lot",
};

const ASSET_TYPE_SPEECH = {
  "Reo Bank Owned": "REO Bank Owned",
  "Foreclosure Homes": "Foreclosure",
  "Short Sale": "Short Sale",
};

const US_STATES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "Washington D C",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

// ─── Number → words ───────────────────────────────────────────────────────────
// VAPI reads variableValues aloud verbatim, so currency must be spelled out.
// "300000" would be read digit-by-digit; "three hundred thousand" reads correctly.

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen",
];

const TENS = [
  "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy",
  "eighty", "ninety",
];

const SCALES = [
  { value: 1000000000, name: "billion" },
  { value: 1000000, name: "million" },
  { value: 1000, name: "thousand" },
];

/** Convert 0–999 to words. */
function hundredsToWords(n) {
  const parts = [];

  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} hundred`);
    n %= 100;
  }

  if (n >= 20) {
    const tens = TENS[Math.floor(n / 10)];
    const ones = n % 10;
    parts.push(ones ? `${tens} ${ONES[ones]}` : tens);
  } else if (n > 0) {
    parts.push(ONES[n]);
  }

  return parts.join(" ");
}

function numberToWords(value) {
  let n = Math.round(Number(value) || 0);
  if (n <= 0) return "zero";

  const parts = [];
  for (const { value: scale, name } of SCALES) {
    if (n >= scale) {
      parts.push(`${hundredsToWords(Math.floor(n / scale))} ${name}`);
      n %= scale;
    }
  }
  if (n > 0) parts.push(hundredsToWords(n));

  return parts.join(" ");
}

/** Returns "" for missing/zero amounts so the caller can decide on a fallback. */
function dollarsToWords(amount) {
  const n = Number(amount);
  if (!n || n <= 0) return "";
  return `${numberToWords(n)} dollars`;
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

function buildAddress(product) {
  const state = US_STATES[String(product.state || "").toUpperCase()] || product.state;
  return [product.street, product.city, `${state} ${product.zipCode || ""}`.trim()]
    .filter(Boolean)
    .join(", ");
}

function buildType(product) {
  const asset = ASSET_TYPE_SPEECH[product.assetType] || product.assetType || "";
  const type = PROPERTY_TYPE_SPEECH[product.propertyType] || product.propertyType || "";

  return [
    product.beds ? `${product.beds}-bedroom` : "",
    product.baths ? `${product.baths}-bathroom` : "",
    asset,
    type,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildListingUrl(product) {
  const slug = LISTING_SLUGS[String(product._id)];
  return slug ? `${SITE_DOMAIN}/listing/${slug}` : SITE_DOMAIN;
}

/**
 * Map a productModel document into the PROPERTY shape dispatchCall expects.
 * Currency fields are spelled out for text-to-speech.
 */
function mapProductToProperty(product) {
  const valuation = product.investmentData?.valuation || {};
  const rental = product.investmentData?.rental || {};

  const startingBid = dollarsToWords(product.startBid);
  const estimate = dollarsToWords(valuation.ViharaValue || valuation.highRange);
  const monthlyRent = dollarsToWords(
    rental.estimatedMonthlyRent || rental.rentalValue
  );

  if (!estimate) {
    console.warn(
      `⚠️  Property ${product._id} has no ViharaValue — estimated_arv will be empty on the call.`
    );
  }

  return {
    id: String(product._id),
    name: product.productName,
    address: buildAddress(product),
    type: buildType(product),
    starting_bid: startingBid,
    estimate,
    monthly_rent: monthlyRent,
    listing_url: buildListingUrl(product),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

const PROPERTY_FIELDS = [
  "productName", "street", "city", "state", "zipCode",
  "beds", "baths", "assetType", "propertyType", "startBid",
  "investmentData.valuation", "investmentData.rental",
].join(" ");

/**
 * Resolve the property a campaign should pitch.
 * Falls back to the hardcoded default when no propertyId is supplied,
 * preserving the previous behaviour.
 */
const resolveProperty = async (propertyId) => {
  if (!propertyId) return DEFAULT_PROPERTY;

  if (!mongoose.Types.ObjectId.isValid(propertyId)) {
    const err = new Error("Invalid property id");
    err.statusCode = 400;
    throw err;
  }

  const product = await productModel
    .findById(propertyId)
    .select(PROPERTY_FIELDS)
    .lean();

  if (!product) {
    const err = new Error("Property not found");
    err.statusCode = 404;
    throw err;
  }

  if (!product.startBid) {
    const err = new Error(
      `"${product.productName}" has no starting bid set — cannot pitch it on a call.`
    );
    err.statusCode = 422;
    throw err;
  }

  return mapProductToProperty(product);
};

module.exports = {
  resolveProperty,
  mapProductToProperty,
  numberToWords,
  dollarsToWords,
};