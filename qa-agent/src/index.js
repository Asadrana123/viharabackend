// QA worker: polls the backend for runs and handles them one at a time.
//   npm start         — keep polling
//   npm run once      — handle at most one run, then exit (handy for trying it out)
import { config } from "./config.js";
import { api, ApiError } from "./api.js";
import { runPlanPhase } from "./plan/planPhase.js";
import { runTestPhase } from "./test/testPhase.js";

// Phases this worker handles: "plan" (build/revise a plan), "test" (run an approved plan).
const PHASES = ["plan", "test"];
const once = process.argv.includes("--once");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const logFor = (runId) => (msg) => console.log(`[${new Date().toISOString()}] [run ${runId}] ${msg}`);

let shuttingDown = false;
process.on("SIGINT", () => {
  if (shuttingDown) process.exit(1);
  shuttingDown = true;
  console.log("Stopping after the current run (Ctrl+C again to quit now)...");
});

async function handle(phase, run) {
  const log = logFor(run._id);
  log(`claimed for ${phase}: "${run.request.slice(0, 80)}"`);
  try {
    if (phase === "plan") await runPlanPhase(run, log);
    else if (phase === "test") await runTestPhase(run, log);
  } catch (err) {
    log(`error: ${err.stack || err.message}`);
    // Best effort: mark the run failed so it doesn't wait for the stale-lock timeout.
    await api.finish(run._id, { status: "failed", error: `QA worker error: ${err.message}`.slice(0, 2000) }).catch(() => {});
  }
}

async function main() {
  console.log(`QA worker ${config.workerId} → ${config.apiUrl} (phases: ${PHASES.join(", ")})`);
  while (!shuttingDown) {
    let claimed;
    try {
      claimed = await api.claim(PHASES);
    } catch (err) {
      const hint = err instanceof ApiError && err.status === 503 ? " — is QA_AGENT_TOKEN set in the backend .env?" : "";
      console.error(`claim failed: ${err.message}${hint}`);
      if (once) process.exit(1);
      await sleep(config.pollSeconds * 1000);
      continue;
    }

    if (claimed.run) await handle(claimed.phase, claimed.run);
    if (once) break;
    if (!claimed.run) await sleep(config.pollSeconds * 1000);
  }
}

main();
