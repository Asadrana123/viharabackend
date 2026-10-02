// services/sendify/sendifyAutoSignupService.js
//
// Automated "thanks for registering" text, triggered from a property auction
// landing page signup (sendify-infra.md Phase 7, user-requested 2026-10-02).
// Deliberately narrow in scope for now: property signups only, gated behind
// its own env flag (independent of SENDIFY_ENABLED's own on/off), off by
// default so it doesn't fire for real traffic until explicitly turned on.
// Other lead-type forms (Early Access, Partner, etc.) may need the same
// treatment later — not built yet, see sendify-infra.md.
//
// This does NOT replace Brevo — registerAndCall still syncs to Brevo exactly
// as before. This is a second, independent send through Sendify, using the
// SAME sms-consent checkbox/basis Brevo's own automation already relies on
// (lead.smsConsent) — not a new consent regime.
const SendifyTemplate = require("../../model/sendify/sendifyTemplateModel");
const { enqueueOutbound } = require("./sendifyMessageService");
const { renderTemplateForProperty } = require("./sendifyTemplateService");

const AUTO_ENABLED = () => process.env.SENDIFY_ENABLED === "true" && process.env.SENDIFY_AUTO_SIGNUP_TEXT_ENABLED === "true";

/**
 * Fire-and-forget — never throws, matches the same non-blocking pattern
 * registerAndCall already uses for its Brevo sync and enrichment calls.
 * @param {object} params
 * @param {object} params.lead - the just-created PropertyLead document
 * @param {object} params.property - the resolved property (productModel doc)
 */
async function maybeSendSignupWelcomeText({ lead, property }) {
  try {
    if (!AUTO_ENABLED()) return;
    if (lead.smsConsent !== true) return; // same gate Brevo's own automation uses

    const template = await SendifyTemplate.findOne({ isAutoSignupTemplate: true }).lean();
    if (!template) {
      console.warn("[sendify auto-signup] no template marked isAutoSignupTemplate — skipping");
      return;
    }

    const { body } = await renderTemplateForProperty(template._id, property._id, lead.fullName);

    await enqueueOutbound({
      to: lead.phone,
      body,
      origin: { kind: "automation", templateKey: "property-signup", campaignId: template._id },
      contactName: lead.fullName,
      isReplyToInbound: false,
    });
  } catch (err) {
    console.error("[sendify auto-signup] failed:", err.message);
  }
}

module.exports = { maybeSendSignupWelcomeText };
