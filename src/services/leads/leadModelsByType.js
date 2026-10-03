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
const EarlyAccessLead = require("../../model/leads/earlyAccessLeadModel");
const GeorgiaStLead = require("../../model/leads/georgiaStLeadModel");
const RensselaerAveLead = require("../../model/leads/rensselaerAveLeadModel");
const PartnerLead = require("../../model/leads/partnerLeadModel");
const PropertyLead = require("../../model/leads/propertyLeadModel");
const NorCalLead = require("../../model/leads/norCalLeadModel");

const MODEL_BY_TYPE = {
  earlyAccess: EarlyAccessLead,
  georgiaSt: GeorgiaStLead,
  rensselaerAve: RensselaerAveLead,
  partner: PartnerLead,
  property: PropertyLead, // unified /auction/:slug leads
  norcal: NorCalLead,     // Northern California early-access leads
};

module.exports = { MODEL_BY_TYPE };
