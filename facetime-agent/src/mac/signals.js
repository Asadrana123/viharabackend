// What FaceTime's screen says at each step of a call. Apple changes these
// between macOS versions and languages, so the defaults below are a starting
// point: run `npm run inspect` during a real call on the Mac, and put anything
// different in facetime-agent/signals.json (same keys; it replaces the default
// for that key).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULTS = {
  // The "Call" button on the prompt macOS shows after a facetime-audio:// link.
  callButtonLabels: ["Call"],
  // Buttons that exist only while a call is in progress (ringing or connected).
  endButtonLabels: ["End", "End Call", "Leave", "Hang Up"],
  // The call timer ("0:07", "01:23", or "FaceTime Audio - 0:07" on macOS 15) shows only once the person picked up.
  connectedTimerPattern: "(^|\\s-\\s)\\d{1,2}:\\d{2}(:\\d{2})?$",
  // Words shown while it is still ringing (only used to report "ringing" sooner).
  ringingTexts: ["Calling", "Ringing", "Connecting", "Waiting"],
  // Words shown when the person declined or was busy.
  declinedTexts: ["Declined", "Busy", "Call Declined"],
  // Words shown when nobody answered or the call couldn't go through.
  unavailableTexts: ["Unavailable", "No Answer", "Not Available", "Call Failed", "Call Back", "Failed"],
};

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "signals.json");

function load() {
  if (!fs.existsSync(file)) return { ...DEFAULTS };
  try {
    const custom = JSON.parse(fs.readFileSync(file, "utf8"));
    return { ...DEFAULTS, ...custom };
  } catch (err) {
    console.error(`signals.json could not be read (${err.message}); using the defaults`);
    return { ...DEFAULTS };
  }
}

export const signals = load();
export { DEFAULTS as DEFAULT_SIGNALS };
