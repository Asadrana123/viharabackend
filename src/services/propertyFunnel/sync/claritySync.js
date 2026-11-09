// services/propertyFunnel/sync/claritySync.js
//
// Microsoft Clarity → pf_clarity_page_days, once a day. Clarity's export API only covers the last 1-3 days,
// so this daily copy is the only history: a missed day is gone.
//
// Why not the sign-up doctor's saved pulls (services/conversion/clarity.js): they only run when
// SIGNUP_DOCTOR_ENABLED=true, and they ask for 3 days at once, which can't be split into single days.
// This job asks for the last 24 hours (numOfDays=1) by URL: 1 of Clarity's 10 calls a day (the doctor uses 3).
//
// Response: [{ metricName, information: [{ Url | URL, ...numbers }] }]. Not checked against a real response
// yet (no Clarity token locally): the first run's detail says how many property pages it found.

const axios = require("axios");
const { getConversionConfig } = require("../../../config/conversion/conversionConfig");
const PfClarityPageDay = require("../../../model/propertyFunnel/pfClarityPageDayModel");
const { pacificDate, addDays, slugFromUrl } = require("../pfCore");

const ENDPOINT = "https://www.clarity.ms/export-data/api/v1/project-live-insights";

const first = (row, ...keys) => {
  for (const k of keys) if (row[k] != null && row[k] !== "") return Number(row[k]);
  return null;
};

/** Clarity's metrics → one row per property page URL. Pages that aren't a property page are skipped. */
function toPageRows(metrics) {
  const byUrl = new Map();
  const row = (url) => byUrl.get(url) || byUrl.set(url, { url, sessions: 0, scrollDepth: null, rageClicks: 0, deadClicks: 0, quickBacks: null }).get(url);
  for (const m of metrics || []) {
    for (const i of m.information || []) {
      const url = String(i.Url ?? i.URL ?? "");
      if (!slugFromUrl(url)) continue;
      const r = row(url);
      if (m.metricName === "Traffic") r.sessions += first(i, "totalSessionCount", "sessionsCount") || 0;
      else if (m.metricName === "ScrollDepth") r.scrollDepth = first(i, "averageScrollDepth");
      else if (m.metricName === "RageClickCount") r.rageClicks += first(i, "subTotal") || 0;
      else if (m.metricName === "DeadClickCount") r.deadClicks += first(i, "subTotal") || 0;
      else if (m.metricName === "QuickbackClick") r.quickBacks = (r.quickBacks || 0) + (first(i, "subTotal") || 0);
    }
  }
  return [...byUrl.values()];
}

async function syncClarity({ now = new Date() } = {}) {
  const { clarityToken } = getConversionConfig();
  if (!clarityToken) throw new Error("CLARITY_API_TOKEN is not set on this server");
  const date = addDays(pacificDate(now), -1); // the last 24 hours, kept as yesterday (the job runs at 01:00 Pacific)
  let data;
  try {
    ({ data } = await axios.get(ENDPOINT, {
      params: { numOfDays: 1, dimension1: "URL" },
      headers: { Authorization: `Bearer ${clarityToken}`, "Content-Type": "application/json" },
      timeout: 60000,
    }));
  } catch (error) {
    const status = error.response && error.response.status;
    throw new Error(status === 429 ? "Clarity's daily limit of 10 calls is used up" : `Clarity ${status || ""} ${error.message}`.trim());
  }
  const rows = toPageRows(Array.isArray(data) ? data : []);
  if (rows.length) {
    await PfClarityPageDay.bulkWrite(rows.map((r) => ({
      // registerClicks stays null until the register_click event exists (DEV_HANDOFF step 8).
      updateOne: { filter: { date, url: r.url }, update: { $set: { ...r, date } }, upsert: true },
    })), { ordered: false });
  }
  return `Daily copy for ${date}: ${rows.length} property pages (Clarity only keeps 3 days)`;
}

module.exports = { syncClarity, toPageRows };
