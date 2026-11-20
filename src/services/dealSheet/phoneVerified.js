// services/dealSheet/phoneVerified.js
//
// lead.phone_verified: what happens when a /deal buyer confirms their number (the code, or opening the texted link).
//   1. Maya's sign-up call goes straight away (consent box ticked, not already called).
//   2. The deal sheet is rebuilt so the ✓ shows (not emailed again).
//   3. A line in the leads Slack channel, so the founders see it.
const PropertyLead = require("../../model/leads/propertyLeadModel");
const { markVerified } = require("./phoneCodeService");
const { placeDealSignupCall } = require("./dealSignupCall");
const { onPhoneVerified } = require("./dealSheetService");
const { postToSlack } = require("../shared/slackService");
const { maskPhone } = require("../../utils/maskPii");

const READY = { "30d": "Now, at this sale", "90d": "In the next 3 months", "180d": "In 3 to 6 months", looking: "Just looking" };

/**
 * Confirm the lead's number and run the follow-ups. Never throws.
 * @returns {Promise<boolean>} true when this call confirmed it
 */
async function confirmPhone(leadId, method) {
  try {
    const confirmed = await markVerified(leadId, method);
    if (!confirmed) return false;
    const lead = await PropertyLead.findById(leadId).lean();
    if (!lead || lead.isQaTest) return true;
    console.log(`[deal-sheet] phone confirmed (${method}) for lead ${lead._id} ${maskPhone(lead.phoneNormalized)}`);

    const called = await placeDealSignupCall(lead._id).catch((e) => {
      console.error(`[deal-sheet] call after confirm failed for ${lead._id}:`, e.message);
      return false;
    });
    onPhoneVerified(lead._id).catch(() => {});

    const webhook = process.env.SLACK_LEADS_WEBHOOK_URL;
    if (webhook) {
      const how = method === "code" ? "entered the code" : "opened the texted link";
      const lines = [
        `✅ *Phone confirmed* · ${lead.fullName} · ${lead.propertySlug} (${how})`,
        `Ready to buy: ${READY[lead.timeline] || "—"}${lead.ref ? ` · Ref ${lead.ref}` : ""}`,
        called ? "Maya is calling now." : lead.consent ? "Maya already called." : "No call (consent box not ticked).",
        ...(lead.timeline === "30d" ? ["Founder call: offer to book"] : []),
      ];
      postToSlack(webhook, { text: lines.join("\n") }).catch((e) => console.error("[slack] phone confirmed post failed:", e.message));
    }
    return true;
  } catch (err) {
    console.error(`[deal-sheet] confirmPhone failed for ${leadId}:`, err.message);
    return false;
  }
}

module.exports = { confirmPhone };
