// scripts/facetimeTestCall.js
//
// FaceTime test call, without running the whole backend (so none of the call
// schedulers start). Runs only the FaceTime pieces:
//   1. turns the FaceTime test on for one number (yours) on the vText Mac line
//   2. makes an agent key and starts the agent API on http://localhost:8010
//   3. waits for the agent (mock or Mac) to check in, then sends one test call
//   4. shows what happened; Ctrl+C turns the test off again
//
//   node src/scripts/facetimeTestCall.js +14155550123 "Your Name"
//
// For the real Mac test, expose port 8010 with ngrok and use that address as
// BACKEND_URL in the Mac's facetime-agent/.env.
require("dotenv").config();
process.env.FACETIME_ENABLED = "true"; // this process only

const crypto = require("crypto");
const readline = require("readline/promises");
const express = require("express");
const mongoose = require("mongoose");

const VtextLine = require("../model/vtext/vtextLineModel");
const FacetimeCallJob = require("../model/calling/facetimeCallJobModel");
const CallLog = require("../model/calling/callLogModel");
const { updateSettings } = require("../services/calling/facetime/facetimeSettingsService");
const { hashKey } = require("../controller/calling/facetimeAgentController");
const { startFacetimeSweep } = require("../services/calling/facetime/facetimeSweep");
const { dispatchCall } = require("../services/calling/vapiService");

const PORT = Number(process.env.FACETIME_TEST_PORT || 8010);
const FINAL = ["ended", "no-answer", "declined", "failed", "fell-back"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

let line = null;
async function turnOff() {
  try {
    await updateSettings({ enabled: false });
    if (line) await VtextLine.updateOne({ _id: line._id }, { $set: { "facetime.enabled": false } });
    console.log("\nFaceTime test switched off again. Bye.");
  } catch (err) {
    console.error("Could not switch the test off:", err.message, "(switch it off in the admin panel)");
  }
}

async function watchJob(callId) {
  const jobId = callId.slice(3);
  let lastStatus = "";
  const deadline = Date.now() + 25 * 60 * 1000;
  while (Date.now() < deadline) {
    let job;
    try {
      job = await FacetimeCallJob.findById(jobId).lean();
    } catch (err) {
      console.log(`   (database hiccup: ${err.message}, retrying)`);
      await sleep(2000);
      continue;
    }
    if (job.status !== lastStatus) {
      console.log(`   ${new Date().toLocaleTimeString()}  ${job.status}${job.failureReason ? ` (${job.failureReason})` : ""}`);
      lastStatus = job.status;
    }
    if (FINAL.includes(job.status)) return job;
    await sleep(1000);
  }
  return FacetimeCallJob.findById(jobId).lean();
}

async function main() {
  const phone = process.argv[2] || (await rl.question("Your phone number (e.g. +14155550123): "));
  const fullName = process.argv[3] || "FaceTime Test";

  // IPv4 + a longer wait: from a home connection, Atlas sometimes resets a connection (ECONNRESET).
  await mongoose.connect(process.env.DB_URI, { family: 4, serverSelectionTimeoutMS: 20000, socketTimeoutMS: 45000 });
  line = await VtextLine.findOne({ channelType: "imessage-bluebubbles", status: { $ne: "retired" } }).sort({ createdAt: 1 });
  if (!line) throw new Error("No vText iMessage line in the database: FaceTime needs one (the same Mac).");

  const key = `ftk_${crypto.randomBytes(24).toString("hex")}`;
  const startedAt = new Date();
  // Only the FaceTime section of the line; texting is not touched.
  await VtextLine.updateOne(
    { _id: line._id },
    { $set: { "facetime.enabled": true, "facetime.agentKeyHash": hashKey(key), "facetime.pausedReason": "", "facetime.consecutiveFailures": 0 } }
  );
  const settings = await updateSettings({ enabled: true, mode: "allowlist", allowlist: [phone] });

  const app = express();
  app.use(express.json());
  app.use("/api/v1/facetime", require("../routes/calling/facetimeRoutes"));
  await new Promise((resolve) => app.listen(PORT, resolve));
  startFacetimeSweep();

  // A dropped database connection must not kill the test; mongoose reconnects by itself.
  process.on("unhandledRejection", (err) => console.log(`   (ignored error: ${err?.message || err})`));
  app.use((err, req, res, next) => {
    console.log(`   (agent request failed: ${err.message})`);
    res.status(500).json({ success: false, message: err.message });
  });

  process.on("SIGINT", async () => {
    await turnOff();
    process.exit(0);
  });

  console.log(`
✅ FaceTime test is ON for ${settings.allowlist.join(", ")} on "${line.name}".
   Agent API: http://localhost:${PORT}

Now, in a second terminal:
   cd facetime-agent
   (create a file named .env with these two lines)
   BACKEND_URL=http://localhost:${PORT}
   FACETIME_AGENT_KEY=${key}
   npm run mock          (on the Mac: npm start)

Waiting for the agent to check in…`);

  for (;;) {
    const fresh = await VtextLine.findById(line._id).select("facetime.lastHeartbeatAt").lean().catch(() => null);
    if (fresh?.facetime?.lastHeartbeatAt > startedAt) break;
    await sleep(1000);
  }
  console.log("✅ Agent is connected.");

  for (;;) {
    await rl.question("\nPress Enter to send a test call (Ctrl+C to finish)… ");
    const res = await dispatchCall(phone, { fullName, timezone: "America/New_York" }, { source: "facetime-test", oncePerDay: false });
    if (!res.success) {
      console.log("❌ Call not sent:", res.error);
      continue;
    }
    if (!String(res.callId).startsWith("ft_")) {
      console.log(`⚠️  It went out as a NORMAL phone call (${res.callId}), not FaceTime. Is the agent still running?`);
      continue;
    }
    console.log(`📱 Sent as FaceTime job ${res.callId}. Answer it in the agent window.`);
    const job = await watchJob(res.callId);

    if (job.vapiCallId) {
      console.log(`   Vapi call: ${job.vapiCallId} (${job.channelUsed === "facetime" ? "FaceTime" : "phone fallback"})`);
      console.log("   Waiting up to 2 minutes for Vapi's end-of-call report to land in the call log…");
      let log = null;
      for (let i = 0; i < 24 && !log; i++) {
        log = await CallLog.findOne({ vapiCallId: job.vapiCallId }).select("durationSeconds endedReason summary phone").lean().catch(() => null);
        if (!log) await sleep(5000);
      }
      if (log) console.log(`   ✅ Call log saved: ${log.durationSeconds}s, ended "${log.endedReason}", phone ${log.phone || "(none)"}\n   Summary: ${log.summary || "(none yet)"}`);
      else console.log("   ⚠️  No call log yet (the report goes to the live backend's webhook; it may just be slow).");
    }
  }
}

main().catch(async (err) => {
  console.error("❌", err.message);
  await turnOff();
  process.exit(1);
});
