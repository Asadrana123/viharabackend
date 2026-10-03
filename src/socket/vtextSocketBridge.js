// socket/vtextSocketBridge.js
//
// Bridges the worker process's vtext:events Redis pub/sub (vtextEventsBus)
// to the web process's socket.io room "vtext-admin" (sendify-infra.md
// §8.2). Workers run in a separate process with no getIoInstance() of their
// own — this is the only connection between "a message changed" (worker)
// and "tell the admin UI" (web process's live sockets).
//
// Kept deliberately separate from socketHandlers.js (the existing
// auction/bidding socket logic) rather than folding into that already-large
// file — same "new feature, its own files" convention as everywhere else in
// Vtext.
const { getSubscriberClient } = require("../services/vtext/queue/connection");
const { CHANNEL } = require("../services/vtext/vtextEventsBus");

const ROOM = "vtext-admin";

/** Starts the Redis subscriber that forwards vtext:events to the socket.io room. Call once, in the web process, after VTEXT_ENABLED is confirmed true. */
function startVtextSocketBridge(io) {
  const subscriber = getSubscriberClient();
  subscriber.subscribe(CHANNEL, (err) => {
    if (err) console.error("[vtext socket bridge] failed to subscribe:", err.message);
  });
  subscriber.on("message", (channel, message) => {
    if (channel !== CHANNEL) return;
    try {
      const event = JSON.parse(message);
      io.to(ROOM).emit(`vtext:${event.type}`, event);
    } catch (err) {
      console.error("[vtext socket bridge] bad event payload:", err.message);
    }
  });
}

/** Per-connection room join/leave, admin-only (§8.2: "must check socket.user.role === 'admin'"). Call from socketServer.js's connection handler, alongside the existing registerSocketHandlers(socket). */
function registerVtextSocketHandlers(socket) {
  socket.on("vtext:join-admin", () => {
    if (socket.user?.role !== "admin") {
      socket.emit("vtext:error", "Admin access required");
      return;
    }
    socket.join(ROOM);
  });

  socket.on("vtext:leave-admin", () => {
    socket.leave(ROOM);
  });
}

module.exports = { startVtextSocketBridge, registerVtextSocketHandlers, ROOM };
