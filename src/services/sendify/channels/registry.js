// services/sendify/channels/registry.js
//
// Single source of truth mapping CHANNEL_TYPES (sendifyLineModel.js) to their
// adapter implementation — the codebase's existing pluggable-enum pattern
// (same idea as leadNoteModel's LEAD_TYPES), applied to messaging channels.
// Adding a channel later (Phase 6: android-sms) means adding one entry here
// and one enum value on the model — nothing else changes (sendify-infra.md §5.4).
const { CHANNEL_TYPES } = require("../../../model/sendify/sendifyLineModel");

const imessageBluebubblesAdapter = require("./imessageBluebubbles/adapter");

// "mock" is deliberately not a normal channel: it only loads when explicitly
// opted into, and assertRegistryMatchesEnum() below treats its absence as
// fine (not a boot failure) when the flag is off — everywhere else, every
// CHANNEL_TYPES entry MUST have a real adapter or boot fails loudly.
const MOCK_ENABLED = process.env.SENDIFY_ENABLE_MOCK_CHANNEL === "true";
const mockAdapter = MOCK_ENABLED ? require("./mock/adapter") : null;

const adapters = {
  "imessage-bluebubbles": imessageBluebubblesAdapter,
};
if (mockAdapter) {
  adapters.mock = mockAdapter;
}

function getAdapter(channelType) {
  const adapter = adapters[channelType];
  if (!adapter) {
    throw new Error(`[sendify] no adapter registered for channel type "${channelType}"`);
  }
  return adapter;
}

/**
 * Called once at boot (web process and worker process both). Throws loudly
 * if a real (non-"mock") CHANNEL_TYPES entry has no adapter — catches the
 * class of bug where someone adds an enum value and forgets the adapter.
 */
function assertRegistryMatchesEnum() {
  const missing = CHANNEL_TYPES.filter((type) => type !== "mock" && !adapters[type]);
  if (missing.length > 0) {
    throw new Error(
      `[sendify] CHANNEL_TYPES has entries with no registered adapter: ${missing.join(", ")}. ` +
        `Every real channel type needs a channels/<name>/adapter.js registered in registry.js.`
    );
  }
}

module.exports = { getAdapter, assertRegistryMatchesEnum, MOCK_ENABLED };
