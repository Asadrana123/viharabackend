const voicePromptModel = require("../model/voicePromptModel");

/**
 * Canonical list of variables VAPI substitutes into the prompt at call time.
 * Exposed to the admin UI so the editor can show exactly what is available
 * while the prompt is being written. Keep this in sync with
 * buildVariableValues below — it is the single source of truth.
 */
const PROMPT_VARIABLES = [
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
 * Build the variableValues payload VAPI substitutes into {{placeholders}}.
 * Every key in PROMPT_VARIABLES must be produced here, even when empty —
 * an absent key leaves a literal "{{var}}" in the spoken output.
 */
const buildVariableValues = (contact = {}, researchSummary = "", property = {}) => ({
  prospect_name: (contact.fullName || "").split(" ")[0] || "",
  prospect_full_name: contact.fullName || "",
  prospect_research: researchSummary || "",
  prospect_address: contact.address || "",
  prospect_city: contact.city || "",
  prospect_state: contact.state || "",

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
