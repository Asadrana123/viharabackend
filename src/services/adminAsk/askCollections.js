// services/adminAsk/askCollections.js
//
// The catalog of collections the admin "Ask AI" / global search may READ.
// Anything not listed here is invisible to it. Each entry says:
//   key            name Claude and the frontend use for the collection
//   model          the Mongoose model
//   description    one line for Claude: what a record in here is
//   searchFields   text fields the global search box matches against
//   phoneFields    phone fields (matched digit-by-digit, so any format hits)
//   defaultExclude fields left out of list results by default (big or noisy);
//                  still readable through get_record unless SENSITIVE
//   title / subtitle  how one record is labelled in search results
//   link           admin-panel query string that opens the right screen
//
// SENSITIVE_FIELDS are never returned, filtered, sorted or grouped on — not
// even through get_record — so a question can't leak or probe them.

const User = require("../../model/users/userModel");
const Product = require("../../model/property/productModel");
const AuctionRegistration = require("../../model/bidding/auctionRegistration");
const ManualBid = require("../../model/bidding/manualBiddingModel");
const PropertyLead = require("../../model/leads/propertyLeadModel");
const EarlyAccessLead = require("../../model/leads/earlyAccessLeadModel");
const GeorgiaStLead = require("../../model/leads/georgiaStLeadModel");
const RensselaerAveLead = require("../../model/leads/rensselaerAveLeadModel");
const PartnerLead = require("../../model/leads/partnerLeadModel");
const NorCalLead = require("../../model/leads/norCalLeadModel");
const BuyerListLead = require("../../model/leads/buyerListLeadModel");
const NewDealsLead = require("../../model/leads/newDealsLeadModel");
const PersonaLead = require("../../model/leads/personaLeadModel");
const LandingPageLead = require("../../model/leads/landingPageLeadModel");
const RenovationContractorRequest = require("../../model/property/renovationContractorRequestModel");
const Rb2bVisitor = require("../../model/leads/rb2bVisitorModel");
const CallLog = require("../../model/calling/callLogModel");
const LeadNote = require("../../model/leads/leadNoteModel");
const Realtor = require("../../model/users/realtorModel");
const SellerForm = require("../../model/property/sellingModel");
const PropertySubmission = require("../../model/property/propertySubmissionModel");

const SENSITIVE_FIELDS = new Set([
  "password",
  "resetPasswordToken",
  "resetPasswordExpire",
]);

// Noise every lead funnel carries (tracking ids, consent legalese, raw enrichment).
const LEAD_NOISE = ["consentText", "smsConsentText", "eventId", "enrichment", "fbp", "fbc", "attribution", "__v"];

const fullName = (d) =>
  d.fullName || [d.firstName, d.lastName].filter(Boolean).join(" ") || d.name || "(no name)";
const contact = (d) => [d.email, d.phone].filter(Boolean).join(" · ");
const leadsLink = (source) => () => `?tab=leads&source=${source}`;

const COLLECTIONS = [
  {
    key: "users",
    model: User,
    description: "Website accounts (buyers, agents, sellers, admins). role = user | admin | seller.",
    searchFields: ["name", "last_name", "email", "city"],
    phoneFields: ["businessPhone"],
    defaultExclude: ["consents", "savedProperties", "__v"],
    title: (d) => [d.name, d.last_name].filter(Boolean).join(" "),
    subtitle: (d) => [d.email, d.role].filter(Boolean).join(" · "),
    // No user-management screen in the admin panel any more.
    link: () => null,
  },
  {
    key: "properties",
    model: Product,
    description:
      "Auction properties / listings. status = active | sold | cancelled | pending. currentBid is the live high bid. slug links to propertyLeads.propertySlug.",
    searchFields: ["productName", "street", "city", "county", "state", "zipCode", "apn", "slug", "trusteeSaleNumber"],
    defaultExclude: [
      "propertyDescription", "otherImages", "threeDTourMetadata", "coordinates", "propertyDetails",
      "investmentData", "marketInsights", "schools", "walkScores", "comparableMarket", "areaStatistics",
      "marketSync", "bidderEmails", "allowedTestUsers", "features", "__v",
    ],
    title: (d) => d.productName || [d.street, d.city].filter(Boolean).join(", "),
    subtitle: (d) => [d.street, d.city, d.state, d.status].filter(Boolean).join(" · "),
    link: () => "?tab=manageListings",
  },
  {
    key: "auctionRegistrations",
    model: AuctionRegistration,
    description:
      "A user's registration to bid on one auction. auctionId -> properties._id, userId -> users._id. status = pending | approved | rejected.",
    searchFields: ["firstName", "lastName", "email", "address", "showcaseSlug"],
    phoneFields: ["mobilePhone"],
    defaultExclude: ["__v"],
    title: fullName,
    subtitle: (d) => [d.email, d.status].filter(Boolean).join(" · "),
    link: () => "?tab=Auction Registrations",
  },
  {
    key: "bids",
    model: ManualBid,
    description: "Individual bids. auctionId -> properties._id, userId -> users._id, amount in dollars.",
    searchFields: [],
    defaultExclude: ["__v"],
    title: (d) => `Bid $${d.amount}`,
    subtitle: (d) => (d.createdAt ? new Date(d.createdAt).toISOString().slice(0, 10) : ""),
    link: () => "?tab=manageBids",
  },
  {
    key: "propertyLeads",
    model: PropertyLead,
    description:
      "Leads from every /auction/:slug property landing page (the current, unified lead collection). propertySlug -> properties.slug. quotePrice = price the buyer quoted.",
    searchFields: ["fullName", "email", "propertySlug", "buyerType"],
    phoneFields: ["phone", "phoneNormalized"],
    defaultExclude: LEAD_NOISE,
    title: fullName,
    subtitle: (d) => [contact(d), d.propertySlug].filter(Boolean).join(" · "),
    link: (d) => `?tab=leads&source=property${d.propertySlug ? `&slug=${encodeURIComponent(d.propertySlug)}` : ""}`,
  },
  {
    key: "earlyAccessLeads",
    model: EarlyAccessLead,
    description: "Early-access signup leads (markets, buyerType, dealSize).",
    searchFields: ["fullName", "email", "markets", "buyerType"],
    phoneFields: ["phone", "phoneNormalized"],
    defaultExclude: LEAD_NOISE,
    title: fullName,
    subtitle: contact,
    link: leadsLink("earlyAccess"),
  },
  {
    key: "georgiaStLeads",
    model: GeorgiaStLead,
    description: "Legacy leads for the 449 Georgia St auction page (before propertyLeads existed).",
    searchFields: ["fullName", "email"],
    phoneFields: ["phone", "phoneNormalized"],
    defaultExclude: LEAD_NOISE,
    title: fullName,
    subtitle: contact,
    link: leadsLink("georgiaSt"),
  },
  {
    key: "rensselaerAveLeads",
    model: RensselaerAveLead,
    description: "Legacy leads for the 401 Rensselaer Ave auction page (before propertyLeads existed).",
    searchFields: ["fullName", "email"],
    phoneFields: ["phone", "phoneNormalized"],
    defaultExclude: LEAD_NOISE,
    title: fullName,
    subtitle: contact,
    link: leadsLink("rensselaerAve"),
  },
  {
    key: "partnerLeads",
    model: PartnerLead,
    description: "Partner-program leads (primaryMarket, persona).",
    searchFields: ["firstName", "lastName", "email", "primaryMarket", "persona"],
    phoneFields: ["phone", "phoneNormalized"],
    defaultExclude: LEAD_NOISE,
    title: fullName,
    subtitle: contact,
    link: leadsLink("partner"),
  },
  {
    key: "norCalLeads",
    model: NorCalLead,
    description: "Northern California early-access leads (where, budget, bedrooms, when).",
    searchFields: ["fullName", "email", "market", "budget"],
    phoneFields: ["phone", "phoneNormalized"],
    defaultExclude: LEAD_NOISE,
    title: fullName,
    subtitle: contact,
    link: leadsLink("norcal"),
  },
  {
    key: "buyerListLeads",
    model: BuyerListLead,
    description: "Buyer-list signups with a buyBox (strategy, property_type, states, cities, price range) and tier A/B/C.",
    searchFields: ["fullName", "firstName", "lastName", "email"],
    phoneFields: ["phone", "phoneNormalized"],
    defaultExclude: [...LEAD_NOISE, "firstTouch", "lastTouch", "smsConsentVersion"],
    title: fullName,
    subtitle: contact,
    link: leadsLink("buyerList"),
  },
  {
    key: "newDealsLeads",
    model: NewDealsLead,
    description: "New-deals signups with a buyBox, tier A/B/C, dealInterest and contactPreference.",
    searchFields: ["fullName", "firstName", "lastName", "email", "dealInterest"],
    phoneFields: ["phone", "phoneNormalized"],
    defaultExclude: [...LEAD_NOISE, "firstTouch", "lastTouch", "consentVersion"],
    title: fullName,
    subtitle: contact,
    link: leadsLink("newDeals"),
  },
  {
    key: "personaLeads",
    model: PersonaLead,
    description: "Persona landing-page leads (market, city, state, buyerType, dealsClosed).",
    searchFields: ["fullName", "email", "market", "city", "state"],
    phoneFields: ["phone"],
    defaultExclude: LEAD_NOISE,
    title: fullName,
    subtitle: contact,
    link: leadsLink("persona"),
  },
  {
    key: "landingPageLeads",
    model: LandingPageLead,
    description: "Older generic landing-page leads (name, email, phone, utm_*).",
    searchFields: ["name", "email"],
    phoneFields: ["phone"],
    defaultExclude: ["__v"],
    title: fullName,
    subtitle: contact,
    link: () => null,
  },
  {
    key: "renovationContractorLeads",
    model: RenovationContractorRequest,
    description: "Renovation contractor/vendor requests. propertyId -> properties._id.",
    searchFields: ["name", "email", "selectedArea"],
    phoneFields: ["phone"],
    defaultExclude: ["consentText", "__v"],
    title: fullName,
    subtitle: contact,
    link: leadsLink("renovationContractor"),
  },
  {
    key: "rb2bVisitors",
    model: Rb2bVisitor,
    description: "Identified website visitors from RB2B (person + company, pages visited, visitCount).",
    searchFields: ["firstName", "lastName", "businessEmail", "companyName", "title", "city", "state"],
    defaultExclude: ["raw", "capturedPages", "__v"],
    title: fullName,
    subtitle: (d) => [d.businessEmail, d.companyName].filter(Boolean).join(" · "),
    link: () => "?tab=rb2bVisitors",
  },
  {
    key: "callLogs",
    model: CallLog,
    description:
      "One record per completed AI voice call. phone matches the lead's phone. summary = short AI summary of the call; transcript = full text (only via get_record).",
    searchFields: ["fullName", "summary", "source"],
    phoneFields: ["phone"],
    defaultExclude: ["transcript", "structuredData", "recordingUrl", "vapiCallId", "__v"],
    title: fullName,
    subtitle: (d) => [d.phone, d.startedAt ? new Date(d.startedAt).toISOString().slice(0, 10) : ""].filter(Boolean).join(" · "),
    link: () => "?tab=voiceAgent",
  },
  {
    key: "leadNotes",
    model: LeadNote,
    description: "Notes advisors wrote on leads. leadType names the lead collection, leadId is that lead's _id.",
    searchFields: ["text", "advisorName"],
    defaultExclude: ["__v"],
    title: (d) => (d.text || "").slice(0, 80),
    subtitle: (d) => [d.advisorName, d.leadType].filter(Boolean).join(" · "),
    link: () => null,
  },
  {
    key: "realtors",
    model: Realtor,
    description: "Partner realtors with a showcase page (slug), status and assigned properties.",
    searchFields: ["name", "email", "company", "licenseNumber", "slug"],
    phoneFields: ["phone"],
    defaultExclude: ["bio", "image", "__v"],
    title: (d) => d.name,
    subtitle: (d) => [d.email, d.company, d.status].filter(Boolean).join(" · "),
    link: () => "?tab=manageRealtors",
  },
  {
    key: "sellerForms",
    model: SellerForm,
    description: "'Sell your property' form submissions from owners.",
    searchFields: ["firstName", "lastName", "email", "propertyAddress", "city", "state", "zip"],
    phoneFields: ["phoneNumber"],
    defaultExclude: ["__v"],
    title: fullName,
    subtitle: (d) => [d.email, d.propertyAddress].filter(Boolean).join(" · "),
    link: () => null,
  },
  {
    key: "propertySubmissions",
    model: PropertySubmission,
    description: "Properties realtors submitted for review. reviewStatus tracks approval; publishedProductId -> properties._id.",
    searchFields: ["productName", "street", "city", "state", "zipCode"],
    defaultExclude: ["propertyDescription", "otherImages", "__v"],
    title: (d) => d.productName || [d.street, d.city].filter(Boolean).join(", "),
    subtitle: (d) => [d.city, d.state, d.reviewStatus].filter(Boolean).join(" · "),
    link: () => "?tab=manageRealtors",
  },
];

const BY_KEY = new Map(COLLECTIONS.map((c) => [c.key, c]));

function getCollection(key) {
  const entry = BY_KEY.get(key);
  if (!entry) {
    throw new Error(`Unknown collection "${key}". Valid: ${COLLECTIONS.map((c) => c.key).join(", ")}`);
  }
  return entry;
}

// True when a dotted path is or sits under a sensitive field.
function isSensitivePath(path) {
  return String(path).split(".").some((part) => SENSITIVE_FIELDS.has(part));
}

// "fieldName: Type (enum: a | b)" lines for Claude, built from the live schemas
// so the catalog never drifts from the models. Deterministic order keeps the
// system prompt byte-stable for prompt caching.
function describeFields(entry) {
  const lines = [];
  const skip = new Set(entry.defaultExclude || []);
  entry.model.schema.eachPath((path, type) => {
    if (path === "__v" || isSensitivePath(path)) return;
    const top = path.split(".")[0];
    // Skip internals of big nested blobs; the top-level name is enough.
    if (skip.has(top) && path !== top) return;
    if (path.split(".").length > 2) return;
    let line = `${path}: ${type.instance}`;
    const enumValues = type.enumValues || (type.caster && type.caster.enumValues);
    if (enumValues && enumValues.length) line += ` (${enumValues.join(" | ")})`;
    lines.push(line);
  });
  return lines;
}

function catalogText() {
  return COLLECTIONS.map((entry) => {
    return [
      `## ${entry.key}`,
      entry.description,
      `Fields: ${describeFields(entry).join("; ")}`,
    ].join("\n");
  }).join("\n\n");
}

module.exports = {
  COLLECTIONS,
  SENSITIVE_FIELDS,
  getCollection,
  isSensitivePath,
  catalogText,
};
