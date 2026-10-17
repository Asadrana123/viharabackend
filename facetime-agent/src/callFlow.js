// One FaceTime call, start to finish. The FaceTime, backend and Maya pieces are
// passed in, so this exact logic runs on the Mac (macAgent.js) and in tests
// with stand-ins.
//
//   ui:      { dial(phone), readCallState(), hangUp(), quitFaceTime() }
//   backend: { reportStatus(jobId, status, note), answered(jobId) }
//   connect: (link) => { done: Promise<string>, hangUp(reason) }   (mayaBridge.connectToMaya, pre-wired)
const defaults = {
  ringTimeoutMs: 45 * 1000,
  maxCallMs: 20 * 60 * 1000,
  watchEveryMs: 1000,
  goneAfterReads: 3, // this many "not connected" reads in a row = the call is gone
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** @returns {Promise<{outcome: "connected"|"declined"|"no-answer", note: string}>} */
async function waitForAnswer(ui, o) {
  const deadline = Date.now() + o.ringTimeoutMs;
  let idleReads = 0;
  while (Date.now() < deadline) {
    await sleep(o.watchEveryMs);
    const { state } = await ui.readCallState();
    if (state === "connected") return { outcome: "connected", note: "" };
    if (state === "declined") return { outcome: "declined", note: "FaceTime showed declined/busy" };
    if (state === "unavailable") return { outcome: "no-answer", note: "FaceTime showed unavailable" };
    idleReads = state === "idle" ? idleReads + 1 : 0;
    if (idleReads >= o.goneAfterReads) return { outcome: "no-answer", note: "the call window closed before anyone answered" };
  }
  return { outcome: "no-answer", note: `no answer in ${Math.round(o.ringTimeoutMs / 1000)}s` };
}

async function bridgeCall(job, link, { ui, backend, connect, log }, o) {
  const call = connect(link);
  log("🎙️  Maya is on the call");

  // The person hanging up (FaceTime no longer connected) ends Maya's side too.
  let watching = true;
  const startedAt = Date.now();
  const watch = (async () => {
    let notConnected = 0;
    while (watching) {
      await sleep(o.watchEveryMs);
      if (!watching) return;
      if (Date.now() - startedAt > o.maxCallMs) return call.hangUp(`call reached the ${Math.round(o.maxCallMs / 60000)} minute limit`);
      try {
        notConnected = (await ui.readCallState()).state === "connected" ? 0 : notConnected + 1;
      } catch {
        notConnected += 1;
      }
      if (notConnected >= o.goneAfterReads) return call.hangUp("the person hung up");
    }
  })();

  const why = await call.done;
  watching = false;
  await watch;
  await ui.hangUp(); // Maya ended it (or audio failed): end FaceTime too
  log(`📴 Call over: ${why}`);
  await backend.reportStatus(job.id, "ended", why);
  return { outcome: "ended", note: why };
}

/**
 * @param {object} job - { id, phone, fullName }
 * @param {object} deps - { ui, backend, connect, log }
 * @param {object} [options] - overrides for the timings in `defaults`
 * @returns {Promise<{outcome: string, note: string}>} what happened, for logs and tests
 */
export async function runCall(job, deps, options = {}) {
  const o = { ...defaults, ...options };
  const { ui, backend, log = () => {} } = deps;
  const report = (status, note = "") =>
    backend.reportStatus(job.id, status, note).catch((err) => log(`⚠️  could not report "${status}":`, err.message));

  log(`📞 Job ${job.id}: ${job.fullName || "someone"} at ${job.phone}`);
  let rang = false;
  try {
    await ui.quitFaceTime(); // start from a clean FaceTime every time
    await report("dialing");
    await ui.dial(job.phone);
    rang = true;
    await report("ringing");
    log("🔔 Ringing…");

    const { outcome, note } = await waitForAnswer(ui, o);
    if (outcome !== "connected") {
      await ui.hangUp();
      log(`🙈 ${outcome} (${note})`);
      await report(outcome, note);
      return { outcome, note };
    }

    log("✅ Answered");
    let link;
    try {
      link = await backend.answered(job.id);
    } catch (err) {
      // The backend has already marked the job failed; don't leave the person on a silent line.
      log("❌ Maya could not start:", err.message);
      await ui.hangUp();
      return { outcome: "maya-failed", note: err.message };
    }
    return await bridgeCall(job, link, { ...deps, log }, o);
  } catch (err) {
    log(`❌ ${rang ? "Call failed" : "Could not get it ringing"}: ${err.message}`);
    await ui.hangUp().catch(() => {});
    // Before it rang, the backend sends a normal phone call instead.
    await report("failed", err.message);
    return { outcome: "failed", note: err.message };
  }
}
