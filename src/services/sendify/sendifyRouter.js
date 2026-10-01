// services/sendify/sendifyRouter.js
//
// Phase 2 scope: a deliberately minimal selectLine — "least-used-today among
// routable lines of the requested channel(s)," same idea as
// callerNumberPoolService's rotation, no stickiness yet. Phase 4
// (sendify-infra.md §7.2) replaces this with the full version: sticky lines
// per contact, weighted scoring, WAIT-don't-switch-mid-conversation. Kept in
// its own file now specifically so that upgrade is a body-swap, not a new
// call site everywhere routeWorker uses it.
const SendifyLine = require("../../model/sendify/sendifyLineModel");
const { ROUTABLE_STATUSES } = SendifyLine;
const { getAdapter } = require("./channels/registry");
const { remainingToday } = require("./sendifyCapacityService");

/** Resolves message.channelPolicy to an ordered list of channel types to try. */
function resolveChannelCandidates(channelPolicy) {
  if (channelPolicy?.channels?.length) {
    return channelPolicy.channels;
  }
  // No explicit channels -> every channel the registry knows about except "mock"
  // (mock is opt-in only, never a silent default for a real send).
  const { CHANNEL_TYPES } = SendifyLine;
  return CHANNEL_TYPES.filter((type) => type !== "mock");
}

/**
 * @param {object} message - a sendifyMessageModel doc/object: needs channelPolicy, excludeLineIds
 * @param {object} contact - a sendifyContactModel doc (unused for routing yet — stickiness is Phase 4)
 * @returns {Promise<object|null>} the chosen sendifyLineModel doc, or null if nothing has room right now
 */
async function selectLine(message, contact) {
  const channels = resolveChannelCandidates(message.channelPolicy);
  const excludeLineIds = message.excludeLineIds || [];

  for (const channelType of channels) {
    const lines = await SendifyLine.find({
      channelType,
      status: { $in: ROUTABLE_STATUSES },
      "routing.acceptsNewContacts": true,
      _id: { $nin: excludeLineIds },
    });
    if (!lines.length) continue;

    const scored = await Promise.all(
      lines.map(async (line) => ({ line, remaining: await remainingToday(line) }))
    );
    const eligible = scored.filter((s) => s.remaining > 0).sort((a, b) => b.remaining - a.remaining);
    if (eligible.length) return eligible[0].line;
  }

  return null;
}

module.exports = { selectLine, resolveChannelCandidates };
