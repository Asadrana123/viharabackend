// services/vtext/vtextAutoSignupService.js
//
// Automated signup text: when someone submits the property auction page form
// with a quoted price, they get the standard first text (firstLeadText.js:
// "Hi {name} - this is Maya from Vihara. Are you there?"), then the follow-ups.
// Until 10 Nov 2026 this repeated the price and said whether it was in range
// of the starting bid (the "Signup text" templates, no longer read). Triggered from the signup (sendify-infra.md Phase 7, user-requested 2026-10-02).
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
const { enqueueOutbound } = require("./vtextMessageService");
const { startFollowUp } = require("./vtextFollowUpService");
const { firstLeadText } = require("./firstLeadText");
const { firstNameOf } = require("../../utils/firstName");
const { getSettings, isConsentRequired } = require("./vtextSettingsService");
const { maskPhone } = require("../../utils/maskPii");
const { nextTextingTime } = require("../../utils/textingHours");
const { toUsSmsNumber } = require("../../utils/usPhone");

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
  console.log(`[vtext auto-signup] called for lead ${lead?._id} (${lead?.phone ? maskPhone(lead.phone) : "no phone"})`);
  try {
    if (!AUTO_ENABLED()) {
      console.error("[vtext auto-signup] SKIPPED — VTEXT_ENABLED/VTEXT_AUTO_SIGNUP_TEXT_ENABLED not both true");
      return;
    }
    if (lead.smsConsent !== true) {
      // Expected/normal when the form's separate SMS opt-in checkbox wasn't
      // ticked. Skipped only while the admin consent check is ON; with it
      // OFF the text goes through, and enqueueOutbound's canSend() still
      // blocks opted-out contacts and bad numbers.
      if (isConsentRequired(await getSettings())) {
        console.error(`[vtext auto-signup] SKIPPED lead ${lead._id} — smsConsent is not true`);
        return;
      }
      console.warn(`[vtext auto-signup] lead ${lead._id} has no SMS consent, continuing because the consent check is OFF`);
    }

    // Only /deal sign-ups with a quoted price come this way (no price + needs financing goes to the
    // dealFinancing form text instead). The follow-ups after this text still talk about the quote.
    const quote = Number(lead.quotePrice);
    if (!(quote > 0)) {
      console.error(`[vtext auto-signup] SKIPPED lead ${lead._id} — no quoted price`);
      return;
    }

    // The same first text every lead gets (firstLeadText.js, 10 Nov 2026), no longer the "Quote your price" templates.
    const body = firstLeadText(firstNameOf(lead.fullName || ""));

    // Only 9 AM to 8 PM in the lead's time zone (Prajwal, 6 Nov 2026): a sign-up at night is texted at 9 AM.
    const hold = nextTextingTime(toUsSmsNumber(lead.phoneNormalized) || toUsSmsNumber(lead.phone) || "", new Date());

    const { message, blocked, reason } = await enqueueOutbound({
      to: lead.phone,
      body,
      origin: { kind: "automation", templateKey: "property-signup-quote", propertyId: property._id },
      contactName: lead.fullName,
      isReplyToInbound: false,
      scheduledFor: hold.waited ? hold.at : undefined,
    });

    if (blocked) {
      console.error(`[vtext auto-signup] BLOCKED for lead ${lead._id} — reason: ${reason}`);
    } else {
      console.log(`[vtext auto-signup] QUEUED for lead ${lead._id} — messageId ${message._id}, status ${message.status}${hold.waited ? `, held until ${hold.at.toISOString()}` : ""}`);
      // Follow-up texts start from the next day if the lead hasn't replied. Never lets a failure here affect the signup text.
      try {
        // A text held until the morning counts as sent that day, so the follow-ups are planned from then.
        const followUp = await startFollowUp({ contactId: message.contactId, lead, property, signupMessageId: message._id, ...(hold.waited ? { now: hold.at } : {}) });
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
