// services/dealSheet/dealSheetData.js
//
// The data behind a /deal lead's private deal sheet: the `window.DEAL_SHEET` object the website's template
// (vihara-next lib/dealSheet/template.ts) renders, plus the Brevo E1 parameters that repeat its words.
// Figures come only from the deal's inventory record, the same one behind /listing/<slug>:
// market value = investmentData.valuation.ViharaValue, rent = investmentData.rental.estimatedMonthlyRent.
const { DateTime } = require("luxon");
const { resolvePropertyTimezone } = require("../../utils/resolveTimezone");
const { advisorFor, isCashOnly, sheetUrl, bookKey, PREAPPROVAL_URL } = require("../../config/dealSheet");
const { getSiteUrl, listingPageUrl } = require("../../config/siteUrls");

const pos = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Number(n) : null);

// productModel.propertyType → the sheet's hero tag.
const TYPE = {
  "Single Family": "single_family",
  "Condo, Townhouse, other single unit": "condo",
  "Multi-family": "multi_family",
};
// productModel.assetType → the photo tag ("Bank-owned · Online sale").
const SALE_TYPE = { "Reo Bank Owned": "Bank-owned", "Foreclosure Homes": "Foreclosure", "Short Sale": "Short sale" };
// The lead's down payment (buyBox DOWN_PAYMENT values) → the sheet's keys.
const DOWN = { "Under 10%": "under_10", "10-20%": "10_20", "20-30%": "20_30", "30% or more": "30_plus" };

function splitName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
  return { firstName: cap(parts[0] || ""), lastName: parts.slice(1).join(" ") };
}

// "+13105550122" → "(310) 555-0122"; anything else as entered.
function displayPhone(lead) {
  const d = String(lead.phoneNormalized || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return lead.phone || "";
}

/** The deal fields the sheet uses, from the inventory record. */
function dealFields(product) {
  const p = product || {};
  return {
    slug: p.slug,
    street: p.street || p.productName || "",
    city: p.city || "",
    state: p.state || "",
    type: TYPE[p.propertyType] || "",
    saleType: SALE_TYPE[p.assetType] || "",
    beds: pos(p.beds),
    baths: pos(p.baths),
    sqft: pos(p.squareFootage),
    startingBid: pos(p.startBid),
    marketEstimate: pos(p.investmentData?.valuation?.ViharaValue),
    rentEstimate: pos(p.investmentData?.rental?.estimatedMonthlyRent),
    occupancy: p.occupancyStatus || "unknown",
    financeability: p.financeability || "unknown",
    saleStart: p.auctionStartDate ? new Date(p.auctionStartDate).toISOString() : null,
    timezone: resolvePropertyTimezone(p),
    imageUrl: p.image || (Array.isArray(p.otherImages) ? p.otherImages[0] : "") || "",
    cashOnly: isCashOnly(p),
  };
}

/** The buyer's answers in the sheet's terms. */
function answersOf(lead) {
  const financing = lead.needsFinancing === "yes";
  return {
    purpose: lead.purpose || "",
    pay: financing ? "loan" : "cash",
    loanType: financing ? lead.loanType || "" : undefined,
    downPayment: financing ? DOWN[lead.downPayment] || "" : undefined,
    preApproved: financing ? (lead.preApproved === true ? "yes" : "no") : undefined,
    offerPrice: pos(lead.quotePrice),
    timeline: lead.timeline || "",
  };
}

/** `window.DEAL_SHEET` for this lead. */
function buildSheetData(lead, product) {
  const { firstName, lastName } = splitName(lead.fullName);
  return {
    ref: lead.ref,
    bookKey: bookKey(lead.dealSheet?.token),
    signedUpAt: new Date(lead.createdAt || Date.now()).toISOString(),
    buyer: { firstName, lastName, phone: displayPhone(lead), phoneVerified: Boolean(lead.phoneVerifiedAt) },
    answers: answersOf(lead),
    advisor: advisorFor(product),
    deal: dealFields(product),
  };
}

const money = (n) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (n) => `${(Math.round(n * 1000) / 10).toFixed(1).replace(/\.0$/, "")}%`;

/**
 * The sheet's opening line without the name, as plain text (same maths as hook() in the template),
 * e.g. "At $465,000 you'd buy this home about $53,866 under its market value."
 */
function hookLine(sheet) {
  const d = sheet.deal;
  const a = sheet.answers;
  const p = a.offerPrice || d.startingBid;
  if (!p) return "";
  const rent = a.purpose === "rental" || a.purpose === "house_hack";
  if (rent && d.rentEstimate) return `At ${money(p)} this home could rent for about ${money(d.rentEstimate)} a month, a ${pct((d.rentEstimate * 12) / p)} gross yield.`;
  if (a.purpose === "fix_flip" && d.marketEstimate > p) return `At ${money(p)} you'd start with about ${money(d.marketEstimate - p)} of built-in equity, before your renovation.`;
  if (d.marketEstimate > p) return `At ${money(p)} you'd buy this home about ${money(d.marketEstimate - p)} under its market value.`;
  return `Here's ${d.street} at your price.`;
}

/** Sale date − 2 days in the deal's zone, e.g. "Friday, Dec 4" ("" without a sale date). */
function bookByLabel(deal) {
  if (!deal.saleStart) return "";
  return DateTime.fromISO(deal.saleStart, { zone: deal.timezone }).minus({ days: 2 }).toFormat("cccc, LLL d");
}

/** The book-by moment (sale − 2 days), or null. */
function bookByDate(deal) {
  if (!deal.saleStart) return null;
  return new Date(new Date(deal.saleStart).getTime() - 2 * 24 * 60 * 60 * 1000);
}

const ZONE_NAME = {
  "America/New_York": "Eastern Time",
  "America/Detroit": "Eastern Time",
  "America/Chicago": "Central Time",
  "America/Denver": "Mountain Time",
  "America/Phoenix": "Mountain Time",
  "America/Los_Angeles": "Pacific Time",
};

/** e.g. "Sunday, Dec 6, 11:00 AM PST (Pacific Time)". */
function saleTimeLabel(deal) {
  if (!deal.saleStart) return "";
  const dt = DateTime.fromISO(deal.saleStart, { zone: deal.timezone });
  const zone = ZONE_NAME[deal.timezone];
  return `${dt.toFormat("cccc, LLL d, h:mm a ZZZZ")}${zone ? ` (${zone})` : ""}`;
}

const LOAN_NAME = { residential: "home loan", dscr: "rental loan (DSCR)", fix_flip: "fix-and-flip loan" };

/** The sheet's headline number and its words, at their price (same maths as hookLine). */
function headline(sheet) {
  const d = sheet.deal;
  const a = sheet.answers;
  const p = a.offerPrice || d.startingBid;
  if (!p) return {};
  if ((a.purpose === "rental" || a.purpose === "house_hack") && d.rentEstimate)
    return { value: `${money(d.rentEstimate)}/mo`, label: `Estimated rent at your price, a ${pct((d.rentEstimate * 12) / p)} gross yield` };
  if (a.purpose === "fix_flip" && d.marketEstimate > p) return { value: money(d.marketEstimate - p), label: "Built-in equity at your price, before renovation" };
  if (d.marketEstimate > p) return { value: money(d.marketEstimate - p), label: "Under market value at your price" };
  return {};
}

/**
 * The deal sheet email's parameters: template 293 "E1 v2 Deal sheet", Prajwal's field list (21 Nov 2026).
 * Ready-to-print strings; URLs carry no query string (the template adds UTM + ref); CALL_OFFER is a real true for
 * ready-now (30d) buyers and left out otherwise. No advisor photo. Names not on 293's list are dropped by
 * propertyEmailParams.
 */
function emailParams(sheet, lead) {
  const v = sheet.advisor;
  const d = sheet.deal;
  const a = sheet.answers;
  const timeline = a.timeline || "30d";
  const now = timeline === "30d";
  const sale = d.saleStart ? DateTime.fromISO(d.saleStart, { zone: d.timezone }) : null;
  const price = a.offerPrice || d.startingBid;
  const fmt = (n) => (Number.isFinite(n) && n > 0 ? money(n) : undefined);
  const head = headline(sheet);
  return {
    TIMELINE: timeline, // for the timeline:<value> tag
    PROPERTY_SHORT: d.street,
    PROPERTY_NAME: [d.street, d.city, d.state].filter(Boolean).join(", "),
    CITY: [d.city, d.state].filter(Boolean).join(", "),
    IMAGE_URL: d.imageUrl || undefined,
    SLUG: d.slug,
    LISTING_URL: listingPageUrl(d.slug),
    AUCTION_DATE: sale ? sale.toFormat("cccc, LLLL d") : undefined,
    AUCTION_TIME: sale ? sale.toFormat("h:mm a ZZZZ") : undefined,
    SHEET_URL: sheetUrl(lead.dealSheet.token),
    REF: lead.ref,
    CALL_OFFER: now ? true : undefined,
    // The key rides in the path (ref.key), so the link has no "?" and /b/ can still fill in name and email.
    BOOKING_URL: now ? `${getSiteUrl()}/b/${encodeURIComponent(lead.ref)}.${bookKey(lead.dealSheet.token)}` : undefined,
    CALL_HOLD_DATE: now ? bookByLabel(d) || undefined : undefined,
    ADVISOR_NAME: v?.name,
    HEADLINE_VALUE: head.value,
    HEADLINE_LABEL: head.label,
    YOUR_PRICE: fmt(price),
    STARTING_BID: fmt(d.startingBid),
    MARKET_VALUE: fmt(d.marketEstimate),
    PROOF_OF_FUNDS: a.pay === "cash" ? fmt(price) : undefined,
    // Financing buyers' step 2 (Prajwal, 21 Nov 2026): the loan type only, never a lender. PRE_APPROVED is a real
    // true (left out when not). PREAPPROVAL_URL only for buyers not yet pre-approved, once the link is configured.
    LOAN_TYPE: a.pay === "cash" ? undefined : LOAN_NAME[a.loanType] || "loan",
    PRE_APPROVED: a.pay !== "cash" && a.preApproved === "yes" ? true : undefined,
    PREAPPROVAL_URL: a.pay !== "cash" && a.preApproved !== "yes" && PREAPPROVAL_URL ? PREAPPROVAL_URL : undefined,
    FIGURES_DATE: DateTime.fromISO(sheet.signedUpAt, { zone: d.timezone }).toFormat("LLLL d, yyyy"),
  };
}

module.exports = { buildSheetData, dealFields, hookLine, bookByLabel, bookByDate, saleTimeLabel, emailParams, splitName };
