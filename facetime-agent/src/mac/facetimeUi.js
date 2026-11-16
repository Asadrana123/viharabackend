// Drives the FaceTime app through macOS accessibility (System Events). Apple
// gives no API for FaceTime, so the agent reads and clicks the same buttons a
// person would. Needs Accessibility + Automation permission for the app that
// runs the agent. Labels it looks for come from signals.js.
import { execFile } from "node:child_process";
import { osascript } from "./osascript.js";
import { signals as defaultSignals } from "./signals.js";

// Every element in every window of a process, one per line: role, name,
// description, value (tabs and newlines inside them flattened to spaces).
// Returns "NO_PROCESS" when the app isn't running. (Checked through the list of
// process names: `exists process` takes about 3 s for an app that isn't running.)
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
    if (name of processes) does not contain procName then return "NO_PROCESS"
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
    if (name of processes) does not contain procName then return "NO_PROCESS"
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
export async function dumpUi(processName = "FaceTime", timeoutMs = 15000) {
  const out = await osascript(DUMP_SCRIPT, [processName], timeoutMs);
  if (out === "NO_PROCESS") return null;
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [role = "", name = "", desc = "", value = ""] = line.split("\t");
      return { role, name: clean(name), desc: clean(desc), value: clean(value) };
    });
}

// FaceTime's own window, plus the places macOS also draws the call prompt and the in-call
// screen (End button, "FaceTime Audio…", timer). On macOS 15.3 the in-call screen is in
// Notification Center, so reading FaceTime alone always looks idle.
export const CALL_PROCESSES = ["FaceTime", "NotificationCenter", "UserNotificationCenter"];

// Once the person picks up, reading the call screen in Notification Center often hangs until
// the time limit (15 s by default), which made every check during a call that slow: Maya
// joined 15-30 s after the answer. A screen that can't be read this quickly is skipped,
// the same as one that can't be read at all (with the call live, that means "connected").
// On macOS 27 one read of Notification Center takes 4-25 s, so 3 s never sees the ringing
// banner there: SCREEN_READ_SECONDS in .env raises it (read when used, after .env is loaded).
const secondsFromEnv = (name, fallback) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n * 1000 : fallback;
};
const callScreenTimeoutMs = () => secondsFromEnv("SCREEN_READ_SECONDS", 3000);

// Which screens the last dumpAll could not read in time (for the dial log).
let lastSkipped = [];

/** @returns {Promise<Array|null>} every element of all the call processes together; null when none is running */
export async function dumpAll(timeoutMs = callScreenTimeoutMs()) {
  let found = false;
  const all = [];
  const skipped = [];
  for (const proc of CALL_PROCESSES) {
    try {
      const els = await dumpUi(proc, timeoutMs);
      if (els) {
        found = true;
        all.push(...els);
      }
    } catch (err) {
      if (/Accessibility|Automation/.test(err.message)) throw err;
      skipped.push(proc);
    }
  }
  lastSkipped = skipped;
  return found ? all : null;
}

/** @returns {Promise<boolean>} true when something was clicked */
export async function clickLabel(processName, labels, timeoutMs = 15000) {
  try {
    return (await osascript(CLICK_SCRIPT, [processName, ...labels], timeoutMs)) === "CLICKED";
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

/** Remember what an idle FaceTime screen shows, so those words are ignored during the next call. */
export function setBaseline(els) {
  baseline = new Set(textsOf(els || []));
}

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

// FaceTime's Video → Mute menu item is enabled for as long as a call is live (ringing or
// connected) and greyed out otherwise. Once the person picks up on macOS 15.3, the call
// screen can't be read at all (no End button, no timer), so this is the only sign left.
// The menu names are English; on another language set them the same way as signals.json.
const CALL_LIVE_SCRIPT = `
tell application "System Events"
  if (name of processes) does not contain "FaceTime" then return "FaceTime not running"
  try
    return (enabled of menu item "Mute" of menu 1 of menu bar item "Video" of menu bar 1 of process "FaceTime") as text
  on error errMsg
    return "menu error: " & errMsg
  end try
end tell
`;

// Why the last check said "no live call" when it wasn't a plain "false" (for the logs).
let lastLiveNote = "";

/** @returns {Promise<boolean>} true while FaceTime has a call in progress */
export async function callIsLive() {
  try {
    const out = await osascript(CALL_LIVE_SCRIPT, [], 8000);
    lastLiveNote = out === "true" || out === "false" ? "" : out.slice(0, 80);
    return out === "true";
  } catch (err) {
    if (/Accessibility|Automation/.test(err.message)) throw err;
    lastLiveNote = /ETIMEDOUT|killed|SIGTERM/i.test(err.message) ? "timed out" : err.message.slice(0, 80);
    return false;
  }
}

/**
 * Is the call still on? For watching a call in progress.
 * Uses FaceTime's menu when it works (macOS 15). On macOS 27 the call runs in the Notification
 * Center banner with the FaceTime app not running at all, so the menu always says "no call" and
 * Maya was cut off 4 s into the call: there the banner is read instead (slow, up to ~25 s).
 * @returns {Promise<boolean|null>} null = couldn't tell (the banner couldn't be read in time)
 */
export async function callStillOn() {
  if (await callIsLive()) return true;
  if (!lastLiveNote) return false; // the menu works on this Mac and says the call is over
  const els = await dumpAll(callScreenTimeoutMs());
  if (lastSkipped.includes("NotificationCenter")) return null;
  const { state } = classify(els);
  return state === "connected" || state === "ringing";
}

/** A live call whose ringing screen is gone means the person picked up. */
export function withCallLive(read, live) {
  return live && read.state === "idle" ? { state: "connected", texts: read.texts } : read;
}

/**
 * What FaceTime shows right now. The live check and the screens are read one after another,
 * never at the same time: on macOS 27 a screen read cut off part-way (or running alongside)
 * left System Events jammed, so the live check said "no call" during a call and, a few reads
 * later, no screen could be read at all.
 * @returns {{state, texts, live: boolean, byScreen: boolean, liveNote: string, skipped: string[], ms: number}}
 *   byScreen: the screen itself showed the call timer next to End (a sure "answered", not just "call live")
 */
export async function readCallState(timeoutMs = callScreenTimeoutMs()) {
  const startedAt = Date.now();
  const live = await callIsLive();
  const liveNote = lastLiveNote;
  const fromScreen = classify(await dumpAll(timeoutMs));
  return {
    ...withCallLive(fromScreen, live),
    live,
    liveNote,
    byScreen: fromScreen.state === "connected",
    skipped: lastSkipped,
    ms: Date.now() - startedAt,
  };
}

/** One line for the log: "ringing (read 4.2s, call live, could not read: NotificationCenter) FaceTime Audio…" */
export function describeRead(read) {
  const parts = [`read ${(read.ms / 1000).toFixed(1)}s`, read.live ? "call live" : `no live call${read.liveNote ? ` [${read.liveNote}]` : ""}`];
  if (read.skipped?.length) parts.push(`could not read: ${read.skipped.join(", ")}`);
  const texts = (read.texts || []).slice(0, 6).join(" | ").slice(0, 160);
  return `${read.state} (${parts.join(", ")})${texts ? ` ${texts}` : ""}`;
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
 * @param {object} [options]
 * @param {number} [options.timeoutMs] - the whole dial, from opening FaceTime to ringing (DIAL_TIMEOUT_SECONDS
 *   in .env, default 40 s). On macOS 27 the ringing banner shows 10-20 s after Call is pressed and each read is
 *   slow, so the old 15 s gave up on calls that did ring. Keep it under 45 s: after 45 s of "dialing" the
 *   backend sends a normal phone call instead (facetimeSweep RING_START_TIMEOUT_MS), and the person gets both.
 * @param {Function} [options.log] - gets one line per step, so a failed dial shows what the agent saw
 * @returns {Promise<void>} resolves once the call is under way (ringing); throws if it never got there
 */
export async function dial(phone, { timeoutMs = Math.min(secondsFromEnv("DIAL_TIMEOUT_SECONDS", 40000), 42000), log = () => {} } = {}) {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  const at = () => `+${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
  baseline = new Set();
  await openUrl(`facetime-audio://${phone}`);
  await sleep(1500);
  // FaceTime's screen before the call starts: the Recents list and the prompt.
  setBaseline(await dumpAll(5000));
  log(`   ${at()} opened FaceTime${lastSkipped.length ? ` (could not read: ${lastSkipped.join(", ")})` : ""}`);

  let clicked = false;
  let checks = 0;
  while (Date.now() < deadline) {
    // The prompt has been seen in FaceTime itself and in Notification Center, depending on the macOS version.
    // Pressed once only: a second "Call" button could be a different person in Recents.
    if (!clicked) {
      for (const proc of CALL_PROCESSES) {
        if (await clickLabel(proc, defaultSignals.callButtonLabels, Math.max(2000, Math.min(8000, (deadline - Date.now()) / 2)))) {
          clicked = true;
          log(`   ${at()} pressed Call (in ${proc})`);
          break;
        }
      }
      if (!clicked) log(`   ${at()} no Call button yet`);
    }
    if (Date.now() >= deadline) break;
    // Once Call is pressed, the quick live check (FaceTime's Video → Mute menu) is enough to know the
    // call is under way. Every third check also reads the screens, which is slow on macOS 27 (4-25 s),
    // to catch "unavailable" and to see the banner if the menu check doesn't work on this Mac.
    // No read may run past the deadline: three screens are read one after another.
    if (clicked) {
      checks += 1;
      const live = await callIsLive();
      if (live) {
        log(`   ${at()} call live (Video → Mute menu is on)`);
        return;
      }
      const room = (deadline - Date.now() - 1000) / CALL_PROCESSES.length;
      // A plain "false" from a working menu: check again soon. An error ("FaceTime not running" on
      // macOS 27, where the call lives in the banner): the menu can't tell, so read the banner now.
      if ((checks % 3 !== 0 && !lastLiveNote) || room < 1500) {
        log(`   ${at()} no live call yet${lastLiveNote ? ` [${lastLiveNote}]` : ""}`);
        await sleep(700);
        continue;
      }
      const read = await readCallState(Math.min(callScreenTimeoutMs(), room));
      log(`   ${at()} ${describeRead(read)}`);
      if (read.state === "ringing" || read.state === "connected") return;
      if (read.state === "declined" || read.state === "unavailable") throw new Error(`FaceTime said "${read.state}" straight away (likely not a FaceTime user)`);
    }
    await sleep(700);
  }
  throw new Error(
    clicked
      ? `Pressed Call, but FaceTime never started ringing (waited ${Math.round(timeoutMs / 1000)}s)`
      : "No Call prompt found to press"
  );
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
  let how = "no End button found";
  try {
    for (const proc of CALL_PROCESSES) {
      // 25 s: on macOS 27 the End button is in the Notification Center banner, which is slow to search,
      // and a search cut off part-way jams macOS's screen reading.
      if (await clickLabel(proc, defaultSignals.endButtonLabels, 25000)) {
        how = `pressed End (in ${proc})`;
        break;
      }
    }
  } catch {
    // permissions problems surface elsewhere; quitting still ends the call
  }
  await sleep(800);
  await quitFaceTime();
  return how;
}
