// Mock agent: stands in for the Mac so the whole FaceTime flow can be tested
// now, on any computer. It does everything the Mac agent will do except
// FaceTime itself: checks in, picks up call jobs, reports dialing/ringing, and
// when you "answer", connects your mic and speaker to Maya on Vapi.
//
//   npm run mock
//
// For each job it asks what the "person" does:
//   a = answer (talk to Maya; press Enter to hang up)
//   n = no answer   d = decline   f = the Mac fails before it rings (→ phone call)
// MOCK_AUTO=answer|no-answer|declined|fail answers that way without asking.
// MOCK_AUDIO=silent skips the mic/speaker (needs SoX otherwise).
// MOCK_INPUT_DEVICE / MOCK_OUTPUT_DEVICE: Core Audio device names (Mac only) instead
// of the default mic/speaker, for the half-manual FaceTime test in README.md.
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import * as backend from "./backend.js";
import { connectToMaya, soxAvailable } from "./mayaBridge.js";

const VERSION = "mock-0.1.0";
const POLL_MS = 3000;
const HEARTBEAT_MS = 30 * 1000;
const AUTO = process.env.MOCK_AUTO || "";
const AUDIO = process.env.MOCK_AUDIO || (soxAvailable() ? "sox" : "silent");

const rl = readline.createInterface({ input: stdin, output: stdout });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...args) => console.log(new Date().toLocaleTimeString(), ...args);

async function ask(question, allowed) {
  if (AUTO) return AUTO;
  for (;;) {
    const answer = (await rl.question(question)).trim().toLowerCase();
    if (allowed[answer]) return allowed[answer];
  }
}

async function talkToMaya(job, websocketCallUrl, audioFormat) {
  log(`🎙️  Connected to Maya (audio: ${AUDIO}). ${AUTO ? "Hanging up in 20s." : "Press Enter to hang up."}`);
  const call = connectToMaya(websocketCallUrl, audioFormat, {
    audio: AUDIO,
    // Half-manual Mac test: point these at the BlackHole cables FaceTime uses (see README).
    inputDevice: process.env.MOCK_INPUT_DEVICE || "-d",
    outputDevice: process.env.MOCK_OUTPUT_DEVICE || "-d",
    onAudioError: (msg) => log("⚠️  audio:", msg),
    onEvent: (event) => {
      if (event.type === "transcript") {
        if (event.transcriptType === "final") log(`  ${event.role}: ${event.transcript}`);
      } else if (event.type && !["speech-update", "model-output", "voice-input", "conversation-update", "status-update"].includes(event.type)) {
        log(`  [${event.type}]`);
      }
    },
  });
  // The "Enter to hang up" question is cancelled when the call ends by itself,
  // or it would swallow the answer to the next job's question.
  const enter = new AbortController();
  if (AUTO) setTimeout(() => call.hangUp(), 20000);
  else rl.question("", { signal: enter.signal }).then(() => call.hangUp("you hung up"), () => {});
  const why = await call.done;
  enter.abort();
  log(`📴 Call over: ${why}`);
  await backend.reportStatus(job.id, "ended", why);
}

async function runJob(job) {
  log(`📞 Job ${job.id}: "call" ${job.fullName || "someone"} at ${job.phone}`);
  await backend.reportStatus(job.id, "dialing");

  const outcome = await ask("   [a]nswer / [n]o answer / [d]ecline / [f]ail before ringing? ", {
    a: "answer", n: "no-answer", d: "declined", f: "fail",
  });

  if (outcome === "fail") {
    const res = await backend.reportStatus(job.id, "failed", "mock agent: failed before ringing");
    return log(`💥 Reported a failure before ringing → backend says "${res.status}" (a normal phone call goes out instead)`);
  }

  await backend.reportStatus(job.id, "ringing");
  log("🔔 Ringing…");
  await sleep(2000);

  if (outcome === "no-answer" || outcome === "declined") {
    await backend.reportStatus(job.id, outcome);
    return log(`🙈 Reported ${outcome}`);
  }

  let link;
  try {
    link = await backend.answered(job.id);
  } catch (err) {
    return log(`❌ Picked up, but Maya could not start: ${err.message}`);
  }
  await talkToMaya(job, link.websocketCallUrl, link.audioFormat);
}

async function main() {
  log(`FaceTime mock agent ${VERSION} → ${backend.BACKEND_URL} (audio: ${AUDIO})`);
  const hello = await backend.heartbeat(VERSION);
  log(`Signed in as "${hello.lineName}". FaceTime is ${hello.facetimeEnabled ? "ON" : "OFF (turn it on for this Mac in the admin panel)"} for it.`);
  setInterval(() => backend.heartbeat(VERSION).catch((err) => log("heartbeat failed:", err.message)), HEARTBEAT_MS);

  for (;;) {
    try {
      const job = await backend.nextJob();
      if (job) await runJob(job);
    } catch (err) {
      log("⚠️ ", err.message);
    }
    await sleep(POLL_MS);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
