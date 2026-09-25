// services/outbound/outboundSmsService.js
//
// Runs one outbound SMS campaign: processes recipients one at a time,
// upserting each into the property's own outbound Brevo list via
// brevoService.syncOutboundSmsContact (remove-then-add, per outboundplan.md
// §4). Our backend never sends the SMS itself — Brevo's automation on that
// list does, once the contact is added. Uses a small fixed delay between
// contacts for politeness; this is NOT rate-limit engineering (explicitly
// out of scope for now, see outboundplan.md §10).

const { getCampaign, markRecipient, finishCampaign } = require("./outboundCampaignService");
const brevoService = require("../integrations/brevoService");
const { listingPageUrl } = require("../../config/siteUrls");

const DELAY_MS = 250;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runSmsCampaign = async (campaignId) => {
  const campaign = await getCampaign(campaignId, { all: true });
  if (!campaign) return;

  const listingUrl = campaign.property?.slug ? listingPageUrl(campaign.property.slug) : "";

  for (let i = 0; i < campaign.recipients.length; i++) {
    const recipient = campaign.recipients[i];
    // Resilience: if this ever runs twice for the same campaign (shouldn't
    // happen — startCampaign is called once — but cheap to guard), don't
    // re-send to already-processed recipients.
    if (recipient.status !== "pending") continue;

    const result = await brevoService.syncOutboundSmsContact({
      email: recipient.email,
      phone: recipient.phone,
      name: recipient.name,
      listId: campaign.sms.listId,
      smsOptIn: true, // consentAttested was required to create an SMS campaign at all
      property: {
        name: campaign.property?.name || "",
        slug: campaign.property?.slug || "",
        listingUrl,
      },
    });

    if (result.success && !result.smsConflict) {
      await markRecipient(campaignId, i, { status: "succeeded" });
    } else if (result.smsConflict) {
      // The fallback save succeeded WITHOUT the SMS number (Brevo said it
      // already belongs to another contact) — the automation can't text
      // this person, so this counts as a failure, not a success.
      await markRecipient(campaignId, i, {
        status: "failed",
        reason: "SMS number already on another Brevo contact",
        smsConflict: true,
      });
    } else {
      await markRecipient(campaignId, i, {
        status: "failed",
        reason: result.error || "Brevo error",
      });
    }

    if (i < campaign.recipients.length - 1) await delay(DELAY_MS);
  }

  await finishCampaign(campaignId, "completed");
};

module.exports = { runSmsCampaign };
