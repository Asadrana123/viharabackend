// jobs/repairJob.js
//
// Repair agent schedule (IST), only when REPAIR_AGENT_ENABLED=true:
//   08:30 daily   tracking + landing page checks; new problems go to the repair agent
// On startup: fixes cut off by a restart are tried again.

const cron = require("node-cron");
const { getRepairConfig, missingRepairSettings } = require("../config/repair/repairConfig");
const { runChecks, recoverRepairs } = require("../services/repair/incidentService");

function startRepairJob() {
    const config = getRepairConfig();
    if (!config.enabled) {
        console.log("[repair] REPAIR_AGENT_ENABLED is not true; checks are off.");
        return;
    }
    const missing = missingRepairSettings(config);
    if (missing.length) console.warn(`[repair] missing settings: ${missing.join(", ")}`);

    cron.schedule(
        config.schedule,
        () => runChecks().catch((e) => console.error("[repair] checks failed:", e.message)),
        { timezone: config.scheduleTimeZone }
    );
    console.log("[repair] scheduled: checks daily 08:30 IST.");
}

/** Run once MongoDB is connected. */
async function recoverRepairJob() {
    if (!getRepairConfig().enabled) return;
    await recoverRepairs();
}

module.exports = { startRepairJob, recoverRepairJob };
