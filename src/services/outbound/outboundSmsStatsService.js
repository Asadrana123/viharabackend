// services/outbound/outboundSmsStatsService.js
//
// Delivery + reply numbers for a Vtext SMS campaign, worked out when the campaign is opened
// (nothing extra is stored). Each recipient already carries the id of the Vtext message queued
// for them (outboundVtextService.js -> markRecipient), so the message's status gives sent /
// delivered / failed, and any inbound message from that contact after it gives replied / opted out.

const OutboundCampaign = require("../../model/outbound/outboundCampaignModel");
const VtextMessage = require("../../model/vtext/vtextMessageModel");

// Message status -> the one bucket a recipient is shown in.
const DELIVERED = ["delivered", "read"];
const SENT = ["sending", "accepted", "sent"]; // handed to the line, no delivery receipt yet
const QUEUED = ["queued", "waiting-window", "waiting-capacity", "assigned", "pending-approval"];
const FAILED = ["failed", "blocked", "cancelled"];

function deliveryState(message) {
  if (!message) return "failed"; // enqueue itself failed, so no message was created
  if (DELIVERED.includes(message.status)) return "delivered";
  if (SENT.includes(message.status)) return "sent";
  if (message.status === "unknown") return "no-receipt";
  if (QUEUED.includes(message.status)) return "queued";
  if (FAILED.includes(message.status)) return "failed";
  return "queued";
}

/**
 * @returns {Promise<null | { totals: object, recipients: Record<string, object> }>} null when the campaign
 *   doesn't exist or isn't a Vtext SMS campaign. `recipients` is keyed by the recipient's messageId.
 */
async function getSmsCampaignStats(campaignId) {
  const campaign = await OutboundCampaign.findById(campaignId).select("channel sms.provider recipients createdAt").lean();
  if (!campaign || campaign.channel !== "sms" || campaign.sms?.provider !== "sendify") return null;

  const messageIds = campaign.recipients.map((r) => r.messageId).filter(Boolean);
  const messages = await VtextMessage.find({ _id: { $in: messageIds } })
    .select("contactId conversationId status error createdAt")
    .lean();
  const messageById = new Map(messages.map((m) => [String(m._id), m]));

  // Inbound texts from these contacts since the campaign started; one query for the whole campaign.
  const contactIds = [...new Set(messages.map((m) => String(m.contactId)))];
  const inbound = await VtextMessage.find({ direction: "in", contactId: { $in: contactIds }, createdAt: { $gte: campaign.createdAt } })
    .select("contactId createdAt keyword.type")
    .lean();
  const inboundByContact = new Map();
  for (const m of inbound) {
    const key = String(m.contactId);
    if (!inboundByContact.has(key)) inboundByContact.set(key, []);
    inboundByContact.get(key).push(m);
  }

  const totals = { total: campaign.recipients.length, sent: 0, delivered: 0, noReceipt: 0, queued: 0, failed: 0, replied: 0, optedOut: 0 };
  const recipients = {};

  for (const r of campaign.recipients) {
    const message = r.messageId ? messageById.get(String(r.messageId)) : null;
    const state = deliveryState(message);

    let replied = false;
    let optedOut = false;
    if (message) {
      for (const m of inboundByContact.get(String(message.contactId)) || []) {
        if (m.createdAt < message.createdAt) continue; // before this text was sent
        if (m.keyword?.type === "stop") optedOut = true;
        else replied = true;
      }
    }

    // "Sent" counts everything that left our system, so it includes delivered and no-receipt.
    if (state === "delivered") { totals.delivered++; totals.sent++; }
    else if (state === "sent") totals.sent++;
    else if (state === "no-receipt") { totals.noReceipt++; totals.sent++; }
    else if (state === "queued") totals.queued++;
    else totals.failed++;
    if (replied) totals.replied++;
    if (optedOut) totals.optedOut++;

    if (r.messageId) {
      recipients[String(r.messageId)] = {
        state,
        replied,
        optedOut,
        conversationId: message?.conversationId ? String(message.conversationId) : null,
        reason: state === "failed" ? message?.error?.message || r.reason || "" : "",
      };
    }
  }

  return { totals, recipients };
}

module.exports = { getSmsCampaignStats };
