// services/vtext/vtextRegistrationLookup.js
//
// "Has this person already registered to bid?" The follow-up texts all push
// registration, so they stop once it has happened. A registration
// (model/bidding/auctionRegistration.js) stores free-text phone and an email;
// the Vtext contact has an E.164 phone and a lead with an email, so the match
// is by phone OR email, for the same property. Any status counts (pending,
// approved or rejected): the person has registered, so "register now" is wrong.
const AuctionRegistration = require("../../model/bidding/auctionRegistration");
const PropertyLead = require("../../model/leads/propertyLeadModel");

const last10 = (phone) => String(phone || "").replace(/\D/g, "").slice(-10);

/** Matches the same 10 digits written any way ("+1 (650) 555-1234", "650-555-1234"). Null when the phone is too short. */
function phoneRegex(phone) {
  const digits = last10(phone);
  return digits.length === 10 ? new RegExp(`${digits.split("").join("\\D*")}\\D*$`) : null;
}

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * @param {object} p
 * @param {*} p.propertyId - the property the follow-up is about
 * @param {string} p.phoneE164 - the contact's phone
 * @param {*} [p.leadId] - the landing-page lead, for its email
 */
async function hasRegistered({ propertyId, phoneE164, leadId }) {
  if (!propertyId) return false;
  const or = [];
  const re = phoneRegex(phoneE164);
  if (re) or.push({ mobilePhone: re });
  if (leadId) {
    const lead = await PropertyLead.findById(leadId).select("email").lean();
    if (lead?.email) or.push({ email: new RegExp(`^${escapeRegex(lead.email.trim())}$`, "i") });
  }
  if (!or.length) return false;
  return Boolean(await AuctionRegistration.exists({ auctionId: propertyId, $or: or }));
}

module.exports = { hasRegistered, last10 };
