// services/vtext/vtextEventsBus.js
//
// Redis pub/sub so the worker process can push real-time updates to the web
// process's admin sockets (sendify-infra.md §8.2/§4.3 step 5/§6.2 step 7) —
// workers and the web process are separate processes with no direct
// in-memory channel between them, but they already share this Redis.
const { getRedisClient } = require("./queue/connection");

const CHANNEL = "vtext:events";

/**
 * @param {object} event - { type: "message.updated"|"message.inbound"|"conversation.updated"|"line.updated", ...payload }
 */
async function publishEvent(event) {
  try {
    await getRedisClient().publish(CHANNEL, JSON.stringify(event));
  } catch (err) {
    // Best-effort — a missed real-time update just means the admin UI's
    // polling fallback (useVtextPolling) picks it up on its next tick
    // instead. Never let a pub/sub hiccup break the actual send/receive flow.
    console.error("[vtext events] publish failed:", err.message);
  }
}

module.exports = { publishEvent, CHANNEL };
