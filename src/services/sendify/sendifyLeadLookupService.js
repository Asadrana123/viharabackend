// services/sendify/sendifyLeadLookupService.js
//
// Phone -> lead lookup, shared by both directions of contact creation
// (inboundWorker.js, extracted from where this used to live private to it;
// sendifyMessageService.js's enqueueOutbound, which never did this lookup at
// all before — found as a real gap: an admin bulk-sending to numbers that
// ARE leads got zero consent-inheritance or name on the outbound side,
// unlike inbound's contacts, which always did). One shared implementation so
// both directions agree on what "this phone is a known lead" means.
const { MODEL_BY_TYPE } = require("../leads/leadModelsByType");

/** Most lead schemas use `fullName`; partnerLeadModel is the one exception (firstName + lastName). */
function leadName(lead) {
  if (!lead) return "";
  if (lead.fullName) return lead.fullName;
  return [lead.firstName, lead.lastName].filter(Boolean).join(" ");
}

/** Looks a phone up across every linked lead collection; returns every match (a number rarely appears in more than one source, but nothing stops it). */
async function findLeadRefs(phoneE164) {
  const refs = [];
  for (const [leadType, Model] of Object.entries(MODEL_BY_TYPE)) {
    try {
      const lead = await Model.findOne({ phoneNormalized: phoneE164 })
        .select("_id fullName firstName lastName smsConsent smsConsentText smsConsentAt")
        .lean();
      if (lead) {
        refs.push({ leadType, leadId: lead._id, lead, name: leadName(lead) });
      }
    } catch (err) {
      console.error(`[sendify lead lookup] failed for ${leadType}:`, err.message);
    }
  }
  return refs;
}

module.exports = { findLeadRefs, leadName };
