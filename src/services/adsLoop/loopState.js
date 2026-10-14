// services/adsLoop/loopState.js
//
// Reads and updates the single adsLoopState document: kill switch, last
// handled Slack message per channel, heartbeat times.

const AdsLoopState = require("../../model/adsLoop/adsLoopStateModel");
const AdCreative = require("../../model/adsLoop/adCreativeModel");
const { basePropertyCode, formatCoreId } = require("./creativeId");

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
 * The property's code (BB449). A property keeps the code of its first
 * creative; a new property whose code is already taken by another property
 * gets a letter added (BB449B).
 */
async function propertyCodeFor(property) {
    const existing = await AdCreative.findOne({ property: property._id, propertyCode: { $ne: "" } }).select("propertyCode").lean();
    if (existing?.propertyCode) return existing.propertyCode;

    const base = basePropertyCode(property);
    for (const suffix of ["", "B", "C", "D", "E", "F", "G", "H"]) {
        const code = `${base}${suffix}`.slice(0, 16);
        const taken = await AdCreative.exists({ propertyCode: code, property: { $ne: property._id } });
        if (!taken) return code;
    }
    throw new Error(`Could not find a free property code for ${base}`);
}

/**
 * The next free core id for this property and format (BB449-S01, BB449-S02 ...).
 * Numbers are never reused or renumbered, including after a rejection: the
 * next number is one above the highest ever used. The unique index on coreId
 * catches two builds racing for the same number (the caller retries).
 */
async function nextCoreId(property, format) {
    const code = await propertyCodeFor(property);
    const letter = format === "carousel" ? "C" : "S";
    const used = await AdCreative.find({ coreId: new RegExp(`^${code}-${letter}\\d{2}$`) }).select("coreId").lean();
    const highest = used.reduce((m, c) => Math.max(m, Number(c.coreId.slice(-2))), 0);
    if (highest >= 99) throw new Error(`${code} has used all ${letter} numbers`);
    return { coreId: formatCoreId(code, format, highest + 1), propertyCode: code };
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
    nextCoreId,
    getLastHandledTs,
    setLastHandledTs,
};
