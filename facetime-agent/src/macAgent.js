// The real Mac agent (Phase 2). One call at a time:
//
//   1. asks the backend for a call job (every 3 seconds when idle)
//   2. dials it over FaceTime audio and reports "dialing", then "ringing"
//   3. watches FaceTime until the person answers, declines, or 45 seconds pass
//   4. on an answer, gets Maya's websocket link from the backend and connects
//      the call audio to her through the two BlackHole cables
//   5. when either side hangs up, ends the other side and reports "ended"
//
// Anything that goes wrong before it rings is reported as "failed", and the
// backend then sends a normal phone call instead. Checks in every 30 seconds.
// The call itself is callFlow.js; this file wires it to the real Mac.
//
//   npm start            (needs the setup in README.md; `npm run check` tests it)
import * as backend from "./backend.js";
import { connectToMaya, soxAvailable } from "./mayaBridge.js";
import { runCall } from "./callFlow.js";
import * as ui from "./mac/facetimeUi.js";
import { wireFaceTimeToBlackHole, restoreAudio, TO_FACETIME, FROM_FACETIME } from "./mac/audioDevices.js";

const VERSION = "mac-0.1.0";
const POLL_MS = 3000;
const HEARTBEAT_MS = 30 * 1000;
const COOLDOWN_MS = 10 * 1000; // a pause between calls, so FaceTime is fully reset

const options = {
  ringTimeoutMs: Number(process.env.RING_TIMEOUT_SECONDS || 45) * 1000,
  maxCallMs: Number(process.env.MAX_CALL_MINUTES || 20) * 60 * 1000,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...args) => console.log(new Date().toLocaleTimeString(), ...args);

function connect({ websocketCallUrl, audioFormat }) {
  let call = null;
  call = connectToMaya(websocketCallUrl, audioFormat, {
    audio: "sox",
    inputDevice: FROM_FACETIME, // what the person says → Maya
    outputDevice: TO_FACETIME, // what Maya says → the person
    // FaceTime plays on channels 1-2 of the 16-channel cable (averaging all 16 would be 8x too quiet), and
    // the caller comes out of it very quiet (about -45 dB), so lift it 24 dB; the limiter stops clipping.
    inputMix: ["remix", "1,2", "gain", "-l", "24"],
    onEvent: (event) => {
      if (event.type === "transcript" && event.transcriptType === "final") log(`  ${event.role}: ${event.transcript}`);
    },
    onAudioError: (msg) => call?.hangUp(`audio problem: ${msg}`),
  });
  return call;
}

async function main() {
  log(`FaceTime Mac agent ${VERSION} → ${backend.BACKEND_URL}`);
  if (process.platform !== "darwin") throw new Error("The Mac agent only runs on macOS. Use `npm run mock` elsewhere.");
  if (!soxAvailable()) throw new Error("SoX is not installed (brew install sox).");

  await wireFaceTimeToBlackHole();
  log(`Audio: Mac mic → "${TO_FACETIME}", Mac speaker → "${FROM_FACETIME}" (put back when the agent stops)`);

  const stop = async () => {
    log("Stopping: putting the Mac's own mic/speaker back");
    await restoreAudio();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.on("SIGHUP", stop); // the Terminal window was closed
  // A crash must not leave the Mac's sound stuck on BlackHole.
  for (const event of ["uncaughtException", "unhandledRejection"]) {
    process.on(event, async (err) => {
      console.error(`${event}:`, err?.stack || err);
      await restoreAudio();
      process.exit(1);
    });
  }

  const hello = await backend.heartbeat(VERSION);
  log(`Signed in as "${hello.lineName}". FaceTime is ${hello.facetimeEnabled ? "ON" : "OFF (turn it on for this Mac in the admin panel)"}.`);
  setInterval(() => backend.heartbeat(VERSION).catch((err) => log("heartbeat failed:", err.message)), HEARTBEAT_MS);

  for (;;) {
    let job = null;
    try {
      job = await backend.nextJob();
    } catch (err) {
      log("⚠️ ", err.message);
    }
    if (job) {
      await runCall(job, { ui, backend, connect, log }, options);
      await sleep(COOLDOWN_MS);
    } else {
      await sleep(POLL_MS);
    }
  }
}

main().catch(async (err) => {
  console.error(err.message);
  await restoreAudio();
  process.exit(1);
});
