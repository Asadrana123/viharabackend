// FaceTime uses the Mac's default microphone and speaker. While the agent runs,
// they are switched to the two BlackHole virtual cables, and switched back when
// it stops:
//
//   Maya (SoX) ──► TO_FACETIME device  ──► FaceTime "microphone" ──► the person
//   the person ──► FaceTime "speaker" ──► FROM_FACETIME device ──► SoX ──► Maya
//
// Two separate cables, so Maya never hears herself. Uses SwitchAudioSource
// (brew install switchaudio-osx).
import { execFile } from "node:child_process";

export const TO_FACETIME = process.env.TO_FACETIME_DEVICE || "BlackHole 2ch";
export const FROM_FACETIME = process.env.FROM_FACETIME_DEVICE || "BlackHole 16ch";

function sas(args) {
  return new Promise((resolve, reject) => {
    execFile("SwitchAudioSource", args, { timeout: 10000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(String(stderr || err.message).trim() || "SwitchAudioSource failed"));
      resolve(String(stdout).trim());
    });
  });
}

export async function listDevices(type) {
  return (await sas(["-a", "-t", type])).split("\n").map((s) => s.trim()).filter(Boolean);
}

let saved = null;

/** Points the Mac's default mic/speaker at BlackHole, remembering what they were. */
export async function wireFaceTimeToBlackHole() {
  const inputs = await listDevices("input");
  const outputs = await listDevices("output");
  if (!inputs.includes(TO_FACETIME)) throw new Error(`Audio device "${TO_FACETIME}" not found. Install BlackHole 2ch (brew install blackhole-2ch).`);
  if (!outputs.includes(FROM_FACETIME)) throw new Error(`Audio device "${FROM_FACETIME}" not found. Install BlackHole 16ch (brew install blackhole-16ch).`);

  if (!saved) saved = { input: await sas(["-c", "-t", "input"]), output: await sas(["-c", "-t", "output"]) };
  await sas(["-t", "input", "-s", TO_FACETIME]);
  await sas(["-t", "output", "-s", FROM_FACETIME]);
}

/** Puts the Mac's own mic/speaker back. */
export async function restoreAudio() {
  if (!saved) return;
  const { input, output } = saved;
  saved = null;
  try {
    if (input) await sas(["-t", "input", "-s", input]);
    if (output) await sas(["-t", "output", "-s", output]);
  } catch (err) {
    console.error("Could not put the Mac's own mic/speaker back:", err.message);
  }
}
