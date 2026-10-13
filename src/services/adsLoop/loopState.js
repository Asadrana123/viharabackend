// services/adsLoop/loopState.js
//
// Reads and updates the single adsLoopState document: kill switch, LT-ID
// counter, last handled Slack message per channel, heartbeat times.

const AdsLoopState = require("../../model/adsLoop/adsLoopStateModel");
const AdCreative = require("../../model/adsLoop/adCreativeModel");
const { getAdsLoopConfig } = require("../../config/adsLoop/adsLoopConfig");
const { formatConcept } = require("./ltId");

const KEY = "default";

async function getState() {
    return AdsLoopState.findOneAndUpdate(
        { key: KEY },
        { $setOnInsert: { key: KEY } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
}

const updateState = (update) => AdsLoopState.updateOne({ key: KEY }, update, { upsert: true });

async function isKillSwitchOn() {
    const state = await getState();
    return state.killSwitch?.on === true;
}

const setKillSwitch = (on, { by = "", reason = "" } = {}) =>
    updateState({ $set: { killSwitch: { on, by, reason, at: new Date() } } });

/**
 * Hand out the next concept LT-ID atomically. The counter never goes below
 * the configured first number or the highest LT-ID already stored.
 */
async function nextConceptLtId() {
    const { firstLtNumber } = getAdsLoopConfig().creative;
    const highest = await AdCreative.find({ ltId: /^LT-\d+$/ }).select("ltId").lean();
    const maxStored = highest.reduce((m, c) => Math.max(m, Number(c.ltId.slice(3))), 0);
    const floor = Math.max(firstLtNumber - 1, maxStored);

    // Raise the counter to the floor first (no-op when it is already higher).
    await AdsLoopState.updateOne({ key: KEY }, { $max: { ltCounter: floor } }, { upsert: true });
    const state = await AdsLoopState.findOneAndUpdate({ key: KEY }, { $inc: { ltCounter: 1 } }, { new: true }).lean();
    return formatConcept(state.ltCounter);
}

async function getLastHandledTs(channel) {
    const state = await getState();
    return state.lastHandledTs?.[channel] || null;
}

/** Only moves forward: an older ts never overwrites a newer one. */
async function setLastHandledTs(channel, ts) {
    if (!channel || !ts) return;
    const current = await getLastHandledTs(channel);
    if (current && Number(current) >= Number(ts)) return;
    await updateState({ $set: { [`lastHandledTs.${channel}`]: ts } });
}

module.exports = {
    getState,
    updateState,
    isKillSwitchOn,
    setKillSwitch,
    nextConceptLtId,
    getLastHandledTs,
    setLastHandledTs,
};
