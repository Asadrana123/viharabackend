// services/buyerMatch/profiles.js
//
// Turns every lead collection and every property into ONE common shape so the
// scorer never has to care which form a lead came from.
//
// Missing answers stay null — the scorer skips a factor it has no data for
// instead of counting it against the lead.

const EarlyAccessLead = require("../../model/leads/earlyAccessLeadModel");
const GeorgiaStLead = require("../../model/leads/georgiaStLeadModel");
const RensselaerAveLead = require("../../model/leads/rensselaerAveLeadModel");
const PartnerLead = require("../../model/leads/partnerLeadModel");
const PersonaLead = require("../../model/leads/personaLeadModel");
const PropertyLead = require("../../model/leads/propertyLeadModel");
const NorCalLead = require("../../model/leads/norCalLeadModel");
const Product = require("../../model/property/productModel");
const { toStateAbbr, normCounty, normCity, parseLocationText, targetLabel, regionsForProperty } = require("./geo");

// Same rule as the Interested Leads tab: test-named leads never leave the Test
// Leads tab.
const TEST_NAME_REGEX = /\btest\b/i;

// ─── Parsers for the free-text answers ─────────────────────────────────────

/** "$450K" → 450000, "$1.2M" → 1200000, "450,000" → 450000 */
function parseMoney(s) {
  const m = String(s || "").toLowerCase().replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*([km])?/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (m[2] === "k") n *= 1e3;
  if (m[2] === "m") n *= 1e6;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Budget answers → { min, max } (either may be null).
 *   "Under $100K" / "Up to $450K"  → { min: null, max }
 *   "$100K–$500K"                  → { min, max }
 *   "$1M+"                         → { min, max: null }
 */
function parseBudget(text) {
  const t = String(text || "").trim();
  if (!t || /^(any|not sure|flexible)$/i.test(t)) return null;
  const parts = t.split(/\s*(?:–|—|-|to)\s*/i).map(parseMoney).filter(Boolean);
  if (/\+|over|above|more than/i.test(t) && parts.length === 1) return { min: parts[0], max: null };
  if (parts.length >= 2) return { min: Math.min(parts[0], parts[1]), max: Math.max(parts[0], parts[1]) };
  if (parts.length === 1) return { min: null, max: parts[0] };
  return null;
}

/** "3+" → 3, "Any" → null */
function parseMinBeds(text) {
  const m = String(text || "").match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Every form uses its own buyer-type labels; fold them into five categories the
 * scorer understands. Unknown → null (factor skipped).
 */
function normBuyerType(text) {
  const t = String(text || "").toLowerCase();
  if (!t) return null;
  if (/owner|occupant|live in|primary|first.?time|home ?buyer|family/.test(t)) return "owner";
  if (/flip|rehab|wholesal|renovat/.test(t)) return "flipper";
  if (/agent|realtor|broker/.test(t)) return "agent";
  if (/explor|just looking|browsing|curious/.test(t)) return "explorer";
  if (/invest|hold|rental|landlord|cash|diversif|operator|fund|portfolio|institution/.test(t)) return "investor";
  return null;
}

/** NorCal "when" answer → urgency bucket. */
function normTiming(text) {
  const t = String(text || "").toLowerCase();
  if (!t) return null;
  if (/right away|now|asap|immediate/.test(t)) return "now";
  if (/1 to 3|1-3|one to three/.test(t)) return "soon";
  if (/3 to 6|3-6|6\+|later/.test(t)) return "later";
  if (/just looking|browsing|not sure/.test(t)) return "browsing";
  return null;
}

// ─── Properties ────────────────────────────────────────────────────────────

/**
 * The price a buyer should plan around. Auction start bids are often token
 * amounts, so reserve (the seller's floor) is the realistic number; the live
 * bid replaces it once bidding passes it.
 */
function effectivePrice(p) {
  const reserve = Number(p.reservePrice) || 0;
  const current = Math.max(Number(p.currentBid) || 0, Number(p.startBid) || 0);
  if (reserve > 0) return Math.max(reserve, current);
  return current || Number(p.investmentData?.valuation?.ViharaValue) || null;
}

function toPropertyProfile(p) {
  const price = effectivePrice(p);
  const state = toStateAbbr(p.state) || String(p.state || "").toUpperCase();
  const countyKey = normCounty(p.county);
  const value = Number(p.investmentData?.valuation?.ViharaValue) || null;
  const rentAnnual =
    Number(p.investmentData?.rental?.estimatedAnnualRent) ||
    (Number(p.investmentData?.rental?.estimatedMonthlyRent) || 0) * 12 ||
    null;

  return {
    id: String(p._id),
    slug: p.slug || null,
    name: p.productName,
    street: p.street,
    city: p.city,
    state,
    cityKey: normCity(p.city),
    countyKey,
    regions: regionsForProperty({ state, countyKey, zip: p.zipCode }),
    zipCode: p.zipCode,
    image: p.image || (p.otherImages || [])[0] || null,
    price,
    value,
    discount: value && price ? (value - price) / value : null, // + = below market
    rentYield: rentAnnual && price ? rentAnnual / price : null,
    beds: Number(p.beds) || 0,
    baths: Number(p.baths) || 0,
    squareFootage: p.squareFootage,
    propertyType: p.propertyType,
    assetType: p.assetType || null,
    occupancyStatus: p.occupancyStatus || null,
    auctionStartDate: p.auctionStartDate || null,
    auctionEndDate: p.auctionEndDate || null,
    status: p.status,
    sellerIds: (p.sellerIds || []).map(String),
  };
}

/** Only properties a lead could still buy: active/pending and auction not over. */
async function loadPropertyProfiles() {
  const now = new Date();
  const docs = await Product.find({
    status: { $in: ["active", "pending"] },
    $or: [{ auctionEndDate: null }, { auctionEndDate: { $exists: false } }, { auctionEndDate: { $gte: now } }],
  })
    .select(
      "productName slug street city county state zipCode beds baths squareFootage propertyType assetType " +
        "occupancyStatus reservePrice startBid currentBid auctionStartDate auctionEndDate status image otherImages sellerIds " +
        "investmentData.valuation.ViharaValue investmentData.rental.estimatedAnnualRent investmentData.rental.estimatedMonthlyRent"
    )
    .lean();
  return docs.map(toPropertyProfile);
}

// ─── Leads ─────────────────────────────────────────────────────────────────

/** Location targets for a lead who registered on a property page. */
function locationFromProperty(prop) {
  if (!prop) return [];
  return [{ kind: "city", city: prop.cityKey, state: prop.state }];
}

/**
 * Per-source adapters. Each returns the source-specific part of the profile;
 * the shared fields (identity, engagement) are filled in by buildLead().
 */
const SOURCES = [
  {
    leadType: "norcal",
    label: "NorCal Early Access",
    model: NorCalLead,
    adapt: (l) => {
      const where = (l.where || []).flatMap(parseLocationText);
      return {
        // "Anywhere in NorCal" / no area picked → the whole NorCal region.
        locations: where.length ? where : [{ kind: "region", region: "norCal", state: "CA" }],
        budget: parseBudget(l.budget),
        budgetText: l.budget,
        buyerTypeText: l.buyerType,
        minBeds: parseMinBeds(l.bedrooms),
        timing: normTiming(l.when),
        timingText: l.when,
      };
    },
  },
  {
    leadType: "earlyAccess",
    label: "Early Access",
    model: EarlyAccessLead,
    adapt: (l) => ({
      locations: parseLocationText(l.markets),
      budget: parseBudget(l.dealSize),
      budgetText: l.dealSize,
      buyerTypeText: l.buyerType,
    }),
  },
  {
    leadType: "persona",
    label: "Persona",
    model: PersonaLead,
    adapt: (l) => {
      let locations = [];
      if (l.city) locations = [{ kind: "city", city: normCity(l.city), state: toStateAbbr(l.state) }];
      else if (l.state) locations = [{ kind: "state", state: toStateAbbr(l.state) }].filter((t) => t.state);
      if (!locations.length) locations = parseLocationText(l.market);
      return { locations, buyerTypeText: l.buyerType };
    },
  },
  {
    leadType: "partner",
    label: "Partner Program",
    model: PartnerLead,
    adapt: (l) => ({
      locations: parseLocationText(l.primaryMarket),
      buyerTypeText: l.persona,
    }),
  },
  {
    leadType: "property",
    label: "Property Page",
    model: PropertyLead,
    adapt: (l, ctx) => {
      const prop = ctx.findProperty(l.propertySlug);
      const quote = Number(l.quotePrice) || null;
      return {
        locations: locationFromProperty(prop),
        // A quoted price is a real budget signal: allow ~15% headroom above it.
        budget: quote ? { min: null, max: quote * 1.15 } : null,
        budgetText: quote ? `Quoted $${Math.round(quote).toLocaleString("en-US")}` : "",
        buyerTypeText: l.buyerType,
        registeredSlugs: [ctx.findProperty(l.propertySlug)?.slug || l.propertySlug],
      };
    },
  },
  {
    leadType: "georgiaSt",
    label: "449 Georgia St",
    model: GeorgiaStLead,
    adapt: (l, ctx) => ({
      locations: locationFromProperty(ctx.findProperty(l.propertySlug)),
      buyerTypeText: l.buyerType,
      registeredSlugs: [ctx.findProperty(l.propertySlug)?.slug || l.propertySlug],
    }),
  },
  {
    leadType: "rensselaerAve",
    label: "401 Rensselaer Ave",
    model: RensselaerAveLead,
    // The model's default slug says "449-rensselaer-ave" but the property is
    // 401 Rensselaer Ave, so every lead here belongs to that one property.
    adapt: (l, ctx) => {
      const prop = ctx.findProperty("401-rensselaer-ave");
      return {
        locations: locationFromProperty(prop),
        buyerTypeText: l.buyerType,
        registeredSlugs: [prop?.slug || l.propertySlug],
      };
    },
  },
];

function buildLead(source, l, ctx) {
  const specific = source.adapt(l, ctx);
  const name = l.fullName || [l.firstName, l.lastName].filter(Boolean).join(" ");
  const locations = (specific.locations || []).filter(Boolean);

  return {
    key: `${source.leadType}:${l._id}`,
    leadType: source.leadType,
    leadId: String(l._id),
    sourceLabel: source.label,
    name,
    email: l.email || "",
    phone: l.phone || "",
    createdAt: l.createdAt || null,

    locations,
    locationText: locations.map(targetLabel).filter(Boolean).join(" · "),
    budget: specific.budget || null,
    budgetText: specific.budgetText || "",
    buyerType: normBuyerType(specific.buyerTypeText),
    buyerTypeText: specific.buyerTypeText || "",
    minBeds: specific.minBeds || null,
    timing: specific.timing || null,
    timingText: specific.timingText || "",
    registeredSlugs: specific.registeredSlugs || [],

    engagement: {
      connected: l.callStatus === "connected",
      smsConsent: !!l.smsConsent,
      callingStopped: !!l.callingStopped,
    },
  };
}

/**
 * Load every lead from every source as a unified profile.
 * Reads the full product list (not just biddable ones) so leads who registered
 * on a now-closed property still inherit its location.
 */
async function loadLeadProfiles() {
  const allProducts = await Product.find({ slug: { $ne: null } })
    .select("slug city state county")
    .lean();
  const bySlug = new Map(
    allProducts.map((p) => [p.slug, { slug: p.slug, cityKey: normCity(p.city), state: toStateAbbr(p.state) }])
  );
  // Older property pages stored a short slug ("449-georgia-st") while the
  // product's own slug also carries the city ("449-georgia-st-big-bear-lake").
  // Exact match first, then a unique prefix match.
  const findProperty = (slug) => {
    if (!slug) return null;
    if (bySlug.has(slug)) return bySlug.get(slug);
    const hits = allProducts.filter((p) => p.slug.startsWith(`${slug}-`));
    return hits.length === 1 ? bySlug.get(hits[0].slug) : null;
  };
  const ctx = { findProperty };

  const perSource = await Promise.all(
    SOURCES.map(async (source) => {
      const docs = await source.model.find().lean();
      return docs
        .filter((l) => !TEST_NAME_REGEX.test(l.fullName || `${l.firstName || ""} ${l.lastName || ""}`))
        .map((l) => buildLead(source, l, ctx));
    })
  );
  return perSource.flat();
}

module.exports = {
  SOURCES,
  loadPropertyProfiles,
  loadLeadProfiles,
  // exported for tests
  parseBudget,
  parseMoney,
  normBuyerType,
  normTiming,
};
