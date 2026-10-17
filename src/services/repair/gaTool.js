// services/repair/gaTool.js
//
// The repair agent's read-only Google Analytics tool. It checks the dates,
// asks gaInsightsService for one breakdown, and turns the rows into short
// text lines. It never changes anything in GA4.
//
// GA4 reports the whole website (organic, direct, Google and Meta), so the agent
// can compare it with Meta's counts and our database when it checks tracking.

const { DateTime } = require("luxon");
const { fetchGaBreakdown, gaConfigured, BREAKDOWN_NAMES, PROPERTY_TIMEZONE } = require("../analytics/gaInsightsService");

const MAX_DAYS = 31;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const LABELS = {
    activeUsers: "visitors",
    sessions: "sessions",
    engagedSessions: "engaged sessions",
    screenPageViews: "page views",
    userEngagementDuration: "engagement seconds",
    eventCount: "events",
};

const percent = (n, d) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "n/a");

/** Dates the tool accepts, or a message that tells the agent what to fix. */
function checkDates(since, until) {
    if (!DATE.test(since) || !DATE.test(until)) throw new Error("since and until must be dates like 2026-10-15");
    const a = DateTime.fromISO(since, { zone: PROPERTY_TIMEZONE });
    const b = DateTime.fromISO(until, { zone: PROPERTY_TIMEZONE });
    if (!a.isValid || !b.isValid) throw new Error("since or until is not a real date");
    if (a > b) throw new Error("since must not be after until");
    if (b > DateTime.now().setZone(PROPERTY_TIMEZONE).endOf("day")) throw new Error("until is in the future");
    if (b.diff(a, "days").days + 1 > MAX_DAYS) throw new Error(`Ask for at most ${MAX_DAYS} days at a time`);
}

function rowLine(row, by) {
    const metrics = Object.entries(row).filter(([, v]) => typeof v === "number");
    const label = Object.entries(row)
        .filter(([, v]) => typeof v === "string")
        .map(([, v]) => (by === "day" && /^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6)}` : v || "(not set)"))
        .join(" · ");
    const parts = metrics.map(([k, v]) => `${v} ${LABELS[k] || k}`);
    if (typeof row.sessions === "number" && typeof row.engagedSessions === "number") {
        parts.push(`${percent(row.engagedSessions, row.sessions)} engaged`);
    }
    return `${label || by}: ${parts.join(", ")}`;
}

/**
 * @param {{since: string, until: string, by: string}} input
 * @returns {Promise<string>} text for the agent. Throws a readable message when the input is wrong.
 */
async function gaReport({ since, until, by }) {
    if (!BREAKDOWN_NAMES.includes(by)) throw new Error(`by must be one of: ${BREAKDOWN_NAMES.join(", ")}`);
    checkDates(since, until);
    if (!gaConfigured()) return "Google Analytics is not connected on this server (GA_PROPERTY_ID or its credentials are missing). Work without it.";

    const rows = await fetchGaBreakdown({ since, until, by });
    if (rows === null) {
        return `The custom dimension behind "${by}" is not available in GA4 yet. It needs 24 to 48 hours of data after it was created, so this is a setup gap, not a tracking fault.`;
    }
    const header = `Google Analytics, ${since} to ${until} (India time), by ${by}. The newest days can still change a little for several hours.`;
    return rows.length ? `${header}\n${rows.map((r) => rowLine(r, by)).join("\n")}` : `${header}\nNo rows.`;
}

module.exports = { gaReport, checkDates, rowLine };
