// services/vtext/vtextLeadLookupService.js
//
// Phone -> lead lookup, shared by both directions of contact creation
// (inboundWorker.js, extracted from where this used to live private to it;
// vtextMessageService.js's enqueueOutbound, which never did this lookup at
// all before — found as a real gap: an admin bulk-sending to numbers that
// ARE leads got zero consent-inheritance or name on the outbound side,
// unlike inbound's contacts, which always did). One shared implementation so
// both directions agree on what "this phone is a known lead" means.
//
// Also the lead -> Vtext side used by the Leads tab's "Text this lead":
// resolveLead() loads one lead by (leadType, leadId), and leadConsent() says
// whether that lead carries texting consent.
const { MODEL_BY_TYPE, ALL_LEAD_SOURCES } = require("../leads/leadModelsByType");
const { toUsSmsNumber } = require("../../utils/usPhone");
const { priceRangeOf } = require("../leads/facebookPriceRange");

/** Most lead schemas use `fullName`; partnerLeadModel is the one exception (firstName + lastName). */
function leadName(lead) {
  if (!lead) return "";
  if (lead.fullName) return lead.fullName;
  return [lead.firstName, lead.lastName].filter(Boolean).join(" ");
}

/**
 * Does this lead carry texting consent, and where from?
 *  - the SMS opt-in checkbox (smsConsent) on the landing-page forms, or
 *  - a Facebook / Instagram form whose disclaimer says the person agrees to calls / texts
 *    (consent + consentSource "form-disclaimer", set by facebookFormLeadService).
 * @returns {{ consented: boolean, at?: Date, text?: string }}
 */
function leadConsent(leadType, lead) {
  if (!lead) return { consented: false };
  if (lead.smsConsent === true) {
    return { consented: true, at: lead.smsConsentAt, text: lead.smsConsentText };
  }
  if (leadType === "facebookForm" && lead.consent === true && lead.consentSource === "form-disclaimer") {
    return { consented: true, at: lead.consentTimestamp, text: lead.consentText };
  }
  return { consented: false };
}

const CONSENT_FIELDS = "_id fullName firstName lastName smsConsent smsConsentText smsConsentAt consent consentText consentTimestamp consentSource";

/** Looks a phone up across every linked lead collection; returns every match (a number rarely appears in more than one source, but nothing stops it). */
async function findLeadRefs(phoneE164) {
  const refs = [];
  for (const [leadType, Model] of Object.entries(MODEL_BY_TYPE)) {
    try {
      const lead = await Model.findOne({ phoneNormalized: phoneE164 }).select(CONSENT_FIELDS).lean();
      if (lead) {
        refs.push({ leadType, leadId: lead._id, lead, name: leadName(lead), consent: leadConsent(leadType, lead) });
      }
    } catch (err) {
      console.error(`[vtext lead lookup] failed for ${leadType}:`, err.message);
    }
  }
  return refs;
}

/** The contact's `consent` object for a lead that gives consent (see leadConsent). */
function consentFromRef(ref) {
  return {
    status: "opted-in",
    source: "lead-form",
    capturedAt: ref.consent.at || new Date(),
    consentText: ref.consent.text,
    evidence: { leadType: ref.leadType, leadId: ref.leadId },
  };
}

/**
 * An existing contact whose consent is still "unknown" (e.g. created by an earlier send before its
 * lead's consent counted) picks the consent up from a matching lead. Never touches a contact that
 * has opted in or out. Returns true when the contact was changed (and saved).
 */
async function applyLeadConsent(contact, leadRefs) {
  if (!contact || contact.optOut?.isOptedOut) return false;
  if (contact.consent?.status && contact.consent.status !== "unknown") return false;
  const ref = leadRefs.find((r) => r.consent.consented);
  if (!ref) return false;
  contact.consent = consentFromRef(ref);
  contact.consentEvents = [...(contact.consentEvents || []), { type: "opt-in", method: "lead-form" }];
  const known = new Set((contact.leadRefs || []).map((r) => `${r.leadType}:${r.leadId}`));
  for (const r of leadRefs) {
    if (!known.has(`${r.leadType}:${r.leadId}`)) contact.leadRefs.push({ leadType: r.leadType, leadId: r.leadId });
  }
  await contact.save();
  return true;
}

/**
 * One lead by (leadType, leadId), from any lead collection, ready for texting.
 * @returns {Promise<null | { leadType, leadId, lead, name, phone, consent, priceRange }>} null when there is no such lead;
 *          `phone` is null when it has no valid US number.
 */
async function resolveLead(leadType, leadId) {
  const source = ALL_LEAD_SOURCES[leadType];
  if (!source || !leadId) return null;
  let lead;
  try {
    lead = await source.model.findById(leadId).lean();
  } catch {
    return null; // not a valid ObjectId
  }
  if (!lead) return null;
  return {
    leadType,
    leadId: lead._id,
    lead,
    name: leadName(lead) || lead.name || "",
    phone: toUsSmsNumber(lead.phoneNormalized) || toUsSmsNumber(lead.phone),
    consent: leadConsent(leadType, lead),
    priceRange: leadType === "facebookForm" ? priceRangeOf(lead) || "" : "",
  };
}

module.exports = { findLeadRefs, leadName, leadConsent, consentFromRef, applyLeadConsent, resolveLead };
