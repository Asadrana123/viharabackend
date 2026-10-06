// socket/qaSocket.js
//
// Live updates for the admin QA tab. Every change to a QA run (new plan,
// question, answer, result, status) is announced in the "qa-admin" room as
// `qa:run.updated` with { runId, event, status }; the tab then refetches that
// run. Only ids and statuses go over the socket — the run itself is always
// read through the admin-only REST API.
//
// The QA worker talks to this web process over HTTP, so every change already
// happens here — no Redis bridge needed (unlike vtextSocketBridge.js).
const { getIoInstance } = require("./getIoInstance");

const ROOM = "qa-admin";

/** Per-connection room join/leave, admin-only. Call from socketServer.js's connection handler. */
function registerQaSocketHandlers(socket) {
  socket.on("qa:join-admin", () => {
    if (socket.user?.role !== "admin") {
      socket.emit("qa:error", "Admin access required");
      return;
    }
    socket.join(ROOM);
  });

  socket.on("qa:leave-admin", () => {
    socket.leave(ROOM);
  });
}

/**
 * Tells admins a run changed. Safe to call anywhere: a no-op when sockets
 * aren't running (scripts, tests), and never throws into the request.
 */
function notifyQaRun(runId, event, status) {
  try {
    const io = getIoInstance();
    if (!io || !runId) return;
    io.to(ROOM).emit("qa:run.updated", { runId: String(runId), event, status, at: new Date().toISOString() });
  } catch (err) {
    console.error("[qa socket] notify failed:", err.message);
  }
}

module.exports = { registerQaSocketHandlers, notifyQaRun, ROOM };
