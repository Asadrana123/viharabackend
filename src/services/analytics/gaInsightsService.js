// services/analytics/gaInsightsService.js
//
// Pulls website numbers from Google Analytics 4 (Data API) for the daily
// analytics report. Every query is read-only.
//
// Env:
//   GA_PROPERTY_ID            GA4 property id, digits only (549331956)
//
// Credentials, first match wins:
//   1. OAuth login (used while service account keys are blocked by the org policy)
//        GA_OAUTH_CLIENT_ID, GA_OAUTH_CLIENT_SECRET, GA_OAUTH_REFRESH_TOKEN
//      Get the refresh token once with: node src/scripts/gaOAuthLogin.js
//      The report runs as the Google user who logged in, so that user needs access to the property.
//   2. GA_SERVICE_ACCOUNT_JSON   the service account key file, pasted as one line of JSON.
//      The service account needs the Viewer role on the GA4 property.
//   3. GOOGLE_APPLICATION_CREDENTIALS (key file path), through the library default.

const { BetaAnalyticsDataClient } = require("@google-analytics/data");
const { OAuth2Client } = require("google-auth-library");
const { DateTime } = require("luxon");

// GA4 days follow the property's reporting time zone, which is India time.
const PROPERTY_TIMEZONE = "Asia/Kolkata";

// Events the report counts. Anything not listed here is ignored.
const TRACKED_EVENTS = [
    "sign_up",
    "property_view",
    "renovation_open",
    "renovation_generate",
    "email_agent",
    "bid_registration_submit",
];

const TOP_ROWS = 10;
// Wide enough that the same campaign spelled two ways still lands in the top rows.
const CAMPAIGN_ROWS = 40;
const ADMIN_PATH_FILTER = {
    notExpression: { filter: { fieldName: "pagePath", stringFilter: { matchType: "BEGINS_WITH", value: "/admin" } } },
};

// Created on first use so a missing key fails the report, not server startup.
let client;

function getClient() {
    if (client) return client;
    const { GA_OAUTH_CLIENT_ID, GA_OAUTH_CLIENT_SECRET, GA_OAUTH_REFRESH_TOKEN } = process.env;
    if (GA_OAUTH_REFRESH_TOKEN) {
        if (!GA_OAUTH_CLIENT_ID || !GA_OAUTH_CLIENT_SECRET) {
            throw new Error("GA_OAUTH_REFRESH_TOKEN is set but GA_OAUTH_CLIENT_ID or GA_OAUTH_CLIENT_SECRET is missing");
        }
        const authClient = new OAuth2Client(GA_OAUTH_CLIENT_ID, GA_OAUTH_CLIENT_SECRET);
        authClient.setCredentials({ refresh_token: GA_OAUTH_REFRESH_TOKEN });
        client = new BetaAnalyticsDataClient({ authClient });
        return client;
    }
    const raw = process.env.GA_SERVICE_ACCOUNT_JSON;
    if (!raw) {
        client = new BetaAnalyticsDataClient();
        return client;
    }
    let key;
    try {
        key = JSON.parse(raw);
    } catch (e) {
        throw new Error("GA_SERVICE_ACCOUNT_JSON is not valid JSON");
    }
    client = new BetaAnalyticsDataClient({
        credentials: {
            client_email: key.client_email,
            // Env vars often store the key's line breaks as a literal backslash-n.
            private_key: String(key.private_key || "").replace(/\\n/g, "\n"),
        },
    });
    return client;
}

function propertyName() {
    const id = process.env.GA_PROPERTY_ID;
    if (!id || !/^\d+$/.test(id)) throw new Error("GA_PROPERTY_ID is not set (digits only)");
    return `properties/${id}`;
}

/**
 * Runs one report and flattens it to plain objects: { <dimension>: string, <metric>: number }.
 * With more than one date range, GA4 adds a "dateRange" dimension (date_range_0, date_range_1, ...).
 */
async function runReport({ dimensions = [], metrics, dateRanges, dimensionFilter, orderBys, limit }) {
    const [response] = await getClient().runReport({
        property: propertyName(),
        dimensions: dimensions.map((name) => ({ name })),
        metrics: metrics.map((name) => ({ name })),
        dateRanges,
        dimensionFilter,
        orderBys,
        limit,
    });

    const dimNames = [...dimensions, ...(dateRanges.length > 1 ? ["dateRange"] : [])];
    return (response.rows || []).map((row) => {
        const out = {};
        (row.dimensionValues || []).forEach((v, i) => {
            out[dimNames[i]] = v.value;
        });
        (row.metricValues || []).forEach((v, i) => {
            out[metrics[i]] = Number(v.value);
        });
        return out;
    });
}

const byMetricDesc = (metric) => [{ metric: { metricName: metric }, desc: true }];

/** Event split by a custom dimension. Returns null when the dimension is not registered in GA4 yet. */
async function eventSplit({ eventName, dimension, dateRanges }) {
    try {
        return await runReport({
            dimensions: [dimension],
            metrics: ["eventCount"],
            dateRanges,
            dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: eventName } } },
            orderBys: byMetricDesc("eventCount"),
            limit: TOP_ROWS,
        });
    } catch (error) {
        // GA4 rejects a custom dimension that was never registered (or has no data yet) with
        // gRPC code 3 (INVALID_ARGUMENT), and the message can come back empty.
        if (error.code === 3 || /not a valid dimension|invalid.*dimension|customEvent/i.test(error.message)) return null;
        throw error;
    }
}

/**
 * Everything the report needs for one day.
 * @param {string} [day] - "YYYY-MM-DD" in property time. Defaults to yesterday.
 */
async function fetchGaReportData(day) {
    const reportDay = day || DateTime.now().setZone(PROPERTY_TIMEZONE).minus({ days: 1 }).toISODate();
    const dayDt = DateTime.fromISO(reportDay, { zone: PROPERTY_TIMEZONE });
    const weekAgo = dayDt.minus({ days: 7 }).toISODate();

    const dayRange = { startDate: reportDay, endDate: reportDay };
    const weekAgoRange = { startDate: weekAgo, endDate: weekAgo };
    const dailyRange = { startDate: weekAgo, endDate: reportDay }; // 8 days: the report day plus the 7 before it
    const last7Range = { startDate: dayDt.minus({ days: 6 }).toISODate(), endDate: reportDay }; // the report day plus the 6 before it

    const [daily, events, pages, landing, channels, sources, campaignsDay, campaignsWeek, campaignSignUpsWeek] = await Promise.all([
        runReport({
            dimensions: ["date"],
            metrics: ["activeUsers", "sessions", "engagedSessions", "userEngagementDuration", "screenPageViews", "newUsers"],
            dateRanges: [dailyRange],
        }),
        runReport({
            dimensions: ["date", "eventName"],
            metrics: ["eventCount"],
            dateRanges: [dailyRange],
            dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: TRACKED_EVENTS } } },
        }),
        runReport({
            dimensions: ["pagePath"],
            metrics: ["screenPageViews", "activeUsers", "userEngagementDuration"],
            dateRanges: [dayRange],
            dimensionFilter: ADMIN_PATH_FILTER,
            orderBys: byMetricDesc("screenPageViews"),
            limit: TOP_ROWS,
        }),
        runReport({
            dimensions: ["landingPage"],
            metrics: ["sessions", "engagedSessions"],
            dateRanges: [dayRange],
            dimensionFilter: { notExpression: { filter: { fieldName: "landingPage", stringFilter: { matchType: "BEGINS_WITH", value: "/admin" } } } },
            orderBys: byMetricDesc("sessions"),
            limit: TOP_ROWS,
        }),
        runReport({
            dimensions: ["sessionDefaultChannelGroup"],
            metrics: ["sessions", "engagedSessions"],
            dateRanges: [dayRange, weekAgoRange],
            orderBys: byMetricDesc("sessions"),
        }),
        runReport({
            dimensions: ["sessionSourceMedium"],
            metrics: ["sessions"],
            dateRanges: [dayRange],
            orderBys: byMetricDesc("sessions"),
            limit: TOP_ROWS,
        }),
        // Campaigns: the report day, the last 7 days, and sign-ups by campaign over the last 7 days.
        runReport({
            dimensions: ["sessionCampaignName"],
            metrics: ["sessions", "engagedSessions"],
            dateRanges: [dayRange],
            orderBys: byMetricDesc("sessions"),
            limit: CAMPAIGN_ROWS,
        }),
        runReport({
            dimensions: ["sessionCampaignName"],
            metrics: ["sessions", "engagedSessions"],
            dateRanges: [last7Range],
            orderBys: byMetricDesc("sessions"),
            limit: CAMPAIGN_ROWS,
        }),
        runReport({
            dimensions: ["sessionCampaignName"],
            metrics: ["eventCount"],
            dateRanges: [last7Range],
            dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: "sign_up" } } },
            orderBys: byMetricDesc("eventCount"),
            limit: CAMPAIGN_ROWS,
        }),
    ]);

    const [signUpByForm, viewByPageType] = await Promise.all([
        eventSplit({ eventName: "sign_up", dimension: "customEvent:form_location", dateRanges: [dayRange] }),
        eventSplit({ eventName: "property_view", dimension: "customEvent:page_type", dateRanges: [dayRange] }),
    ]);

    return { reportDay, weekAgo, daily, events, pages, landing, channels, sources, campaignsDay, campaignsWeek, campaignSignUpsWeek, signUpByForm, viewByPageType };
}

// Breakdowns the repair agent can ask for over any date range (see repair/gaTool.js).
const BREAKDOWN_ROWS = 25;
const BREAKDOWNS = {
    day: { dimensions: ["date"], metrics: ["activeUsers", "sessions", "engagedSessions", "screenPageViews"], orderBys: [{ dimension: { dimensionName: "date" } }] },
    channel: { dimensions: ["sessionDefaultChannelGroup"], metrics: ["sessions", "engagedSessions"] },
    source: { dimensions: ["sessionSourceMedium"], metrics: ["sessions", "engagedSessions"] },
    campaign: { dimensions: ["sessionCampaignName"], metrics: ["sessions", "engagedSessions"] },
    page: { dimensions: ["pagePath"], metrics: ["screenPageViews", "activeUsers", "userEngagementDuration"], dimensionFilter: ADMIN_PATH_FILTER },
    landing_page: {
        dimensions: ["landingPage"],
        metrics: ["sessions", "engagedSessions"],
        dimensionFilter: { notExpression: { filter: { fieldName: "landingPage", stringFilter: { matchType: "BEGINS_WITH", value: "/admin" } } } },
    },
    event: { dimensions: ["eventName"], metrics: ["eventCount"] },
};
// Event counts split by a custom dimension: [event, dimension].
const EVENT_SPLITS = {
    sign_up_by_form: ["sign_up", "customEvent:form_location"],
    property_view_by_page_type: ["property_view", "customEvent:page_type"],
};
const BREAKDOWN_NAMES = [...Object.keys(BREAKDOWNS), ...Object.keys(EVENT_SPLITS)];

/** True when some GA4 credentials and a property id are set, so a query can be tried. */
function gaConfigured() {
    const env = process.env;
    const hasCredentials = env.GA_OAUTH_REFRESH_TOKEN || env.GA_SERVICE_ACCOUNT_JSON || env.GOOGLE_APPLICATION_CREDENTIALS;
    return Boolean(env.GA_PROPERTY_ID && hasCredentials);
}

/**
 * One breakdown over a date range, read-only.
 * @param {{since: string, until: string, by: string}} p  dates are "YYYY-MM-DD" in property time
 * @returns {Promise<Array<object>|null>} rows, or null when a custom dimension is not registered yet
 */
async function fetchGaBreakdown({ since, until, by }) {
    const dateRanges = [{ startDate: since, endDate: until }];
    if (EVENT_SPLITS[by]) {
        const [eventName, dimension] = EVENT_SPLITS[by];
        return eventSplit({ eventName, dimension, dateRanges });
    }
    const spec = BREAKDOWNS[by];
    if (!spec) throw new Error(`Unknown breakdown "${by}". Use one of: ${BREAKDOWN_NAMES.join(", ")}`);
    const firstMetric = spec.metrics[0];
    return runReport({
        dimensions: spec.dimensions,
        metrics: spec.metrics,
        dateRanges,
        dimensionFilter: spec.dimensionFilter,
        orderBys: spec.orderBys || byMetricDesc(firstMetric),
        limit: BREAKDOWN_ROWS,
    });
}

module.exports = { fetchGaReportData, fetchGaBreakdown, gaConfigured, BREAKDOWN_NAMES, TRACKED_EVENTS, PROPERTY_TIMEZONE };
