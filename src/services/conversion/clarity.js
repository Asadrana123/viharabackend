// services/conversion/clarity.js
//
// Microsoft Clarity's Data Export API: the site's visitor behaviour (sessions,
// scroll depth, engagement time, dead / rage / error clicks, quick backs,
// script errors), broken down by page, device and traffic source.
//
// Clarity allows 10 calls a day per project and only covers the last 1-3 days,
// so pullClarity() runs once each morning (3 calls) and saves the answers;
// everything else reads the saved copies.

const axios = require("axios");
const ClarityDaily = require("../../model/conversion/clarityDailyModel");
const { getConversionConfig } = require("../../config/conversion/conversionConfig");

const ENDPOINT = "https://www.clarity.ms/export-data/api/v1/project-live-insights";
const BREAKDOWNS = [["URL"], ["URL", "Device"], ["URL", "Source"]];

/** Today's pulls (skips any already saved today, so a rerun doesn't spend the daily quota). */
async function pullClarity() {
    const { clarityToken } = getConversionConfig();
    if (!clarityToken) return { pulled: 0, skipped: "CLARITY_API_TOKEN is not set" };

    const since = new Date(Date.now() - 12 * 3600 * 1000);
    let pulled = 0;
    for (const dims of BREAKDOWNS) {
        const dimensions = dims.join(",");
        if (await ClarityDaily.exists({ dimensions, pulledAt: { $gte: since }, error: "" })) continue;
        const params = { numOfDays: 3 };
        dims.forEach((d, i) => (params[`dimension${i + 1}`] = d));
        try {
            const { data } = await axios.get(ENDPOINT, {
                params,
                headers: { Authorization: `Bearer ${clarityToken}`, "Content-Type": "application/json" },
                timeout: 60000,
            });
            await ClarityDaily.create({ pulledAt: new Date(), numOfDays: 3, dimensions, metrics: Array.isArray(data) ? data : [] });
            pulled += 1;
        } catch (error) {
            const status = error.response?.status;
            const message = status === 429 ? "Clarity's daily limit of 10 calls is used up" : `Clarity ${status || ""} ${error.message}`.trim();
            await ClarityDaily.create({ pulledAt: new Date(), numOfDays: 3, dimensions, error: message });
            console.warn(`[signup-doctor] Clarity pull (${dimensions}) failed: ${message}`);
            if (status === 401 || status === 403 || status === 429) break;
        }
    }
    return { pulled };
}

/** "https://www.vihara.ai/auction/x/?utm=1" → "vihara.ai/auction/x" */
function normalizeUrl(url) {
    try {
        const u = new URL(String(url).startsWith("http") ? url : `https://${url}`);
        return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
    } catch {
        return String(url || "").toLowerCase();
    }
}

/**
 * Clarity rows for one page from the most recent pulls (newest first).
 * Thank-you pages are matched separately: pass `path + "/thank-you"`.
 * @returns {Promise<Array<{pulledAt, dimensions, metrics: {[metricName]: Array<row>}}>>}
 */
async function clarityForPage(pageUrl, { pulls = 1 } = {}) {
    const target = normalizeUrl(pageUrl);
    const docs = await ClarityDaily.find({ error: "" }).sort({ pulledAt: -1 }).limit(BREAKDOWNS.length * pulls).lean();
    return docs.map((doc) => {
        const metrics = {};
        for (const m of doc.metrics || []) {
            // The page column is "Url" or "URL" depending on the metric.
            const rows = (m.information || []).filter((row) => {
                const rowUrl = row.Url ?? row.URL;
                return rowUrl !== undefined && normalizeUrl(rowUrl) === target;
            });
            if (rows.length) metrics[m.metricName] = rows.map(({ Url, URL, ...rest }) => rest);
        }
        return { pulledAt: doc.pulledAt, dimensions: doc.dimensions, metrics };
    });
}

/** Sessions Clarity saw on a page (bots excluded) in the latest URL-only pull, or null. */
async function claritySessions(pageUrl) {
    const [latest] = (await clarityForPage(pageUrl)).filter((p) => p.dimensions === "URL");
    const row = latest?.metrics?.Traffic?.[0];
    if (!row) return null;
    return Math.max(0, Number(row.totalSessionCount || 0) - Number(row.totalBotSessionCount || 0));
}

/** Why Clarity data may be missing (for the agent's context). */
async function clarityStatus() {
    const last = await ClarityDaily.findOne().sort({ pulledAt: -1 }).lean();
    if (!getConversionConfig().clarityToken) return "Clarity is not connected (CLARITY_API_TOKEN not set).";
    if (!last) return "Clarity has not been pulled yet.";
    return last.error ? `Last Clarity pull failed: ${last.error}` : `Clarity last pulled ${last.pulledAt.toISOString()} (covers the 3 days before it, UTC).`;
}

module.exports = { pullClarity, clarityForPage, claritySessions, clarityStatus, normalizeUrl };
