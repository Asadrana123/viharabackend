// services/vtext/vtextMessageService.js
//
// The entry point every outbound send goes through (sendify-infra.md §4.3,
// top half) — normalizes the recipient, upserts the contact, runs the first
// compliance gate, persists the message, and enqueues the route job. The
// rest of the flow (routing, capacity, the actual send) happens in
// routeWorker/lineSendWorker, async, off the request.
const VtextContact = require("../../model/vtext/vtextContactModel");
const VtextMessage = require("../../model/vtext/vtextMessageModel");
const { getRouteQueue } = require("./queue/queues");
const { canSend } = require("./vtextComplianceService");
const { normalizeInternationalPhone } = require("../../utils/internationalPhone");
const { findLeadRefs } = require("./vtextLeadLookupService");
const Errorhandler = require("../../utils/errorhandler");

function normalizeAddress(raw) {
  if (typeof raw !== "string") return null;
  if (raw.includes("@")) return raw.trim().toLowerCase();
  return normalizeInternationalPhone(raw);
}

/**
 * @param {object} params
 * @param {string} params.to - phone (any format) or email
 * @param {string} params.body
 * @param {object} [params.origin] - { kind, sentBy, batchId, campaignId, replyToMessageId }
 * @param {object} [params.channelPolicy] - { mode, channels }
 * @param {boolean} [params.isReplyToInbound]
 * @param {string} [params.idempotencyKey]
 * @param {Date} [params.scheduledFor]
 * @param {string} [params.contactName] - admin-provided name (e.g. typed into a bulk-send row), takes priority over a lead-lookup match when a NEW contact is created
 * @returns {Promise<{ message: object, blocked: boolean, reason?: string }>}
 */
async function enqueueOutbound({ to: rawTo, body, origin, channelPolicy, isReplyToInbound, idempotencyKey, scheduledFor, contactName }) {
  const to = normalizeAddress(rawTo);
  if (!to) {
    throw new Errorhandler("to is not a valid US phone number or email address", 400);
  }
  if (!body || typeof body !== "string") {
    throw new Errorhandler("body is required", 400);
  }

  let contact = await VtextContact.findOne({ phoneE164: to });
  if (!contact) {
    // Found as a real gap: this path never looked the number up against the
    // lead collections at all, unlike inboundWorker's own contact-creation —
    // meaning an admin bulk-sending to numbers that ARE leads got no name and
    // no consent-inheritance, every time, even though the exact same lookup
    // already existed for the inbound direction. One shared lookup now
    // covers both.
    const leadRefs = !to.includes("@") ? await findLeadRefs(to) : [];
    const consentLead = leadRefs.find((r) => r.lead.smsConsent === true);

    contact = await VtextContact.create({
      phoneE164: to,
      email: to.includes("@") ? to : undefined,
      name: contactName || leadRefs[0]?.name || undefined,
      source: "admin",
      leadRefs: leadRefs.map((r) => ({ leadType: r.leadType, leadId: r.leadId })),
      consent: consentLead
        ? {
            status: "opted-in",
            source: "lead-form",
            capturedAt: consentLead.lead.smsConsentAt || new Date(),
            consentText: consentLead.lead.smsConsentText,
            evidence: { leadType: consentLead.leadType, leadId: consentLead.leadId },
          }
        : undefined,
    });
  } else if (contactName && !contact.name) {
    // Existing contact with no name yet (e.g. created by an earlier send
    // before this lookup existed) — a freshly-provided name is still worth saving.
    contact.name = contactName;
    await contact.save();
  }

  // See routeWorker.js's matching call for why lastInboundAt is passed here too.
  const complianceResult = canSend(contact, { isReplyToInbound, origin }, { lastInboundAt: contact.lastInboundAt });

  const message = await VtextMessage.create({
    direction: "out",
    contactId: contact._id,
    channelType: undefined, // set once routed
    body,
    status: complianceResult.allowed ? "queued" : "blocked",
    origin: origin || { kind: "manual" },
    channelPolicy: channelPolicy || { mode: "any" },
    isReplyToInbound: !!isReplyToInbound,
    idempotencyKey: idempotencyKey || undefined,
    scheduledFor: scheduledFor || undefined,
    queuedAt: complianceResult.allowed ? new Date() : undefined,
    error: complianceResult.allowed ? undefined : { kind: complianceResult.errorKind, message: complianceResult.reason },
  });

  if (!complianceResult.allowed) {
    return { message, blocked: true, reason: complianceResult.reason };
  }

  const delay = scheduledFor ? Math.max(0, new Date(scheduledFor).getTime() - Date.now()) : 0;
  await getRouteQueue().add(
    "route",
    { messageId: String(message._id) },
    { jobId: `route-${message._id}-1`, delay }
  );

  return { message, blocked: false };
}

module.exports = { enqueueOutbound, normalizeAddress };
