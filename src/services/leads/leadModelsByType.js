// services/leads/leadModelsByType.js
//
// Extracted from controller/calling/stopCallingController.js (sendify-infra.md
// §6.2 step 3 / §0 item 6) so Vtext's inbound lead-linking can reuse the
// same leadType -> Model map without duplicating it. Keys MUST match
// leadNoteModel.LEAD_TYPES so both systems agree on what a "leadType" is.
//
// Deliberately kept identical in scope to the original (6 of LEAD_TYPES' 7
// entries — "renovationContractor" was never in stopCallingController's map
// either, since renovation contractor requests were never part of the daily
// calling sweep this map was built for). Not expanded here — extraction,
// not a scope change.
//
// "newDeals" added during the main-branch merge (sendify-infra rename vs.
// the New Deals/buyer-match feature landing on main around the same time) —
// origin/main had added it directly into stopCallingController.js's inline
// map, which this file replaced; carried over here so it isn't lost.
const EarlyAccessLead = require("../../model/leads/earlyAccessLeadModel");
const GeorgiaStLead = require("../../model/leads/georgiaStLeadModel");
const RensselaerAveLead = require("../../model/leads/rensselaerAveLeadModel");
const PartnerLead = require("../../model/leads/partnerLeadModel");
const PropertyLead = require("../../model/leads/propertyLeadModel");
const NorCalLead = require("../../model/leads/norCalLeadModel");
const NewDealsLead = require("../../model/leads/newDealsLeadModel");

const MODEL_BY_TYPE = {
  earlyAccess: EarlyAccessLead,
  georgiaSt: GeorgiaStLead,
  rensselaerAve: RensselaerAveLead,
  partner: PartnerLead,
  property: PropertyLead, // unified /auction/:slug leads
  norcal: NorCalLead,     // Northern California early-access leads
  newDeals: NewDealsLead, // /new-deals buy-box leads
};

// Every lead tab's collection, with the label the admin UI shows for it.
// MODEL_BY_TYPE above stays the calling-funnel subset; this is the full set,
// for admin actions that apply to any lead (delete, "everything about this
// person" lookups).
const BuyerListLead = require("../../model/leads/buyerListLeadModel");
const PersonaLead = require("../../model/leads/personaLeadModel");
const RenovationContractorRequest = require("../../model/property/renovationContractorRequestModel");

const ALL_LEAD_SOURCES = {
  earlyAccess:          { model: EarlyAccessLead,             label: "Early Access" },
  georgiaSt:            { model: GeorgiaStLead,               label: "449 Georgia St" },
  rensselaerAve:        { model: RensselaerAveLead,           label: "401 Rensselaer Ave" },
  partner:              { model: PartnerLead,                 label: "Partner Program" },
  property:             { model: PropertyLead,                label: "Property page" },
  norcal:               { model: NorCalLead,                  label: "Northern California" },
  newDeals:             { model: NewDealsLead,                label: "New Deals" },
  buyerList:            { model: BuyerListLead,               label: "Buyer List" },
  persona:              { model: PersonaLead,                 label: "Persona" },
  renovationContractor: { model: RenovationContractorRequest, label: "Renovation Contractors/Vendors" },
};

module.exports = { MODEL_BY_TYPE, ALL_LEAD_SOURCES };
