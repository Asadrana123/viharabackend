// services/calling/facetime/facetimeSettingsService.js
//
// Read/update the single FaceTime test settings document. Every call that goes
// out asks "is FaceTime on?", so the answer is cached for a few seconds instead
// of hitting Mongo on every dial.
const FacetimeSettings = require("../../../model/calling/facetimeSettingsModel");
const { phoneKey } = require("../dailyDialGuard");

const CACHE_MS = 15 * 1000;
let cached = null;
let cachedAt = 0;

/** True only when the server was started with FACETIME_ENABLED=true. Off = zero extra work anywhere. */
function isServerEnabled() {
  return process.env.FACETIME_ENABLED === "true";
}

async function getSettings({ fresh = false } = {}) {
  if (!fresh && cached && Date.now() - cachedAt < CACHE_MS) return cached;
  const doc = await FacetimeSettings.findOneAndUpdate({}, {}, { new: true, upsert: true, setDefaultsOnInsert: true }).lean();
  cached = doc;
  cachedAt = Date.now();
  return doc;
}

/**
 * @param {object} changes - any of { enabled, mode, allowlist, percent, maxCallsPerHourPerLine }
 * @param {object} [admin] - { _id, name } of the admin making the change
 */
async function updateSettings(changes = {}, admin = null) {
  const set = {};
  if (typeof changes.enabled === "boolean") set.enabled = changes.enabled;
  if (["allowlist", "percent"].includes(changes.mode)) set.mode = changes.mode;
  if (Array.isArray(changes.allowlist)) {
    set.allowlist = [...new Set(changes.allowlist.map(phoneKey).filter((k) => k.length >= 10))];
  }
  if (changes.percent !== undefined) {
    const pct = Number(changes.percent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error("percent must be between 0 and 100");
    set.percent = Math.round(pct);
  }
  if (changes.maxCallsPerHourPerLine !== undefined) {
    const max = Number(changes.maxCallsPerHourPerLine);
    if (!Number.isInteger(max) || max < 1 || max > 60) throw new Error("maxCallsPerHourPerLine must be a whole number from 1 to 60");
    set.maxCallsPerHourPerLine = max;
  }
  set.changedAt = new Date();
  if (admin) set.changedBy = { adminId: admin._id, adminName: admin.name || admin.fullName || "" };

  const doc = await FacetimeSettings.findOneAndUpdate({}, { $set: set }, { new: true, upsert: true, setDefaultsOnInsert: true }).lean();
  cached = doc;
  cachedAt = Date.now();
  return doc;
}

module.exports = { isServerEnabled, getSettings, updateSettings };
