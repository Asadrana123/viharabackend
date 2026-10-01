// socket/sendifySocketBridge.js
//
// Bridges the worker process's sendify:events Redis pub/sub (sendifyEventsBus)
// to the web process's socket.io room "sendify-admin" (sendify-infra.md
// §8.2). Workers run in a separate process with no getIoInstance() of their
// own — this is the only connection between "a message changed" (worker)
// and "tell the admin UI" (web process's live sockets).
//
// Kept deliberately separate from socketHandlers.js (the existing
// auction/bidding socket logic) rather than folding into that already-large
// file — same "new feature, its own files" convention as everywhere else in
// Sendify.
const { getSubscriberClient } = require("../services/sendify/queue/connection");
const { CHANNEL } = require("../services/sendify/sendifyEventsBus");

const ROOM = "sendify-admin";

/** Starts the Redis subscriber that forwards sendify:events to the socket.io room. Call once, in the web process, after SENDIFY_ENABLED is confirmed true. */
function startSendifySocketBridge(io) {
  const subscriber = getSubscriberClient();
  subscriber.subscribe(CHANNEL, (err) => {
    if (err) console.error("[sendify socket bridge] failed to subscribe:", err.message);
  });
  subscriber.on("message", (channel, message) => {
    if (channel !== CHANNEL) return;
    try {
      const event = JSON.parse(message);
      io.to(ROOM).emit(`sendify:${event.type}`, event);
    } catch (err) {
      console.error("[sendify socket bridge] bad event payload:", err.message);
    }
  });
}

/** Per-connection room join/leave, admin-only (§8.2: "must check socket.user.role === 'admin'"). Call from socketServer.js's connection handler, alongside the existing registerSocketHandlers(socket). */
function registerSendifySocketHandlers(socket) {
  socket.on("sendify:join-admin", () => {
    if (socket.user?.role !== "admin") {
      socket.emit("sendify:error", "Admin access required");
      return;
    }
    socket.join(ROOM);
  });

  socket.on("sendify:leave-admin", () => {
    socket.leave(ROOM);
  });
}

module.exports = { startSendifySocketBridge, registerSendifySocketHandlers, ROOM };
