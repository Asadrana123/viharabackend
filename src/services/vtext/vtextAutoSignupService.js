// services/vtext/vtextAutoSignupService.js
//
// Automated "thanks for registering" text, triggered from a property auction
// landing page signup (sendify-infra.md Phase 7, user-requested 2026-10-02).
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
const { renderTemplateForProperty } = require("./vtextTemplateService");

const AUTO_ENABLED = () => process.env.VTEXT_ENABLED === "true" && process.env.VTEXT_AUTO_SIGNUP_TEXT_ENABLED === "true";

/**
 * Fire-and-forget — never throws, matches the same non-blocking pattern
 * registerAndCall already uses for its Brevo sync and enrichment calls.
 * @param {object} params
 * @param {object} params.lead - the just-created PropertyLead document
 * @param {object} params.property - the resolved property (productModel doc)
 */
async function maybeSendSignupWelcomeText({ lead, property }) {
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

    const template = await VtextTemplate.findOne({ isAutoSignupTemplate: true }).lean();
    if (!template) {
      console.error("[vtext auto-signup] SKIPPED — no template is marked isAutoSignupTemplate. Set one in the Vtext admin dashboard (Send tab -> Templates -> Edit -> \"Use as the auto-signup text\").");
      return;
    }

    const { body } = await renderTemplateForProperty(template._id, property._id, lead.fullName);

    const { message, blocked, reason } = await enqueueOutbound({
      to: lead.phone,
      body,
      origin: { kind: "automation", templateKey: "property-signup", campaignId: template._id },
      contactName: lead.fullName,
      isReplyToInbound: false,
    });

    if (blocked) {
      console.error(`[vtext auto-signup] BLOCKED for lead ${lead._id} — reason: ${reason}`);
    } else {
      console.log(`[vtext auto-signup] QUEUED for lead ${lead._id} — messageId ${message._id}, status ${message.status}`);
    }
  } catch (err) {
    console.error(`[vtext auto-signup] FAILED for lead ${lead?._id}:`, err.message);
  }
}

module.exports = { maybeSendSignupWelcomeText };
