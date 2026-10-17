// Connects one call's audio to Maya over the Vapi websocket link the backend
// hands out when a FaceTime call is answered.
//
// Vapi websocket calls: binary frames are raw audio both ways (the format the
// backend asked for, 16 kHz mono 16-bit PCM), text frames are JSON events.
// To be confirmed against a real call (Phase 2).
//
// Audio in/out is pluggable:
//   - "sox": through SoX (must be installed). By default the computer's mic and
//     speaker; on the Mac agent, the two BlackHole devices FaceTime is wired to.
//   - "silent": sends silence and plays nothing; you only see Maya's events
import { spawn, spawnSync } from "node:child_process";
import WebSocket from "ws";

const RAW = (rate) => ["-t", "raw", "-r", String(rate), "-e", "signed", "-b", "16", "-c", "1"];

export function soxAvailable() {
  try {
    return spawnSync("sox", ["--version"], { stdio: "ignore" }).status === 0;
  } catch {
    return false;
  }
}

/**
 * SoX's "-d" (default device) only works on Windows when spelled as the
 * waveaudio driver's "default"; on macOS a name means a Core Audio device.
 */
function deviceArgs(device) {
  if (device === "-d") return process.platform === "win32" ? ["-t", "waveaudio", "default"] : ["-d"];
  return process.platform === "win32" ? ["-t", "waveaudio", device] : ["-t", "coreaudio", device];
}

/**
 * inputDevice → stdout (what Maya hears), stdin → outputDevice (what Maya says).
 * "-d" = the default device; anything else is a Core Audio device name (macOS).
 * A SoX that dies (device missing, unplugged) only stops the audio, never the agent.
 */
function soxAudio(rate, { inputDevice = "-d", outputDevice = "-d", onError } = {}) {
  const inArgs = deviceArgs(inputDevice);
  const outArgs = deviceArgs(outputDevice);
  const rec = spawn("sox", ["-q", ...inArgs, ...RAW(rate), "-"], { stdio: ["ignore", "pipe", "inherit"] });
  const play = spawn("sox", ["-q", ...RAW(rate), "-", ...outArgs], { stdio: ["pipe", "ignore", "inherit"] });
  let stopped = false;
  const fail = (what) => (err) => !stopped && onError?.(`${what}: ${err?.message || err}`);
  rec.on("error", fail("SoX recording"));
  play.on("error", fail("SoX playback"));
  play.stdin.on("error", () => {}); // EPIPE when playback SoX is gone; reported through its exit below
  rec.on("exit", (code) => code && fail("SoX recording")(`exited with code ${code}`));
  play.on("exit", (code) => code && fail("SoX playback")(`exited with code ${code}`));
  return {
    onChunk: (fn) => rec.stdout.on("data", fn),
    play: (buf) => play.stdin.writable && play.stdin.write(buf),
    stop: () => {
      stopped = true;
      rec.kill();
      play.stdin.end();
      play.kill();
    },
  };
}

/**
 * Real-time silence, so Vapi hears a live (if quiet) line. Timers drift (badly
 * on Windows), so each tick sends however many 20 ms frames are due by the clock.
 */
function silentAudio(rate) {
  const frame = Buffer.alloc(Math.round(rate * 0.02) * 2);
  let timer = null;
  return {
    onChunk: (fn) => {
      const startedAt = Date.now();
      let sent = 0;
      timer = setInterval(() => {
        const due = Math.floor((Date.now() - startedAt) / 20);
        for (; sent < due; sent++) fn(frame);
      }, 20);
    },
    play: () => {},
    stop: () => clearInterval(timer),
  };
}

/**
 * @param {string} websocketCallUrl
 * @param {object} audioFormat - { sampleRate }
 * @param {object} [opts] - { audio: "sox"|"silent", inputDevice, outputDevice, onEvent, onAudioError }
 * @returns {{ done: Promise<string>, hangUp: (reason?: string) => void }} done resolves with why the call ended
 */
export function connectToMaya(websocketCallUrl, audioFormat, opts = {}) {
  const rate = audioFormat?.sampleRate || 16000;
  const audio = opts.audio === "sox" ? soxAudio(rate, { ...opts, onError: opts.onAudioError }) : silentAudio(rate);
  const ws = new WebSocket(websocketCallUrl);
  let reason = "call ended";

  const done = new Promise((resolve) => {
    ws.on("open", () => {
      audio.onChunk((buf) => ws.readyState === WebSocket.OPEN && ws.send(buf));
    });
    ws.on("message", (data, isBinary) => {
      if (isBinary) return audio.play(data);
      try {
        const event = JSON.parse(data.toString());
        opts.onEvent?.(event);
        if (event.type === "hang" || event.type === "call-ended") reason = "Maya ended the call";
      } catch {
        // not JSON: ignore
      }
    });
    ws.on("error", (err) => {
      reason = `websocket error: ${err.message}`;
    });
    ws.on("close", () => {
      audio.stop();
      resolve(reason);
    });
  });

  const hangUp = (why) => {
    if (why) reason = why;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "hangup" }));
      ws.close();
    } else if (ws.readyState === WebSocket.CONNECTING) {
      ws.terminate();
    }
  };
  return { done, hangUp };
}
