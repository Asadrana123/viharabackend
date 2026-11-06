// services/adsLoop/dailyMessages.js
//
// What the ads loop posts to #ads-weekly each morning, kept quiet when nothing changed:
//
//   06:00 pull: ONE message, only when there is something new. The unmatched list (ads not
//         named AP-...) used to be posted in full every day, the same ~36 ads each time.
//         Now only ads that are NEW to the list are posted, with the total. A manual pull
//         (/adsloop pull) always posts the full list, so it can be seen on demand.
//         Hand-launched (unapproved) ads and unknown core ids are always posted: they are
//         rare and need a person.
//   06:30 heartbeat: posts only when something is wrong (kill switch on, settings missing,
//         no pull in the last 12 hours). The heartbeat time is still saved every day, so the
//         hourly stale check and /api/v1/ads-loop/health work as before.
//
// Pure functions, no Slack or database calls, so they can be tested.

const LIST_LIMIT = 20;
const PULL_MAX_AGE_HOURS = 12;

const adLine = (ad) => `• ${ad.name} (${ad.status}, ad ${ad.platformAdId})`;
const plural = (count, one, many) => (count === 1 ? one : many);

function listWithLimit(ads) {
    const lines = ads.slice(0, LIST_LIMIT).map(adLine);
    if (ads.length > LIST_LIMIT) lines.push(`… and ${ads.length - LIST_LIMIT} more`);
    return lines.join("\n");
}

/**
 * The one message for the 6:00 pull, or null when there is nothing new to say.
 *
 * @param {object} p
 * @param {object[]} p.unmatched - ads that ran but have no AP- name
 * @param {object[]} p.unapproved - running ads with a CR-/R<n>- name
 * @param {string[]} p.unknown - core ids not in the creatives list
 * @param {string[]|null} p.previousUnmatchedIds - platformAdIds in the last posted list (null = never posted)
 * @param {boolean} [p.force] - a manual pull: post the full unmatched list even when nothing changed
 * @returns {string|null}
 */
function pullAlertText({ unmatched, unapproved, unknown, previousUnmatchedIds, force = false }) {
    const parts = [];

    if (unmatched.length) {
        const seen = new Set(previousUnmatchedIds || []);
        const fresh = force || !previousUnmatchedIds ? unmatched : unmatched.filter((ad) => !seen.has(String(ad.platformAdId)));
        if (fresh.length) {
            const total = `${unmatched.length} Meta ${plural(unmatched.length, "ad has", "ads have")} no AP- name, so ${plural(unmatched.length, "its", "their")} results can't be joined to a creative.`;
            const heading =
                fresh.length === unmatched.length
                    ? `🔎 *Unmatched ads*: ${total}`
                    : `🔎 *${fresh.length} new unmatched ${plural(fresh.length, "ad", "ads")}*. ${total}`;
            parts.push(`${heading}\n${listWithLimit(fresh)}\nName approved ads "AP-<core id>_..." (e.g. AP-BB449-S01_price_hero-photo_static-4x5) to include them.`);
        }
    }

    if (unapproved.length) {
        parts.push(
            `🚩 ${unapproved.length} running ${plural(unapproved.length, "ad is", "ads are")} not named AP-, so an unapproved creative may have been launched by hand:\n${unapproved.map(adLine).join("\n")}`
        );
    }

    if (unknown.length) parts.push(`🔎 Ads use core ids that aren't in the creatives list yet: ${unknown.join(", ")}.`);

    return parts.length ? parts.join("\n\n") : null;
}

/** The ids to remember as "already posted" after a pull. */
const unmatchedIds = (unmatched) => unmatched.map((ad) => String(ad.platformAdId));

/**
 * The 6:30 heartbeat message, or null when everything is fine (nothing is posted then).
 *
 * @param {object} p
 * @param {object} p.state - the adsLoopState document
 * @param {string[]} p.missing - missing settings
 * @param {Date} [p.now]
 * @returns {string|null}
 */
function heartbeatText({ state, missing, now = new Date() }) {
    const problems = [];
    if (state.killSwitch?.on) problems.push("🛑 Kill switch is ON. No writes to Meta/Zernio until `/adsloop resume`.");
    if (missing.length) problems.push(`⚠️ Missing settings: ${missing.join(", ")}`);

    const pullAgeH = state.lastPullAt ? (now - new Date(state.lastPullAt)) / 3600000 : null;
    if (pullAgeH === null) problems.push("⚠️ The daily pull has never finished.");
    else if (pullAgeH > PULL_MAX_AGE_HOURS) {
        problems.push(`⚠️ No daily pull since ${new Date(state.lastPullAt).toISOString()}. Last one: ${state.lastPullSummary || "no summary"}`);
    }

    return problems.length ? `💓 Ads loop is running, but:\n${problems.join("\n")}` : null;
}

module.exports = { pullAlertText, unmatchedIds, heartbeatText, PULL_MAX_AGE_HOURS };
