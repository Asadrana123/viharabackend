// services/propertyEmail/propertyEmailParams.js
//
// Builds the Brevo template params (spec section 6, "Email fields by template")
// from a property document. Everything is derived from fields the property
// already has; nothing here is typed in per property:
//
//   PROPERTY_SHORT     street                         "449 Georgia St"
//   PROPERTY_NAME      street, city, state            "449 Georgia St, Big Bear Lake, CA"
//   LISTING_URL        listing page + UTM tags
//   OPENING_BID        startBid                       "$525,000"
//   IMAGE_URL          image
//   FACT_1..3          the first three `features`
//   AUCTION_DATE       auctionStartDate, local        "Saturday, October 17"
//   AUCTION_DATE_SHORT                                "OCT 17"
//   AUCTION_TIME       single-day only                "11 AM to 3 PM PT"
//   MULTI_DAY          "yes" when start and end fall on different local days
//   AUCTION_CLOSE_TEXT auctionEndDate, local          "Saturday, October 17 at 3 PM PT"
//   BOOKING_URL        advisor call (Cal.com) + UTM tags
//   DEAL_2..5_*        the other deals a finder lead picked (dealParams): NAME, BID, DATE, URL
//
// Per recipient (passed in `extra`): FIRSTNAME, QUOTE_AMOUNT, MAYA_CALL_NOW ("yes"
// when Maya is calling as the email goes out), PHONE_LAST4.
//
// "Local" is the property's time zone (resolvePropertyTimezone, from state/ZIP).
// Flags are "yes" or left out — never "no" (templates treat any value as true).
const { DateTime } = require("luxon");
const { resolvePropertyTimezone } = require("../../utils/resolveTimezone");
const { listingPageUrl } = require("../../config/siteUrls");

// Which params each template takes (required + optional). Anything else is
// dropped, so an email never carries fields its template doesn't use.
const OTHER_DEAL_FIELDS = [2, 3, 4, 5].flatMap((n) => ["NAME", "BID", "DATE", "URL"].map((k) => `DEAL_${n}_${k}`));
const TEMPLATE_FIELDS = {
  E1: ["PROPERTY_SHORT", "PROPERTY_NAME", "LISTING_URL", "OPENING_BID", "IMAGE_URL",
    "FACT_1", "FACT_2", "FACT_3", "AUCTION_DATE", "AUCTION_TIME", "QUOTE_AMOUNT", "NOTE",
    "MAYA_CALL_NOW", "PHONE_LAST4", "BOOKING_URL", ...OTHER_DEAL_FIELDS],
  R1: ["PROPERTY_SHORT", "PROPERTY_NAME", "LISTING_URL", "IMAGE_URL", "FACT_1", "FACT_2", "FACT_3",
    "AUCTION_DATE", "AUCTION_TIME", "BOOKING_URL"],
  R2: ["PROPERTY_SHORT", "PROPERTY_NAME", "LISTING_URL", "OPENING_BID", "FACT_1", "FACT_2", "FACT_3",
    "AUCTION_DATE", "AUCTION_TIME", "MULTI_DAY", "AUCTION_CLOSE_TEXT"],
  PT1: ["PROPERTY_SHORT"],
};

const formatMoney = (n) =>
  Number.isFinite(Number(n)) && Number(n) > 0 ? `$${Math.round(Number(n)).toLocaleString("en-US")}` : undefined;

// "PDT"/"PST" → "PT", "EDT" → "ET", ... (the spec writes "11 AM to 3 PM PT").
const zoneLabel = (dt) => dt.toFormat("ZZZZ").replace(/^([A-Z])[SD]T$/, "$1T");

// "11 AM", or "11:30 AM" when there are minutes.
const clock = (dt) => dt.toFormat(dt.minute ? "h:mm a" : "h a");

const firstNameOf = (fullName) => String(fullName || "").trim().split(/\s+/)[0] || undefined;

const withUtm = (url, propertyKey, templateCode) => {
  const qs = new URLSearchParams({
    utm_source: "email",
    utm_medium: "backend",
    utm_campaign: propertyKey,
    utm_content: templateCode,
  });
  return `${url}?${qs.toString()}`;
};

// The spec's PROPERTY_ID: the property's slug (falls back to its _id).
const propertyKeyOf = (property) => property.slug || String(property._id);

// Advisor call booking page (same link the website's thank-you pages use).
const ADVISOR_BOOKING_URL = "https://cal.com/vihara-ai-advisor/walkthrough";

/**
 * "YOU'RE ALSO FOLLOWING" rows in E1: the other deals a finder lead picked
 * (up to 4), as DEAL_2_NAME / _BID / _DATE / _URL ... DEAL_5_*.
 * @param {object[]} deals  productModel docs, in the order they were picked
 */
function dealParams(deals = [], templateCode = "E1") {
  const out = {};
  deals.slice(0, 4).forEach((d, i) => {
    const n = i + 2;
    const zone = resolvePropertyTimezone(d);
    const open = d.auctionStartDate ? DateTime.fromJSDate(new Date(d.auctionStartDate), { zone }) : null;
    out[`DEAL_${n}_NAME`] = [d.street || d.productName, d.city].filter(Boolean).join(", ") || undefined;
    out[`DEAL_${n}_BID`] = formatMoney(d.startBid);
    out[`DEAL_${n}_DATE`] = open && open.isValid ? open.toFormat("ccc, LLL d") : undefined;
    out[`DEAL_${n}_URL`] = d.slug ? withUtm(listingPageUrl(d.slug), propertyKeyOf(d), templateCode) : undefined;
  });
  return out;
}

function auctionParams(property) {
  if (!property.auctionStartDate) return {};
  const zone = resolvePropertyTimezone(property);
  const open = DateTime.fromJSDate(new Date(property.auctionStartDate), { zone });
  if (!open.isValid) return {};

  const params = {
    AUCTION_DATE: open.toFormat("cccc, LLLL d"),
    AUCTION_DATE_SHORT: open.toFormat("LLL d").toUpperCase(),
  };

  const close = property.auctionEndDate
    ? DateTime.fromJSDate(new Date(property.auctionEndDate), { zone })
    : null;
  if (!close || !close.isValid) return params;

  if (open.hasSame(close, "day")) {
    params.AUCTION_TIME = `${clock(open)} to ${clock(close)} ${zoneLabel(close)}`;
  } else {
    params.MULTI_DAY = "yes";
  }
  params.AUCTION_CLOSE_TEXT = `${close.toFormat("cccc, LLLL d")} at ${clock(close)} ${zoneLabel(close)}`;
  return params;
}

/**
 * @param {string} templateCode  E1 | R1 | R2 | PT1
 * @param {object} property      productModel doc (lean or hydrated)
 * @param {object} [extra]       per-recipient fields: FIRSTNAME, QUOTE_AMOUNT (number), ...
 * @returns {object} params for that template, empty values removed
 */
function buildPropertyEmailParams(templateCode, property, extra = {}) {
  const fields = TEMPLATE_FIELDS[templateCode];
  if (!fields) throw new Error(`No field list for template ${templateCode}`);

  const features = Array.isArray(property.features) ? property.features.filter(Boolean) : [];
  const all = {
    PROPERTY_SHORT: property.street || property.productName,
    PROPERTY_NAME: [property.street, property.city, property.state].filter(Boolean).join(", ") || property.productName,
    LISTING_URL: property.slug ? withUtm(listingPageUrl(property.slug), propertyKeyOf(property), templateCode) : undefined,
    OPENING_BID: formatMoney(property.startBid),
    IMAGE_URL: property.image,
    FACT_1: features[0],
    FACT_2: features[1],
    FACT_3: features[2],
    BOOKING_URL: withUtm(ADVISOR_BOOKING_URL, propertyKeyOf(property), templateCode),
    ...auctionParams(property),
    ...extra,
    QUOTE_AMOUNT: formatMoney(extra.QUOTE_AMOUNT),
  };

  const params = { FIRSTNAME: extra.FIRSTNAME };
  for (const f of fields) params[f] = all[f];
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""));
}

module.exports = { buildPropertyEmailParams, dealParams, firstNameOf, propertyKeyOf, TEMPLATE_FIELDS };
