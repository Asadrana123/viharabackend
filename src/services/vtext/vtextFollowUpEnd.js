// services/vtext/vtextFollowUpEnd.js
//
// Ending a follow-up sequence. Database only (no queue or send code), so other
// parts of the app, such as auction registration, can call it without pulling
// in the sending machinery.
const VtextContact = require("../../model/vtext/vtextContactModel");
const PropertyLead = require("../../model/leads/propertyLeadModel");
const { last10 } = require("./vtextRegistrationLookup");

/**
 * Ends an active sequence. Returns true when it was active and is now ended.
 * @param {"replied"|"opted-out"|"cancelled"|"no-response"} status
 */
async function endFollowUp(contactId, status, reason) {
  const set = { "followUp.status": status, "followUp.endedAt": new Date(), "followUp.nextAt": null };
  if (reason) set["followUp.endedReason"] = reason;
  const update = { $set: set };
  if (status === "no-response") update.$addToSet = { tags: "followup-no-response" };
  const result = await VtextContact.updateOne({ _id: contactId, "followUp.status": "active" }, update);
  return result.modifiedCount > 0;
}

/**
 * Called when someone registers to bid: ends the running follow-ups of the
 * contact(s) matching that registration's phone or email, for the same property.
 * @returns {Promise<number>} how many sequences were ended
 */
async function endFollowUpsForRegistration({ auctionId, mobilePhone, email }) {
  if (!auctionId) return 0;
  const candidates = await VtextContact.find({ "followUp.status": "active", "followUp.propertyId": auctionId })
    .select("phoneE164 followUp.leadId")
    .lean();

  const wantedEmail = String(email || "").trim().toLowerCase();
  const wantedPhone = last10(mobilePhone);
  let ended = 0;
  for (const c of candidates) {
    let match = wantedPhone.length === 10 && last10(c.phoneE164) === wantedPhone;
    if (!match && wantedEmail && c.followUp?.leadId) {
      const lead = await PropertyLead.findById(c.followUp.leadId).select("email").lean();
      match = Boolean(lead?.email) && lead.email.trim().toLowerCase() === wantedEmail;
    }
    if (match && (await endFollowUp(c._id, "cancelled", "registered"))) ended += 1;
  }
  return ended;
}

module.exports = { endFollowUp, endFollowUpsForRegistration };
