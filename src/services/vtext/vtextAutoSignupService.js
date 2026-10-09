// services/vtext/vtextAutoSignupService.js
//
// Automated "Your Price" text: when someone submits the property auction page
// form with a quoted price, they get a text that repeats the price and says
// whether it is in range of the starting bid. Triggered from the signup (sendify-infra.md Phase 7, user-requested 2026-10-02).
// Deliberately narrow in scope for now: property signups only, gated behind
// its own env flag (independent of VTEXT_ENABLED's own on/off), off by
// default so it doesn't fire for real traffic until explicitly turned on.
// Other lead-type forms (Early Access, Partner, etc.) may need the same
// treatment later — not built yet, see sendify-infra.md.
//
// This does NOT replace Brevo — registerAndCall still syncs to Brevo exactly
// as before. This is a second, independent send through Vtext, using the
// SAME sms-consent checkbox/basis Brevo's own automation already relies on
// (lead.smsConsent) — not a new consent regime.
const VtextTemplate = require("../../model/vtext/vtextTemplateModel");
const { enqueueOutbound } = require("./vtextMessageService");
const { renderTemplateForProperty, checkRendered } = require("./vtextTemplateService");
const { startFollowUp } = require("./vtextFollowUpService");

// The text is never sent without the price, street and city it names, or with a {{placeholder}} left in it.
const QUOTE_REQUIRED = ["quote_price", "property_short", "city"];

const AUTO_ENABLED = () => process.env.VTEXT_ENABLED === "true" && process.env.VTEXT_AUTO_SIGNUP_TEXT_ENABLED === "true";

/**
 * Fire-and-forget — never throws, matches the same non-blocking pattern
 * registerAndCall already uses for its Brevo sync and enrichment calls.
 * @param {object} params
 * @param {object} params.lead - the just-created PropertyLead document
 * @param {object} params.property - the resolved property (productModel doc)
 */
async function maybeSendSignupQuoteText({ lead, property }) {
  // Unconditional — proves this function actually ran at all. Every branch
  // below also logs its own outcome, so "nothing in the logs" should never
  // happen again for this path: either this line plus a skip/error reason,
  // or this line plus a final outcome line.
  console.log(`[vtext auto-signup] called for lead ${lead?._id} (${lead?.phone || "no phone"})`);
  try {
    if (!AUTO_ENABLED()) {
      console.error("[vtext auto-signup] SKIPPED — VTEXT_ENABLED/VTEXT_AUTO_SIGNUP_TEXT_ENABLED not both true");
      return;
    }
    if (lead.smsConsent !== true) {
      // Same gate Brevo's own automation uses. Expected/normal when the
      // form's separate SMS opt-in checkbox wasn't ticked — not a bug, but
      // still logged at error level so it's never missed while scanning logs.
      console.error(`[vtext auto-signup] SKIPPED lead ${lead._id} — smsConsent is not true`);
      return;
    }

    // The two texts differ by whether the quote reaches the starting bid. No quote
    // (a property with no price slider) or no starting bid means there is nothing to compare.
    const quote = Number(lead.quotePrice);
    const startBid = Number(property.startBid);
    if (!(quote > 0)) {
      console.error(`[vtext auto-signup] SKIPPED lead ${lead._id} — no quoted price`);
      return;
    }
    if (!(startBid > 0)) {
      console.error(`[vtext auto-signup] SKIPPED lead ${lead._id} — property has no starting bid to compare with`);
      return;
    }
    const role = quote >= startBid ? "quote_in_range" : "quote_short";

    const template = await VtextTemplate.findOne({ autoSignupRole: role }).lean();
    if (!template) {
      console.error(`[vtext auto-signup] SKIPPED — no template has the role "${role}". Set one in the Vtext admin dashboard (Send tab -> Templates -> Edit -> "Signup text").`);
      return;
    }

    const { body, values } = await renderTemplateForProperty(template._id, property._id, lead.fullName, { quotePrice: quote });
    const renderProblem = checkRendered(template.body, body, values, QUOTE_REQUIRED);
    if (renderProblem) {
      console.error(`[vtext auto-signup] SKIPPED lead ${lead._id} — ${renderProblem}`);
      return;
    }

    const { message, blocked, reason } = await enqueueOutbound({
      to: lead.phone,
      body,
      origin: { kind: "automation", templateKey: "property-signup-quote", campaignId: template._id, propertyId: property._id },
      contactName: lead.fullName,
      isReplyToInbound: false,
    });

    if (blocked) {
      console.error(`[vtext auto-signup] BLOCKED for lead ${lead._id} — reason: ${reason}`);
    } else {
      console.log(`[vtext auto-signup] QUEUED for lead ${lead._id} — messageId ${message._id}, status ${message.status}`);
      // Follow-up texts start from the next day if the lead hasn't replied. Never lets a failure here affect the signup text.
      try {
        const followUp = await startFollowUp({ contactId: message.contactId, lead, property, signupMessageId: message._id });
        console.log(`[vtext auto-signup] follow-ups for lead ${lead._id}: ${followUp.started ? "STARTED" : `not started (${followUp.reason})`}`);
      } catch (err) {
        console.error(`[vtext auto-signup] follow-up enrollment FAILED for lead ${lead._id}:`, err.message);
      }
    }
  } catch (err) {
    console.error(`[vtext auto-signup] FAILED for lead ${lead?._id}:`, err.message);
  }
}

module.exports = { maybeSendSignupQuoteText };
