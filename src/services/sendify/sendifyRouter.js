// services/sendify/sendifyRouter.js
//
// The full version (sendify-infra.md §7.2) — Phase 2 shipped a minimal
// least-used-today selectLine with no stickiness; this replaces it.
// Stickiness: a contact talking to the same line twice keeps talking to
// that line (continuity matters more than a few hours' latency — if the
// sticky line is just over budget, we WAIT for it rather than switching
// numbers mid-conversation). A sticky line that's gone bad (quarantined/
// retired) is detected lazily here too, not just during an explicit drain.
const SendifyLine = require("../../model/sendify/sendifyLineModel");
const { ROUTABLE_STATUSES, CHANNEL_TYPES } = SendifyLine;
const SendifyConversation = require("../../model/sendify/sendifyConversationModel");
const { getAdapter } = require("./channels/registry");
const capacity = require("./sendifyCapacityService");

const REACHABILITY_STALE_DAYS = 30;

/** Resolves message.channelPolicy to an ordered list of channel types to try. */
function resolveChannelCandidates(channelPolicy) {
  if (channelPolicy?.channels?.length) {
    return channelPolicy.channels;
  }
  // No explicit channels -> every registered channel except "mock" (opt-in
  // only, never a silent default for a real send).
  return CHANNEL_TYPES.filter((type) => type !== "mock");
}

/** True/false/null per the adapter's own checkReachability contract; refreshes a stale or never-checked cache entry. Only called for channels that don't reach every US number (capabilities.reachesAllUsNumbers === false). */
async function resolveReachability(contact, channelType, adapter) {
  const cached = contact.channelReachability?.find((r) => r.channelType === channelType);
  const isStale = !cached || !cached.checkedAt || Date.now() - new Date(cached.checkedAt).getTime() > REACHABILITY_STALE_DAYS * 24 * 60 * 60 * 1000;

  if (!isStale) return cached.reachable;
  if (!adapter.checkReachability) return cached?.reachable ?? null;

  let reachable = null;
  try {
    reachable = await adapter.checkReachability({ to: contact.phoneE164 });
  } catch {
    reachable = cached?.reachable ?? null; // a check failure falls back to the last known value, not an outright "no"
  }

  if (cached) {
    cached.reachable = reachable;
    cached.checkedAt = new Date();
  } else {
    contact.channelReachability = contact.channelReachability || [];
    contact.channelReachability.push({ channelType, reachable, checkedAt: new Date() });
  }
  await contact.save();

  return reachable;
}

/**
 * Sticky-first, then least-used-today scoring among the rest.
 * @returns {Promise<"WAIT"|object|null>} a line document, "WAIT" (a specific
 *   sticky line is the right answer but it's over budget right now — don't
 *   fall through to a different line), or null (nothing usable at all on
 *   this channel).
 */
async function pickInChannel(channel, message, contact) {
  const stickyLineId = contact.stickyLines?.get(channel);

  if (stickyLineId) {
    const stickyLine = await SendifyLine.findById(stickyLineId);
    if (stickyLine && ROUTABLE_STATUSES.includes(stickyLine.status) && !(message.excludeLineIds || []).some((id) => String(id) === String(stickyLineId))) {
      const remaining = await capacity.remainingForSend(stickyLine, { isReply: message.isReplyToInbound });
      if (remaining > 0) return stickyLine;
      return "WAIT"; // over budget right now — do not switch numbers mid-conversation
    }

    // Sticky line is gone (quarantined/retired/deleted) or explicitly
    // excluded for this message — mark the conversation and clear the
    // stale pointer so future routing doesn't keep trying it, then fall
    // through to picking a fresh line.
    if (stickyLine && !ROUTABLE_STATUSES.includes(stickyLine.status)) {
      await SendifyConversation.updateOne(
        { contactId: contact._id, lineId: stickyLineId },
        { $set: { lineRetired: true } }
      );
      contact.stickyLines.delete(channel);
      await contact.save();
    }
  }

  const candidates = await SendifyLine.find({
    channelType: channel,
    status: { $in: ROUTABLE_STATUSES },
    "routing.acceptsNewContacts": true,
    _id: { $nin: message.excludeLineIds || [] },
  });
  if (!candidates.length) return null;

  const scored = [];
  for (const line of candidates) {
    const remaining = await capacity.remainingForSend(line, { isReply: message.isReplyToInbound });
    if (remaining <= 0) continue;

    // A brand-new (contact, line) pairing draws on the new-recipient-per-hour
    // budget — an existing conversation doesn't, regardless of channel.
    const hasExistingConversation = await SendifyConversation.exists({ contactId: contact._id, lineId: line._id });
    if (!hasExistingConversation) {
      const used = await capacity.peekNewRecipientCount(line._id);
      const limit = capacity.limitsFor(line).newRecipientsPerHour;
      if (used >= limit) continue;
    }

    const cap = capacity.effectiveDailyCap(line);
    const score = cap > 0 ? (remaining / cap) * (line.routing?.weight || 1) : 0;
    scored.push({ line, score });
  }

  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);
  // Tie-break randomly among the top-scored lines (same idea as callerNumberPoolService's rotation).
  const topScore = scored[0].score;
  const top = scored.filter((s) => s.score === topScore);
  return top[Math.floor(Math.random() * top.length)].line;
}

/**
 * @param {object} message - needs channelPolicy, excludeLineIds, isReplyToInbound
 * @param {object} contact - a sendifyContactModel document (mutated in place for reachability-cache/sticky-line cleanup — caller should already hold the loaded doc, not a .lean() copy)
 * @returns {Promise<{line: object|null, waitingOnStickyLine: boolean}>}
 */
async function selectLine(message, contact) {
  const policy = message.channelPolicy || { mode: "any" };
  const channels = resolveChannelCandidates(policy);

  for (const channelType of channels) {
    const adapter = getAdapter(channelType);

    if (!adapter.capabilities.reachesAllUsNumbers) {
      const reachable = await resolveReachability(contact, channelType, adapter);
      // Only a CONFIRMED false (known-unreachable) skips this channel. `null`
      // (unknown — e.g. BlueBubbles' own checkReachability() always returns
      // this, since it has no real check to run) must fall through to an
      // actual send attempt, per that adapter's own documented contract
      // ("the router treats null the same as 'needs a fresh check' and just
      // tries the send"). This didn't match until now: the real (non-bypass)
      // queue pipeline could never route a single iMessage send to any real
      // contact, since no contact starts with a pre-confirmed `true` — every
      // prior phase's testing only worked because its synthetic contacts had
      // reachability pre-seeded as true, masking this for every real-world case.
      if (reachable === false) {
        if (policy.mode === "only" && channels.length === 1) {
          // The one channel explicitly requested is confirmed unreachable — no point trying others.
          return { line: null, waitingOnStickyLine: false };
        }
        continue;
      }
    }

    const result = await pickInChannel(channelType, message, contact);
    if (result === "WAIT") return { line: null, waitingOnStickyLine: true };
    if (result) return { line: result, waitingOnStickyLine: false };
  }

  return { line: null, waitingOnStickyLine: false };
}

module.exports = { selectLine, resolveChannelCandidates };
