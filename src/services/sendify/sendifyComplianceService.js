// services/sendify/sendifyComplianceService.js
//
// canSend() is the compliance gate from sendify-infra.md §6.3 — checked at
// enqueue, route, and send time once the real queue exists (Phase 2), but
// the gate itself exists from Phase 1 day one per that section's own
// instruction, so nothing can ever ship without it already wired in.
//
// Order of checks (do not reorder — each one is a harder stop than the next):
//   1. opted out -> always blocked (the one exception: a system stop-confirm
//      reply, which Phase 3's opt-out cascade sends explicitly)
//   2. phone status invalid/landline -> blocked
//   3. consent: opted-in -> allow; a reply to a recent inbound -> allow
//      (conversational exemption); otherwise -> blocked
const CONVERSATIONAL_WINDOW_DAYS = Number(process.env.SENDIFY_CONVERSATIONAL_WINDOW_DAYS || 30);

/**
 * @param {object} contact - a sendifyContactModel document (or plain object with the same shape)
 * @param {object} [message] - { isReplyToInbound, origin: { kind, templateKey } }
 * @param {object} [context] - { lastInboundAt } — when was this contact's last inbound message on the thread in question
 * @returns {{ allowed: boolean, reason?: string, errorKind?: string }}
 */
function canSend(contact, message = {}, context = {}) {
  const isSystemStopConfirm = message.origin?.kind === "system" && message.origin?.templateKey === "stop-confirm";

  if (contact?.optOut?.isOptedOut && !isSystemStopConfirm) {
    return { allowed: false, reason: "contact has opted out", errorKind: "compliance" };
  }

  if (contact?.phoneStatus === "invalid" || contact?.phoneStatus === "landline") {
    return { allowed: false, reason: `phone status is "${contact.phoneStatus}"`, errorKind: "compliance" };
  }

  if (contact?.consent?.status === "opted-in") {
    return { allowed: true };
  }

  if (message.isReplyToInbound && context.lastInboundAt) {
    const ageMs = Date.now() - new Date(context.lastInboundAt).getTime();
    const withinWindow = ageMs <= CONVERSATIONAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    if (withinWindow) {
      return { allowed: true };
    }
  }

  return { allowed: false, reason: "no consent on file and not a timely reply to an inbound message", errorKind: "compliance" };
}

module.exports = { canSend, CONVERSATIONAL_WINDOW_DAYS };
