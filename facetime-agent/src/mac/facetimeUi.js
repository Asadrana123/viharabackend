// Drives the FaceTime app through macOS accessibility (System Events). Apple
// gives no API for FaceTime, so the agent reads and clicks the same buttons a
// person would. Needs Accessibility + Automation permission for the app that
// runs the agent. Labels it looks for come from signals.js.
import { execFile } from "node:child_process";
import { osascript } from "./osascript.js";
import { signals as defaultSignals } from "./signals.js";

// Every element in every window of a process, one per line: role, name,
// description, value (tabs and newlines inside them flattened to spaces).
// Returns "NO_PROCESS" when the app isn't running.
const DUMP_SCRIPT = `
on clean(t)
  set AppleScript's text item delimiters to {tab, linefeed, return}
  set parts to text items of t
  set AppleScript's text item delimiters to " "
  set t to parts as text
  set AppleScript's text item delimiters to ""
  return t
end clean

on run argv
  set procName to item 1 of argv
  tell application "System Events"
    if not (exists process procName) then return "NO_PROCESS"
    set out to {}
    tell process procName
      repeat with w in windows
        try
          set els to entire contents of w
        on error
          set els to {}
        end try
        repeat with e in els
          set r to ""
          set n to ""
          set d to ""
          set v to ""
          try
            set r to (role of e) as text
          end try
          try
            set n to (name of e) as text
          end try
          try
            set d to (description of e) as text
          end try
          try
            set v to (value of e) as text
          end try
          set end of out to my clean(r) & tab & my clean(n) & tab & my clean(d) & tab & my clean(v)
        end repeat
      end repeat
    end tell
  end tell
  set AppleScript's text item delimiters to linefeed
  return out as text
end run
`;

// Clicks the first button (or AX action) whose name/description is one of the labels.
const CLICK_SCRIPT = `
on run argv
  set procName to item 1 of argv
  set labels to rest of argv
  tell application "System Events"
    if not (exists process procName) then return "NO_PROCESS"
    tell process procName
      repeat with w in windows
        try
          set els to entire contents of w
        on error
          set els to {}
        end try
        repeat with e in els
          try
            set n to ""
            set d to ""
            try
              set n to (name of e) as text
            end try
            try
              set d to (description of e) as text
            end try
            if (role of e) is "AXButton" and (labels contains n or labels contains d) then
              click e
              return "CLICKED"
            end if
            repeat with a in (actions of e)
              if labels contains ((description of a) as text) then
                perform a
                return "CLICKED"
              end if
            end repeat
          end try
        end repeat
      end repeat
    end tell
  end tell
  return "NOT_FOUND"
end run
`;

const clean = (s) => (s === "missing value" ? "" : s);

/** @returns {Promise<Array<{role,name,desc,value}>|null>} null when the process isn't running */
export async function dumpUi(processName = "FaceTime") {
  const out = await osascript(DUMP_SCRIPT, [processName]);
  if (out === "NO_PROCESS") return null;
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [role = "", name = "", desc = "", value = ""] = line.split("\t");
      return { role, name: clean(name), desc: clean(desc), value: clean(value) };
    });
}

/** @returns {Promise<boolean>} true when something was clicked */
export async function clickLabel(processName, labels) {
  try {
    return (await osascript(CLICK_SCRIPT, [processName, ...labels])) === "CLICKED";
  } catch (err) {
    if (/Accessibility|Automation/.test(err.message)) throw err;
    return false;
  }
}

const has = (texts, words) => texts.some((t) => words.some((w) => t.toLowerCase().includes(w.toLowerCase())));

// Words FaceTime already showed before we dialed (the Recents list: old times
// like "10:42", an old "Declined"). They say nothing about this call.
let baseline = new Set();

const textsOf = (els) => els.flatMap((e) => [e.name, e.desc, e.value]).map((t) => t.trim()).filter(Boolean);

/**
 * Reads a call state from FaceTime's screen elements (null = not running).
 * Texts in `ignore` (the baseline) are skipped; buttons are always counted.
 * @returns {{state: "idle"|"ringing"|"connected"|"declined"|"unavailable", texts: string[]}}
 */
export function classify(els, signals = defaultSignals, ignore = baseline) {
  if (!els) return { state: "idle", texts: [] };

  const texts = textsOf(els).filter((t) => !ignore.has(t));
  const endButton = els.some((e) => e.role === "AXButton" && (signals.endButtonLabels.includes(e.name) || signals.endButtonLabels.includes(e.desc)));
  const timer = new RegExp(signals.connectedTimerPattern);

  // The call timer only counts next to an End button: a time on its own could be anything.
  if (endButton && texts.some((t) => timer.test(t))) return { state: "connected", texts };
  if (has(texts, signals.declinedTexts)) return { state: "declined", texts };
  if (has(texts, signals.unavailableTexts)) return { state: "unavailable", texts };
  if (endButton || has(texts, signals.ringingTexts)) return { state: "ringing", texts };
  return { state: "idle", texts };
}

/** What FaceTime shows right now. */
export async function readCallState() {
  return classify(await dumpUi("FaceTime"));
}

function openUrl(url) {
  return new Promise((resolve, reject) => {
    execFile("open", [url], { timeout: 10000 }, (err) => (err ? reject(err) : resolve()));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Starts a FaceTime audio call and presses "Call" on the prompt macOS shows.
 * @param {string} phone - E.164
 * @returns {Promise<void>} resolves once the call is under way (ringing); throws if it never got there
 */
export async function dial(phone, { timeoutMs = 15000 } = {}) {
  baseline = new Set();
  await openUrl(`facetime-audio://${phone}`);
  await sleep(1500);
  // FaceTime's screen before the call starts: the Recents list and the prompt.
  baseline = new Set(textsOf((await dumpUi("FaceTime")) || []));

  const deadline = Date.now() + timeoutMs;
  let clicked = false;
  while (Date.now() < deadline) {
    // The prompt has been seen in FaceTime itself and in Notification Center, depending on the macOS version.
    // Pressed once only: a second "Call" button could be a different person in Recents.
    if (!clicked) {
      for (const proc of ["FaceTime", "NotificationCenter", "UserNotificationCenter"]) {
        if (await clickLabel(proc, defaultSignals.callButtonLabels)) {
          clicked = true;
          break;
        }
      }
    }
    const { state } = await readCallState();
    if (state === "ringing" || state === "connected") return;
    if (clicked && (state === "declined" || state === "unavailable")) throw new Error(`FaceTime said "${state}" straight away (likely not a FaceTime user)`);
    await sleep(700);
  }
  throw new Error(clicked ? "Pressed Call, but FaceTime never started ringing" : "No Call prompt found to press");
}

/** Quits FaceTime, which always ends a call in progress. */
export async function quitFaceTime() {
  try {
    await osascript('tell application "FaceTime" to quit', [], 8000);
  } catch {
    // not running, or not responding: fall through to a hard stop
  }
  await sleep(1000);
  await new Promise((resolve) => execFile("pkill", ["-x", "FaceTime"], () => resolve()));
}

/** Ends the call: the End button if it can find it, quitting FaceTime either way. */
export async function hangUp() {
  try {
    await clickLabel("FaceTime", defaultSignals.endButtonLabels);
  } catch {
    // permissions problems surface elsewhere; quitting still ends the call
  }
  await sleep(800);
  await quitFaceTime();
}
