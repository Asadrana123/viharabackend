// jobs/adsLoopJob.js
//
// Schedules for the Meta Ads Loop (all IST), only when ADS_LOOP_ENABLED=true:
//   06:00 daily     metrics pull from Zernio + lead join
//   06:30 daily     heartbeat in #ads-weekly
//   09:00 Monday    weekly list (suggestions + training metrics)
//   hourly          alert if the heartbeat is older than 26 hours
// On startup: restart builds cut off by a restart, then replay Slack
// replies / ✅ that arrived while the server was down.

const cron = require("node-cron");
const { getAdsLoopConfig, missingSettings } = require("../config/adsLoop/adsLoopConfig");
const { runDailyPull } = require("../services/adsLoop/dailyPull");
const { runWeeklyAnalysis } = require("../services/adsLoop/weeklyAnalysis");
const { replayMissed } = require("../services/adsLoop/slackHandlers");
const { recoverBuilds } = require("../services/adsLoop/creativePipeline");
const { getState, updateState } = require("../services/adsLoop/loopState");
const slack = require("../services/adsLoop/slackBot");

async function postHeartbeat() {
    const state = await getState();
    const missing = missingSettings();
    await slack.postMessage({
        channel: getAdsLoopConfig().slack.adsWeeklyChannel,
        text: `💓 Ads loop is running. Last pull: ${state.lastPullSummary || "never"}${state.killSwitch?.on ? "\n🛑 Kill switch is ON." : ""}${missing.length ? `\n⚠️ Missing settings: ${missing.join(", ")}` : ""}`,
    });
    await updateState({ $set: { lastHeartbeatAt: new Date() } });
}

/** Posts once per day when the heartbeat is stale (e.g. the 06:30 post failed). */
async function checkHeartbeat() {
    const config = getAdsLoopConfig();
    const state = await getState();
    const maxAgeMs = config.heartbeatMaxAgeHours * 3600 * 1000;
    const stale = !state.lastHeartbeatAt || Date.now() - new Date(state.lastHeartbeatAt) > maxAgeMs;
    const alertedRecently = state.lastStaleAlertAt && Date.now() - new Date(state.lastStaleAlertAt) < 24 * 3600 * 1000;
    if (!stale || alertedRecently || !state.lastHeartbeatAt) return;

    await slack.postMessage({
        channel: config.slack.adsWeeklyChannel,
        text: `🚨 The ads loop missed its heartbeat (last one ${new Date(state.lastHeartbeatAt).toISOString()}). Check the server logs and /api/v1/ads-loop/health.`,
    });
    await updateState({ $set: { lastStaleAlertAt: new Date() } });
}

const safe = (name, fn) => async () => {
    try {
        await fn();
    } catch (error) {
        console.error(`[adsLoop] ${name} failed:`, error.message);
    }
};

function startAdsLoopJob() {
    const config = getAdsLoopConfig();
    if (!config.enabled) {
        console.log("[adsLoop] ADS_LOOP_ENABLED is not true; schedules are off.");
        return;
    }
    const missing = missingSettings(config);
    if (missing.length) console.warn(`[adsLoop] missing settings: ${missing.join(", ")}`);

    const opts = { timezone: config.scheduleTimeZone };
    cron.schedule(config.schedules.dailyPull, safe("daily pull", runDailyPull), opts);
    cron.schedule(config.schedules.heartbeat, safe("heartbeat", postHeartbeat), opts);
    cron.schedule(config.schedules.weeklyList, safe("weekly list", runWeeklyAnalysis), opts);
    cron.schedule("15 * * * *", safe("heartbeat check", checkHeartbeat), opts);
    console.log("[adsLoop] scheduled: pull 06:00 IST, heartbeat 06:30 IST, weekly list Mon 09:00 IST.");
}

/** Run once MongoDB is connected. */
/**
 * Make the loop's own collections' indexes match the models, dropping old
 * ones (the ltId indexes from before the core id naming). Only touches
 * ads-loop collections.
 */
async function syncAdsLoopIndexes() {
    const models = [
        require("../model/adsLoop/adCreativeModel"),
        require("../model/adsLoop/adResultModel"),
        require("../model/adsLoop/adProposalModel"),
        require("../model/adsLoop/adChangeLogModel"),
        require("../model/adsLoop/creativeExampleModel"),
        require("../model/adsLoop/designRuleModel"),
    ];
    for (const model of models) {
        const dropped = await model.syncIndexes().catch((e) => (console.error(`[adsLoop] index sync ${model.modelName}:`, e.message), []));
        if (dropped?.length) console.log(`[adsLoop] ${model.modelName}: dropped old indexes ${dropped.join(", ")}`);
    }
}

async function recoverAdsLoop() {
    await syncAdsLoopIndexes();
    if (!getAdsLoopConfig().enabled) return;
    const restarted = await recoverBuilds().catch((e) => (console.error("[adsLoop] build recovery:", e.message), 0));
    if (restarted) console.log(`[adsLoop] restarted ${restarted} interrupted build(s).`);
    await safe("Slack replay", replayMissed)();
    await safe("heartbeat check", checkHeartbeat)();
}

module.exports = { startAdsLoopJob, recoverAdsLoop, postHeartbeat };
