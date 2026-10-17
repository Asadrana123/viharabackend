// Calibration helper: shows what FaceTime's screen says, live, and which call
// state the agent would read from it. Run it, then place a FaceTime audio call
// by hand (ring, answer, hang up; also a declined and an unanswered one).
// If the state shown is ever wrong, put the right words in signals.json.
//
//   npm run inspect            (FaceTime only)
//   npm run inspect -- --all   (also Notification Center, to find the "Call" prompt)
//
// Everything printed is also saved to inspect-log.txt, to send to whoever is tuning signals.json.
import fs from "node:fs";
import { dumpUi, readCallState } from "./mac/facetimeUi.js";
import { signals } from "./mac/signals.js";

const ALL = process.argv.includes("--all");
const LOG_FILE = new URL("../inspect-log.txt", import.meta.url);
const processes = ALL ? ["FaceTime", "NotificationCenter", "UserNotificationCenter"] : ["FaceTime"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function out(line) {
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + "\n");
}

let last = "";
out(`--- inspect started ${new Date().toISOString()} | signals: ${JSON.stringify(signals)}`);
console.log("Watching FaceTime. Place a FaceTime audio call by hand. Ctrl+C to stop.\n");

for (;;) {
  try {
    const parts = [];
    for (const proc of processes) {
      const els = await dumpUi(proc);
      if (!els) {
        parts.push(`[${proc}] not running`);
        continue;
      }
      const interesting = els.filter((e) => e.name || e.desc || e.value);
      parts.push(`[${proc}]\n` + interesting.map((e) => `   ${e.role.padEnd(16)} name="${e.name}" desc="${e.desc}" value="${e.value}"`).join("\n"));
    }
    const { state } = await readCallState();
    const snapshot = parts.join("\n");
    if (snapshot !== last) {
      out(`\n${new Date().toLocaleTimeString()}  agent would read: ${state.toUpperCase()}\n${snapshot}`);
      last = snapshot;
    }
  } catch (err) {
    out(`error: ${err.message}`);
    await sleep(3000);
  }
  await sleep(1000);
}
