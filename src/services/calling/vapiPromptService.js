const { DateTime } = require("luxon");
const voicePromptModel = require("../../model/calling/voicePromptModel");

/**
 * Canonical list of variables VAPI substitutes into the prompt at call time.
 * Exposed to the admin UI so the editor can show exactly what is available
 * while the prompt is being written. Keep this in sync with
 * buildVariableValues below — it is the single source of truth.
 */
const PROMPT_VARIABLES = [
  {
    key: "flips_per_year",
    label: "Flips per year (from form)",
    scope: "contact",
    example: "10-50",
  },
  {
    key: "prospect_name",
    label: "Prospect first name",
    scope: "contact",
    example: "Jane",
  },
  {
    key: "prospect_full_name",
    label: "Prospect full name",
    scope: "contact",
    example: "Jane Cooper",
  },
  {
    key: "prospect_research",
    label: "Enrichment summary",
    scope: "contact",
    example: "Prospect name: Jane Cooper. Location: Houston, TX…",
  },
  {
    key: "prospect_address",
    label: "Prospect street address",
    scope: "contact",
    example: "1703 Brookside Pine Ln",
  },
  {
    key: "prospect_city",
    label: "Prospect city",
    scope: "contact",
    example: "Kingwood",
  },
  {
    key: "prospect_state",
    label: "Prospect state",
    scope: "contact",
    example: "TX",
  },
  {
    key: "prospect_markets",
    label: "Prospect markets (early access, from form)",
    scope: "contact",
    example: "Dallas, TX and Kingwood, TX",
  },
  {
    key: "prospect_buyer_type",
    label: "Prospect buyer type (early access, from form)",
    scope: "contact",
    example: "buy-and-hold investor",
  },
  {
    key: "prospect_deal_size",
    label: "Prospect deal size (early access, from form)",
    scope: "contact",
    example: "two hundred fifty thousand to five hundred thousand dollars",
  },
  {
    key: "prospect_quote",
    label: "Prospect price quote (property auction, from form, spoken)",
    scope: "contact",
    example: "nine hundred thousand dollars",
  },
  {
    key: "prospect_where",
    label: "Prospect areas (NorCal buy-box, from form)",
    scope: "contact",
    example: "Central Valley, Sierra foothills",
  },
  {
    key: "prospect_budget",
    label: "Prospect budget (NorCal buy-box, from form, spoken)",
    scope: "contact",
    example: "up to four hundred fifty thousand dollars",
  },
  {
    key: "prospect_bedrooms",
    label: "Prospect bedrooms (NorCal buy-box, from form)",
    scope: "contact",
    example: "3+",
  },
  {
    key: "prospect_timeline",
    label: "Prospect timeline (NorCal buy-box, from form)",
    scope: "contact",
    example: "1 to 3 months",
  },
  {
    key: "current_time_local",
    label: "Caller's local date & time (for booking callbacks)",
    scope: "contact",
    example: "Thursday, October 1, 2026, 2:15 PM (2026-10-01T14:15:00-07:00)",
  },
  {
    key: "caller_timezone",
    label: "Caller's timezone",
    scope: "contact",
    example: "America/Los_Angeles",
  },
  {
    key: "auction_start_local",
    label: "Auction opens (caller's timezone)",
    scope: "property",
    example: "Saturday, October 17 at 11:00 AM their time",
  },
  {
    key: "auction_end_local",
    label: "Auction closes (caller's timezone)",
    scope: "property",
    example: "Saturday, October 17 at 3:15 PM their time",
  },
  {
    key: "property_name",
    label: "Property name",
    scope: "property",
    example: "Kings Point Village Estate",
  },
  {
    key: "property_address",
    label: "Property address",
    scope: "property",
    example: "1703 Brookside Pine Ln, Kingwood, Texas 77345",
  },
  {
    key: "property_type",
    label: "Property type",
    scope: "property",
    example: "5-bedroom 5-bathroom REO Bank Owned Single Family Home",
  },
  {
    key: "property_price",
    label: "Starting bid (spoken)",
    scope: "property",
    example: "eight hundred thousand dollars",
  },
  {
    key: "estimated_arv",
    label: "Vihara estimate (spoken)",
    scope: "property",
    example: "one million thirty seven thousand dollars",
  },
  {
    key: "monthly_rent",
    label: "Estimated monthly rent (spoken)",
    scope: "property",
    example: "four thousand four hundred ninety nine dollars",
  },
  {
    key: "listing_url",
    label: "Listing URL",
    scope: "property",
    example: "vihara.ai/listing/1703-brookside-pine-ln-kingwood",
  },
];

/**
 * The caller's local clock, so Maya can turn "call me at five" into a real
 * time. Unknown / invalid timezone → Eastern, labelled as an assumption.
 */
const callerClock = (timezone) => {
  const zone = String(timezone || "").trim();
  let now = zone ? DateTime.now().setZone(zone) : null;
  const assumed = !now || !now.isValid;
  if (assumed) now = DateTime.now().setZone("America/New_York");
  return {
    current_time_local: `${now.toFormat("cccc, LLLL d, yyyy, h:mm a")} (${now.toISO({ suppressMilliseconds: true })})`,
    caller_timezone: assumed ? "America/New_York (assumed — confirm with the caller if they name a time)" : zone,
  };
};

/**
 * Auction open / close, spoken in the CALLER's timezone. The property scripts
 * are shared by every caller, so the date is a {{placeholder}} filled per call.
 * `window` = { start, end, propertyZone } from the live listing. Unknown caller
 * timezone → the property's own zone, named out loud so it's never ambiguous.
 */
const auctionTimes = (window, callerTz) => {
  if (!window || (!window.start && !window.end)) return { auction_start_local: "", auction_end_local: "" };
  const caller = String(callerTz || "").trim();
  const useCaller = caller && DateTime.now().setZone(caller).isValid;
  const zone = useCaller ? caller : window.propertyZone || "America/New_York";
  const say = (d) => {
    if (!d) return "";
    const dt = DateTime.fromJSDate(new Date(d)).setZone(zone);
    if (!dt.isValid) return "";
    const when = dt.toFormat("cccc, LLLL d 'at' h:mm a");
    return useCaller ? `${when} their time` : `${when} ${dt.toFormat("ZZZZZ")}`;
  };
  const now = Date.now();
  const start = window.start ? new Date(window.start).getTime() : null;
  const end = window.end ? new Date(window.end).getTime() : null;
  if (end && end <= now) return { auction_start_local: "", auction_end_local: "the auction has already closed" };
  return {
    auction_start_local: start && start <= now ? "bidding is already open right now" : say(window.start),
    auction_end_local: say(window.end),
  };
};

/**
 * Build the variableValues payload VAPI substitutes into {{placeholders}}.
 * Every key in PROMPT_VARIABLES must be produced here, even when empty —
 * an absent key leaves a literal "{{var}}" in the spoken output.
 */
const buildVariableValues = (contact = {}, researchSummary = "", property = {}, auctionWindow = null) => ({
  ...auctionTimes(auctionWindow || property.auctionWindow, contact.timezone),
  prospect_state: contact.state || "",
  flips_per_year: contact.flipsPerYear || "",   // ← add this lineX
  prospect_name: (contact.fullName || "").split(" ")[0] || "",
  prospect_full_name: contact.fullName || "",
  prospect_research: researchSummary || "",
  prospect_address: contact.address || "",
  prospect_city: contact.city || "",
  prospect_state: contact.state || "",
  prospect_markets: contact.market || "",
  prospect_buyer_type: contact.buyerType || "",
  prospect_deal_size: contact.dealSize || "",
  prospect_quote: contact.quote || "",
  prospect_where: contact.where || "",
  prospect_budget: contact.budget || "",
  prospect_bedrooms: contact.bedrooms || "",
  prospect_timeline: contact.timeline || "",
  ...callerClock(contact.timezone),

  property_name: property.name || "",
  property_address: property.address || "",
  property_type: property.type || "",
  property_price: property.starting_bid || "",
  estimated_arv: property.estimate || "",
  monthly_rent: property.monthly_rent || "",
  listing_url: property.listing_url || "",
});

/**
 * Preview values for the prompt editor — same shape as buildVariableValues
 * but with the contact half filled from PROMPT_VARIABLES examples, since no
 * real contact exists while the admin is writing.
 */
const buildPreviewValues = (property = {}) => {
  const live = buildVariableValues({}, "", property);
  return PROMPT_VARIABLES.map((v) => ({
    ...v,
    value: v.scope === "property" ? live[v.key] || "" : v.example,
  }));
};

/**
 * Load the prompt for a property. There is no global fallback by design —
 * a property without an authored prompt cannot be called.
 */
const resolvePromptConfig = async (propertyId) => {
  if (!propertyId) {
    const err = new Error("A property must be selected before dispatching a call");
    err.statusCode = 400;
    throw err;
  }

  const prompt = await voicePromptModel.findOne({ propertyId }).lean();

  if (!prompt || !prompt.systemPrompt) {
    const err = new Error(
      "No voice prompt has been written for this property yet. Add one in the Prompt tab before calling."
    );
    err.statusCode = 422;
    throw err;
  }

  return {
    systemPrompt: prompt.systemPrompt,
    firstMessage: prompt.firstMessage || "",
    voicemailMessage: prompt.voicemailMessage || "",
    endCallMessage: prompt.endCallMessage || "",
  };
};

module.exports = {
  PROMPT_VARIABLES,
  buildVariableValues,
  buildPreviewValues,
  resolvePromptConfig,
};
