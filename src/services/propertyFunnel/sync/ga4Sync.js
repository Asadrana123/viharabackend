// services/propertyFunnel/sync/ga4Sync.js
//
// GA4 (straight from Google, the same client as Website Analytics) → pf_ga4_page_days.
// Pages: /listing/, /auction/, /deal (property pages) and /blogs/ (the blog).
// The deal form is one path for every property (/deal?property=<slug>), so we pull pagePathPlusQueryString
// (pagePath drops the query) and keep only the `property` parameter: other params (utm_*, fbclid) are cut
// so a page stays one row.
//
// Our GA4 property runs on India time (gaInsightsService PROPERTY_TIMEZONE), so its `date` is an IST day.
// The page needs Pacific days: we pull by `dateHour` and put each hour on its Pacific date (an IST hour
// starts on the half hour in Pacific time; its midpoint decides the day). Every Pacific day in the window
// is rebuilt whole: its old rows are replaced.

const { DateTime } = require("luxon");
const { runReport, gaConfigured, PROPERTY_TIMEZONE } = require("../../analytics/gaInsightsService");
const PfGa4PageDay = require("../../../model/propertyFunnel/pfGa4PageDayModel");
const { pacificDate, addDays, TZ } = require("../pfCore");

const PATHS = ["/listing/", "/auction/", "/deal", "/blogs/", "/blog/"];
const PAGE = 25000;

/** "2026110913" (GA4 dateHour, property time) → the Pacific date of that hour's midpoint. */
const pacificDateOfHour = (dateHour) =>
  DateTime.fromFormat(dateHour, "yyyyMMddHH", { zone: PROPERTY_TIMEZONE }).plus({ minutes: 30 }).setZone(TZ).toISODate();

/** "/deal?property=x&utm_source=meta#top" → "/deal?property=x"; any other query is dropped. */
function normalizePath(pathPlusQuery) {
  try {
    const u = new URL(String(pathPlusQuery || "/").split("#")[0], "https://www.vihara.ai");
    const property = u.searchParams.get("property");
    return property ? `${u.pathname}?property=${property}` : u.pathname;
  } catch {
    return String(pathPlusQuery || "").split(/[?#]/)[0];
  }
}

/** GA4 rows (by hour) → one row per Pacific date x page x channel x source/medium. */
function toPacificDays(rows, minDate) {
  const m = new Map();
  for (const r of rows) {
    const date = pacificDateOfHour(r.dateHour);
    if (date < minDate) continue;
    const pagePath = normalizePath(r.pagePathPlusQueryString);
    const key = `${date}|${pagePath}|${r.sessionDefaultChannelGroup}|${r.sessionSourceMedium || ""}`;
    const g = m.get(key) || { date, pagePath, channelGroup: r.sessionDefaultChannelGroup, sourceMedium: r.sessionSourceMedium || "", campaign: "", sessions: 0, engagedSessions: 0, engagementSeconds: 0 };
    g.sessions += r.sessions || 0;
    g.engagedSessions += r.engagedSessions || 0;
    g.engagementSeconds += r.userEngagementDuration || 0;
    m.set(key, g);
  }
  return [...m.values()];
}

async function syncGa4({ days = 2, now = new Date() } = {}) {
  if (!gaConfigured()) throw new Error("Google Analytics is not connected on this server");
  const to = pacificDate(now);
  const minDate = addDays(to, -(days - 1));
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await runReport({
      dimensions: ["dateHour", "pagePathPlusQueryString", "sessionDefaultChannelGroup", "sessionSourceMedium"],
      metrics: ["sessions", "engagedSessions", "userEngagementDuration"],
      // In property (IST) days: minDate's IST day starts before the Pacific one, and "today" in IST is
      // today or tomorrow in Pacific, so every hour of every Pacific day in the window is covered.
      dateRanges: [{ startDate: minDate, endDate: "today" }],
      dimensionFilter: { orGroup: { expressions: PATHS.map((p) => ({ filter: { fieldName: "pagePathPlusQueryString", stringFilter: { matchType: "BEGINS_WITH", value: p } } })) } },
      limit: PAGE,
      offset,
    });
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  const out = toPacificDays(rows, minDate);
  await PfGa4PageDay.deleteMany({ date: { $gte: minDate } });
  if (out.length) await PfGa4PageDay.insertMany(out, { ordered: false });
  return `GA4: ${out.length} page-day rows (${minDate} to ${to}, Pacific)`;
}

module.exports = { syncGa4, toPacificDays, pacificDateOfHour, normalizePath };
