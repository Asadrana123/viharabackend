// Setup check for the Mac: runs every requirement and says, in plain words,
// what's missing and how to fix it. Changes nothing (except one check-in to the backend).
//
//   npm run check
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { soxAvailable } from "./mayaBridge.js";
import { osascript } from "./mac/osascript.js";
import { listDevices, TO_FACETIME, FROM_FACETIME } from "./mac/audioDevices.js";

let problems = 0;
const pass = (msg) => console.log(`✅ ${msg}`);
const fail = (msg, fix) => {
  problems += 1;
  console.log(`❌ ${msg}\n   → ${fix}`);
};

const has = (cmd) => {
  try {
    execFileSync("which", [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

if (process.platform !== "darwin") {
  console.log("This check is for the Mac. On other computers use `npm run mock`.");
  process.exit(1);
}

const major = Number(process.versions.node.split(".")[0]);
major >= 20 ? pass(`Node.js ${process.versions.node}`) : fail(`Node.js ${process.versions.node} is too old`, "Install Node.js 20 or newer (brew install node)");

soxAvailable() ? pass("SoX installed") : fail("SoX is missing", "brew install sox");

if (!has("SwitchAudioSource")) {
  fail("SwitchAudioSource is missing", "brew install switchaudio-osx");
} else {
  try {
    const inputs = await listDevices("input");
    const outputs = await listDevices("output");
    inputs.includes(TO_FACETIME) ? pass(`Audio device "${TO_FACETIME}" found`) : fail(`Audio device "${TO_FACETIME}" not found`, "brew install blackhole-2ch, then restart the Mac");
    outputs.includes(FROM_FACETIME) ? pass(`Audio device "${FROM_FACETIME}" found`) : fail(`Audio device "${FROM_FACETIME}" not found`, "brew install blackhole-16ch, then restart the Mac");
  } catch (err) {
    fail("Could not list audio devices", err.message);
  }
}

fs.existsSync("/System/Applications/FaceTime.app") ? pass("FaceTime app found") : fail("FaceTime app not found", "This Mac needs the FaceTime app");

try {
  await osascript('tell application "System Events" to tell process "Finder" to get name of windows');
  pass("Accessibility and Automation permission");
} catch (err) {
  fail("Permission missing", err.message);
}

try {
  const backend = await import("./backend.js");
  const hello = await backend.heartbeat("check");
  pass(`Backend reachable (${backend.BACKEND_URL}), signed in as "${hello.lineName}"`);
  hello.facetimeEnabled ? pass("FaceTime is ON for this Mac in the admin panel") : fail("FaceTime is OFF for this Mac", "Admin panel → FaceTime Test → Macs → turn it On");
} catch (err) {
  fail("Could not reach the backend with this agent key", `${err.message}. Check BACKEND_URL and FACETIME_AGENT_KEY in facetime-agent/.env`);
}

console.log(fs.existsSync(new URL("../signals.json", import.meta.url)) ? "ℹ️  Using custom signals.json" : "ℹ️  Using default FaceTime screen words (no signals.json)");
console.log("ℹ️  Also check by hand: FaceTime is signed in (FaceTime → Settings), and the Mac never sleeps (System Settings → Energy).");
console.log(problems ? `\n${problems} thing(s) to fix.` : "\nAll good. Start the agent with: npm start");
process.exit(problems ? 1 : 0);
