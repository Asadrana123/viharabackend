// services/outbound/outboundVtextService.js
//
// Vtext-provider runner for an SMS outboundCampaign — parallel to
// outboundSmsService.js's Brevo runner, selected by
// outboundCampaignService.startCampaign when campaign.sms.provider is
// "vtext" (Phase 7b, sendify-infra.md). A thin per-recipient adapter, not
// a second sender: compliance, routing, queueing, and delivery all stay
// exactly Vtext's own (vtextMessageService.enqueueOutbound) — the same
// function vtextMessageController.sendBulkMessages already calls.
const OutboundCampaign = require("../../model/outbound/outboundCampaignModel");
const { markRecipient, finishCampaign } = require("./outboundCampaignService");
const { loadTemplateAndProperty, resolveContactVariables, renderTemplate, checkRendered } = require("../vtext/vtextTemplateService");
const { enqueueOutbound } = require("../vtext/vtextMessageService");

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function runVtextCampaign(campaignId) {
  const campaign = await OutboundCampaign.findById(campaignId).lean();
  const { template, propertyValues } = await loadTemplateAndProperty(
    campaign.sms.templateId,
    String(campaign.property.id)
  );

  for (let i = 0; i < campaign.recipients.length; i++) {
    const recipient = campaign.recipients[i];
    try {
      const values = { ...propertyValues, ...resolveContactVariables(recipient.name) };
      const body = renderTemplate(template.body, values);
      const problem = checkRendered(template.body, body, values, ["quote_price"]);
      if (problem) throw new Error(`Not sent: ${problem}`);

      const result = await enqueueOutbound({
        to: recipient.phone,
        body,
        origin: {
          kind: "bulk",
          batchId: String(campaign._id),
          campaignId: campaign.sms.templateId,
          sentBy: { adminId: campaign.createdBy?.id, adminName: campaign.createdBy?.name },
        },
        contactName: recipient.name,
      });

      await markRecipient(
        campaignId,
        i,
        result.blocked
          ? { status: "failed", reason: result.reason, messageId: String(result.message._id) }
          : { status: "succeeded", messageId: String(result.message._id) }
      );
    } catch (err) {
      await markRecipient(campaignId, i, { status: "failed", reason: err.message || String(err) });
    }
    // Same politeness pacing outboundSmsService.js already uses between
    // recipients — Vtext's own queue/router handles real send pacing and
    // per-line capacity downstream, this is just spacing out the enqueue calls.
    await delay(250);
  }

  await finishCampaign(campaignId, "completed");
}

module.exports = { runVtextCampaign };
