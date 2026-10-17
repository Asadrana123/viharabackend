// Runs an AppleScript with osascript, with a time limit, so a stuck FaceTime
// window can never freeze the agent.
import { execFile } from "node:child_process";

/**
 * @param {string} script - AppleScript source
 * @param {string[]} [args] - passed to the script's `on run argv`
 * @param {number} [timeoutMs]
 * @returns {Promise<string>} what the script returned, trimmed
 */
export function osascript(script, args = [], timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    execFile("osascript", ["-e", script, ...args], { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const msg = String(stderr || err.message).trim();
        // -1719 / -25211: the agent (Terminal or node) has no Accessibility permission.
        if (/-1719|-25211|assistive access|not allowed assistive/i.test(msg)) {
          return reject(new Error("No Accessibility permission. System Settings → Privacy & Security → Accessibility: allow the app running the agent (Terminal, or node)."));
        }
        if (/-1743|not authorized to send apple events/i.test(msg)) {
          return reject(new Error("No Automation permission. System Settings → Privacy & Security → Automation: allow the agent to control System Events and FaceTime."));
        }
        return reject(new Error(msg || "osascript failed"));
      }
      resolve(String(stdout).trim());
    });
  });
}
