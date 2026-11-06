// services/property/statusReportRules.js
//
// When the daily property status summary is posted to Slack. It used to go out every day,
// usually the same lines as the day before. Now it is posted when:
//   - a new status alert went out today (the alerts with Hide / Keep live buttons are
//     posted on their own, as before; this only decides about the summary),
//   - the list of live properties that are not for sale changed (a new one, a status
//     change, Keep live pressed, one hidden or back on sale),
//   - a property could not be checked two days in a row and that was not posted yet
//     (one failed check is usually a passing Firecrawl error and fixes itself),
//   - it is Monday (Pacific), so there is a full summary once a week and a sign the
//     check is still running,
//   - or the check was run by hand.
//
// Pure functions, no Slack or database calls, so they can be tested.

const TIME_ZONE = "America/Los_Angeles";

const idOf = (row) => String(row.product._id);

/** One line per live property that is not for sale, e.g. "abc:PENDING:kept". A new alert counts as open. */
function notForSaleKey(rows) {
    return rows
        .filter((r) => r.status && r.status !== "FOR_SALE")
        .map((r) => `${idOf(r)}:${r.status}:${r.alerted || r.open ? "open" : "kept"}`)
        .sort()
        .join("|");
}

const failedIds = (rows) => rows.filter((r) => r.error).map(idOf).sort();

const isMonday = (now) => new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short" }).format(now) === "Mon";

/**
 * @param {object} p
 * @param {object[]} p.rows - one row per property: { product, status, alerted, open, error }
 * @param {object|null} p.state - what was saved after the last check (null on the first run)
 * @param {boolean} [p.force] - run by hand: always post
 * @param {Date} [p.now]
 * @returns {{ post: boolean, reason: string, key: string, failed: string[], repeatedFailures: string[] }}
 */
function decideDailyReport({ rows, state, force = false, now = new Date() }) {
    const key = notForSaleKey(rows);
    const failed = failedIds(rows);
    const previousFailed = new Set(state?.lastFailedIds || []);
    const alreadyPosted = new Set(state?.postedFailedIds || []);
    // Failed today and in the last check, and not in the last summary posted.
    const repeatedFailures = failed.filter((id) => previousFailed.has(id));
    const newRepeatedFailures = repeatedFailures.filter((id) => !alreadyPosted.has(id));

    const base = { key, failed, repeatedFailures };
    if (force) return { ...base, post: true, reason: "run by hand" };
    if (!state) return { ...base, post: true, reason: "first run" };
    if (rows.some((r) => r.alerted)) return { ...base, post: true, reason: "new alert" };
    if (key !== state.notForSaleKey) return { ...base, post: true, reason: "not-for-sale list changed" };
    if (newRepeatedFailures.length) return { ...base, post: true, reason: "failed two days in a row" };
    if (isMonday(now)) return { ...base, post: true, reason: "weekly summary" };
    return { ...base, post: false, reason: "nothing changed" };
}

module.exports = { decideDailyReport, notForSaleKey, failedIds, isMonday };
